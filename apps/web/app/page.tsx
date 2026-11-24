"use client";

import { AtlasMap, type Station } from "@/components/AtlasMap";
import { ConstituentCatalog } from "@/components/ConstituentCatalog";
import { FlowScatter } from "@/components/FlowScatter";
import { QualityWorkspace } from "@/components/QualityWorkspace";
import { StationProfile } from "@/components/StationProfile";
import { TemporalWorkspace } from "@/components/TemporalWorkspace";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowRight,
  Atom,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  Compass,
  Database,
  ExternalLink,
  FlaskConical,
  Globe2,
  LayoutDashboard,
  Map,
  Menu,
  Moon,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Waves,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type View =
  | "overview"
  | "atlas"
  | "stations"
  | "constituents"
  | "flow"
  | "trends"
  | "seasonality"
  | "quality"
  | "station-profile"
  | "methods";
type Summary = {
  stations: number;
  observations: number;
  measured_values: number;
  constituents: number;
  countries: number;
  stations_with_flow_gauge: number;
  paired_flow_values: number;
  flagged_records: number;
  period: { start: string | null; end: string | null };
  coverage_note: string;
};
type Constituent = {
  variable: string;
  units: string;
  description: string;
  imported: boolean;
};
type StationList = {
  items: Station[];
  total: number;
  page: number;
  page_size: number;
};
type DatasetStatus = {
  ready: boolean;
  release: string;
  doi: string;
  raw_files: Record<string, boolean>;
  observation_files: string[];
  prepared_files: string[];
};
const EMPTY_STATIONS: Station[] = [];
const EMPTY_CONSTITUENTS: Constituent[] = [];

const nav = [
  {
    group: "EXPLORE",
    items: [
      { id: "overview", title: "Overview", icon: LayoutDashboard },
      { id: "atlas", title: "Global atlas", icon: Globe2 },
      { id: "stations", title: "Stations", icon: Map },
      { id: "constituents", title: "Constituents", icon: Atom },
    ],
  },
  {
    group: "ANALYZE",
    items: [
      { id: "flow", title: "Flow analysis", icon: Waves },
      { id: "trends", title: "Temporal trends", icon: ChartNoAxesCombined },
      { id: "seasonality", title: "Seasonality", icon: CalendarDays },
      { id: "quality", title: "Data quality", icon: ShieldCheck },
    ],
  },
  {
    group: "REFERENCE",
    items: [{ id: "methods", title: "Data & methods", icon: BookOpen }],
  },
] as const;

function Brand() {
  return (
    <div className="brand-lockup">
      <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
        <path
          d="M19.8 3C15.9 9.1 10.3 13.5 10.3 20.9a9.7 9.7 0 1 0 19.4 0c0-7.4-5.6-11.8-9.9-17.9Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M19.9 10.2v20M20 18.2l-5-4.4M20 21.4l5.9-5M20 26l-5.4 4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <circle cx="14.9" cy="13.8" r="1.7" fill="currentColor" />
        <circle cx="25.9" cy="16.2" r="1.7" fill="currentColor" />
        <circle cx="14.6" cy="30.2" r="1.7" fill="currentColor" />
      </svg>
      <span>
        <strong>RIVERQUALITY</strong>
        <small>
          ATLAS <i>·</i> GLOBAL OBSERVATORY
        </small>
      </span>
    </div>
  );
}

