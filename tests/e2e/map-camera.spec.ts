import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test.afterEach(async ({ page }) => {
  await page.goto("about:blank");
});

for (const { viewport, reducedMotion } of [
  { viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" },
  { viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" },
  { viewport: { width: 1024, height: 768 }, reducedMotion: "no-preference" },
  { viewport: { width: 390, height: 844 }, reducedMotion: "reduce" },
] as const) {
  test(`regional reset restores the entry fit at ${viewport.width}px with ${reducedMotion} motion`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion });
    const errors: string[] = [];
    const measurements = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const region of ["sabah", "putrajaya"]) {
      await page.goto(`/region/${region}`);
      await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
      await page
        .getByRole("combobox", { name: "Map layers", exact: true })
        .selectOption("combined");
      const canvas = page.locator("canvas.maplibregl-canvas");
      const original = await canvas.elementHandle();
      await canvas.scrollIntoViewIfNeeded();
      const label = page.locator(`[data-label-id='${region}']`);
      await expect(label).toBeVisible();
      await expect(label).toHaveAttribute("style", /translate\(/);
      await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
      const entry = (await label.boundingBox())!;
      await page.locator(".map-stage").screenshot({ path: info.outputPath(`${region}-entry.png`) });
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
      const reset = page.getByRole("button", { name: "Reset view", exact: true });
      await reset.focus();
      await reset.press("Enter");
      await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
      await expect
        .poll(async () => {
          const current = await label.boundingBox();
          return current ? Math.hypot(current.x - entry.x, current.y - entry.y) : Infinity;
        })
        .toBeLessThan(2);
      const field = page.locator(".wind-source-canvas");
      await expect(field).toHaveAttribute("data-valid-at", "2026-09-21T04:00:00.000Z");
      if (reducedMotion === "reduce") {
        await expect(field).toHaveAttribute("data-running", "false");
      } else {
        const frames = Number((await field.getAttribute("data-frames")) ?? 0);
        await expect
          .poll(async () => Number((await field.getAttribute("data-frames")) ?? 0))
          .toBeGreaterThan(frames + 2);
      }
      expect(await canvas.evaluate((element, previous) => element === previous, original)).toBe(
        true,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      measurements.push({ region, entry, reset: await label.boundingBox() });
      await page.locator(".map-stage").screenshot({ path: info.outputPath(`${region}-reset.png`) });
    }
    await writeFile(
      info.outputPath("camera.json"),
      JSON.stringify({ viewport, reducedMotion, measurements, errors }, null, 2),
    );
    expect(errors).toEqual([]);
  });
}
