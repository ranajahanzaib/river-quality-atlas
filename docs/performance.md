# Performance and capacity

The frontend never requests all chemistry rows. Station points are queried per map viewport with a hard 10,000-row API limit (the map requests 8,000). Station directory pagination is bounded to 500 rows per response. API analytical queries operate on normalized Parquet, and DuckDB can predicate-push filters on station and date columns.

Preparation currently reads one constituent CSV into Polars before writing Parquet. Memory use therefore depends on the size of the selected constituent. Full-release throughput and query latency have not been benchmarked; deployment capacity should be measured with the intended data profile and host.