function Value({
  value,
  loading,
}: {
  value?: number | string | null;
  loading: boolean;
}) {
  if (loading) return <span className="value-skeleton" aria-label="Loading" />;
  if (value === null || value === undefined)
    return <span className="value-empty">—</span>;
  return <>{typeof value === "number" ? value.toLocaleString() : value}</>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem("rqa-theme");
    return saved === "light" || saved === "dark" ? saved : "dark";
  });
  const [stationsPage, setStationsPage] = useState(1);
  const [search, setSearch] = useState("");
  const [stationQuery, setStationQuery] = useState("");
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedConstituent, setSelectedConstituent] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["dataset-status"],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API}/api/v1/status`, { signal });
      if (!response.ok) throw new Error("Data service is unavailable.");
      return response.json() as Promise<DatasetStatus>;
    },
  });
  const status = statusQuery.data ?? null;
  const summaryQuery = useQuery({
    queryKey: ["overview"],
    enabled: Boolean(status?.ready),
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API}/api/v1/overview`, { signal });
      if (!response.ok)
        throw new Error("Overview statistics are not available yet.");
      return response.json() as Promise<Summary>;
    },
  });
  const constituentsQuery = useQuery({
    queryKey: ["constituents"],
    enabled: Boolean(status?.raw_files["Caravan-Qual_zarr_variables.csv"]),
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API}/api/v1/constituents`, { signal });
      if (!response.ok)
        throw new Error("Constituent dictionary is not available yet.");
      return response.json() as Promise<Constituent[]>;
    },
  });
  const stationListQuery = useQuery({
    queryKey: ["stations", stationQuery, stationsPage],
    enabled: Boolean(status?.raw_files["wqms_site_info.csv"]),
    queryFn: async ({ signal }): Promise<StationList> => {
      const params = new URLSearchParams({
        page: String(stationsPage),
        page_size: "100",
      });
      if (stationQuery) params.set("q", stationQuery);
      const response = await fetch(`${API}/api/v1/stations?${params}`, {
        signal,
      });
      if (!response.ok)
        throw new Error("Station metadata is not available yet.");
      return response.json() as Promise<StationList>;
    },
  });
  const summary = summaryQuery.data ?? null;
  const constituents = constituentsQuery.data ?? EMPTY_CONSTITUENTS;
  const stations = stationListQuery.data?.items ?? EMPTY_STATIONS;
  const stationTotal = stationListQuery.data?.total ?? 0;
  const loading = statusQuery.isLoading || summaryQuery.isLoading;
  const apiError = statusQuery.error
    ? "The local API is not connected. Start the project with pnpm dev."
    : "";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("rqa-theme", theme);
  }, [theme]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setSidebarOpen(false);
        setReleaseOpen(false);
        searchInput.current?.blur();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const importedConstituents = useMemo(
    () => constituents.filter((item) => item.imported).length,
    [constituents],
  );
  const title: Record<View, string> = {
    overview: "Overview",
    atlas: "Global atlas",
    flow: "Flow analysis",
    trends: "Temporal trends",
    seasonality: "Seasonality",
    quality: "Data quality",
    stations: "Stations",
    constituents: "Constituents",
    "station-profile": "Station profile",
    methods: "Data & methods",
  };

  const runSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (search.trim()) {
      setStationQuery(search.trim());
      setStationsPage(1);
      setView("stations");
      setSearchOpen(false);
      setSidebarOpen(false);
    }
  };
  const applyStationSearch = (value: string) => {
    setStationQuery(value);
    setStationsPage(1);
  };
  const changeStationsPage = (page: number) => setStationsPage(page);
  const chooseStation = (station: Station) => {
    setSelectedStation(station.wqms_id);
    setView("flow");
  };
  const openStationProfile = (station: Station) => {
    setSelectedStation(station.wqms_id);
    setView("station-profile");
  };
  const downloadManifest = async () => {
    try {
      const response = await fetch(`${API}/api/v1/manifest`);
      if (!response.ok)
        throw new Error("No local provenance manifest is available yet.");
      const data = await response.blob();
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "river-quality-atlas-manifest.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      window.alert(
        cause instanceof Error ? cause.message : "Manifest export failed.",
      );
    }
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar-top">
          <Brand />
          <button
            className="mobile-close"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-mark">
            <Waves size={15} />
          </span>
          <span>
            <strong>River observatory</strong>
            <small>PUBLIC DATASET</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map((group) => (
            <div key={group.group} className="nav-group">
              <div className="nav-group-label">{group.group}</div>
              {group.items.map(({ id, title: itemTitle, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    setView(id);
                    setSidebarOpen(false);
                  }}
                  className={`nav-item ${view === id ? "nav-item--active" : ""}`}
                  aria-current={view === id ? "page" : undefined}
                >
                  <Icon size={17} strokeWidth={1.7} />
                  <span>{itemTitle}</span>
                  {id === "flow" && <span className="nav-arrow">↗</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-release">
          <div className="sidebar-release-heading">
            <span className="release-status">
              <i /> RELEASE
            </span>
            <button
              className="tiny-caret"
              aria-label="Show dataset release details"
              onClick={() => setReleaseOpen(!releaseOpen)}
            >
              <ChevronDown size={14} />
            </button>
          </div>
          <strong>Caravan-Qual lite</strong>
          <small>VERSION 1.0 · 2026</small>
          <button className="release-link" onClick={() => setView("methods")}>
            Source and citation <ArrowRight size={12} />
          </button>
        </div>
        <button
          className="nav-item nav-settings"
          onClick={() => setView("methods")}
        >
          <Settings2 size={17} />
          <span>Settings & provenance</span>
        </button>
        <div className="sidebar-credit">
          <span className="credit-mark">C</span>
          <span>
            <strong>Caravan-Qual</strong>
            <small>Utrecht University · Open data</small>
          </span>
          <ExternalLink size={12} />
        </div>
      </aside>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumbs">
              <span>OBSERVATORY</span>
              <span className="crumb-sep">/</span>
              <strong>{title[view].toUpperCase()}</strong>
            </div>
          </div>
          <form className="global-search" onSubmit={runSearch} role="search">
            <Search size={15} />
            <input
              ref={searchInput}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchOpen(Boolean(event.target.value));
              }}
              onFocus={() => setSearchOpen(Boolean(search))}
              placeholder="Search stations, countries…"
              aria-label="Search stations and countries"
            />
            <kbd>⌘ K</kbd>
            {searchOpen && search && (
              <div className="search-popover">
                <button type="submit">
                  <Search size={14} />
                  <span>
                    Search stations for <strong>{search}</strong>
                  </span>
                  <kbd>↵</kbd>
                </button>
                <p>
                  Search uses station identifiers and country names in the
                  imported release.
                </p>
              </div>
            )}
          </form>
          <div className="topbar-actions">
            <button
              className="header-source"
              onClick={() => setReleaseOpen(!releaseOpen)}
            >
              <Database size={14} />
              <span>Caravan-Qual</span>
              <ChevronDown size={13} />
            </button>
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="export-button"
              onClick={() => void downloadManifest()}
              title="Download reproducibility manifest"
            >
              <ArrowDownToLine size={15} />
              <span>Export</span>
            </button>
          </div>
        </header>
        {releaseOpen && (
          <div className="release-popover">
            <div className="eyebrow">DATASET RELEASE</div>
            <strong>Caravan-Qual lite · v1.1</strong>
            <p>
              Water quality observations paired with streamflow, catchment and
              station metadata.
            </p>
            <a
              href="https://zenodo.org/records/21337532"
              target="_blank"
              rel="noreferrer"
            >
              View official Zenodo record <ExternalLink size={12} />
            </a>
          </div>
        )}
        <div className="page-scroll">
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-line" />{" "}
                  {view === "flow"
                    ? "HYDROCHEMICAL RELATIONSHIPS"
                    : view === "trends"
                      ? "LONG-TERM CHANGE"
                      : view === "seasonality"
                        ? "SEASONAL DISTRIBUTION"
                        : view === "quality"
                          ? "SOURCE DATA QUALITY"
                          : view === "station-profile"
                            ? "STATION RESEARCH PROFILE"
                            : view === "atlas"
                              ? "GEOGRAPHIC EXPLORATION"
                              : view === "stations"
                                ? "MONITORING NETWORK"
                                : view === "methods"
                                  ? "SCIENTIFIC REFERENCE"
                                  : "GLOBAL RIVER OBSERVATORY"}
                </div>
                <h1>
                  {view === "overview" ? (
                    <>
                      Read the river
                      <br className="heading-break" /> <em>in its flow.</em>
                    </>
                  ) : view === "flow" ? (
                    <>
                      Chemistry across
                      <br className="heading-break" /> <em>flow conditions.</em>
                    </>
                  ) : (
                    title[view]
                  )}
                </h1>
                <p className="page-description">
                  {view === "overview"
                    ? "Explore water pollution alongside river flow. Trace what was measured, where it was sampled, and how chemistry shifts with discharge."
                    : view === "flow"
                      ? "Compare observed concentrations with contemporaneous streamflow—at the same station and sampling date."
                      : view === "atlas"
                        ? "Locate water-quality stations and their linked streamflow gauges across a connected river network."
                        : view === "stations"
                          ? "Search monitoring locations and inspect which stations have a linked discharge gauge."
                          : view === "methods"
                            ? "Understand the release, measurement conventions and limits that shape every analysis."
                            : "Explore observed patterns without filling unsampled dates or obscuring source limitations."}
                </p>
              </div>
              <div className="heading-tools">
                <button
                  className="filter-button"
                  onClick={() => setView("methods")}
                >
                  <SlidersHorizontal size={14} />
                  <span>Data notes</span>
                </button>
                <div className="release-chip">
                  <span className="release-status">
                    <i /> SOURCE RELEASE
                  </span>
                  <strong>Lite v1.1</strong>
                </div>
              </div>
            </div>

            {apiError && (
              <div className="service-banner" role="status">
                <CircleHelp size={16} />
                <span>
                  {apiError} Data measurements stay blank until the official
                  records are imported.
                </span>
                <button onClick={() => void queryClient.invalidateQueries()}>
                  Retry <ArrowRight size={13} />
                </button>
              </div>
            )}

            {view === "overview" && (
              <>
                <section
                  className="metrics-grid"
                  aria-label="Dataset coverage metrics"
                >
                  <Metric
                    icon={Map}
                    label="MONITORING STATIONS"
                    value={summary?.stations}
                    loading={loading}
                    note={
                      summary
                        ? "From official site metadata"
                        : "Waiting for site metadata"
                    }
                  />
                  <Metric
                    icon={FlaskConical}
                    label="OBSERVATIONS"
                    value={summary?.observations}
                    loading={loading}
                    note={
                      summary
                        ? "Imported constituent files"
                        : "No chemistry files imported"
                    }
                    accent
                  />
                  <Metric
                    icon={Atom}
                    label="CONSTITUENTS"
                    value={summary?.constituents}
                    loading={loading}
                    note={`${importedConstituents.toLocaleString()} constituent files imported`}
                  />
                  <Metric
                    icon={Compass}
                    label="COUNTRIES"
                    value={summary?.countries}
                    loading={loading}
                    note={
                      summary
                        ? "Geographic metadata coverage"
                        : "Awaiting station metadata"
                    }
                  />
                  <Metric
                    icon={Waves}
                    label="FLOW-LINKED STATIONS"
                    value={summary?.stations_with_flow_gauge}
                    loading={loading}
                    note={
                      summary
                        ? "Source-linked gauge IDs"
                        : "No inferred gauge links"
                    }
                  />
                </section>

                <section className="overview-grid">
                  <div className="panel map-panel">
                    <div className="panel-heading map-panel-heading">
                      <div>
                        <div className="eyebrow">
                          GLOBAL COVERAGE{" "}
                          <span className="eyebrow-divider">/</span> MONITORING
                          NETWORK
                        </div>
                        <h2>Stations on the river map</h2>
                      </div>
                      <button
                        className="text-action"
                        onClick={() => setView("atlas")}
                      >
                        Open atlas <ArrowRight size={14} />
                      </button>
                    </div>
                    <div className="map-legend">
                      <span>
                        <i className="legend-dot" /> Water quality station
                      </span>
                      <span>
                        <i className="legend-ring" /> Linked flow gauge
                      </span>
                      <span className="map-source">Caravan-Qual · WGS 84</span>
                    </div>
                    <AtlasMap compact onSelect={chooseStation} />
                    <div className="map-caption">
                      <span>
                        {summary
                          ? `${stations.length.toLocaleString()} locations loaded in station directory`
                          : "Monitoring points appear after station metadata is imported"}
                      </span>
                      <button onClick={() => setView("stations")}>
                        Browse station directory <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="coverage-panel panel">
                    <div className="panel-heading">
                      <div>
                        <div className="eyebrow">RELEASE COVERAGE</div>
                        <h2>At a glance</h2>
                      </div>
                      <button
                        className="quiet-icon"
                        aria-label="Open dataset notes"
                        onClick={() => setView("methods")}
                      >
                        <CircleHelp size={15} />
                      </button>
                    </div>
                    <div className="coverage-range">
                      <span>OBSERVATION WINDOW</span>
                      <strong>
                        {summary?.period.start && summary.period.end
                          ? `${summary.period.start.slice(0, 4)} — ${summary.period.end.slice(0, 4)}`
                          : "No imported dates"}
                      </strong>
                      <div className="range-rail">
                        <i />
                      </div>
                      <small>
                        {summary?.period.start ?? "Start year"}
                        <span>{summary?.period.end ?? "End year"}</span>
                      </small>
                    </div>
                    <div className="coverage-row">
                      <span>Paired flow values</span>
                      <strong>
                        <Value
                          value={summary?.paired_flow_values}
                          loading={loading}
                        />
                      </strong>
                    </div>
                    <div className="coverage-row">
                      <span>Source-flagged records</span>
                      <strong>
                        <Value
                          value={summary?.flagged_records}
                          loading={loading}
                        />
                      </strong>
                    </div>
                    <div className="coverage-row">
                      <span>Release constituents</span>
                      <strong>
                        {constituents.length
                          ? constituents.length.toLocaleString()
                          : "—"}
                      </strong>
                    </div>
                    <div className="coverage-callout">
                      <span className="callout-icon">
                        <CircleHelp size={14} />
                      </span>
                      <p>
                        {summary?.coverage_note ??
                          "This workspace currently has no imported measurements. The source release is not a real-time monitoring feed."}
                      </p>
                    </div>
                    <button
                      className="coverage-link"
                      onClick={() => setView("methods")}
                    >
                      Coverage and data limits <ArrowRight size={13} />
                    </button>
                  </div>
                </section>

                <FlowScatter
                  stations={stations}
                  constituents={constituents}
                  initialStation={selectedStation}
                />

                <section className="lower-grid">
                  <div className="panel source-panel">
                    <div className="eyebrow">DATA PROVENANCE</div>
                    <h2>Built from one documented release.</h2>
                    <p>
                      Caravan-Qual connects harmonized water chemistry records
                      to river flow, catchment attributes and monitoring
                      locations. Each record retains the source flags and
                      detection-limit fields.
                    </p>
                    <button
                      className="text-action"
                      onClick={() => setView("methods")}
                    >
                      Review methodology <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="panel methods-card">
                    <div className="methods-icon">
                      <Waves size={18} />
                    </div>
                    <div>
                      <div className="eyebrow">SCIENTIFIC GUARDRAIL</div>
                      <h3>Missing is not zero.</h3>
                      <p>
                        No flow interpolation. No fabricated dates. Pairs use
                        source observations on the same day only.
                      </p>
                    </div>
                  </div>
                </section>
              </>
            )}

            {view === "atlas" && (
              <section className="panel atlas-workspace">
                <div className="atlas-toolbar">
                  <div>
                    <div className="eyebrow">
                      STATION LAYER <span className="eyebrow-divider">/</span>{" "}
                      VIEWPORT QUERIES
                    </div>
                    <strong>
                      {stations.length.toLocaleString()} in the station
                      directory
                    </strong>
                  </div>
                  <div className="atlas-legend">
                    <i className="legend-dot" /> Monitoring station{" "}
                    <span>·</span> Click a point to analyze
                  </div>
                </div>
                <AtlasMap onSelect={chooseStation} />
                <div className="atlas-footnote">
                  Location and gauge linkage are source metadata. The viewport
                  layer is bounded; zoom in to inspect dense regions.
                </div>
              </section>
            )}
            {view === "flow" && (
              <>
                <div className="selection-context">
                  <span className="selection-mark">
                    <Waves size={15} />
                  </span>
                  <span>Same-day concentration–discharge pairs</span>
                  <span className="context-dot">·</span>
                  <span>Spearman rank association</span>
                </div>
                <FlowScatter
                  key={`${selectedStation}:${selectedConstituent}`}
                  stations={stations}
                  constituents={constituents}
                  initialStation={selectedStation}
                  initialConstituent={selectedConstituent}
                />
              </>
            )}
            {view === "trends" && (
              <TemporalWorkspace
                mode="trends"
                stations={stations}
                constituents={constituents}
                initialStation={selectedStation}
              />
            )}
            {view === "seasonality" && (
              <TemporalWorkspace
                mode="seasonality"
                stations={stations}
                constituents={constituents}
                initialStation={selectedStation}
              />
            )}
            {view === "quality" && <QualityWorkspace />}
            {view === "stations" && (
              <StationDirectory
                key={stationQuery}
                stations={stations}
                total={stationTotal}
                page={stationsPage}
                query={stationQuery}
                setQuery={applyStationSearch}
                setPage={changeStationsPage}
                onSelect={openStationProfile}
              />
            )}
            {view === "constituents" && (
              <ConstituentCatalog
                items={constituents}
                onAnalyze={(name) => {
                  setSelectedConstituent(name);
                  setSelectedStation(stations[0]?.wqms_id ?? "");
                  setView("flow");
                }}
              />
            )}
            {view === "station-profile" && (
              <StationProfile
                stationId={selectedStation}
                onAnalyze={() => setView("flow")}
                onAtlas={() => setView("atlas")}
              />
            )}
            {view === "methods" && (
              <Methodology
                status={status}
                onManifest={() => void downloadManifest()}
              />
            )}

            <footer className="page-footer">
              <span>
                RIVERQUALITYATLAS <i>·</i> SCIENTIFIC EXPLORATION
              </span>
              <span>
                Data:{" "}
                <a
                  href="https://zenodo.org/records/21337532"
                  target="_blank"
                  rel="noreferrer"
                >
                  Caravan-Qual lite v1.1 <ExternalLink size={10} />
                </a>
              </span>
              <span>Not a real-time monitoring feed</span>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  loading,
  note,
  accent = false,
}: {
  icon: typeof Map;
  label: string;
  value?: number;
  loading: boolean;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "metric--accent" : ""}`}>
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={15} strokeWidth={1.6} />
      </div>
      <strong className="metric-value">
        <Value value={value} loading={loading} />
      </strong>
      <small>{note}</small>
    </div>
  );
}

