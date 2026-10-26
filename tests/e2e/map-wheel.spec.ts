import { test, expect } from "@playwright/test";

test("wheel zoom stays inside the map while the surrounding page still scrolls", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await page.getByRole("button", { name: "All Malaysia", exact: true }).click();
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  const zoom = () =>
    page.evaluate(() => JSON.parse(sessionStorage.getItem("jerebu-camera")!).zoom as number);
  await expect.poll(zoom).toBeGreaterThan(0);
  const initialZoom = await zoom();
  const canvas = page.locator("canvas.maplibregl-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const initialScroll = await page.evaluate(() => scrollY);
  await page.mouse.move(bounds!.x + bounds!.width * 0.6, bounds!.y + bounds!.height * 0.4);
  await page.mouse.wheel(0, -450);
  await expect.poll(zoom).toBeGreaterThan(initialZoom + 0.1);
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  const enlargedZoom = await zoom();
  expect(Math.abs((await page.evaluate(() => scrollY)) - initialScroll)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath("wheel-zoom-in.png") });
  await page.mouse.wheel(0, 450);
  await expect.poll(zoom).toBeLessThan(enlargedZoom - 0.1);
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  await expect(canvas).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("wheel-zoom-out.png") });
  await page.mouse.move(12, 100);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(initialScroll + 20);
});
