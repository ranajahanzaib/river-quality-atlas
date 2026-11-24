"""FastAPI endpoints backed only by imported Caravan-Qual release records."""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

import duckdb
import polars as pl
from fastapi import FastAPI, HTTPException, Query
from fastapi import Path as ApiPath
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

from river_quality_atlas.analytics.flow import (
    concentration_discharge,
    flow_regime_summary,
    instantaneous_loads,
)
from river_quality_atlas.analytics.temporal import seasonal_summary, temporal_trend
from river_quality_atlas.ingestion.release import NORMALIZED, RAW, status

ROOT = Path(__file__).resolve().parents[1]

app = FastAPI(
    title="RiverQualityAtlas API",
    version="0.1.0",
    description="A research API over locally imported Caravan-Qual records.",
)
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "RQA_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ObservationRequest(BaseModel):
    station_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.-]+$")
    constituent: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_.-]+$")
    start_date: date | None = None
    end_date: date | None = None
    unit: str | None = Field(default=None, max_length=100)
    unit_is_null: bool = False

    @model_validator(mode="after")
    def ordered_date_range(self) -> ObservationRequest:
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must not be later than end_date")
        if self.unit is not None and self.unit_is_null:
            raise ValueError("Provide a source unit or select missing-unit records, not both.")
        return self


class FlowRequest(ObservationRequest):
    pass


def _files() -> list[str]:
    return (
        [str(path) for path in sorted(NORMALIZED.glob("*.parquet"))] if NORMALIZED.exists() else []
    )


def _require_observations() -> list[str]:
    files = _files()
    if not files:
        raise HTTPException(
            503,
            detail={
                "code": "dataset_not_prepared",
                "message": "Download and prepare Caravan-Qual records first.",
            },
        )
    return files


def _query(sql: str, params: list[object] | None = None) -> list[tuple]:
    connection = duckdb.connect(database=":memory:", read_only=False)
    try:
        return connection.execute(sql, params or []).fetchall()
    finally:
        connection.close()


def _observation_source(constituent: str) -> Path:
    files = _require_observations()
    source = next(
        (Path(path) for path in files if Path(path).stem.lower() == constituent.lower()), None
    )
    if source is None:
        raise HTTPException(
            404,
            detail={
                "code": "constituent_not_imported",
                "message": "Import this constituent first.",
            },
        )
    return source


def _date_conditions(request: ObservationRequest) -> tuple[list[str], list[object]]:
    conditions = ["wqms_id = ?"]
    params: list[object] = [request.station_id]
    for column, value, operator in (
        ("dates", request.start_date, ">="),
        ("dates", request.end_date, "<="),
    ):
        if value:
            conditions.append(f"{column} {operator} CAST(? AS DATE)")
            params.append(value.isoformat())
    return conditions, params


def _resolve_unit(
    source: Path, request: ObservationRequest, conditions: list[str], params: list[object]
) -> tuple[str | None, bool, list[str | None]]:
    rows = _query(
        "SELECT DISTINCT unit FROM read_parquet(?) WHERE " + " AND ".join(conditions),
        [str(source), *params],
    )
    units = sorted({row[0] for row in rows}, key=lambda value: value or "")
    if request.unit_is_null and None not in units:
        raise HTTPException(422, detail="Missing-unit observations are not present for this query.")
    if request.unit is not None and request.unit not in units:
        raise HTTPException(422, detail="The selected unit is not present for this query.")
    if request.unit is None and not request.unit_is_null and len(units) > 1:
        raise HTTPException(
            409,
            detail={
                "code": "unit_selection_required",
                "message": (
                    "This station has observations in multiple units. "
                    "Select one unit before analysis."
                ),
                "units": units,
            },
        )
    if request.unit_is_null:
        return None, True, units
    if request.unit is not None:
        return request.unit, False, units
    return (units[0] if units else None), bool(units and units[0] is None), units


def _unit_condition(
    conditions: list[str],
    params: list[object],
    unit: str | None,
    unit_is_null: bool,
    units: list[str | None],
) -> None:
    if unit_is_null:
        conditions.append("unit IS NULL")
    elif unit is not None:
        conditions.append("unit = ?")
        params.append(unit)
    elif not units:
        conditions.append("unit IS NULL")


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "RiverQualityAtlas API"}


@app.get("/api/v1/status")
def dataset_status() -> dict[str, object]:
    return status()


