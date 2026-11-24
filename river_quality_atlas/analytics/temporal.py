"""Temporal summaries that preserve irregular source sampling."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
from scipy.stats import kendalltau, theilslopes

MIN_TREND_DAYS = 8


@dataclass(frozen=True)
class TrendResult:
    observations: int
    sampling_days: int
    start_date: str | None
    end_date: str | None
    slope_per_year: float | None
    intercept: float | None
    slope_ci_low: float | None
    slope_ci_high: float | None
    kendall_tau: float | None
    p_value: float | None
    method: str
    note: str


def temporal_trend(rows: list[tuple[str | date | None, float | None]]) -> TrendResult:
    """Estimate a Theil–Sen slope and Kendall trend association from daily medians."""
    daily: dict[date, list[float]] = {}
    for raw_day, value in rows:
        if raw_day is None or value is None or not np.isfinite(value):
            continue
        day = raw_day if isinstance(raw_day, date) else date.fromisoformat(raw_day[:10])
        daily.setdefault(day, []).append(float(value))

    dates = sorted(daily)
    if len(dates) < MIN_TREND_DAYS:
        return TrendResult(
            sum(len(values) for values in daily.values()), len(dates),
            dates[0].isoformat() if dates else None,
            dates[-1].isoformat() if dates else None,
            None, None, None, None, None, None, "Theil–Sen + Kendall tau",
            f"At least {MIN_TREND_DAYS} distinct sampling dates are required.",
        )

    values = np.array([np.median(daily[day]) for day in dates], dtype=np.float64)
    epoch = date(1970, 1, 1).toordinal()
    years = np.array([(day.toordinal() - epoch) / 365.2425 for day in dates], dtype=np.float64)
    slope = theilslopes(values, years, alpha=0.95)
    association = kendalltau(years, values, nan_policy="omit")
    return TrendResult(
        sum(len(items) for items in daily.values()),
        len(dates),
        dates[0].isoformat(),
        dates[-1].isoformat(),
        float(slope.slope),
        float(slope.intercept),
        float(slope.low_slope),
        float(slope.high_slope),
        float(association.statistic),
        float(association.pvalue),
        "Theil–Sen slope on daily medians; Kendall tau trend test",
        "Descriptive trend test; it does not adjust for seasonality, serial dependence, "
        "censoring, or uneven site coverage. Significance is not causal evidence.",
    )


MONTH_NAMES = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)


def seasonal_summary(
    rows: list[tuple[str | date | None, float | None]],
) -> dict[str, object]:
    """Return observed calendar-month distributions without filling unsampled months."""
    by_month: dict[int, list[float]] = {}
    by_year_month: dict[tuple[int, int], list[float]] = {}
    for raw_day, value in rows:
        if raw_day is None or value is None or not np.isfinite(value):
            continue
        day = raw_day if isinstance(raw_day, date) else date.fromisoformat(raw_day[:10])
        by_month.setdefault(day.month, []).append(float(value))
        by_year_month.setdefault((day.year, day.month), []).append(float(value))

    def distribution(values: list[float]) -> dict[str, object]:
        quartiles = np.quantile(values, [0.25, 0.5, 0.75])
        return {
            "observations": len(values),
            "median": float(quartiles[1]),
            "q1": float(quartiles[0]),
            "q3": float(quartiles[2]),
        }

    months = [
        {"month": month, "name": MONTH_NAMES[month - 1], **distribution(values)}
        for month, values in sorted(by_month.items())
    ]
    heatmap = [
        {"year": year, "month": month, **distribution(values)}
        for (year, month), values in sorted(by_year_month.items())
    ]
    dates = [
        raw_day if isinstance(raw_day, date) else date.fromisoformat(raw_day[:10])
        for raw_day, value in rows
        if raw_day is not None and value is not None and np.isfinite(value)
    ]
    return {
        "observations": sum(item["observations"] for item in months),
        "period": {"start": min(dates).isoformat() if dates else None,
                   "end": max(dates).isoformat() if dates else None},
        "months": months,
        "month_by_year": heatmap,
        "note": "Descriptive source-sample distributions by calendar month. Unsampled "
        "month/year cells are omitted; seasonal differences are not causal estimates.",
    }
