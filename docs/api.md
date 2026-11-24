# API

The FastAPI service publishes interactive OpenAPI at `/docs`.

| Route                                           | Purpose                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/v1/health`                            | Process health                                                          |
| `GET /api/v1/status`                            | Local release and import status                                         |
| `GET /api/v1/overview`                          | Counts derived from imported observations and station metadata          |
| `GET /api/v1/constituents`                      | Published variable dictionary with local import status                  |
| `GET /api/v1/stations`                          | Searchable, paginated station metadata (`page_size` max 500)            |
| `GET /api/v1/stations/{id}`                     | One station's source metadata and imported constituent availability     |
| `GET /api/v1/stations/{id}/constituents`        | Imported observation counts by source unit for one station              |
| `GET /api/v1/atlas/stations`                    | Viewport-filtered station points (max 10,000)                           |
| `POST /api/v1/analysis/concentration-discharge` | Same-date concentration–flow pairs and Spearman summary                 |
| `POST /api/v1/analysis/trends`                  | Theil–Sen slope and Kendall tau on daily medians                        |
| `POST /api/v1/analysis/seasonality`             | Observed calendar-month distributions                                   |
| `POST /api/v1/analysis/flow-regimes`            | Concentration summaries across sample-specific flow quintiles           |
| `POST /api/v1/analysis/loads`                   | Sampled kg/day-equivalent values for supported mg/L mass concentrations |
| `POST /api/v1/analysis/detection-limits`        | Source flags and detection-limit field coverage                         |
| `GET /api/v1/quality/summary`                   | Missing, flagged and detection-limit counts                             |
| `GET /api/v1/manifest`                          | Local source-checksum provenance manifest                               |

Routes validate values with FastAPI/Pydantic. Station, constituent, date and viewport values are passed as database parameters; callers cannot submit SQL. Responses distinguish unavailable source data with `503` and a stable error code. CORS defaults to the local development frontend origins and should be configured for self-hosting.

Analysis requests select one station, one imported constituent file, an optional date range, and (if needed) one source unit. Requests spanning mixed units are rejected until a unit is selected. Trend results require at least eight distinct sampling days. The Theil–Sen slope and its 95% interval are expressed per year; Kendall tau reports monotonic association with time. These results do not adjust for seasonality, serial dependence or censoring. Seasonal output contains only observed calendar-month groups with counts, median and interquartile range; unsampled month/year cells are omitted.
