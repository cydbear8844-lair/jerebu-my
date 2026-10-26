import { test, expect } from "@playwright/test";

test.use({ video: { mode: "on", size: { width: 1440, height: 900 } } });

test("continuous interaction recording without screenshot viewport changes", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 3, longitude: 101.5, accuracy: 25 });
  await page.goto("/");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await page.locator("canvas").evaluate((canvas) => (canvas.dataset.identity = "continuous"));
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-button")).toHaveAttribute("data-location-phase", "settled");
  await expect
    .poll(() =>
      page
        .locator(".near-me-ring")
        .evaluate((ring) => ring.getAnimations().filter((a) => a.playState === "running").length),
    )
    .toBe(0);
  await page.getByRole("button", { name: "Dismiss location result" }).click();
  await page.locator(".region-row[href='/region/selangor']").click();
  await expect(page.locator(".location-heading h1")).toHaveText("Selangor");
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  await expect(page.locator("canvas")).toHaveAttribute("data-identity", "continuous");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("MALAYSIA AIR QUALITY");
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  await page.getByRole("slider", { name: "Observation time" }).press("ArrowLeft");
  await expect(page.locator("main.overview-page")).toHaveAttribute(
    "data-snapshot-at",
    "2026-09-21T03:00:00.000Z",
  );
  await page.getByRole("button", { name: "Play hourly observations" }).click();
  await expect(page.locator("main.overview-page")).toHaveAttribute(
    "data-snapshot-at",
    "2026-09-21T04:00:00.000Z",
  );
  await expect(page.getByRole("button", { name: "Play hourly observations" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
});
