# Architecture

RiverQualityAtlas is a single deployable web application with a separate Python API and a local scientific data store.

```text
Browser
  Next.js App Router — shared filters, station directory, analysis workspace
    MapLibre — geographic viewport and basemap attribution
    deck.gl — GPU station points, fetched only for the visible bounding box
    SVG — readable scatter plot, tooltips and CSV export
  FastAPI — parameter validation, status, station, coverage and analysis routes
    Polars — CSV schema checks and streaming-friendly columnar preparation
    DuckDB — parameterized analytical queries against Parquet
  data/raw — official Zenodo files, excluded from version control
  data/normalized — constituent Parquet files, excluded from version control
```

Scientific calculations live under `river_quality_atlas/analytics` and do not depend on FastAPI. Ingestion logic lives under `river_quality_atlas/ingestion`. API code never accepts SQL text from callers. The frontend can run without imported measurements and reports the unpopulated state instead of filling charts with invented values.

The initial release uses a one-process DuckDB connection per API call. This is suitable for local research and modest self-hosted workloads. A higher-concurrency service should add a bounded worker pool, query timeouts and shared cache after measuring the target dataset and host.