@app.get("/api/v1/overview")
def overview() -> dict[str, object]:
    files = _require_observations()
    station_file = RAW / "wqms_site_info.csv"
    if not station_file.exists():
        raise HTTPException(
            503,
            detail={
                "code": "station_metadata_missing",
                "message": "Download official station metadata first.",
            },
        )
    station = pl.read_csv(
        station_file, schema_overrides={"wqms_id": pl.String, "gauge_id": pl.String}
    )
    variables_file = RAW / "Caravan-Qual_zarr_variables.csv"
    registry = pl.read_csv(variables_file) if variables_file.exists() else pl.DataFrame()
    counts = _query(
        "SELECT count(*) AS rows, count(obs) AS measured, count(streamflow) AS flow, "
        "count(*) FILTER (WHERE flag IS NOT NULL AND trim(flag) <> '') AS flagged "
        "FROM read_parquet(?, union_by_name=true)",
        [files],
    )[0]
    countries = station.get_column("country_name").drop_nulls().n_unique()
    first, last = _query(
        "SELECT min(dates)::VARCHAR, max(dates)::VARCHAR FROM read_parquet(?, union_by_name=true)",
        [files],
    )[0]
    return {
        "stations": station.height,
        "observations": counts[0],
        "measured_values": counts[1],
        "constituents": len(files),
        "countries": countries,
        "stations_with_flow_gauge": station.filter(
            pl.col("gauge_id").is_not_null() & (pl.col("gauge_id") != "")
        ).height,
        "paired_flow_values": counts[2],
        "flagged_records": counts[3],
        "period": {"start": first, "end": last},
        "constituent_registry_rows": registry.filter(pl.col("category") == "water_quality").height
        if registry.height
        else 0,
        "coverage_note": (
            "Counts describe imported constituent files; they are not full release totals "
            "unless all files are imported."
        ),
    }


@app.get("/api/v1/constituents")
def constituents() -> list[dict[str, object]]:
    path = RAW / "Caravan-Qual_zarr_variables.csv"
    if not path.exists():
        raise HTTPException(
            503,
            detail={
                "code": "variable_registry_missing",
                "message": "Download the release variable registry first.",
            },
        )
    registry = pl.read_csv(path).filter(pl.col("category") == "water_quality")
    imported = {Path(file).stem.lower() for file in _files()}
    return [
        {**row, "imported": str(row["variable"]).lower() in imported} for row in registry.to_dicts()
    ]


@app.get("/api/v1/stations")
def stations(
    q: str = Query(default="", max_length=120),
    country: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
) -> dict[str, object]:
    path = RAW / "wqms_site_info.csv"
    if not path.exists():
        raise HTTPException(
            503,
            detail={
                "code": "station_metadata_missing",
                "message": "Download official station metadata first.",
            },
        )
    filters: list[pl.Expr] = []
    if q:
        filters.append(
            pl.col("wqms_id").str.contains(q, literal=True)
            | pl.col("country_name").str.contains(q, literal=True)
        )
    if country:
        filters.append(pl.col("country_name") == country)
    frame = pl.scan_csv(path, schema_overrides={"wqms_id": pl.String, "gauge_id": pl.String})
    if filters:
        frame = frame.filter(pl.all_horizontal(filters))
    total = frame.select(pl.len()).collect().item()
    rows = frame.slice((page - 1) * page_size, page_size).collect().to_dicts()
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


@app.get("/api/v1/stations/{station_id}")
def station_profile(
    station_id: str = ApiPath(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.-]+$"),
) -> dict[str, object]:
    """Return one release station row plus imported constituent availability."""
    path = RAW / "wqms_site_info.csv"
    if not path.exists():
        raise HTTPException(
            503,
            detail={
                "code": "station_metadata_missing",
                "message": "Download official station metadata first.",
            },
        )
    rows = (
        pl.scan_csv(path, schema_overrides={"wqms_id": pl.String, "gauge_id": pl.String})
        .filter(pl.col("wqms_id") == station_id)
        .limit(1)
        .collect()
        .to_dicts()
    )
    if not rows:
        raise HTTPException(
            404,
            detail={"code": "station_not_found", "message": "Station not found."},
        )
    return {
        "metadata": rows[0],
        "constituents": station_constituents(station_id),
        "observations_imported": bool(_files()),
    }


@app.get("/api/v1/stations/{station_id}/constituents")
def station_constituents(
    station_id: str = ApiPath(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.-]+$"),
) -> list[dict[str, object]]:
    """Report imported measurement availability and native units for one station."""
    files = _files()
    result: list[dict[str, object]] = []
    for source in files:
        rows = _query(
            "SELECT unit, count(*) FROM read_parquet(?) WHERE wqms_id = ? "
            "GROUP BY unit ORDER BY unit",
            [str(source), station_id],
        )
        if rows:
            result.append(
                {
                    "constituent": Path(source).stem,
                    "units": [{"unit": row[0], "observations": row[1]} for row in rows],
                }
            )
    return result


