"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleHelp, Flag, FlaskConical, Ruler, Waves } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type QualitySummary = {
  records: number;
  missing_values: number;
  flagged_records: number;
  records_with_detection_limits: number;
};

export function QualityWorkspace() {
  const query = useQuery({
    queryKey: ["quality-summary"],
    queryFn: async ({ signal }): Promise<QualitySummary> => {
      const response = await fetch(`${API}/api/v1/quality/summary`, { signal });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.detail?.message ?? "Quality summary could not be loaded.",
        );
      return body as QualitySummary;
    },
  });
  const data = query.data;
  const error = query.error instanceof Error ? query.error.message : "";
  return (
    <section
      className="panel quality-workspace"
      aria-labelledby="quality-title"
    >
      <div className="panel-heading">
        <div>
          <div className="eyebrow">SOURCE-PRESERVING AUDIT</div>
          <h2 id="quality-title">Imported record quality</h2>
          <p>
            Counts describe imported constituent files only; source flags and
            detection limits are retained.
          </p>
        </div>
      </div>
      {query.isFetching ? (
        <div className="temporal-state">
          <span className="spinner" /> Reading quality fields…
        </div>
      ) : error ? (
        <div className="temporal-state" role="status">
          <CircleHelp size={17} />
          {error.includes("not prepared") || error.includes("first")
            ? "Import an official constituent file to calculate these quality summaries."
            : error}
        </div>
      ) : data ? (
        <>
          <div className="quality-stats">
            <QualityMetric
              icon={FlaskConical}
              label="SOURCE RECORDS"
              value={data.records}
              note="Imported source rows"
            />
            <QualityMetric
              icon={CircleHelp}
              label="MISSING MEASUREMENTS"
              value={data.missing_values}
              note="Concentration field is null"
            />
            <QualityMetric
              icon={Flag}
              label="SOURCE-FLAGGED"
              value={data.flagged_records}
              note="Any non-empty source flag"
            />
            <QualityMetric
              icon={Ruler}
              label="WITH DETECTION LIMIT"
              value={data.records_with_detection_limits}
              note="Limit value retained"
            />
          </div>
          <div className="quality-callout">
            <Waves size={16} />
            <p>
              Flag values are summarized as supplied. This view does not infer
              censoring direction or treat a detection limit as a measured
              concentration; consult the source-specific documentation before
              applying a censoring model.
            </p>
          </div>
        </>
      ) : (
        <div className="temporal-state">
          <CircleHelp size={17} />
          Import an official constituent file to calculate these quality
          summaries.
        </div>
      )}
    </section>
  );
}

function QualityMetric({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof FlaskConical;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="temporal-stat">
      <span>
        <Icon size={13} />
        {label}
      </span>
      <strong>{value.toLocaleString()}</strong>
      <small>{note}</small>
    </div>
  );
}
