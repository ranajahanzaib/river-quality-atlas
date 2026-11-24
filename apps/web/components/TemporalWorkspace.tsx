"use client";

import { useQuery } from "@tanstack/react-query";
import { scaleLinear } from "d3";
import { CircleHelp } from "lucide-react";
import { useMemo, useState } from "react";
import type { Station } from "./AtlasMap";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type Constituent = {
  variable: string;
  units: string;
  description: string;
  imported: boolean;
};
type UnitOption = { unit: string | null; observations: number };
type MonthSummary = {
  month: number;
  name: string;
  observations: number;
  median: number;
  q1: number;
  q3: number;
};
type Trend = {
  unit: string | null;
  observations: number;
  sampling_days: number;
  start_date: string | null;
  end_date: string | null;
  slope_per_year: number | null;
  intercept: number | null;
  slope_ci_low: number | null;
  slope_ci_high: number | null;
  kendall_tau: number | null;
  p_value: number | null;
  method: string;
  note: string;
  series: { date: string; median: number }[];
  series_downsampled: boolean;
};
type Seasonality = {
  unit: string | null;
  observations: number;
  period: { start: string | null; end: string | null };
  months: MonthSummary[];
  note: string;
};
const EMPTY_UNITS: UnitOption[] = [];

export function TemporalWorkspace({
  mode,
  stations,
  constituents,
  initialStation,
}: {
  mode: "trends" | "seasonality";
  stations: Station[];
  constituents: Constituent[];
  initialStation?: string;
}) {
  const imported = useMemo(
    () => constituents.filter((item) => item.imported),
    [constituents],
  );
  const [station, setStation] = useState(initialStation ?? "");
  const [constituent, setConstituent] = useState("");
  const [unitKey, setUnitKey] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const activeConstituent = constituent || imported[0]?.variable || "";
  const chosenStation = station || initialStation || stations[0]?.wqms_id || "";

  const unitsQuery = useQuery({
    queryKey: ["station-units", chosenStation],
    enabled: Boolean(chosenStation && imported.length),
    queryFn: async ({ signal }): Promise<Record<string, UnitOption[]>> => {
      const response = await fetch(
        `${API}/api/v1/stations/${encodeURIComponent(chosenStation)}/constituents`,
        { signal },
      );
      if (!response.ok)
        throw new Error("Unit availability could not be loaded.");
      const rows = (await response.json()) as {
        constituent: string;
        units: UnitOption[];
      }[];
      return Object.fromEntries(
        rows.map((row) => [row.constituent.toLowerCase(), row.units]),
      );
    },
  });
  const unitOptions =
    unitsQuery.data?.[activeConstituent.toLowerCase()] ?? EMPTY_UNITS;
  const selectedUnit = unitOptions.find(
    (item) => (item.unit ?? "__missing") === unitKey,
  );
  const activeUnit = unitOptions.length === 1 ? unitOptions[0] : selectedUnit;

  const query = useQuery({
    queryKey: [mode, chosenStation, activeConstituent, unitKey, start, end],
    enabled: Boolean(
      chosenStation &&
      activeConstituent &&
      unitsQuery.isSuccess &&
      (unitOptions.length <= 1 || activeUnit),
    ),
    queryFn: async ({ signal }): Promise<Trend | Seasonality> => {
      const response = await fetch(`${API}/api/v1/analysis/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station_id: chosenStation,
          constituent: activeConstituent,
          start_date: start || null,
          end_date: end || null,
          ...(activeUnit?.unit ? { unit: activeUnit.unit } : {}),
          ...(activeUnit?.unit === null ? { unit_is_null: true } : {}),
        }),
        signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : (body.detail?.message ?? "Analysis could not be loaded."),
        );
      return body as Trend | Seasonality;
    },
  });
  const error =
    query.error instanceof Error
      ? query.error.message
      : unitsQuery.error instanceof Error
        ? unitsQuery.error.message
        : "";
  const trend =
    mode === "trends" ? (query.data as Trend | undefined) : undefined;
  const seasonal =
    mode === "seasonality"
      ? (query.data as Seasonality | undefined)
      : undefined;

  return (
    <section className="panel temporal-panel" aria-labelledby="temporal-title">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">
            {mode === "trends"
              ? "IRREGULAR-SAMPLE TREND"
              : "CALENDAR-MONTH DISTRIBUTION"}
          </div>
          <h2 id="temporal-title">
            {mode === "trends"
              ? "Temporal trend analysis"
              : "Seasonal patterns"}
          </h2>
          <p>
            {mode === "trends"
              ? "Summarize measured change without filling unsampled dates."
              : "Compare source observations by calendar month; missing months stay unfilled."}
          </p>
        </div>
      </div>
      <div className="analysis-filters">
        <label>
          <span>MONITORING STATION</span>
          <select
            value={chosenStation}
            onChange={(event) => setStation(event.target.value)}
            disabled={!stations.length}
          >
            {stations.length ? (
              stations.slice(0, 250).map((item) => (
                <option key={item.wqms_id} value={item.wqms_id}>
                  {item.wqms_id} · {item.country_name ?? "Unknown country"}
                </option>
              ))
            ) : (
              <option value="">Import station metadata</option>
            )}
          </select>
        </label>
        <label>
          <span>CONSTITUENT</span>
          <select
            value={activeConstituent}
            onChange={(event) => setConstituent(event.target.value)}
            disabled={!imported.length}
          >
            {imported.length ? (
              imported.map((item) => (
                <option key={item.variable} value={item.variable}>
                  {item.description} ({item.variable})
                </option>
              ))
            ) : (
              <option value="">Import observation records</option>
            )}
          </select>
        </label>
        {unitOptions.length > 1 && (
          <label>
            <span>MEASUREMENT UNIT</span>
            <select
              value={unitKey}
              onChange={(event) => setUnitKey(event.target.value)}
            >
              <option value="">Choose unit</option>
              {unitOptions.map((item) => (
                <option
                  key={item.unit ?? "__missing"}
                  value={item.unit ?? "__missing"}
                >
                  {item.unit ?? "Unit not reported"} ·{" "}
                  {item.observations.toLocaleString()} records
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="date-filter">
          <span>FROM</span>
          <input
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label className="date-filter">
          <span>TO</span>
          <input
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
      </div>
      {query.isFetching ? (
        <div className="temporal-state">
          <span className="spinner" /> Loading source observations…
        </div>
      ) : error ? (
        <div className="temporal-state" role="status">
          <CircleHelp size={17} />
          {error}
        </div>
      ) : trend ? (
        <TrendResultView
          result={trend}
          unit={query.data && "unit" in query.data ? query.data.unit : null}
        />
      ) : seasonal ? (
        <SeasonalResultView
          result={seasonal}
          unit={query.data && "unit" in query.data ? query.data.unit : null}
        />
      ) : (
        <div className="temporal-state" role="status">
          <CircleHelp size={17} />
          {unitsQuery.isLoading
            ? "Loading station coverage…"
            : "Select an imported station and constituent to begin."}
        </div>
      )}
    </section>
  );
}

function TrendResultView({
  result,
  unit,
}: {
  result: Trend;
  unit: string | null;
}) {
  return (
    <>
      <div className="temporal-stats">
        <Stat
          label="SOURCE RECORDS"
          value={result.observations.toLocaleString()}
          note={`${result.sampling_days.toLocaleString()} distinct sampling dates`}
        />
        <Stat
          label="THEIL–SEN SLOPE"
          value={
            result.slope_per_year == null
              ? "—"
              : `${formatNumber(result.slope_per_year)} ${unit ?? "source units"}/year`
          }
          note={
            result.slope_ci_low == null || result.slope_ci_high == null
              ? "Insufficient sampling"
              : `95% CI ${formatNumber(result.slope_ci_low)} to ${formatNumber(result.slope_ci_high)}`
          }
        />
        <Stat
          label="KENDALL TAU"
          value={
            result.kendall_tau == null ? "—" : result.kendall_tau.toFixed(2)
          }
          note={
            result.p_value == null
              ? "No test reported"
              : `p = ${result.p_value.toPrecision(2)}`
          }
        />
        <Stat
          label="OBSERVATION WINDOW"
          value={
            result.start_date && result.end_date
              ? `${result.start_date.slice(0, 4)}–${result.end_date.slice(0, 4)}`
              : "—"
          }
          note={result.method}
        />
      </div>
      <TrendChart result={result} unit={unit} />
      <p className="temporal-note">
        <CircleHelp size={13} />
        {result.note}
        {result.series_downsampled
          ? " Chart markers are a time-spaced display sample; estimates use all source rows."
          : ""}
      </p>
    </>
  );
}

function TrendChart({ result, unit }: { result: Trend; unit: string | null }) {
  const chart = useMemo(() => {
    const points = result.series
      .map((item) => ({ ...item, x: Date.parse(`${item.date}T00:00:00Z`) }))
      .filter((item) => Number.isFinite(item.x));
    if (!points.length) return null;
    const x = scaleLinear()
      .domain([points[0].x, points.at(-1)!.x])
      .range([46, 720]);
    const min = Math.min(...points.map((item) => item.median));
    const max = Math.max(...points.map((item) => item.median));
    const pad = (max - min || Math.abs(max) * 0.1 || 1) * 0.12;
    const y = scaleLinear()
      .domain([min - pad, max + pad])
      .nice()
      .range([232, 28]);
    const line = points
      .map((point) => `${x(point.x)},${y(point.median)}`)
      .join(" ");
    const firstYear = points[0].x / (365.2425 * 24 * 60 * 60 * 1000);
    const lastYear = points.at(-1)!.x / (365.2425 * 24 * 60 * 60 * 1000);
    const fit =
      result.slope_per_year != null && result.intercept != null
        ? [
            `${x(points[0].x)},${y(result.intercept + result.slope_per_year * firstYear)}`,
            `${x(points.at(-1)!.x)},${y(result.intercept + result.slope_per_year * lastYear)}`,
          ].join(" ")
        : "";
    return { points, x, y, line, fit };
  }, [result]);
  if (!chart)
    return (
      <div className="temporal-state">
        <CircleHelp size={17} />
        At least eight distinct sampling dates are required to estimate a trend.
      </div>
    );
  return (
    <div className="temporal-chart-wrap">
      <div className="chart-subhead">
        <span>DAILY MEDIAN OF SOURCE MEASUREMENTS</span>
        <span>{unit ?? "Unit not reported"}</span>
      </div>
      <svg
        className="temporal-chart"
        viewBox="0 0 760 270"
        role="img"
        aria-label="Observed daily median water-quality trend"
      >
        <g className="chart-grid">
          {chart.y.ticks(5).map((tick) => (
            <line
              key={tick}
              x1="46"
              x2="720"
              y1={chart.y(tick)}
              y2={chart.y(tick)}
            />
          ))}
        </g>
        <polyline className="temporal-series" points={chart.line} />
        {chart.points.map((point, index) => (
          <circle
            key={`${point.date}-${index}`}
            cx={chart.x(point.x)}
            cy={chart.y(point.median)}
            r="2.3"
            className="temporal-point"
          >
            <title>
              {point.date}: {point.median} {unit ?? ""}
            </title>
          </circle>
        ))}
        {chart.fit && <polyline className="temporal-fit" points={chart.fit} />}
        <text className="axis-tick" x="46" y="252">
          {chart.points[0].date}
        </text>
        <text className="axis-tick" x="720" y="252" textAnchor="end">
          {chart.points.at(-1)!.date}
        </text>
        <text
          className="axis-label"
          transform="translate(14 132) rotate(-90)"
          textAnchor="middle"
        >
          MEDIAN ({unit ?? "source unit"})
        </text>
      </svg>
      <div className="chart-legend temporal-legend">
        <span>
          <i className="legend-dot" /> Daily source median
        </span>
        {chart.fit && (
          <span>
            <i className="legend-fit" /> Theil–Sen fit
          </span>
        )}
      </div>
    </div>
  );
}

function SeasonalResultView({
  result,
  unit,
}: {
  result: Seasonality;
  unit: string | null;
}) {
  const data = result.months;
  const scale = useMemo(() => {
    if (!data.length) return null;
    const values = data.flatMap((item) => [item.q1, item.q3]);
    const extent = [Math.min(...values), Math.max(...values)];
    if (extent[0] === extent[1]) extent[0] -= Math.abs(extent[0]) * 0.1 || 1;
    return scaleLinear().domain(extent).nice().range([270, 35]);
  }, [data]);
  return (
    <>
      <div className="temporal-stats">
        <Stat
          label="SOURCE RECORDS"
          value={result.observations.toLocaleString()}
          note="No values added for unsampled months"
        />
        <Stat
          label="MONTHS OBSERVED"
          value={data.length.toLocaleString()}
          note="Calendar-month groups with source data"
        />
        <Stat
          label="OBSERVATION WINDOW"
          value={
            result.period.start && result.period.end
              ? `${result.period.start.slice(0, 4)}–${result.period.end.slice(0, 4)}`
              : "—"
          }
          note="Source sampling dates"
        />
      </div>
      {scale ? (
        <div className="temporal-chart-wrap">
          <div className="chart-subhead">
            <span>MEDIAN AND INTERQUARTILE RANGE</span>
            <span>{unit ?? "Unit not reported"}</span>
          </div>
          <svg
            className="seasonal-chart"
            viewBox="0 0 760 320"
            role="img"
            aria-label="Monthly distribution of observed measurements"
          >
            <g className="chart-grid">
              {scale.ticks(5).map((tick) => (
                <line
                  key={tick}
                  x1="54"
                  x2="740"
                  y1={scale(tick)}
                  y2={scale(tick)}
                />
              ))}
            </g>
            {data.map((item) => {
              const x = 82 + (item.month - 1) * 56.4;
              return (
                <g key={item.month} className="seasonal-mark">
                  <line x1={x} x2={x} y1={scale(item.q3)} y2={scale(item.q1)} />
                  <line
                    x1={x - 5}
                    x2={x + 5}
                    y1={scale(item.q3)}
                    y2={scale(item.q3)}
                  />
                  <line
                    x1={x - 5}
                    x2={x + 5}
                    y1={scale(item.q1)}
                    y2={scale(item.q1)}
                  />
                  <circle cx={x} cy={scale(item.median)} r="4">
                    <title>{`${item.name}: median ${item.median} ${unit ?? ""}, IQR ${item.q1}–${item.q3}, n=${item.observations}`}</title>
                  </circle>
                  <text className="axis-tick" x={x} y="298" textAnchor="middle">
                    {item.name.slice(0, 3)}
                  </text>
                  <text
                    className="seasonal-count"
                    x={x}
                    y="315"
                    textAnchor="middle"
                  >
                    n={item.observations}
                  </text>
                </g>
              );
            })}
            <text
              className="axis-label"
              transform="translate(15 155) rotate(-90)"
              textAnchor="middle"
            >
              VALUE ({unit ?? "source unit"})
            </text>
          </svg>
        </div>
      ) : (
        <div className="temporal-state">
          <CircleHelp size={17} />
          No measured values fall within this station, constituent and date
          range.
        </div>
      )}
      <p className="temporal-note">
        <CircleHelp size={13} />
        {result.note}
      </p>
    </>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="temporal-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: 4,
  }).format(value);
}
