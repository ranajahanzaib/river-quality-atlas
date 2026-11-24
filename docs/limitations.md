# Capabilities and limitations

The current release supports station, constituent-catalog, flow, temporal, seasonal and source-quality workflows. The following capabilities are not included:

- Observation values appear only after official source files pass their release size and checksum checks and normalized Parquet files pass validation. Without prepared records, data views show an empty state.
- Trend estimates use all finite reported measurements, collapse same-day rows to daily medians, and do not adjust for seasonality, autocorrelation, censoring, source flags or changes in station coverage.
- Flow quintile classes are computed from positive paired values in the selected sample. They are not long-term flow-duration classes.
- Daily-equivalent load estimates are restricted to supported mg/L concentration units and same-date flow. They are not integrated daily or annual loads.
- Detection-limit output summarizes the recorded limit and flag fields but does not infer censoring direction or apply a censored-data model.
- Temporal and station workspaces analyze one selected station at a time; there is no multistation comparison builder.
- The constituent catalog exposes source names, units, descriptions and import status. Per-constituent distribution, geographic coverage and cross-station comparison views remain future work.
- The atlas renders station points only. It does not include catchment polygons, river topology, upstream/downstream traversal, aggregation layers, temporal playback or regional selection.
- Trend and seasonal workspaces are descriptive; flow-adjusted estimates, pollutant flux integration, seasonal inference and uncertainty corrections remain future work.
- There is no Research Studio, saved workspace persistence, custom chart builder, report generation or GeoJSON/SVG/PNG export. Available exports cover paired flow records as CSV and the local checksum manifest.
- The `full` profile imports the release's chemistry CSV archive. It does not download or process the large Zarr weather bundles.
- A Playwright smoke suite covers desktop and mobile overview, constituent catalog, trends, seasonality, data quality and theme switching. It does not exercise every route or populated-data interactions.
- The default OpenStreetMap tile endpoint is suitable for local exploration, not high-volume hosted traffic. Public deployments need a tile provider whose terms and capacity fit their use.
- The application license is separate from source-data licenses. Redistribution of downloaded records must follow the relevant terms in the Caravan-Qual license archive.
