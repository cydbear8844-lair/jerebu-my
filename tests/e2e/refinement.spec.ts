import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

let evidence: string;
test.beforeEach(async ({}, testInfo) => {
  evidence = testInfo.outputDir;
  await mkdir(evidence, { recursive: true });
});
const latest = "2026-09-21T04:00:00.000Z";
test.use({ video: "on" });

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await expect(page.locator(".playback-availability .available").first()).toBeAttached();
}

test("normal motion: acquisition ping precedes real camera travel and settles once", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: 101.5, latitude: 3.0, accuracy: 25 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.evaluate(() => {
    const phases: { phase: string; t: number }[] = [];
    Object.assign(window, { refinementPhases: phases });
    window.addEventListener("jerebu:location-phase", (event) =>
      phases.push({ phase: (event as CustomEvent).detail.phase, t: performance.now() }),
    );
  });
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  const session = await page.evaluate(() => JSON.stringify(sessionStorage));
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-button")).toHaveAttribute("data-location-phase", "settled");
  const phases = await page.evaluate(
    () =>
      (window as unknown as { refinementPhases: { phase: string; t: number }[] }).refinementPhases,
  );
  expect(phases.map((x) => x.phase)).toEqual(["ping", "flight", "settled"]);
  expect(phases[1].t - phases[0].t).toBeGreaterThanOrEqual(180);
  expect(phases[2].t - phases[1].t).toBeGreaterThan(750);
  await expect(page.getByRole("img", { name: "Your approximate location" })).toBeVisible();
  await expect(page.locator(".near-me-card")).toContainText("Fresh at selected time");
  await expect(page.locator(".near-me-card")).toContainText("not a reading at your location");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storage);
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).toBe(session);
  await writeFile(
    `${evidence}/location-sequence.json`,
    JSON.stringify({ phases, errors }, null, 2),
  );
  await page.screenshot({ path: `${evidence}/after-near-me.png`, fullPage: true });
  await page.getByRole("button", { name: "Dismiss location result" }).click();
  await expect(page.locator(".near-me-user")).toHaveCount(0);
  await page.locator(".region-row[href='/region/selangor']").click();
  await expect(page.locator(".location-heading h1")).toHaveText("Selangor");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("MALAYSIA AIR QUALITY");
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).toBe(session);
  expect(errors).toEqual([]);
});

test("location error states, repeated clicks and outside Malaysia remain honest", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.evaluate(() => {
    Object.assign(window, { geoCalls: 0 });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) => {
          (window as unknown as { geoCalls: number }).geoCalls++;
          queueMicrotask(() => fail({ code: 1 }));
        },
      },
    });
  });
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-card")).toContainText("permission denied");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) =>
          fail({ code: 3 }),
      },
    });
  });
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-card")).toContainText("timed out");
  await page.reload();
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: 151.2, latitude: -33.8 });
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-card")).toContainText("outside the mapped Malaysia");
  await expect(page.locator(".near-me-station")).toHaveCount(0);
  await page.evaluate(() => {
    Object.assign(window, { geoCalls: 0 });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: () => {
          (window as unknown as { geoCalls: number }).geoCalls++;
        },
      },
    });
  });
  const button = page.getByRole("button", { name: "Near me", exact: true });
  await button.click();
  await expect(page.locator(".near-me-button")).toBeDisabled();
  await page.locator(".near-me-button").dispatchEvent("click");
  expect(await page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls)).toBe(1);
  await page.getByRole("button", { name: "Dismiss location result" }).click();
});

test("one canvas survives region changes and Back restores overview search and time", async ({
  page,
}) => {
  await ready(page);
  await page.locator("canvas").evaluate((c) => (c.dataset.identity = "original"));
  const slider = page.getByRole("slider", { name: "Observation time" });
  await slider.press("ArrowLeft");
  await expect(page.locator("main.overview-page")).not.toHaveAttribute("data-snapshot-at", latest);
  const selected = await page.locator("main.overview-page").getAttribute("data-snapshot-at");
  const search = page.getByRole("textbox", { name: "Search regions" });
  await search.fill("Selangor");
  await page.locator(".region-row[href='/region/selangor']").press("Enter");
  await expect(page).toHaveURL("/region/selangor");
  await expect(page.locator(".location-heading h1")).toHaveText("Selangor");
  await expect(page.locator("canvas")).toHaveAttribute("data-identity", "original");
  await expect(page.locator(".history-chart")).toBeVisible();
  await page.goBack();
  await expect(search).toHaveValue("Selangor");
  await expect(page.locator("main.overview-page")).toHaveAttribute("data-snapshot-at", selected!);
  await search.fill("");
  await page.locator(".region-row[href='/region/sabah']").click();
  await page.locator(".region-row[href='/region/sarawak']").click();
  await page.locator(".region-row[href='/region/putrajaya']").click();
  await expect(page.locator(".location-heading h1")).toHaveText("Putrajaya");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("canvas")).toHaveAttribute("data-identity", "original");
  await page.reload();
  await expect(page.locator(".location-heading h1")).toHaveText("Putrajaya");
});

