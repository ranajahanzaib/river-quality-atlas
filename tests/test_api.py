from datetime import date, timedelta

import polars as pl
import pytest
from fastapi.testclient import TestClient

from river_quality_atlas import api


@pytest.fixture(autouse=True)
def isolate_dataset(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "NORMALIZED", tmp_path / "normalized")
    monkeypatch.setattr(api, "RAW", tmp_path / "raw")


client = TestClient(api.app)


def test_health_endpoint() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_analysis_refuses_to_imply_data_when_not_imported() -> None:
    response = client.post(
        "/api/v1/analysis/concentration-discharge",
        json={"station_id": "wqms_00000001", "constituent": "DO"},
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "dataset_not_prepared"


def test_date_range_is_validated_before_analysis() -> None:
    response = client.post(
        "/api/v1/analysis/concentration-discharge",
        json={"station_id": "station", "constituent": "DO", "start_date": "not-a-date"},
    )

    assert response.status_code == 422


def test_temporal_analysis_endpoints_use_prepared_source_records(tmp_path, monkeypatch) -> None:
    source_dir = tmp_path / "normalized"
    source_dir.mkdir()
    first_day = date(2000, 1, 1)
    pl.DataFrame(
        {
            "wqms_id": ["station"] * 10,
            "dates": [first_day + timedelta(days=365 * index) for index in range(10)],
            "obs": [float(index + 1) for index in range(10)],
            "streamflow": [float(index + 2) for index in range(10)],
            "unit": ["mg/L"] * 10,
            "flag": [None] * 10,
            "detection_limit": [None] * 10,
        }
    ).write_parquet(source_dir / "DO.parquet")
    monkeypatch.setattr(api, "NORMALIZED", source_dir)

    trend = client.post(
        "/api/v1/analysis/trends",
        json={"station_id": "station", "constituent": "DO"},
    )
    seasonal = client.post(
        "/api/v1/analysis/seasonality",
        json={"station_id": "station", "constituent": "DO"},
    )
    regimes = client.post(
        "/api/v1/analysis/flow-regimes",
        json={"station_id": "station", "constituent": "DO"},
    )
    loads = client.post(
        "/api/v1/analysis/loads",
        json={"station_id": "station", "constituent": "DO"},
    )
    detection = client.post(
        "/api/v1/analysis/detection-limits",
        json={"station_id": "station", "constituent": "DO"},
    )
    availability = client.get("/api/v1/stations/station/constituents")

    assert trend.status_code == 200
    assert trend.json()["sampling_days"] == 10
    assert trend.json()["slope_per_year"] == pytest.approx(1.0, abs=0.01)
    assert len(trend.json()["series"]) == 10
    assert seasonal.status_code == 200
    assert seasonal.json()["observations"] == 10
    assert sum(month["observations"] for month in seasonal.json()["months"]) == 10
    assert regimes.status_code == 200
    assert regimes.json()["paired_observations"] == 10
    assert loads.status_code == 200
    assert loads.json()["unit"] == "kg/day equivalent"
    assert detection.json()["records"] == 10
    assert availability.json() == [
        {"constituent": "DO", "units": [{"unit": "mg/L", "observations": 10}]}
    ]


def test_analysis_requires_unit_selection_before_mixing_units(tmp_path, monkeypatch) -> None:
    source_dir = tmp_path / "normalized"
    source_dir.mkdir()
    pl.DataFrame(
        {
            "wqms_id": ["station", "station"],
            "dates": [date(2020, 1, 1), date(2020, 1, 2)],
            "obs": [1.0, 1000.0],
            "streamflow": [2.0, 3.0],
            "unit": ["mg/L", "ug/L"],
            "flag": [None, None],
            "detection_limit": [None, None],
        }
    ).write_parquet(source_dir / "DO.parquet")
    monkeypatch.setattr(api, "NORMALIZED", source_dir)

    response = client.post(
        "/api/v1/analysis/concentration-discharge",
        json={"station_id": "station", "constituent": "DO"},
    )

    assert response.status_code == 409
    assert response.json()["detail"]["units"] == ["mg/L", "ug/L"]


def test_station_profile_keeps_metadata_available_without_observations(
    tmp_path, monkeypatch
) -> None:
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir()
    pl.DataFrame(
        {
            "wqms_id": ["station"],
            "wqms_lat": [12.5],
            "wqms_lon": [45.25],
            "country_name": ["Example"],
            "gauge_id": [None],
        }
    ).write_csv(raw_dir / "wqms_site_info.csv")
    monkeypatch.setattr(api, "RAW", raw_dir)

    response = client.get("/api/v1/stations/station")

    assert response.status_code == 200
    assert response.json()["metadata"]["country_name"] == "Example"
    assert response.json()["observations_imported"] is False
    assert response.json()["constituents"] == []
