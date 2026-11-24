# Data pipeline

## Source release

The downloader targets Zenodo record `21337532` (Caravan-Qual lite v1.1, DOI `10.5281/zenodo.21337532`). Filenames, byte sizes and MD5 values are recorded from the official record metadata. The client uses a fixed Zenodo host and a fixed allowlist of filenames, checks available disk space, resumes bounded byte ranges into a `.part` file, then verifies size and digest before promoting it. Verified existing assets are reused.

The lite release has a 641,285,380-byte `wqms-csv.zip`, a 14,770,683-byte `wqms_site_info.csv`, a 25,870,862-byte `Caravan-Qual_linkages.parquet`, and a 22,441-byte variable dictionary. Quickstart and standard profiles read selected observation members with HTTP byte ranges, avoiding the full archive download. If the upstream server does not honor byte-range requests, the command exits with a clear error. The full profile downloads the archive and verifies its published checksum.

## Profiles

- `quickstart`: station metadata, variable registry, license archive and official dissolved-oxygen CSV. The CSV's expanded size is allowed up to 250 MB; the source release's dissolved-oxygen member is about 152 MB expanded.
- `standard`: the quickstart metadata plus official nitrate observations.
- `full`: quickstart metadata and license archive plus the full water-quality CSV archive.
- `--constituent ID`: retrieve one named CSV member from the same official archive using bounded ranges.

The full ZIP extractor must only write `.csv` members within the application data directory. Raw files are never committed. The `full` profile downloads all release chemistry CSVs; the separately packaged Zarr meteorology arrays are not downloaded by that profile yet.

## Preparation

Each constituent CSV is validated against the published release fields: `wqms_id`, `dates`, `obs`, `unit`, `flag`, `detection_limit`, and `streamflow`. `imputation_method` and `variable` are retained when present. Dates are parsed without filling gaps; values remain in the source unit. A constituent CSV becomes one Zstandard-compressed Parquet file. The manifest captures release citation, source path, byte size and checksum.

The download command can fetch records, `data:prepare` normalizes them, `data:validate` checks schemas, and `data:status` reports what is available. A quickstart import represents one constituent, not the full global release. API counts are scoped to the imported files and labelled accordingly.

## Failure behavior

Bad digests, missing required columns, invalid date columns, unsupported release filenames and absent observations stop the workflow. Interrupted downloads remain resumable `.part` files and are not treated as valid records. There is no synthetic fallback dataset.
