"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleHelp, MapPin, Waves } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type Availability = {
  constituent: string;
  units: { unit: string | null; observations: number }[];
};
type Profile = {
  metadata: Record<string, string | number | null>;
  constituents: Availability[];
  observations_imported: boolean;
};

export function StationProfile({
  stationId,
  onAnalyze,
  onAtlas,
}: {
  stationId: string;
  onAnalyze: () => void;
  onAtlas: () => void;
}) {
  const query = useQuery({
    queryKey: ["station-profile", stationId],
    enabled: Boolean(stationId),
    queryFn: async ({ signal }): Promise<Profile> => {
      const response = await fetch(
        `${API}/api/v1/stations/${encodeURIComponent(stationId)}`,
        { signal },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.detail?.message ?? "Station profile could not be loaded.",
        );
      return body as Profile;
    },
  });
  const profile = query.data;
  const metadata = profile?.metadata;
  const details = metadata
    ? Object.entries(metadata).filter(
        ([key]) =>
          ![
            "wqms_id",
            "country_name",
            "wqms_lat",
            "wqms_lon",
            "gauge_id",
          ].includes(key),
      )
    : [];
  return (
    <section
      className="panel station-profile"
      aria-labelledby="station-profile-title"
    >
      {query.isFetching ? (
        <div className="temporal-state">
          <span className="spinner" /> Loading release metadata…
        </div>
      ) : query.error instanceof Error ? (
        <div className="temporal-state" role="status">
          <CircleHelp size={17} />
          {query.error.message}
        </div>
      ) : metadata ? (
        <>
          <div className="station-profile-head">
            <div>
              <div className="eyebrow">OFFICIAL MONITORING SITE</div>
              <h2 id="station-profile-title" className="mono">
                {String(metadata.wqms_id ?? stationId)}
              </h2>
              <p>{String(metadata.country_name ?? "Country not reported")}</p>
            </div>
            <div className="station-profile-actions">
              <button className="filter-button" onClick={onAtlas}>
                <MapPin size={13} /> Open atlas
              </button>
              <button className="export-button" onClick={onAnalyze}>
                <Waves size={14} /> Analyze station <ArrowRight size={13} />
              </button>
            </div>
          </div>
          <div className="station-facts">
            <Fact
              label="LATITUDE"
              value={formatCoordinate(metadata.wqms_lat)}
            />
            <Fact
              label="LONGITUDE"
              value={formatCoordinate(metadata.wqms_lon)}
            />
            <Fact
              label="FLOW GAUGE"
              value={
                metadata.gauge_id == null || metadata.gauge_id === ""
                  ? "No source-linked gauge"
                  : String(metadata.gauge_id)
              }
            />
            <Fact
              label="OBSERVATION FILES"
              value={
                profile.observations_imported
                  ? profile.constituents.length.toLocaleString()
                  : "Not imported"
              }
            />
          </div>
          {details.length > 0 && (
            <section className="station-source-fields">
              <div className="eyebrow">SOURCE METADATA</div>
              <dl>
                {details.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replaceAll("_", " ")}</dt>
                    <dd>
                      {value == null || value === "" ? "—" : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <section className="station-availability">
            <div className="eyebrow">CONSTITUENT AVAILABILITY</div>
            <h3>Imported measurements at this site</h3>
            {profile.constituents.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>CONSTITUENT</th>
                      <th>SOURCE UNIT</th>
                      <th>RECORDS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.constituents.flatMap((item) =>
                      item.units.map((unit, index) => (
                        <tr key={`${item.constituent}-${index}`}>
                          <td className="mono station-id">
                            {item.constituent}
                          </td>
                          <td>{unit.unit ?? "Unit not reported"}</td>
                          <td className="mono">
                            {unit.observations.toLocaleString()}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="temporal-state" role="status">
                <CircleHelp size={17} />
                {profile.observations_imported
                  ? "No imported constituent records are linked to this station."
                  : "Import an official constituent file to see station-level measurement counts and native units."}
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="temporal-state">
          <CircleHelp size={17} />
          Select a station from the directory to inspect its release metadata.
        </div>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="station-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatCoordinate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(5) : "—";
}
