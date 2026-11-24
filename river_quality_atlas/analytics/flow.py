"""Concentration and discharge calculations with explicit paired sampling."""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median

import numpy as np
from scipy.stats import spearmanr

FLOW_REGIMES = ("Very low", "Low", "Moderate", "High", "Very high")


@dataclass(frozen=True)
class FlowResult:
    paired_observations: int
    excluded_missing_pairs: int
    rho: float | None
    p_value: float | None
    interpretation: str


def concentration_discharge(rows: list[tuple[float | None, float | None]]) -> FlowResult:
    """Calculate rank association using only same-date, observed concentration-flow pairs."""
    pairs = [
        (c, q)
        for c, q in rows
        if c is not None and q is not None and np.isfinite(c) and np.isfinite(q)
    ]
    n = len(pairs)
    if n < 8:
        return FlowResult(
            n,
            len(rows) - n,
            None,
            None,
            "At least 8 paired observations are required for this summary.",
        )
    concentrations, discharges = zip(*pairs, strict=True)
    if len(set(concentrations)) < 2 or len(set(discharges)) < 2:
        return FlowResult(
            n, len(rows) - n, None, None, "Association is undefined because one series is constant."
        )
    result = spearmanr(concentrations, discharges)
    return FlowResult(
        n,
        len(rows) - n,
        float(result.statistic),
        float(result.pvalue),
        "Spearman rank association describes monotonic co-variation; "
        "it does not establish causation.",
    )


def flow_regime_summary(rows: list[tuple[float | None, float | None]]) -> dict[str, object]:
    """Describe concentrations across quintiles of the selected paired flow sample."""
    pairs = [
        (float(c), float(q))
        for c, q in rows
        if c is not None and q is not None and np.isfinite(c) and np.isfinite(q) and q > 0
    ]
    if not pairs:
        return {
            "paired_observations": 0,
            "flow_thresholds": [],
            "regimes": [],
            "note": "No finite, positive-flow pairs are available in the selected period.",
        }
    concentrations = np.asarray([pair[0] for pair in pairs], dtype=np.float64)
    flows = np.asarray([pair[1] for pair in pairs], dtype=np.float64)
    thresholds = np.quantile(flows, [0.2, 0.4, 0.6, 0.8]).tolist()
    regime_index = np.searchsorted(thresholds, flows, side="left")
    regimes = []
    for index, name in enumerate(FLOW_REGIMES):
        values = concentrations[regime_index == index]
        regimes.append(
            {
                "name": name,
                "quantile_range": f"{index * 20}–{(index + 1) * 20}%",
                "observations": int(values.size),
                "median_concentration": float(median(values)) if values.size else None,
                "q1": float(np.quantile(values, 0.25)) if values.size else None,
                "q3": float(np.quantile(values, 0.75)) if values.size else None,
            }
        )
    return {
        "paired_observations": len(pairs),
        "flow_thresholds": [float(value) for value in thresholds],
        "regimes": regimes,
        "note": (
            "Quintile thresholds use positive same-date flows from this station, constituent "
            "and selected period; ties may yield unequal bin counts. They are sample-specific, "
            "not long-term flow-duration classes."
        ),
    }


def instantaneous_loads(
    rows: list[tuple[str | None, float | None, float | None]], unit: str | None
) -> dict[str, object]:
    """Calculate sampled daily-equivalent loads only for verified mg/L concentrations."""
    normalized_unit = "".join(unit.lower().split()) if unit else ""
    if normalized_unit not in {"mg/l", "mgl-1"}:
        raise ValueError(
            "Daily-equivalent loads are available only for mass concentrations in mg/L."
        )
    eligible = [
        (day, float(concentration), float(flow))
        for day, concentration, flow in rows
        if day is not None
        and concentration is not None
        and flow is not None
        and np.isfinite(concentration)
        and np.isfinite(flow)
        and concentration > 0
        and flow > 0
    ]
    series = [
        {"date": day, "load_kg_day_equivalent": concentration * flow * 86.4}
        for day, concentration, flow in eligible
    ]
    loads = [item["load_kg_day_equivalent"] for item in series]
    return {
        "unit": "kg/day equivalent",
        "paired_positive_observations": len(series),
        "excluded_nonpositive_or_missing": len(rows) - len(series),
        "median_kg_day_equivalent": float(median(loads)) if loads else None,
        "series": series,
        "note": (
            "Sampled instantaneous concentration × same-date streamflow converted to a "
            "daily-equivalent rate. Values are not integrated daily or annual loads."
        ),
    }
