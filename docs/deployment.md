# Deployment

Local development uses `pnpm dev`; the web process serves on port 3000 and the API on port 8000. The local containerized setup starts with `docker compose up --build`, binds both services to loopback, and mounts `./data` as persistent API storage. Set `WEB_PORT` and `API_PORT` in `.env` to change occupied host ports, then align `NEXT_PUBLIC_API_URL` and `RQA_CORS_ORIGINS` with those values. For public hosting, place the services behind an HTTPS reverse proxy, set `NEXT_PUBLIC_API_URL` to the browser-reachable API URL before building the web image, and set `RQA_CORS_ORIGINS` to the web origin. Populate data through the documented ingestion workflow.

The basemap URL is configured in `apps/web/components/AtlasMap.tsx` and uses the public OpenStreetMap tile service for local development. Before public deployment, point it to a provider with suitable usage rights and capacity, retaining visible attribution. Do not use the community tile endpoint for a high-volume production application.

No credentials are needed for basic local operation. Put service-specific secrets in deployment environment configuration, not the repository. Serve the app behind HTTPS, restrict CORS to the deployment origin, and place resource limits around worker counts and exports before exposing it to broad public traffic.
