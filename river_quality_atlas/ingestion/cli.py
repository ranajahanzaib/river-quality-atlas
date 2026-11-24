"""Command-line release download, normalization, and validation workflows."""

from __future__ import annotations

import argparse
import json
import sys

import polars as pl

from river_quality_atlas.ingestion.release import (
    NORMALIZED,
    RAW,
    download_profile,
    status,
    write_manifest,
)

REQUIRED = {"wqms_id", "dates", "obs", "unit", "flag", "detection_limit", "streamflow"}


def prepare() -> int:
    source_dir = RAW / "wqms-csv"
    sources = sorted(source_dir.glob("*.csv")) if source_dir.exists() else []
    if not sources:
        print(
            "No constituent observations found. Run `pnpm data:quickstart` "
            "or `pnpm data:standard` first.",
            file=sys.stderr,
        )
        return 2
    NORMALIZED.mkdir(parents=True, exist_ok=True)
    total_rows = 0
    for path in sources:
        frame = pl.scan_csv(
            path,
            infer_schema_length=10_000,
            schema_overrides={
                "wqms_id": pl.String,
                "unit": pl.String,
                "flag": pl.String,
                "imputation_method": pl.String,
                "variable": pl.String,
            },
            try_parse_dates=False,
            null_values=["", "NA", "NaN", "null"],
        )
        schema_names = set(frame.collect_schema().names())
        missing = REQUIRED - schema_names
        if missing:
            raise ValueError(
                f"{path.name} is missing required release columns: {', '.join(sorted(missing))}"
            )
        if "variable" not in schema_names:
            frame = frame.with_columns(pl.lit(path.stem).alias("variable"))
        frame = frame.with_columns(
            pl.col("dates").cast(pl.String).str.to_date(strict=False).alias("dates"),
            pl.col("obs").cast(pl.Float64, strict=False),
            pl.col("streamflow").cast(pl.Float64, strict=False),
            pl.col("detection_limit").cast(pl.Float64, strict=False),
            pl.col("wqms_id").cast(pl.String),
            pl.col("unit").cast(pl.String),
            pl.col("flag").cast(pl.String),
        )
        target = NORMALIZED / f"{path.stem}.parquet"
        frame.sink_parquet(target, compression="zstd", statistics=True, engine="streaming")
        stats = (
            pl.scan_parquet(target)
            .select(pl.len().alias("rows"), pl.col("dates").is_null().sum().alias("invalid_dates"))
            .collect(engine="streaming")
            .row(0, named=True)
        )
        if stats["invalid_dates"] == stats["rows"]:
            target.unlink(missing_ok=True)
            raise ValueError(f"{path.name} has no parseable dates")
        total_rows += stats["rows"]
        print(f"Prepared {path.stem}: {stats['rows']:,} records")
    write_manifest()
    print(f"Prepared {total_rows:,} observation rows across {len(sources)} constituent files.")
    return 0


def validate() -> int:
    issues: list[str] = []
    info = RAW / "wqms_site_info.csv"
    variables = RAW / "Caravan-Qual_zarr_variables.csv"
    if not info.exists():
        issues.append("Missing official wqms_site_info.csv")
    else:
        schema = pl.scan_csv(info, infer_schema_length=1000).collect_schema().names()
        expected = {"wqms_id", "wqms_lat", "wqms_lon", "country_name", "gauge_id"}
        if not expected.issubset(schema):
            issues.append(
                f"Station metadata missing columns: {', '.join(sorted(expected - set(schema)))}"
            )
    if not variables.exists():
        issues.append("Missing official Caravan-Qual_zarr_variables.csv")
    else:
        schema = pl.scan_csv(variables).collect_schema().names()
        if not {"variable", "category", "units", "description"}.issubset(schema):
            issues.append("Variable registry does not match the published release schema")
    for path in NORMALIZED.glob("*.parquet") if NORMALIZED.exists() else []:
        schema = pl.scan_parquet(path).collect_schema().names()
        missing = REQUIRED - set(schema)
        if missing:
            issues.append(f"{path.name} is missing normalized fields: {', '.join(sorted(missing))}")
    if issues:
        print(json.dumps({"valid": False, "issues": issues}, indent=2))
        return 1
    print(json.dumps({"valid": True, "status": status()}, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="river-quality-atlas-data")
    commands = parser.add_subparsers(dest="command", required=True)
    download = commands.add_parser("download")
    download.add_argument(
        "--profile", choices=["quickstart", "standard", "full"], default="quickstart"
    )
    download.add_argument(
        "--constituent", help="One official CSV constituent to fetch by bounded ZIP ranges"
    )
    commands.add_parser("prepare")
    commands.add_parser("validate")
    commands.add_parser("status")
    args = parser.parse_args()
    try:
        if args.command == "download":
            paths = download_profile(args.profile, args.constituent)
            write_manifest()
            print("Downloaded and verified:")
            for path in paths:
                print(f"  {path.relative_to(RAW)}")
            return 0
        if args.command == "prepare":
            return prepare()
        if args.command == "validate":
            return validate()
        print(json.dumps(status(), indent=2))
        return 0
    except (OSError, ValueError, pl.exceptions.PolarsError) as exc:
        print(f"Data workflow failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
