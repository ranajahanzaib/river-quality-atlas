# Data model

## Source entities

| Entity                | Source                                | Key fields                                                                                                      |
| --------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Monitoring station    | `wqms_site_info.csv`                  | `wqms_id`, WGS84 latitude/longitude, country, HydroBASINS level 12, river `LINKNO`, linked `gauge_id`, distance |
| Water-quality records | per-constituent CSV in `wqms-csv.zip` | station ID, date, observation, unit, source flag, detection limit, imputation method, streamflow                |
| Variable dictionary   | `Caravan-Qual_zarr_variables.csv`     | variable identifier, category, units, description                                                               |
| Station/gauge linkage | `Caravan-Qual_linkages.parquet`       | release-supplied gauge and reach relationships                                                                  |

Station identifiers are strings, not numbers. Coordinates remain longitude/latitude in WGS84. Missing gauge IDs remain missing. Source units and flags are preserved. Daily weather in the full release and monthly weather in the lite bundle are separate from chemistry CSVs; the initial UI does not imply that lite monthly fields are daily observations.

## Normalized records

One Parquet file per constituent preserves source columns while normalizing dates to date values and measurement fields to nullable floating-point numbers. No unit harmonization is applied. `obs`, `streamflow`, and `detection_limit` can be null. A source quality flag does not cause automatic deletion or adjustment.

The application does not assign globally comparable ecological thresholds to constituents. Unit, fraction and analytical method differences must be resolved before cross-constituent comparison.