test("pan and zoom camera restore on Back, pending replay cannot replace a newer location", async ({
  page,
  context,
  request,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "All Malaysia", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("jerebu-camera")))
    .not.toBeNull();
  const original = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jerebu-camera")!));
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("jerebu-camera")!).zoom))
    .toBeGreaterThan(original.zoom + 0.5);
  const canvas = await page.locator("canvas").boundingBox();
  await page.mouse.move(canvas!.x + canvas!.width * 0.45, canvas!.y + canvas!.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(canvas!.x + canvas!.width * 0.5, canvas!.y + canvas!.height * 0.45, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("jerebu-camera")!).center[0]))
    .not.toBe(original.center[0]);
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  const before = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jerebu-camera")!));
  await page.locator(".region-row[href='/region/selangor']").click();
  await expect(page.locator(".location-heading h1")).toHaveText("Selangor");
  await page.goBack();
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  await expect
    .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("jerebu-camera")!).zoom))
    .toBeCloseTo(before.zoom, 3);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("jerebu-camera")!).center[0]))
    .toBeCloseTo(before.center[0], 3);
  const payload = await (await request.get("/api/overview?at=2026-09-20T04:00:00.000Z")).json();
  let release!: () => void;
  let intercepted!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const received = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  await page.route("**/api/overview?at=*", async (route) => {
    intercepted();
    await held;
    await route.fulfill({ json: payload }).catch(() => {});
  });
  await page
    .getByRole("slider", { name: "Observation time" })
    .fill(String(Date.parse(payload.asOf)));
  await received;
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  release();
  await expect(page.locator(".near-me-button")).toHaveAttribute("data-location-phase", "settled");
  await expect(page.locator("main.overview-page")).toHaveAttribute("data-snapshot-at", latest);
  await expect(page.locator(".near-me-card")).toContainText("Fresh at selected time");
});

test("timeline commits snapshot data and time together, keyboard, drag, speeds and range stop", async ({
  page,
  request,
}) => {
  await ready(page);
  const slider = page.getByRole("slider", { name: "Observation time" });
  const target = "2026-09-20T04:00:00.000Z";
  const expected = await (await request.get(`/api/overview?at=${target}`)).json();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/overview?at=*", async (route) => {
    await held;
    await route.continue();
  });
  await slider.fill(String(Date.parse(target)));
  await expect(page.locator(".playback-time-marker")).toContainText("Loading");
  await expect(page.locator("main.overview-page")).toHaveAttribute("data-snapshot-at", latest);
  release();
  await expect(page.locator("main.overview-page")).toHaveAttribute("data-snapshot-at", target);
  const max = Math.max(...expected.summaries.map((s: { value: number | null }) => s.value ?? -1));
  await expect(page.locator(".highest-summary-body strong")).toContainText(String(max));
  for (const region of expected.summaries)
    await expect(
      page.locator(`.region-row[href='/region/${region.regionId}'] .row-value`),
    ).toHaveText(String(region.value ?? "—"));
  expect(
    expected.observations.every(
      (o: { observedAt: string; fetchedAt: string }) =>
        Date.parse(o.observedAt) <= Date.parse(target) &&
        Date.parse(o.fetchedAt) <= Date.parse(target),
    ),
  ).toBe(true);
  await page.unroute("**/api/overview?at=*");
  await slider.press("End");
  await expect(page.locator("main.overview-page")).toHaveAttribute("data-snapshot-at", latest);
  await slider.press("ArrowLeft");
  await expect(page.locator("main.overview-page")).toHaveAttribute(
    "data-snapshot-at",
    "2026-09-21T03:00:00.000Z",
  );
  await page.getByRole("combobox", { name: "Playback speed" }).selectOption("2");
  await page.getByRole("button", { name: "Play hourly observations" }).click();
  await expect(page.locator("main.overview-page")).toHaveAttribute("data-snapshot-at", latest);
  await expect(page.getByRole("button", { name: "Play hourly observations" })).toBeVisible();
  const box = await slider.boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("main.overview-page")).not.toHaveAttribute("data-snapshot-at", latest);
  await page.getByRole("button", { name: "Latest available", exact: true }).click();
  await expect(page.locator("main.overview-page")).toHaveAttribute("data-snapshot-at", latest);
});

