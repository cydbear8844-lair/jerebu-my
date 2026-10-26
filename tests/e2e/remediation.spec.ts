import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
}

test("wind survives zero-size workspace hiding and resumes on return without bounds errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.getByRole("combobox", { name: "Map layers", exact: true }).selectOption("wind");
  await page.locator(".map-stage").scrollIntoViewIfNeeded();
  await expect(page.locator(".wind-source-canvas")).toHaveAttribute("data-running", "true");
  await page
    .locator("canvas.maplibregl-canvas")
    .evaluate((e) => (e.dataset.hiddenWorkspaceIdentity = "retained"));
  for (const route of ["about", "saved"]) {
    await page.locator(`.app-header a[href="/${route}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/${route}$`));
    await expect(page.locator(".wind-source-canvas")).toHaveAttribute("data-running", "false");
    await page.locator('.app-header a[href="/"]').filter({ hasText: "Malaysia overview" }).click();
    await page.locator(".map-stage").scrollIntoViewIfNeeded();
    await expect(page.locator(".wind-source-canvas")).toHaveAttribute("data-running", "true");
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveAttribute(
      "data-hidden-workspace-identity",
      "retained",
    );
  }
  expect(errors).toEqual([]);
});

test("mobile selection invalidates a held location and Back closes its portal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (callback: PositionCallback) => {
          Object.assign(window, {
            releaseReviewLocation: () =>
              callback({
                coords: { longitude: 101.5, latitude: 3, accuracy: 25 },
              } as GeolocationPosition),
          });
        },
      },
    });
  });
  await page.goto("/about");
  await page.getByRole("link", { name: "Malaysia overview", exact: true }).click();
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-button")).toHaveAttribute("data-location-phase", "locating");
  await page.getByRole("button", { name: "List · 16", exact: true }).click();
  const territory = page.locator('.region-row[href="/region/labuan"]');
  await territory.focus();
  await territory.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Labuan");
  await page.evaluate(
    async () =>
      await (
        window as unknown as { releaseReviewLocation: () => Promise<void> }
      ).releaseReviewLocation(),
  );
  await expect(page.locator(".near-me-button")).toHaveAttribute("data-location-phase", "idle");
  await expect(page.locator(".near-me-user")).toHaveCount(0);
  await page.getByRole("dialog").screenshot({ path: test.info().outputPath("mobile-sheet.png") });
  await page.keyboard.press("Escape");
  await expect(territory).toBeFocused();
  await territory.press("Enter");
  await page.goBack();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[hidden]")))).toBe(
    false,
  );
  await page.screenshot({ path: test.info().outputPath("after-back.png") });
  await page.goForward();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("saved station from an omitted catalogue remains removable", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("jerebu-saved", JSON.stringify(["waqi-9999"])),
  );
  await page.goto("/saved");
  const item = page.locator(".saved-item");
  await expect(item).toContainText("waqi-9999");
  await expect(item).toContainText("Unavailable in the current station catalogue");
  await expect(item.getByRole("link")).toHaveAttribute("href", "/station/waqi-9999");
  await item.getByRole("button", { name: "Remove saved location: waqi-9999" }).click();
  await expect(item).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("jerebu-saved")!))).toEqual([]);
});

test("BM not-found and footer retain the selected recovery language", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jerebu-language", "bm"));
  await page.goto("/region/not-a-region");
  await expect(page.locator("html")).toHaveAttribute("lang", "ms");
  await expect(
    page.getByRole("heading", { name: "Lokasi itu tiada pada peta ini." }),
  ).toBeVisible();
  await expect(page.locator(".app-footer")).toContainText("Peneroka kualiti udara Malaysia");
  await page.screenshot({ path: test.info().outputPath("bm-recovery.png"), fullPage: true });
});

async function loseContext(page: Page) {
  await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.maplibregl-canvas")!;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("Real WebGL context-loss extension unavailable");
    Object.assign(window, { restoreReviewContext: () => extension.restoreContext() });
    await new Promise<void>((resolve) => {
      canvas.addEventListener("webglcontextlost", () => resolve(), { once: true });
      extension.loseContext();
    });
  });
}
async function restoreContext(page: Page) {
  await page.evaluate(async () => {
    const canvas = document.querySelector("canvas.maplibregl-canvas")!;
    await new Promise<void>((resolve) => {
      canvas.addEventListener(
        "webglcontextrestored",
        () => requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        { once: true },
      );
      (window as unknown as { restoreReviewContext: () => void }).restoreReviewContext();
    });
  });
}

