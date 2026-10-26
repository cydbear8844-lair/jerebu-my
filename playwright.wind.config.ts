import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "wind.spec.ts",
  timeout: 90000,
  outputDir: "test-results/wind",
  reporter: [["list"], ["json", { outputFile: "test-results/wind-results.json" }]],
  projects: base.projects!.filter((project) => ["chromium", "webkit"].includes(project.name!)),
  use: { ...base.use, video: "on", trace: "retain-on-failure" },
});
