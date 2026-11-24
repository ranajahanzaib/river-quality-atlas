"use client";

import { useQuery } from "@tanstack/react-query";
import { format, scaleLog } from "d3";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CircleHelp,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Station } from "./AtlasMap";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const tickFormat = format(".2~g");
type Constituent = {
  variable: string;
  units: string;
  description: string;
  imported: boolean;
};
type Point = {
  date: string;
  concentration: number | null;
  discharge: number | null;
  unit: string | null;
  flag: string | null;
  detection_limit: number | null;
};
type Analysis = {
  paired_observations: number;
  excluded_missing_pairs: number;
  spearman_rho: number | null;
  p_value: number | null;
  interpretation: string;
  series: Point[];
};
type UnitOption = { unit: string | null; observations: number };
type FlowRegime = {
  name: string;
  quantile_range: string;
  observations: number;
  median_concentration: number | null;
  q1: number | null;
  q3: number | null;
};
type FlowRegimeResult = {
  paired_observations: number;
  regimes: FlowRegime[];
  note: string;
};
type LoadResult = {
  unit: string;
  paired_positive_observations: number;
  excluded_nonpositive_or_missing: number;
  median_kg_day_equivalent: number | null;
  note: string;
};
const EMPTY_UNITS: UnitOption[] = [];

