import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3200",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command:
        "./.venv/bin/uvicorn river_quality_atlas.api:app --host 127.0.0.1 --port 8200",
      cwd: "../..",
      url: "http://127.0.0.1:8200/api/v1/health",
      reuseExistingServer: true,
      timeout: 120_000,
      env: { RQA_CORS_ORIGINS: "http://127.0.0.1:3200" },
    },
    {
      command:
        "./node_modules/.bin/next dev --webpack --hostname 127.0.0.1 --port 3200",
      cwd: ".",
      url: "http://127.0.0.1:3200",
      reuseExistingServer: true,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:8200" },
    },
  ],
});
