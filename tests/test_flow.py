import pytest

from river_quality_atlas.analytics.flow import (
    concentration_discharge,
    flow_regime_summary,
    instantaneous_loads,
)


def test_perfect_monotonic_pairs_have_unit_rank_association() -> None:
    result = concentration_discharge([(float(value), float(value * 3)) for value in range(1, 9)])

    assert result.paired_observations == 8
    assert result.excluded_missing_pairs == 0
    assert result.rho == 1.0
    assert result.p_value is not None and result.p_value < 0.01


def test_missing_flow_is_excluded_without_filling() -> None:
    rows = [(float(value), float(value * 2)) for value in range(1, 9)]
    rows.extend([(9.0, None), (None, 20.0)])

    result = concentration_discharge(rows)

    assert result.paired_observations == 8
    assert result.excluded_missing_pairs == 2
    assert result.rho == 1.0


def test_small_sample_is_reported_as_insufficient() -> None:
    result = concentration_discharge([(1.0, 2.0)] * 7)

    assert result.paired_observations == 7
    assert result.rho is None
    assert "8 paired observations" in result.interpretation


def test_constant_series_has_undefined_association() -> None:
    result = concentration_discharge([(2.0, float(value)) for value in range(8)])

    assert result.paired_observations == 8
    assert result.rho is None
    assert "constant" in result.interpretation


def test_flow_regimes_use_selected_sample_quintiles() -> None:
    result = flow_regime_summary([(float(index), float(index)) for index in range(1, 11)])

    assert result["paired_observations"] == 10
    assert [row["observations"] for row in result["regimes"]] == [2, 2, 2, 2, 2]
    assert result["regimes"][0]["median_concentration"] == 1.5
    assert "sample-specific" in result["note"]


def test_daily_equivalent_load_formula_and_unit_guardrail() -> None:
    result = instantaneous_loads([("2020-01-01", 2.0, 3.0)], "mg/L")

    assert result["median_kg_day_equivalent"] == pytest.approx(518.4)
    assert result["unit"] == "kg/day equivalent"
    with pytest.raises(ValueError, match="only for mass concentrations"):
        instantaneous_loads([("2020-01-01", 7.0, 3.0)], "pH")
