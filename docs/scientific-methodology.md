# Scientific methodology

## Concentration–discharge association

For one station and one constituent, the current analysis uses source records where both concentration and streamflow are finite on the same date. It reports Spearman's rank correlation coefficient, the paired sample count, and the p-value. At least eight pairs are required; constant inputs yield an undefined result. This minimum is an interface guardrail, not a universal guarantee of statistical power.

Spearman's rho measures monotonic association and does not establish causation. Irregular sampling and temporal dependence can affect uncertainty; the current p-value is the conventional two-sided rank test and does not adjust for serial dependence. Source records remain available in the CSV export.

The scatter plot uses logarithmic visual coordinates for positive concentration and flow values. Zero, negative and missing values are excluded from the plotted coordinates and counted; they are not silently removed from the analysis response or export. No interpolation, gap filling or between-sample animation is applied.

## Temporal trends and seasonal distributions

Trend estimates first collapse multiple source records on the same calendar date to a daily median. Theil–Sen slope is expressed per year with its SciPy 95% interval, and Kendall tau summarizes monotonic association between date and daily median. At least eight distinct sampling dates are required. These simple methods do not adjust for seasonality, temporal autocorrelation, censoring, source flags, or changes in station coverage; they are exploratory summaries, not definitive attribution or causal estimates.

Seasonal summaries group actual source measurements by calendar month, reporting the median, interquartile range and count. Unsampled months and month/year combinations are omitted. No northern/southern hemisphere season is inferred.

## Flow regimes and sampled loads

Flow regimes divide positive same-date discharge observations into five sample-specific quintiles and summarize the paired concentration distribution in each group. Thresholds depend on the selected period and sample and are not long-term flow-duration classes.

For concentrations with a supported mg/L unit, the load module calculates the sampled daily-equivalent rate `C × Q × 86.4` in kg/day using same-date source flow in m³/s. It does not integrate between observations or estimate daily, monthly or annual loads. Non-positive and missing values are excluded from that calculation and counted. pH, temperature, counts and unsupported units are rejected.

## Data quality and limitations

Detection limits and flags are retained. Censored values are not substituted with zero or half the detection limit. The current concentration–discharge calculation uses the numeric source observation as supplied; it does not apply a censoring model. Uneven sampling, geographic bias, source-level quality differences and station/gauge linkage uncertainty should be considered in interpretation.

The source release is historical and versioned. It is not a live monitoring feed. Lite meteorological data is monthly. Missing observations and missing gauges are not evidence of zero chemistry or zero discharge.