export function FlowScatter({
  stations,
  constituents,
  initialStation,
  initialConstituent,
}: {
  stations: Station[];
  constituents: Constituent[];
  initialStation?: string;
  initialConstituent?: string;
}) {
  const imported = useMemo(
    () => constituents.filter((item) => item.imported),
    [constituents],
  );
  const [station, setStation] = useState(initialStation ?? "");
  const [constituent, setConstituent] = useState(initialConstituent ?? "");
  const [unitKey, setUnitKey] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [refresh, setRefresh] = useState(0);
  const activeConstituent = constituent || imported[0]?.variable || "";
  const chosenStation = station || initialStation || stations[0]?.wqms_id || "";
  const unitOptionsQuery = useQuery({
    queryKey: ["station-units", chosenStation],
    enabled: Boolean(chosenStation && imported.length),
    queryFn: async ({ signal }): Promise<Record<string, UnitOption[]>> => {
      const response = await fetch(
        `${API}/api/v1/stations/${encodeURIComponent(chosenStation)}/constituents`,
        { signal },
      );
      if (!response.ok)
        throw new Error("Unit availability could not be loaded.");
      const body = (await response.json()) as {
        constituent: string;
        units: UnitOption[];
      }[];
      return Object.fromEntries(
        body.map((item) => [item.constituent.toLowerCase(), item.units]),
      );
    },
  });
  const unitOptions =
    unitOptionsQuery.data?.[activeConstituent.toLowerCase()] ?? EMPTY_UNITS;
  const selectedUnit = unitOptions.find(
    (item) => (item.unit ?? "__missing") === unitKey,
  );
  const activeUnit = unitOptions.length === 1 ? unitOptions[0] : selectedUnit;
  const analysisRequest = {
    station_id: chosenStation,
    constituent: activeConstituent,
    start_date: start || null,
    end_date: end || null,
    ...(activeUnit?.unit ? { unit: activeUnit.unit } : {}),
    ...(activeUnit && activeUnit.unit === null ? { unit_is_null: true } : {}),
  };
  const canAnalyze = Boolean(
    chosenStation &&
    activeConstituent &&
    unitOptionsQuery.isSuccess &&
    (unitOptions.length <= 1 || activeUnit),
  );
  const analysisQuery = useQuery({
    queryKey: [
      "flow-analysis",
      chosenStation,
      activeConstituent,
      unitKey,
      start,
      end,
      refresh,
    ],
    enabled: canAnalyze,
    queryFn: async ({ signal }): Promise<Analysis> => {
      const response = await fetch(
        `${API}/api/v1/analysis/concentration-discharge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(analysisRequest),
          signal,
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.detail?.message ??
            body.detail ??
            "Analysis could not be loaded.",
        );
      return body as Analysis;
    },
  });
  const regimeQuery = useQuery({
    queryKey: [
      "flow-regimes",
      chosenStation,
      activeConstituent,
      unitKey,
      start,
      end,
    ],
    enabled: canAnalyze,
    queryFn: async ({ signal }): Promise<FlowRegimeResult> =>
      postAnalysis("flow-regimes", analysisRequest, signal),
  });
  const supportsLoad = activeUnit?.unit
    ? ["mg/l", "mgl-1"].includes(
        activeUnit.unit.toLowerCase().replaceAll(" ", ""),
      )
    : false;
  const loadQuery = useQuery({
    queryKey: [
      "flow-loads",
      chosenStation,
      activeConstituent,
      unitKey,
      start,
      end,
    ],
    enabled: canAnalyze && supportsLoad,
    queryFn: async ({ signal }): Promise<LoadResult> =>
      postAnalysis("loads", analysisRequest, signal),
  });
  const analysis = analysisQuery.data ?? null;
  const loading =
    analysisQuery.isLoading ||
    analysisQuery.isFetching ||
    unitOptionsQuery.isFetching;
  const error =
    analysisQuery.error instanceof Error
      ? analysisQuery.error.message
      : unitOptionsQuery.error instanceof Error
        ? unitOptionsQuery.error.message
        : "";

  const points = useMemo(
    () =>
      (analysis?.series ?? []).filter(
        (row) =>
          row.concentration !== null &&
          row.discharge !== null &&
          row.concentration > 0 &&
          row.discharge > 0,
      ),
    [analysis],
  );
  const plot = useMemo(() => {
    if (!points.length) return [];
    const positiveExtent = (values: number[]): [number, number] => {
      const low = Math.min(...values);
      const high = Math.max(...values);
      return low === high ? [low / 1.5, high * 1.5] : [low, high];
    };
    const xScale = scaleLog()
      .domain(positiveExtent(points.map((point) => point.discharge as number)))
      .range([66, 654]);
    const yScale = scaleLog()
      .domain(
        positiveExtent(points.map((point) => point.concentration as number)),
      )
      .range([220, 46]);
    return points.map((point) => {
      return {
        point,
        x: xScale(point.discharge as number),
        y: yScale(point.concentration as number),
      };
    });
  }, [points]);
  const ticks = useMemo(() => {
    if (!points.length)
      return {
        x: [] as { position: number; label: string }[],
        y: [] as { position: number; label: string }[],
      };
    const positiveExtent = (values: number[]): [number, number] => {
      const low = Math.min(...values);
      const high = Math.max(...values);
      return low === high ? [low / 1.5, high * 1.5] : [low, high];
    };
    const xScale = scaleLog()
      .domain(positiveExtent(points.map((point) => point.discharge as number)))
      .range([66, 654]);
    const yScale = scaleLog()
      .domain(
        positiveExtent(points.map((point) => point.concentration as number)),
      )
      .range([220, 46]);
    return {
      x: xScale
        .ticks(5)
        .map((value) => ({
          position: xScale(value),
          label: tickFormat(value),
        })),
      y: yScale
        .ticks(5)
        .map((value) => ({
          position: yScale(value),
          label: tickFormat(value),
        })),
    };
  }, [points]);

  const exportCsv = () => {
    if (!analysis) return;
    const headers = [
      "date",
      "concentration",
      "unit",
      "discharge_m3_s",
      "source_flag",
      "detection_limit",
    ];
    const rows = analysis.series.map((item) => [
      item.date,
      item.concentration,
      item.unit,
      item.discharge,
      item.flag,
      item.detection_limit,
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${chosenStation}-${activeConstituent}-flow-pairs.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="panel flow-panel" aria-labelledby="flow-title">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> RELATIONSHIP EXPLORER
          </div>
          <h2 id="flow-title">
            Concentration <span className="heading-operator">×</span> discharge
          </h2>
          <p>
            Observe how chemistry varies with flow at the same station and
            sampling dates.
          </p>
        </div>
        <div className="panel-actions">
          <button
            className="icon-button"
            onClick={() => setRefresh((n) => n + 1)}
            aria-label="Refresh analysis"
            title="Refresh analysis"
          >
            <RefreshCw size={15} />
          </button>
          <button
            className="icon-button"
            onClick={exportCsv}
            disabled={!analysis}
            aria-label="Export paired observations as CSV"
            title="Export paired observations as CSV"
          >
            <ArrowDownToLine size={15} />
          </button>
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
      <div className="chart-subhead">
        <div className="chart-legend">
          <span className="legend-dot" /> Same-day paired observations{" "}
          <span className="chart-count">
            {analysis
              ? `${analysis.paired_observations.toLocaleString()} pairs`
              : "— pairs"}
          </span>
        </div>
        <div className="chart-scale">
          <span className="scale-icon">log</span> Log scales · positive values
          only
        </div>
      </div>
      <div className="scatter-wrap">
        <svg
          className="scatter-chart"
          viewBox="0 0 700 272"
          role="img"
          aria-label={`Concentration and discharge paired observation scatter plot for ${activeConstituent || "selected constituent"}`}
        >
          <g className="chart-grid">
            {ticks.y.map((tick, index) => (
              <line
                key={`y${index}`}
                x1="66"
                x2="654"
                y1={tick.position}
                y2={tick.position}
              />
            ))}
            {ticks.x.map((tick, index) => (
              <line
                key={`x${index}`}
                y1="46"
                y2="220"
                x1={tick.position}
                x2={tick.position}
              />
            ))}
          </g>
          <line className="chart-axis" x1="66" x2="654" y1="220" y2="220" />
          <line className="chart-axis" x1="66" x2="66" y1="46" y2="220" />
          {ticks.x.map((tick, index) => (
            <text
              key={`xtick-${index}`}
              className="axis-tick"
              x={tick.position}
              y="233"
              textAnchor="middle"
            >
              {tick.label}
            </text>
          ))}
          {ticks.y.map((tick, index) => (
            <text
              key={`ytick-${index}`}
              className="axis-tick"
              x="58"
              y={tick.position + 2.5}
              textAnchor="end"
            >
              {tick.label}
            </text>
          ))}
          <text className="axis-label" x="360" y="260" textAnchor="middle">
            DISCHARGE (m³ s⁻¹) · LOG SCALE
          </text>
          <text
            className="axis-label"
            transform="translate(13 133) rotate(-90)"
            textAnchor="middle"
          >
            CONCENTRATION (
            {analysis?.series.find((item) => item.unit)?.unit ?? "source unit"})
            · LOG SCALE
          </text>
          {plot.map(({ point, x, y }, index) => (
            <circle
              key={`${point.date}-${index}`}
              cx={x}
              cy={y}
              r="3.3"
              className={
                point.flag
                  ? "scatter-point scatter-point--flagged"
                  : "scatter-point"
              }
            >
              <title>{`${point.date}: ${point.concentration} ${point.unit ?? ""} · ${point.discharge} m³ s⁻¹${point.flag ? ` · source flag ${point.flag}` : ""}${point.detection_limit != null ? ` · detection limit ${point.detection_limit}` : ""}`}</title>
            </circle>
          ))}
        </svg>
        {(loading ||
          error ||
          (!analysis && !loading) ||
          Boolean(analysis && !plot.length)) && (
          <div className="chart-overlay" role="status">
            {loading ? (
              <>
                <span className="spinner" />
                <span>Loading paired observations…</span>
              </>
            ) : error ? (
              <>
                <CircleHelp size={19} />
                <span>{error}</span>
              </>
            ) : analysis ? (
              <>
                <CircleHelp size={19} />
                <span>
                  {analysis.series.length
                    ? "No positive concentration–flow pairs fit the logarithmic chart. The records remain available in the CSV export."
                    : "No paired observations exist for this station, constituent and date range."}
                </span>
              </>
            ) : (
              <>
                <CircleHelp size={19} />
                <span>
                  {unitOptions.length > 1 && !activeUnit
                    ? "Choose a measurement unit to avoid combining unlike source values."
                    : stations.length
                      ? "Choose a constituent observation file to view the measured concentration–flow pairs."
                      : "Import the official Caravan-Qual release to explore paired chemical and discharge records."}
                </span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="analysis-footer">
        <div className="stat-inline">
          <span>RANK ASSOCIATION</span>
          <strong>
            {analysis?.spearman_rho == null
              ? "—"
              : analysis.spearman_rho.toFixed(2)}
          </strong>
          <small>
            Spearman ρ
            {analysis?.p_value == null
              ? ""
              : ` · p=${analysis.p_value.toPrecision(2)}`}
          </small>
        </div>
        <div className="stat-inline">
          <span>PAIRED SAMPLE</span>
          <strong>
            {analysis?.paired_observations.toLocaleString() ?? "—"}
          </strong>
          <small>same-day values</small>
        </div>
        <div className="stat-inline">
          <span>EXCLUDED FROM PLOT</span>
          <strong>
            {analysis
              ? (analysis.series.length - points.length).toLocaleString()
              : "—"}
          </strong>
          <small>non-positive / missing axes</small>
        </div>
        <div className="analysis-note">
          <CircleHelp size={13} />
          <span>
            {analysis?.interpretation ??
              "Association is calculated from same-date measurements only. No discharge values are interpolated."}
          </span>
          <ArrowUpRight size={13} />
        </div>
      </div>
      <FlowRegimePanel
        regimes={regimeQuery.data}
        load={loadQuery.data}
        loadSupported={supportsLoad}
        unit={analysis?.series.find((item) => item.unit)?.unit ?? null}
      />
    </section>
  );
}

async function postAnalysis<T>(
  route: string,
  body: object,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API}/api/v1/analysis/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.detail === "string"
        ? result.detail
        : (result.detail?.message ?? "Analysis could not be loaded."),
    );
  return result as T;
}

function FlowRegimePanel({
  regimes,
  load,
  loadSupported,
  unit,
}: {
  regimes?: FlowRegimeResult;
  load?: LoadResult;
  loadSupported: boolean;
  unit: string | null;
}) {
  return (
    <div className="flow-secondary-grid">
      <section className="flow-secondary-panel">
        <div className="eyebrow">PAIRED FLOW QUINTILES</div>
        <h3>Concentrations by sampled flow regime</h3>
        {regimes?.regimes.length ? (
          <div className="regime-table">
            <div className="regime-row regime-row--head">
              <span>FLOW RANGE</span>
              <span>SAMPLES</span>
              <span>MEDIAN C</span>
            </div>
            {regimes.regimes.map((item) => (
              <div className="regime-row" key={item.name}>
                <span>
                  {item.name} <small>{item.quantile_range}</small>
                </span>
                <span>{item.observations.toLocaleString()}</span>
                <span>
                  {item.median_concentration == null
                    ? "—"
                    : formatValue(item.median_concentration, unit)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="secondary-empty">
            {regimes?.note ??
              "Flow-regime summaries appear when paired measurements are available."}
          </p>
        )}
        <p className="secondary-note">
          {regimes?.note ??
            "Thresholds are based only on positive same-date flows in the selected period."}
        </p>
      </section>
      <section className="flow-secondary-panel">
        <div className="eyebrow">SUPPORTED MASS CONCENTRATIONS</div>
        <h3>Sampled daily-equivalent load</h3>
        {load ? (
          <>
            <strong className="load-value">
              {load.median_kg_day_equivalent == null
                ? "—"
                : `${formatValue(load.median_kg_day_equivalent, null)} kg/day`}
            </strong>
            <span className="load-count">
              {load.paired_positive_observations.toLocaleString()} positive
              pairs · {load.excluded_nonpositive_or_missing.toLocaleString()}{" "}
              excluded
            </span>
            <p className="secondary-note">{load.note}</p>
          </>
        ) : (
          <p className="secondary-empty">
            {loadSupported
              ? "Calculating sampled load values…"
              : unit
                ? `Load conversion is unavailable for ${unit}; only verified mg/L mass concentrations are supported.`
                : "Load estimates require an explicitly reported mass-concentration unit in mg/L."}
          </p>
        )}
      </section>
    </div>
  );
}

function formatValue(value: number, unit: string | null): string {
  const formatted = new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: 4,
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}
