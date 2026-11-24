from datetime import date, timedelta

import pytest

from river_quality_atlas.analytics.temporal import seasonal_summary, temporal_trend


def test_trend_uses_daily_medians_and_reports_per_year_slope() -> None:
    start = date(2000, 1, 1)
    rows = [(start + timedelta(days=365 * year), 4.0 + year * 2.0) for year in range(10)]
    rows.extend([(start, 2.0), (start, 6.0)])

    result = temporal_trend([(day.isoformat(), value) for day, value in rows])

    assert result.observations == 12
    assert result.sampling_days == 10
    assert result.slope_per_year == pytest.approx(2.0, abs=0.01)
    assert result.slope_ci_low is not None
    assert result.slope_ci_high is not None
    assert result.start_date == "2000-01-01"
    assert result.end_date == "2008-12-29"


def test_trend_does_not_report_a_slope_below_minimum_sampling_days() -> None:
    rows = [(date(2020, 1, day).isoformat(), float(day)) for day in range(1, 8)]

    result = temporal_trend(rows)

    assert result.slope_per_year is None
    assert result.p_value is None
    assert result.sampling_days == 7


def test_seasonality_omits_unsampled_months_and_keeps_sample_counts() -> None:
    result = seasonal_summary(
        [
            ("2020-01-01", 1.0),
            ("2020-01-10", 3.0),
            ("2021-07-05", 9.0),
            ("2021-08-05", None),
        ]
    )

    assert result["observations"] == 3
    assert [item["month"] for item in result["months"]] == [1, 7]
    assert result["months"][0] == {
        "month": 1,
        "name": "January",
        "observations": 2,
        "median": 2.0,
        "q1": 1.5,
        "q3": 2.5,
    }
    assert len(result["month_by_year"]) == 2