for (const mode of ["active", "paused", "reduced"] as const) {
  test(`wind enabled inside the restored event recovers in ${mode} mode`, async ({ page }) => {
    if (mode === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await ready(page);
    const layers = page.getByRole("combobox", { name: "Map layers", exact: true });
    await layers.selectOption("wind");
    await page.locator(".map-stage").scrollIntoViewIfNeeded();
    const source = page.locator(".wind-source-canvas");
    await expect(source).toHaveAttribute("data-valid-at", "2026-09-21T04:00:00.000Z");
    if (mode === "paused")
      await page.getByRole("button", { name: "Pause wind animation", exact: true }).click();
    await loseContext(page);
    await layers.selectOption("air");
    await expect(source).toHaveCount(0);
    await page.evaluate(async () => {
      const canvas = document.querySelector("canvas.maplibregl-canvas")!;
      await new Promise<void>((resolve) => {
        canvas.addEventListener(
          "webglcontextrestored",
          () => {
            const select = document.querySelector<HTMLSelectElement>(
              'select[aria-label="Map layers"]',
            )!;
            select.value = "wind";
            select.dispatchEvent(new Event("change", { bubbles: true }));
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          },
          { once: true },
        );
        (window as unknown as { restoreReviewContext: () => void }).restoreReviewContext();
      });
    });
    await expect(source).toHaveAttribute("data-valid-at", "2026-09-21T04:00:00.000Z");
    await expect(source).toHaveAttribute("data-running", mode === "active" ? "true" : "false");
    await expect(page.locator(".wind-renderer-error")).toHaveCount(0);
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

for (const mode of ["active", "paused", "reduced"] as const) {
  test(`wind context restoration preserves ${mode} rendering without exceptions`, async ({
    page,
  }) => {
    if (mode === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await ready(page);
    await page.getByRole("combobox", { name: "Map layers", exact: true }).selectOption("wind");
    await page.locator(".map-stage").scrollIntoViewIfNeeded();
    const source = page.locator(".wind-source-canvas");
    await expect(source).toHaveAttribute("data-valid-at", "2026-09-21T04:00:00.000Z");
    if (mode === "paused")
      await page.getByRole("button", { name: "Pause wind animation", exact: true }).click();
    await expect(source).toHaveAttribute("data-running", mode === "active" ? "true" : "false");
    const before = Number(await source.getAttribute("data-frames"));
    await loseContext(page);
    await expect(source).toHaveAttribute("data-running", "false");
    await restoreContext(page);
    await expect(source).toHaveAttribute("data-running", mode === "active" ? "true" : "false");
    if (mode === "active")
      await expect
        .poll(async () => Number(await source.getAttribute("data-frames")))
        .toBeGreaterThan(before + 2);
    await expect(source).toHaveCount(1);
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
    await page
      .locator(".map-stage")
      .screenshot({ path: test.info().outputPath(`restored-${mode}.png`) });
    expect(errors).toEqual([]);
  });
}

test("disabling wind while context is lost allows a clean re-enable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const layers = page.getByRole("combobox", { name: "Map layers", exact: true });
  await layers.selectOption("wind");
  await page.locator(".map-stage").scrollIntoViewIfNeeded();
  await expect(page.locator(".wind-source-canvas")).toHaveAttribute("data-running", "true");
  await loseContext(page);
  await layers.selectOption("air");
  await expect(page.locator(".wind-source-canvas")).toHaveCount(0);
  await restoreContext(page);
  await layers.selectOption("wind");
  await expect(page.locator(".wind-source-canvas")).toHaveAttribute("data-running", "true");
  await expect
    .poll(async () =>
      Number(await page.locator(".wind-source-canvas").getAttribute("data-segments")),
    )
    .toBeGreaterThan(1000);
  await page
    .locator(".map-stage")
    .screenshot({ path: test.info().outputPath("reenabled-after-loss.png") });
  await layers.selectOption("air");
  await expect(page.locator(".wind-source-canvas")).toHaveCount(0);
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});
