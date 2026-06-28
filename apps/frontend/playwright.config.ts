import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3210);
const mockApiPort = Number(process.env.PLAYWRIGHT_MOCK_API_PORT ?? 3211);
const nodeExecutable = process.execPath.includes(" ")
  ? `"${process.execPath}"`
  : process.execPath;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `${nodeExecutable} node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_DEMO_MODE: "true",
      SERVER_API_BASE_URL: `http://127.0.0.1:${mockApiPort}`,
      NEXT_PUBLIC_API_BASE_URL: "",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
