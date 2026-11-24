# Contributing

Contributions are welcome. For bugs and feature proposals, use the repository's GitHub issue templates. For code changes, open a pull request with a concise description of the problem and the proposed change.

## Development setup

Install the project dependencies and prepare the local Python environment:

```bash
pnpm install
uv sync
```

Start the web application and API with `pnpm dev`. See the [README](README.md) for data import options. Data downloads are optional; tests use isolated records and do not require the full release.

## Checks

Run the checks relevant to your changes before opening a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm test
uv run ruff check river_quality_atlas tests
pnpm build
```

For changes to browser workflows, install Playwright Chromium with `pnpm --filter @river-quality-atlas/web exec playwright install chromium` and run `pnpm test:e2e`.

## Pull requests

- Keep changes focused and describe user-visible behavior and scientific assumptions.
- Add or update tests when behavior changes.
- Update documentation when setup, API behavior, data handling, or analytical methods change.
- Do not include credentials, downloaded source datasets, or generated Parquet files. Dataset licensing terms vary by source; see [data licenses](docs/data-licenses.md).
