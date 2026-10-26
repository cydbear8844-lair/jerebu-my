import { defineConfig, devices } from "@playwright/test";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= ".cache/playwright";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "test-results/browser",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { timeout: 20000 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          timeout: 20000,
          args: ["--use-angle=swiftshader", "--enable-webgl", "--enable-unsafe-swiftshader"],
        },
      },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
    },
    ...(["no-preference", "reduce"] as const).flatMap((reducedMotion) => [
      {
        name: `mobile-chromium-${reducedMotion}`,
        testMatch: "browser-matrix.spec.ts",
        use: {
          ...devices["Pixel 7"],
          channel: "chromium",
          reducedMotion,
          launchOptions: {
            args: ["--use-angle=swiftshader", "--enable-webgl", "--enable-unsafe-swiftshader"],
          },
        },
      },
      {
        name: `mobile-webkit-${reducedMotion}`,
        testMatch: "browser-matrix.spec.ts",
        use: { ...devices["iPhone 13"], reducedMotion },
      },
    ]),
  ],
  webServer:
    process.env.JEREBU_TEST_EXTERNAL === "1"
      ? undefined
      : {
          command: "npm run build && npm run start:demo -- --hostname 127.0.0.1 --port 3100",
          url: "http://127.0.0.1:3100",
          reuseExistingServer: false,
          timeout: 180000,
        },
});
