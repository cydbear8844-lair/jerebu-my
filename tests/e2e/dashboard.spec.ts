import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const regions = [
  "johor",
  "kedah",
  "kelantan",
  "melaka",
  "negeri-sembilan",
  "pahang",
  "perak",
  "perlis",
  "pulau-pinang",
  "sabah",
  "sarawak",
  "selangor",
  "terengganu",
  "kuala-lumpur",
  "labuan",
  "putrajaya",
];
let evidence: string;
test.beforeEach(async ({}, testInfo) => {
  evidence = testInfo.outputDir;
  await mkdir(evidence, { recursive: true });
});

test("national WebGL map, 16 regions, hover without requests, geographic selection and Back", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("MALAYSIA AIR QUALITY");
  await expect(page.locator(".data-banner")).toContainText("DEMO DATA — NOT CURRENT READINGS");
  await expect(page.locator(".region-list > a")).toHaveCount(16);
  await expect(page.locator(".region-list a[href='/region/kelantan']")).toContainText("Stale");
  await expect(page.locator(".region-list a[href='/region/perlis']")).toContainText("Missing");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sabah & Sarawak", exact: true })).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) requests.push(request.url());
  });
  await page.locator(".region-row[href='/region/selangor']").hover();
  await expect(page.locator(".map-preview h2")).toHaveText("Selangor");
  await expect(page).toHaveURL("/");
  expect(requests).toEqual([]);
  await page.locator(".overview-heading h1").hover();
  await page.screenshot({ path: `${evidence}/overview-desktop.png`, fullPage: true });
  await page.locator(".region-row[href='/region/selangor']").click();
  await expect(page).toHaveURL("/region/selangor");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Selangor");
  await expect(page.locator(".history-chart")).toBeVisible();
  await page.screenshot({ path: `${evidence}/selangor-desktop.png`, fullPage: true });
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("MALAYSIA AIR QUALITY");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await expect(page.locator(".map-label-sabah")).toBeVisible();
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  const mapBounds = await page.locator("canvas.maplibregl-canvas").boundingBox();
  expect(mapBounds).not.toBeNull();
  for (const slug of ["perlis", "sabah"]) {
    const label = page.locator(`.map-label-${slug}`);
    await expect(label).toBeVisible();
    const bounds = await label.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(mapBounds!.x);
    expect(bounds!.y).toBeGreaterThanOrEqual(mapBounds!.y);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(mapBounds!.x + mapBounds!.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(mapBounds!.y + mapBounds!.height);
  }
  await page.screenshot({ path: `${evidence}/overview-after-back.png`, fullPage: true });
  const sabah = await page.locator(".map-label-sabah").boundingBox();
  expect(sabah).not.toBeNull();
  await page.mouse.move(sabah!.x + sabah!.width / 2 + 15, sabah!.y + sabah!.height + 20);
  await expect(page.locator(".map-preview h2")).toHaveText("Sabah");
  await page.mouse.click(sabah!.x + sabah!.width / 2 + 15, sabah!.y + sabah!.height + 20);
  await expect(page).toHaveURL("/region/sabah");
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
  await expect(page.locator(".map-label-sabah")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const region of regions) {
  test(`region deep link reload: ${region}`, async ({ page }) => {
    await page.goto(`/region/${region}`);
    await expect(page.locator(".location-heading h1")).toBeVisible();
    await expect(page.getByRole("button", { name: "Stations 2", exact: true })).toBeVisible();
    await expect(page.locator(".data-banner")).toContainText("DEMO DATA");
    if (region === "perlis") {
      await expect(page.locator(".regional-metric .reading")).toContainText("—");
      await expect(page.locator(".regional-metric")).toContainText(
        "No fresh eligible observations",
      );
      await page.screenshot({ path: `${evidence}/perlis-no-data.png`, fullPage: true });
    }
    if (region === "kelantan")
      await expect(page.locator(".regional-metric .reading")).toContainText("—");
    if (region === "sarawak") {
      await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
      await page.screenshot({ path: `${evidence}/sarawak-desktop.png`, fullPage: true });
    }
    if (region === "putrajaya") {
      await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
      await page.screenshot({ path: `${evidence}/putrajaya-desktop.png`, fullPage: true });
    }
    await page.reload();
    await expect(page.locator(".location-heading h1")).toBeVisible();
    await expect(page).toHaveURL(`/region/${region}`);
    if (region === "putrajaya")
      await expect(page.locator(".location-heading h1")).toHaveText("Putrajaya");
  });
}

test("unknown region and nested route return not found", async ({ page }) => {
  await page.goto("/region/not-a-region");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("not on this map");
  await page.goto("/region/selangor/anything");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("not on this map");
});

test("search and sorting, station navigation, history ranges, null gaps and custom range", async ({
  page,
}) => {
  await page.goto("/region/selangor");
  await page.getByRole("button", { name: "Stations 2", exact: true }).click();
  await page.getByRole("textbox", { name: "Search stations" }).fill("Selangor B");
  await expect(page.locator(".station-table-panel tbody tr")).toHaveCount(1);
  await expect(page.locator(".station-table-panel tbody tr")).toContainText("Missing");
  await page.getByLabel("Sort stations", { exact: true }).selectOption("value");
  await page.locator(".station-table-panel tbody a").click();
  await expect(page).toHaveURL("/station/demo-selangor-b");
  await expect(page.locator(".history-chart")).toBeVisible();
  await expect(page.locator(".history-chart")).toHaveAttribute(
    "data-station-id",
    "demo-selangor-b",
  );
  expect(
    Number(await page.locator(".history-chart").getAttribute("data-gap-count")),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "7d", exact: true }).click();
  await expect(page.locator(".history-chart")).toHaveAttribute("data-point-count", "169");
  await page.getByRole("button", { name: "30d", exact: true }).click();
  await expect(page.locator(".history-chart")).toHaveAttribute("data-point-count", "721");
  await expect(page.locator(".history-chart")).toHaveAttribute(
    "data-station-id",
    "demo-selangor-b",
  );
  await page.screenshot({ path: `${evidence}/station-history-desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "View data table" }).click();
  await expect(page.locator(".history-data-table tbody tr")).toHaveCount(721);
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("From (MYT)").fill("2026-09-20T00:00");
  await page.getByLabel("To (MYT)").fill("2026-09-21T00:00");
  await page.getByRole("button", { name: "Apply range" }).click();
  await expect(page.locator(".history-data-table tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: "View chart" }).click();
  await expect(page.locator(".history-chart")).toHaveAttribute("data-point-count", "25");
});

test("persistent saved locations, BM/EN dictionaries and accessible share fallback", async ({
  page,
  context,
}) => {
  await page.goto("/region/labuan");
  await page.getByRole("button", { name: "Save location", exact: true }).click();
  await page.getByRole("button", { name: "BM", exact: true }).click();
  await expect(page.locator(".data-banner")).toContainText("DATA DEMO");
  await expect(page.getByRole("button", { name: "Gambaran", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ms");
  await expect(
    page.getByRole("button", { name: "Buang lokasi tersimpan", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Disimpan/ }).click();
  await expect(page.locator(".saved-item")).toContainText("Labuan");
  await page.locator(".saved-item a").click();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await context.grantPermissions([]);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Copy this link" })).toHaveValue(
    /\/region\/labuan$/,
  );
  await expect(page.locator(".regional-metric .reading")).toContainText("IPU");
  await page.goto("/about");
  await expect(page.locator(".data-banner")).toContainText("DEMO DATA — NOT CURRENT READINGS");
});

test("mobile territory sheet focus, navigation, map/list and responsive layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const mobileCanvas = await page.locator("canvas.maplibregl-canvas").boundingBox();
  expect(mobileCanvas?.height).toBeGreaterThan(400);
  expect(mobileCanvas?.width).toBeGreaterThan(300);
  await expect(page.getByRole("button", { name: "All Malaysia", exact: true })).toBeVisible();
  await page.screenshot({ path: `${evidence}/overview-mobile.png`, fullPage: true });
  await page.getByRole("button", { name: "List · 16", exact: true }).click();
  const territory = page.locator(".region-list a[href='/region/kuala-lumpur']");
  await territory.focus();
  await territory.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL("/");
  await page.screenshot({ path: `${evidence}/territory-sheet-mobile.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(territory).toBeFocused();
  await territory.click();
  await page.getByRole("link", { name: "View dashboard", exact: true }).click();
  await expect(page).toHaveURL("/region/kuala-lumpur");
  await expect(page.locator(".history-chart")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `${evidence}/region-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `${evidence}/overview-tablet.png`, fullPage: true });
});

test("map download failure retains all region navigation", async ({ page }) => {
  await page.route("**/data/malaysia-regions.geojson", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".map-fallback")).toContainText("Interactive map unavailable");
  await expect(page.locator(".region-list a")).toHaveCount(16);
  await page.locator(".region-list a[href='/region/perlis']").click();
  await expect(page).toHaveURL("/region/perlis");
});

test("replay changes as-of, never chooses future observations, and returns latest", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const slider = page.getByRole("slider", { name: "Observation time" });
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await slider.focus();
  await slider.press("ArrowLeft");
  await expect(page.locator(".snapshot-stamp")).toContainText("Historical mode");
  const response = await request.get("/api/overview?at=2026-09-20T04%3A00%3A00.000Z");
  expect(response.status()).toBe(200);
  const body = await response.json();
  for (const reading of body.observations)
    expect(Date.parse(reading.observedAt)).toBeLessThanOrEqual(Date.parse(body.asOf));
  await page.getByRole("button", { name: "Latest available" }).click();
  await expect(slider).toHaveValue(String(Date.parse("2026-09-21T04:00:00.000Z")));
  await expect(page.locator(".snapshot-stamp")).toContainText("21 Sept 2026");
});

test("API range and station validation returns honest errors and no-store", async ({ request }) => {
  const overview = await request.get("/api/overview");
  expect(overview.headers()["cache-control"]).toContain("no-store");
  expect((await overview.json()).mode).toBe("demo");
  expect((await request.get("/api/overview?at=not-a-time")).status()).toBe(400);
  expect(
    (
      await request.get(
        "/api/history?stationId=missing&start=2026-09-20T00:00:00Z&end=2026-09-21T00:00:00Z",
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(
        "/api/history?stationId=demo-selangor-a&start=2026-09-22T00:00:00Z&end=2026-09-20T00:00:00Z",
      )
    ).status(),
  ).toBe(400);
});

test("repeating the active history range and unchanged custom submission keeps observations usable", async ({
  page,
}) => {
  await page.goto("/station/demo-selangor-a");
  await expect(page.locator(".history-chart")).toBeVisible();
  await page.getByRole("button", { name: "24h", exact: true }).click();
  await expect(page.locator(".history-chart")).toBeVisible();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByRole("button", { name: "Apply range", exact: true }).click();
  await expect(page.locator(".history-chart")).toBeVisible();
  await page.getByRole("button", { name: "Apply range", exact: true }).click();
  await expect(page.locator(".history-chart")).toBeVisible();
});

test("mobile map failure activates the list rather than targeting hidden content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/data/malaysia-regions.geojson", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".map-fallback")).toBeVisible();
  await page.locator(".map-fallback").getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Search regions" })).toBeFocused();
  await page.locator(".region-list a[href='/region/putrajaya']").click();
  await expect(page.getByRole("dialog")).toContainText("Putrajaya");
});
