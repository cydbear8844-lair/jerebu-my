import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const canvas = (page: Page) => page.locator(".wind-source-canvas");
const latest = "2026-09-21T04:00:00.000Z";
test.afterEach(async ({ page }) => {
  await page.goto("about:blank");
});
async function ready(page: Page, mode = "wind") {
  await page.goto("/");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await page.getByRole("combobox", { name: "Map layers", exact: true }).selectOption(mode);
  await page.locator(".map-stage").scrollIntoViewIfNeeded();
  await expect(canvas(page)).toHaveAttribute("data-valid-at", latest);
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
}
async function setting(page: Page, label: string, value: string) {
  const details = page.locator(".wind-settings");
  await details.evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.getByRole("combobox", { name: label, exact: true }).selectOption(value);
  await details.evaluate((e) => ((e as HTMLDetailsElement).open = false));
  if (label === "Demo field")
    await expect(canvas(page)).toHaveAttribute("data-field-id", new RegExp(`demo-wind-${value}-`));
}
async function flow(page: Page) {
  await page.bringToFront();
  await page.locator("canvas.maplibregl-canvas").scrollIntoViewIfNeeded();
  const start = await canvas(page).evaluate((e) => Number(e.dataset.frames ?? 0));
  try {
    await expect
      .poll(() => canvas(page).evaluate((e) => Number(e.dataset.frames ?? 0)))
      .toBeGreaterThan(start + 2);
  } catch (cause) {
    throw new Error(JSON.stringify(await canvas(page).evaluate((e) => ({ ...e.dataset }))), {
      cause,
    });
  }
  return canvas(page).evaluate((e) => ({ ...e.dataset }));
}
async function pixels(page: Page) {
  return canvas(page).evaluate((e: HTMLCanvasElement) => {
    const data = e.getContext("2d")!.getImageData(0, 0, e.width, e.height).data;
    let nonempty = 0,
      checksum = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) nonempty++;
      checksum = (checksum + data[i] * i) % 1000000007;
    }
    return { nonempty, checksum, width: e.width, height: e.height };
  });
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`combined mode retains air-quality labels and legends at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
    const map = await page.locator("canvas.maplibregl-canvas").elementHandle();
    const layers = page.getByRole("combobox", { name: "Map layers", exact: true });
    const values = page.locator(".map-label-layer small");
    await expect(values).toHaveCount(13);
    const airValues = await values.allTextContents();
    const airMethodology = await page.locator(".legend-methodology").innerText();
    await page.locator(".map-stage").screenshot({ path: info.outputPath("air.png") });

    await layers.selectOption("combined");
    await expect(canvas(page)).toHaveAttribute("data-valid-at", latest);
    await flow(page);
    expect((await pixels(page)).nonempty).toBeGreaterThan(100);
    await expect(values).toHaveCount(13);
    expect(await values.allTextContents()).toEqual(airValues);
    await expect(page.locator(".map-legend")).toBeVisible();
    await expect(page.locator(".wind-legend")).toBeVisible();
    await expect(page.locator(".legend-methodology")).toContainText(airMethodology);
    await expect(page.locator(".legend-methodology")).toContainText(
      "Wind colours show speed (km/h).",
    );
    await page.locator(".map-stage").screenshot({ path: info.outputPath("combined.png") });

    await layers.selectOption("wind");
    await expect(values).toHaveCount(0);
    await expect(page.locator(".map-legend")).toBeHidden();
    await expect(page.locator(".wind-legend")).toBeVisible();
    await flow(page);
    await page.locator(".map-stage").screenshot({ path: info.outputPath("wind.png") });

    await layers.selectOption("air");
    await expect(canvas(page)).toHaveCount(0);
    await expect(values).toHaveCount(13);
    expect(await values.allTextContents()).toEqual(airValues);
    expect(
      await page
        .locator("canvas.maplibregl-canvas")
        .evaluate((element, original) => element === original, map),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}
test("cardinal flow, fixed speed colours, calm and masked fields", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await setting(page, "Demo field", "north");
  const north = await flow(page);
  expect(Number(north.motionY)).toBeGreaterThan(0);
  expect(Math.abs(Number(north.motionX))).toBeLessThan(0.001);
  const a = await pixels(page);
  expect(a.nonempty).toBeGreaterThan(500);
  await page.locator(".map-stage").screenshot({ path: info.outputPath("north.png") });
  await setting(page, "Demo field", "east");
  const east = await flow(page);
  expect(Number(east.motionX)).toBeLessThan(0);
  expect(Math.abs(Number(east.motionY))).toBeLessThan(0.001);
  await setting(page, "Demo field", "gradient");
  const gradient = await flow(page);
  expect(Number(gradient.fastStep)).toBeGreaterThan(Number(gradient.slowStep) * 1.4);
  await expect(page.locator(".wind-legend")).toContainText("60+");
  await page.locator(".map-stage").screenshot({ path: info.outputPath("speed-gradient.png") });
  await setting(page, "Demo field", "calm");
  await flow(page);
  expect(Number(await canvas(page).getAttribute("data-segments"))).toBe(0);
  expect((await pixels(page)).nonempty).toBe(0);
  await page.getByRole("button", { name: "Inspect wind", exact: true }).click();
  await page.locator("canvas.maplibregl-canvas").click({ position: { x: 500, y: 250 } });
  await expect(page.locator(".wind-inspector")).toContainText("0.0 km/h · Calm");
  await setting(page, "Demo field", "holes");
  await flow(page);
  expect((await pixels(page)).nonempty).toBeGreaterThan(100);
  await page.locator(".map-stage").screenshot({ path: info.outputPath("missing-holes.png") });
  await writeFile(
    info.outputPath("motion-metrics.json"),
    JSON.stringify({ north, east, gradient, a, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});

test("timeline commits one matching wind hour and preserves independent animation pause", async ({
  page,
}, info) => {
  await ready(page, "combined");
  await flow(page);
  await expect(page.locator(".map-legend")).toBeVisible();
  await expect(page.locator(".wind-legend")).toBeVisible();
  await page.getByRole("button", { name: "Pause wind animation" }).click();
  await expect(canvas(page)).toHaveAttribute("data-running", "false");
  const staticPixels = await pixels(page);
  expect(staticPixels.nonempty).toBeGreaterThan(100);
  await expect(page.locator("main.overview-page")).toHaveAttribute("data-snapshot-at", latest);
  await page.getByRole("slider", { name: "Observation time" }).press("ArrowLeft");
  await expect(page.locator("main.overview-page")).toHaveAttribute(
    "data-snapshot-at",
    "2026-09-21T03:00:00.000Z",
  );
  await expect(canvas(page)).toHaveAttribute("data-valid-at", "2026-09-21T03:00:00.000Z");
  await expect(canvas(page)).toHaveAttribute("data-running", "false");
  await page.getByRole("button", { name: "Play wind animation" }).click();
  await flow(page);
  await expect(page.locator("main.overview-page")).toHaveAttribute(
    "data-snapshot-at",
    "2026-09-21T03:00:00.000Z",
  );
  await page.getByRole("button", { name: "Latest available", exact: true }).click();
  await expect(canvas(page)).toHaveAttribute("data-valid-at", latest);
  await page.locator(".map-stage").screenshot({ path: info.outputPath("combined.png") });
});

test("Near Me, region transitions, wheel zoom and Back retain one wind map", async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 3, longitude: 101.5, accuracy: 25 });
  await ready(page);
  await flow(page);
  await page
    .locator("canvas.maplibregl-canvas")
    .evaluate((e) => (e.dataset.windIdentity = "persistent"));
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-button")).toHaveAttribute("data-location-phase", "flight");
  await expect(canvas(page)).toHaveAttribute("data-running", "false");
  await expect(page.locator(".near-me-button")).toHaveAttribute("data-location-phase", "settled");
  await flow(page);
  await expect(page.locator(".near-me-card")).toContainText("not a reading at your location");
  await page.locator(".map-stage").screenshot({ path: info.outputPath("near-me.png") });
  await page.getByRole("button", { name: "Dismiss location result" }).click();
  for (const slug of ["selangor", "sabah", "putrajaya"]) {
    await page.locator(`.region-row[href='/region/${slug}']`).click();
    await expect(page).toHaveURL(new RegExp(`/region/${slug}$`));
    const toolbar = await page.locator(".wind-toolbar").boundingBox();
    const panel = await page.locator(".region-information").boundingBox();
    expect(toolbar!.x + toolbar!.width).toBeLessThanOrEqual(panel!.x + 1);
    await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
    await flow(page);
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveAttribute(
      "data-wind-identity",
      "persistent",
    );
    await expect(canvas(page)).toHaveCount(1);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  }
  const map = page.locator("canvas.maplibregl-canvas");
  await map.scrollIntoViewIfNeeded();
  await map.hover({ position: { x: 600, y: 250 } });
  await page.mouse.wheel(0, -400);
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  await flow(page);
  await expect(map).toHaveCount(1);
});

test("repeated toggles, offscreen pause and presentation controls do not fetch per frame", async ({
  page,
}, info) => {
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/wind?")) requests++;
  });
  await ready(page);
  await flow(page);
  const before = requests;
  await page.locator(".wind-settings").evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.getByRole("checkbox", { name: "Wind-speed shading" }).check();
  await page.getByRole("combobox", { name: "Rendering density" }).selectOption("low");
  await page.getByRole("slider", { name: "Trail opacity" }).fill("0.6");
  await page.locator(".wind-settings").evaluate((e) => ((e as HTMLDetailsElement).open = false));
  await flow(page);
  expect(requests).toBe(before);
  await page.locator(".map-stage").screenshot({ path: info.outputPath("shading.png") });
  await page.evaluate(() => scrollTo(0, 0));
  await page.setViewportSize({ width: 1440, height: 320 });
  await expect(canvas(page)).toHaveAttribute("data-running", "false");
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let i = 0; i < 4; i++) {
    await page.getByRole("combobox", { name: "Map layers", exact: true }).selectOption("air");
    await expect(canvas(page)).toHaveCount(0);
    await page.getByRole("combobox", { name: "Map layers", exact: true }).selectOption("wind");
    await expect(canvas(page)).toHaveCount(1);
  }
  await flow(page);
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
  expect(requests).toBeLessThanOrEqual(before + 4);
});

test("real-source failure stays unavailable without demo fallback", async ({ page }) => {
  await page.route("**/api/wind?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("source") === "open-meteo")
      await route.fulfill({ status: 503, json: { error: "Provider unavailable (test)" } });
    else await route.continue();
  });
  await ready(page);
  await setting(page, "Wind source", "open-meteo");
  await expect(page.locator(".wind-status")).toContainText("Wind unavailable for this time");
  await expect(canvas(page)).toHaveAttribute("data-valid-at", "");
  await expect(page.locator(".wind-status")).not.toContainText("SYNTHETIC DEMO WIND");
});

test("rapid historical changes hide pending wind and reject an obsolete response", async ({
  page,
}) => {
  await ready(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/wind?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("at") === "2026-09-21T03:00:00.000Z") {
      const response = await route.fetch();
      await held;
      try {
        await route.fulfill({ response });
      } catch {
        /* The superseded browser request may already be aborted. */
      }
    } else await route.continue();
  });
  const slider = page.getByRole("slider", { name: "Observation time" });
  await slider.press("ArrowLeft");
  await expect(page.locator("main.overview-page")).toHaveAttribute(
    "data-snapshot-at",
    "2026-09-21T03:00:00.000Z",
  );
  await expect(canvas(page)).toHaveAttribute("data-valid-at", "");
  await slider.press("ArrowLeft");
  await expect(canvas(page)).toHaveAttribute("data-valid-at", "2026-09-21T02:00:00.000Z");
  release();
  await flow(page);
  await expect(page.locator(".wind-status")).toHaveAttribute(
    "data-wind-valid-at",
    "2026-09-21T02:00:00.000Z",
  );
});

test("reduced motion uses static arrows; phone controls and BM remain usable", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page.getByRole("button", { name: "Static wind arrows" })).toBeDisabled();
  await expect(canvas(page)).toHaveAttribute("data-running", "false");
  expect((await pixels(page)).nonempty).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("mobile-reduced.png"), fullPage: true });
  await page.getByRole("button", { name: "BM", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Lapisan peta", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Anak panah statik" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Lapisan peta", exact: true }).selectOption("air");
  await expect(canvas(page)).toHaveCount(0);
});

test("normal-motion layout and WebGL evidence at required viewport sizes", async ({
  page,
}, info) => {
  await ready(page);
  const performance: Record<string, unknown> = {};
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
    [1024, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "All Malaysia", exact: true }).click();
    const metrics = await flow(page);
    const a = await pixels(page);
    await flow(page);
    const b = await pixels(page);
    expect(a.checksum).not.toBe(b.checksum);
    expect(a.nonempty).toBeGreaterThan(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`viewport-${width}.png`), fullPage: true });
    performance[String(width)] = { metrics, texture: a };
  }
  await writeFile(info.outputPath("performance.json"), JSON.stringify(performance, null, 2));
});