test("earliest availability gap has no eligible location and region history cannot leak future rows", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "30d", exact: true }).click();
  const slider = page.getByRole("slider", { name: "Observation time" });
  await slider.press("Home");
  await expect(page.locator("main.overview-page")).toHaveAttribute(
    "data-snapshot-at",
    "2026-08-22T04:00:00.000Z",
  );
  await expect(page.locator(".playback-availability .gap").first()).toBeAttached();
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-card")).toContainText("No station has a fresh");
  await page.getByRole("button", { name: "Latest available", exact: true }).click();
  await page.locator(".region-row[href='/region/selangor']").click();
  await expect(page.locator(".history-chart")).toBeVisible();
  await page
    .getByRole("slider", { name: "Observation time" })
    .fill(String(Date.parse("2026-09-20T04:00:00.000Z")));
  await expect(page.locator("main.overview-page")).toHaveAttribute(
    "data-snapshot-at",
    "2026-09-20T04:00:00.000Z",
  );
  await page.getByRole("button", { name: "View data table" }).click();
  await expect(page.locator(".history-data-table")).toBeVisible();
  expect(await page.locator(".history-data-table tbody tr").count()).toBeGreaterThan(0);
  await expect(page.locator(".history-meta")).toContainText("20 Sept 2026, 12:00");
  await expect(page.locator(".history-data-table")).not.toContainText("21 Sept");
});

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
  [1024, 768],
  [390, 844],
]) {
  test(`composition and WebGL at ${width}x${height}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height });
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const overlaps = await page.locator("[data-label-id]").evaluateAll((elements) => {
      const labels = elements
        .filter((e) => getComputedStyle(e).visibility === "visible")
        .map((e) => ({ id: e.getAttribute("data-label-id"), r: e.getBoundingClientRect() }));
      const pairs: string[] = [];
      labels.forEach((a, i) =>
        labels.slice(i + 1).forEach((b) => {
          if (
            a.r.left < b.r.right &&
            a.r.right > b.r.left &&
            a.r.top < b.r.bottom &&
            a.r.bottom > b.r.top
          )
            pairs.push(`${a.id}/${b.id}`);
        }),
      );
      return pairs;
    });
    expect(overlaps).toEqual([]);
    await page.locator(".map-stage").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/after-${width}.png`, fullPage: true });
    await page.screenshot({ path: `${evidence}/after-map-${width}.png` });
    if (width === 390) {
      await page.getByRole("button", { name: "List · 16" }).click();
      await page.locator(".region-row[href='/region/labuan']").press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.screenshot({ path: `${evidence}/after-mobile-sheet.png` });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await context.grantPermissions(["geolocation"]);
      await context.setGeolocation({ latitude: 3, longitude: 101.5, accuracy: 25 });
      await page.getByRole("button", { name: "Near me", exact: true }).click();
      await expect(page.locator(".near-me-button")).toHaveAttribute(
        "data-location-phase",
        "settled",
      );
      await expect(page.locator(".near-me-card")).toBeInViewport({ ratio: 1 });
      const station = await page.locator(".near-me-station").boundingBox();
      const controls = await page.locator(".map-controls").boundingBox();
      expect(
        station &&
          controls &&
          (station.y >= controls.y + controls.height ||
            station.y + station.height <= controls.y ||
            station.x >= controls.x + controls.width ||
            station.x + station.width <= controls.x),
      ).toBe(true);
      await page.screenshot({ path: `${evidence}/after-mobile-location.png`, fullPage: false });
    }
  });
}

test("reduced motion and secondary-page skip target remain usable", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 3.139, longitude: 101.6869 });
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-button")).toHaveAttribute("data-location-phase", "settled");
  expect(
    await page.locator(".near-me-ring").evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await page.locator(".region-row[href='/region/selangor']").click();
  await expect(page.locator(".location-heading h1")).toHaveText("Selangor");
  expect(
    await page.locator(".region-information").evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await page.goto("/about");
  await expect(page.locator("#main")).toHaveCount(1);
  await expect(page.locator("#main")).toBeVisible();
});