@app.get("/api/v1/atlas/stations")
def atlas_stations(
    west: float = Query(ge=-180, le=180),
    south: float = Query(ge=-90, le=90),
    east: float = Query(ge=-180, le=180),
    north: float = Query(ge=-90, le=90),
    limit: int = Query(default=5000, ge=1, le=10000),
) -> dict[str, object]:
    path = RAW / "wqms_site_info.csv"
    if not path.exists():
        raise HTTPException(
            503,
            detail={
                "code": "station_metadata_missing",
                "message": "Download official station metadata first.",
            },
        )
    if south >= north:
        raise HTTPException(422, detail="The map viewport must have south < north")
    frame = pl.scan_csv(path, schema_overrides={"wqms_id": pl.String, "gauge_id": pl.String})
    longitude = (
        (pl.col("wqms_lon") >= west) & (pl.col("wqms_lon") <= east)
        if west <= east
        else ((pl.col("wqms_lon") >= west) | (pl.col("wqms_lon") <= east))
    )
    rows = (
        frame.filter(longitude & pl.col("wqms_lat").is_between(south, north))
        .select("wqms_id", "wqms_lon", "wqms_lat", "country_name", "gauge_id")
        .limit(limit + 1)
        .collect()
    )
    return {"items": rows.head(limit).to_dicts(), "truncated": rows.height > limit}


@app.post("/api/v1/analysis/concentration-discharge")
def flow_analysis(request: FlowRequest) -> dict[str, object]:
    source = _observation_source(request.constituent)
    conditions, params = _date_conditions(request)
    unit, unit_is_null, units = _resolve_unit(source, request, conditions, params)
    _unit_condition(conditions, params, unit, unit_is_null, units)
    rows = _query(
        "SELECT obs, streamflow FROM read_parquet(?) WHERE "
        + " AND ".join(conditions)
        + " ORDER BY dates",
        [str(source), *params],
    )
    result = concentration_discharge(rows)
    series = _query(
        "SELECT dates::VARCHAR, obs, streamflow, unit, flag, detection_limit "
        "FROM read_parquet(?) WHERE " + " AND ".join(conditions),
        [str(source), *params],
    )
    return {
        "station_id": request.station_id,
        "constituent": request.constituent,
        "unit": unit,
        "unit_is_null": unit_is_null,
        "paired_observations": result.paired_observations,
        "excluded_missing_pairs": result.excluded_missing_pairs,
        "spearman_rho": result.rho,
        "p_value": result.p_value,
        "interpretation": result.interpretation,
        "series": [
            dict(
                zip(
                    ["date", "concentration", "discharge", "unit", "flag", "detection_limit"],
                    row,
                    strict=True,
                )
            )
            for row in series
        ],
        "provenance": {
            "release": "Caravan-Qual lite v1.1",
            "doi": "10.5281/zenodo.21337532",
            "pairing": "Source records on the same date only; no interpolation or forward fill.",
            "method": (
                "Spearman rank correlation on finite same-date observed concentration "
                "and streamflow pairs."
            ),
        },
    }


@app.post("/api/v1/analysis/trends")
def trend_analysis(request: ObservationRequest) -> dict[str, object]:
    source = _observation_source(request.constituent)
    conditions, params = _date_conditions(request)
    unit, unit_is_null, units = _resolve_unit(source, request, conditions, params)
    _unit_condition(conditions, params, unit, unit_is_null, units)
    rows = _query(
        "SELECT dates::VARCHAR, obs FROM read_parquet(?) WHERE "
        + " AND ".join(conditions)
        + " ORDER BY dates",
        [str(source), *params],
    )
    result = temporal_trend(rows)
    daily = _query(
        "SELECT dates::VARCHAR, median(obs) FROM read_parquet(?) WHERE "
        + " AND ".join([*conditions, "dates IS NOT NULL", "obs IS NOT NULL"])
        + " GROUP BY dates ORDER BY dates",
        [str(source), *params],
    )
    max_points = 1200
    sampled = (
        [daily[round(index * (len(daily) - 1) / (max_points - 1))] for index in range(max_points)]
        if len(daily) > max_points
        else daily
    )
    return {
        "station_id": request.station_id,
        "constituent": request.constituent,
        "unit": unit,
        "unit_is_null": unit_is_null,
        **result.__dict__,
        "series": [{"date": row[0], "median": row[1]} for row in sampled],
        "series_downsampled": len(daily) > max_points,
    }


