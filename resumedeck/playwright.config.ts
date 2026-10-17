import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DATA_DIR = ".data-e2e";

/**
 * E2E runs against a production build whose database is filled by the real
 * pipeline (PDF → text/OCR → heuristic extraction → score) from
 * tests/fixtures/bucket, with the model disabled so results are deterministic.
 * Tests share that database, so they run one at a time and reset it first.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 400, height: 860 }, hasTouch: true } },
  ],
  webServer: {
    command: [
      `rm -rf ${DATA_DIR}`,
      "node --import tsx src/workers/run.mts --once",
      "npm run build",
      `npx next start -p ${PORT}`,
    ].join(" && "),
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATA_DIR,
      LLM_PROVIDER: "none",
      RESUME_SOURCE: "local:tests/fixtures/bucket",
      ALLOW_AUTH_BYPASS: "1",
      AUTH_BYPASS_EMAIL: "e2e-recruiter@example.com",
      ALLOW_TEST_RESET: "1",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    },
  },
});