function StationDirectory({
  stations,
  total,
  page,
  query,
  setQuery,
  setPage,
  onSelect,
}: {
  stations: Station[];
  total: number;
  page: number;
  query: string;
  setQuery: (value: string) => void;
  setPage: (page: number) => void;
  onSelect: (station: Station) => void;
}) {
  const [searchTerm, setSearchTerm] = useState(query);
  const pages = Math.max(1, Math.ceil(total / 100));
  return (
    <section className="panel directory-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">OFFICIAL SITE METADATA</div>
          <h2>Monitoring stations</h2>
          <p>{total.toLocaleString()} locations · sorted in release order</p>
        </div>
        <form
          className="directory-search"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(searchTerm);
          }}
        >
          <Search size={14} />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Station ID or country"
            aria-label="Filter stations"
          />
          <button type="submit" aria-label="Apply station search">
            <ArrowRight size={14} />
          </button>
        </form>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>STATION ID</th>
              <th>COUNTRY</th>
              <th>LATITUDE</th>
              <th>LONGITUDE</th>
              <th>FLOW LINK</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stations.length ? (
              stations.map((station) => (
                <tr key={station.wqms_id}>
                  <td className="mono station-id">{station.wqms_id}</td>
                  <td>{station.country_name ?? "—"}</td>
                  <td className="mono">
                    {Number.isFinite(station.wqms_lat)
                      ? station.wqms_lat.toFixed(4)
                      : "—"}
                  </td>
                  <td className="mono">
                    {Number.isFinite(station.wqms_lon)
                      ? station.wqms_lon.toFixed(4)
                      : "—"}
                  </td>
                  <td>
                    <span
                      className={`link-status ${station.gauge_id ? "link-status--yes" : ""}`}
                    >
                      <i />
                      {station.gauge_id ? "Linked" : "No gauge"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="row-action"
                      onClick={() => onSelect(station)}
                    >
                      Profile <ArrowRight size={12} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="table-empty" colSpan={6}>
                  No station metadata found. Import the official Caravan-Qual
                  lite release to populate this directory.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <span>
          Showing {total ? ((page - 1) * 100 + 1).toLocaleString() : 0}–
          {Math.min(page * 100, total).toLocaleString()} of{" "}
          {total.toLocaleString()} source locations
        </span>
        <div>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <strong>
            {page} / {pages}
          </strong>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      </div>
      <p className="directory-note">
        <CircleHelp size={13} /> This directory reports source station metadata
        only. Observation counts become available per constituent after its CSV
        is imported.
      </p>
    </section>
  );
}

function Methodology({
  status,
  onManifest,
}: {
  status: DatasetStatus | null;
  onManifest: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(
      "pnpm data:quickstart && pnpm data:prepare",
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="methodology-layout">
      <section className="panel method-intro">
        <div className="eyebrow">SOURCE DATASET</div>
        <h2>
          Caravan-Qual connects water chemistry to large-sample hydrology.
        </h2>
        <p>
          The lite release publishes water-quality observations with same-date
          streamflow, station metadata, gauge linkages and a variable
          dictionary. Its meteorological fields are monthly in the lite Zarr
          bundle. These are historical records, not live sensor feeds.
        </p>
        <div className="method-citation">
          <span>DATASET DOI</span>
          <a
            href="https://doi.org/10.5281/zenodo.21337532"
            target="_blank"
            rel="noreferrer"
          >
            10.5281/zenodo.21337532 <ExternalLink size={12} />
          </a>
          <span>OFFICIAL RELEASE</span>
          <a
            href="https://zenodo.org/records/21337532"
            target="_blank"
            rel="noreferrer"
          >
            Zenodo record 21337532 <ExternalLink size={12} />
          </a>
          <span>SOURCE CODE</span>
          <a
            href="https://github.com/SustainableWaterSystems/Caravan-Qual"
            target="_blank"
            rel="noreferrer"
          >
            SustainableWaterSystems/Caravan-Qual <ExternalLink size={12} />
          </a>
        </div>
      </section>
      <div className="method-side">
        <section className="panel import-panel">
          <div className="eyebrow">LOCAL DATA WORKFLOW</div>
          <h3>
            {status?.ready
              ? "Release is prepared locally"
              : "Prepare an official data slice"}
          </h3>
          <p>
            The quickstart profile retrieves the source variable registry,
            station metadata and gauge linkages. Choose a constituent for a
            bounded download from the official observation archive.
          </p>
          <code>pnpm data:quickstart</code>
          <button className="copy-command" onClick={() => void copy()}>
            {copied ? "Copied command" : "Copy quickstart command"}
            <ArrowRight size={13} />
          </button>
          <div className="import-actions">
            <button onClick={onManifest}>
              <ArrowDownToLine size={13} /> Export manifest
            </button>
            <a
              href="https://zenodo.org/records/21337532"
              target="_blank"
              rel="noreferrer"
            >
              Official files <ExternalLink size={12} />
            </a>
          </div>
        </section>
        <section className="panel guardrails-panel">
          <div className="eyebrow">ANALYTICAL CONVENTIONS</div>
          <ul>
            <li>
              <strong>Paired dates only.</strong> Concentration and flow are
              joined through their source record on the same date. Missing
              discharge is never filled.
            </li>
            <li>
              <strong>Source fields retained.</strong> Original units, flags,
              detection limits and imputation metadata travel with each
              observation.
            </li>
            <li>
              <strong>Association, not causation.</strong> Spearman ρ summarizes
              monotonic co-variation. A low p-value does not establish a
              mechanism.
            </li>
            <li>
              <strong>Sampling is uneven.</strong> Geographic coverage,
              constituents and measurement frequency vary. Absence from a panel
              means unavailable or unmeasured, not zero.
            </li>
            <li>
              <strong>Positive log axes.</strong> The scatter view plots
              positive concentration and discharge values only; excluded rows
              remain in exported data and are counted.
            </li>
          </ul>
        </section>
      </div>
      <section className="panel unit-note">
        <div className="unit-symbol">pH</div>
        <div>
          <div className="eyebrow">UNITS & INTERPRETATION</div>
          <h3>Measurements retain their constituent-specific meaning.</h3>
          <p>
            Concentrations with different units or chemical fractions are not
            directly interchangeable. Values remain in source units. A higher
            value is not universally a worse water-quality result: dissolved
            oxygen, pH, nutrients, metals and microbial indicators have
            different interpretations, thresholds and ecological context.
          </p>
        </div>
      </section>
    </div>
  );
}