@app.post("/api/v1/analysis/seasonality")
def seasonality_analysis(request: ObservationRequest) -> dict[str, object]:
    source = _observation_source(request.constituent)
    conditions, params = _date_conditions(request)
    unit, unit_is_null, units = _resolve_unit(source, request, conditions, params)
    _unit_condition(conditions, params, unit, unit_is_null, units)
    rows = _query(
        "SELECT dates::VARCHAR, obs FROM read_parquet(?) WHERE "
        + " AND ".join(conditions)
        + " ORDER BY dates",
        [str(source), *params],
    )
    return {
        "station_id": request.station_id,
        "constituent": request.constituent,
        "unit": unit,
        "unit_is_null": unit_is_null,
        **seasonal_summary(rows),
    }


@app.post("/api/v1/analysis/flow-regimes")
def flow_regime_analysis(request: FlowRequest) -> dict[str, object]:
    source = _observation_source(request.constituent)
    conditions, params = _date_conditions(request)
    unit, unit_is_null, units = _resolve_unit(source, request, conditions, params)
    _unit_condition(conditions, params, unit, unit_is_null, units)
    rows = _query(
        "SELECT obs, streamflow FROM read_parquet(?) WHERE "
        + " AND ".join(conditions)
        + " ORDER BY dates",
        [str(source), *params],
    )
    return {
        "station_id": request.station_id,
        "constituent": request.constituent,
        "unit": unit,
        "unit_is_null": unit_is_null,
        **flow_regime_summary(rows),
    }


@app.post("/api/v1/analysis/loads")
def load_analysis(request: FlowRequest) -> dict[str, object]:
    source = _observation_source(request.constituent)
    conditions, params = _date_conditions(request)
    unit, unit_is_null, units = _resolve_unit(source, request, conditions, params)
    _unit_condition(conditions, params, unit, unit_is_null, units)
    rows = _query(
        "SELECT dates::VARCHAR, obs, streamflow FROM read_parquet(?) WHERE "
        + " AND ".join(conditions)
        + " ORDER BY dates",
        [str(source), *params],
    )
    try:
        result = instantaneous_loads(rows, unit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "station_id": request.station_id,
        "constituent": request.constituent,
        "source_unit": unit,
        **result,
    }


@app.get("/api/v1/quality/summary")
def quality_summary() -> dict[str, object]:
    files = _require_observations()
    row = _query(
        "SELECT count(*) AS records, count(*) FILTER (WHERE obs IS NULL) AS missing_values, "
        "count(*) FILTER (WHERE flag IS NOT NULL AND trim(flag) <> '') AS flagged, "
        "count(*) FILTER (WHERE detection_limit IS NOT NULL) AS detection_limits "
        "FROM read_parquet(?, union_by_name=true)",
        [files],
    )[0]
    return {
        "records": row[0],
        "missing_values": row[1],
        "flagged_records": row[2],
        "records_with_detection_limits": row[3],
    }


@app.post("/api/v1/analysis/detection-limits")
def detection_limit_analysis(request: ObservationRequest) -> dict[str, object]:
    """Summarize source flags and limits without guessing censoring semantics."""
    source = _observation_source(request.constituent)
    conditions, params = _date_conditions(request)
    unit, unit_is_null, units = _resolve_unit(source, request, conditions, params)
    _unit_condition(conditions, params, unit, unit_is_null, units)
    where = " AND ".join(conditions)
    summary = _query(
        "SELECT count(*), count(obs), count(*) FILTER (WHERE detection_limit IS NOT NULL), "
        "count(*) FILTER (WHERE flag IS NOT NULL AND trim(flag) <> '') "
        f"FROM read_parquet(?) WHERE {where}",
        [str(source), *params],
    )[0]
    flags = _query(
        "SELECT flag, count(*) FROM read_parquet(?) WHERE "
        + " AND ".join([*conditions, "flag IS NOT NULL", "trim(flag) <> ''"])
        + " GROUP BY flag ORDER BY count(*) DESC, flag LIMIT 100",
        [str(source), *params],
    )
    return {
        "station_id": request.station_id,
        "constituent": request.constituent,
        "unit": unit,
        "unit_is_null": unit_is_null,
        "records": summary[0],
        "measured_values": summary[1],
        "records_with_detection_limits": summary[2],
        "source_flagged_records": summary[3],
        "source_flags": [{"flag": row[0], "records": row[1]} for row in flags],
        "note": (
            "Detection limits and original flags are reported as supplied. Flag meanings and "
            "censoring direction are not inferred without source-specific documentation."
        ),
    }


@app.get("/api/v1/manifest")
def manifest() -> dict[str, object]:
    path = ROOT / "data" / "manifests" / "caravan-qual.json"
    if not path.exists():
        raise HTTPException(
            404,
            detail={
                "code": "manifest_unavailable",
                "message": "Prepare or download source data to write a provenance manifest.",
            },
        )
    return json.loads(path.read_text())
