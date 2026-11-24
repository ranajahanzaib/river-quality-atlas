"use client";

import { ArrowRight, Atom, Search } from "lucide-react";
import { useMemo, useState } from "react";

type Constituent = {
  variable: string;
  units: string;
  description: string;
  imported: boolean;
};

export function ConstituentCatalog({
  items,
  onAnalyze,
}: {
  items: Constituent[];
  onAnalyze: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "imported">("all");
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const matchesScope = scope === "all" || item.imported;
        const haystack =
          `${item.variable} ${item.units} ${item.description}`.toLowerCase();
        return matchesScope && haystack.includes(search.trim().toLowerCase());
      }),
    [items, scope, search],
  );

  return (
    <section
      className="panel constituent-workspace"
      aria-labelledby="constituent-title"
    >
      <div className="panel-heading">
        <div>
          <div className="eyebrow">RELEASE VARIABLE REGISTRY</div>
          <h2 id="constituent-title">Water quality constituents</h2>
          <p>
            Browse source definitions and units. Records are available for
            analysis only after their official file is imported.
          </p>
        </div>
      </div>
      <div className="constituent-tools">
        <label className="constituent-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, unit or description"
            aria-label="Search constituents"
          />
        </label>
        <div
          className="constituent-scope"
          role="group"
          aria-label="Constituent file filter"
        >
          <button
            className={scope === "all" ? "is-active" : ""}
            onClick={() => setScope("all")}
          >
            All variables <span>{items.length}</span>
          </button>
          <button
            className={scope === "imported" ? "is-active" : ""}
            onClick={() => setScope("imported")}
          >
            Imported <span>{items.filter((item) => item.imported).length}</span>
          </button>
        </div>
      </div>
      {filtered.length ? (
        <div className="constituent-grid">
          {filtered.map((item) => (
            <article className="constituent-card" key={item.variable}>
              <div className="constituent-card-top">
                <span className="constituent-icon">
                  <Atom size={16} />
                </span>
                <span
                  className={`constituent-status ${item.imported ? "is-imported" : ""}`}
                >
                  {item.imported ? "FILE IMPORTED" : "REGISTRY ONLY"}
                </span>
              </div>
              <h3>{item.variable}</h3>
              <div className="constituent-unit">
                Source unit · {item.units || "Not specified"}
              </div>
              <p>
                {item.description ||
                  "The source registry does not provide a description for this variable."}
              </p>
              <button
                disabled={!item.imported}
                onClick={() => onAnalyze(item.variable)}
              >
                {item.imported ? "Analyze with flow" : "Import required"}
                <ArrowRight size={14} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="temporal-state">No variables match this search.</div>
      )}
      {!items.length && (
        <div className="temporal-state">
          The official variable registry is unavailable. Prepare the quickstart
          dataset to load its catalog.
        </div>
      )}
    </section>
  );
}
