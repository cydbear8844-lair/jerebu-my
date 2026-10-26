import { test, expect, type Page } from "@playwright/test";
import os from "node:os";

test.use({ video: "on" });
let events: { kind: string; message: string }[] = [];

test.beforeEach(async ({ page, browser, browserName }, testInfo) => {
  events = [];
  page.on("pageerror", (error) => events.push({ kind: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") events.push({ kind: "console", message: message.text() });
  });
  page.on("requestfailed", (request) =>
    events.push({
      kind: "requestfailed",
      message: `${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
    }),
  );
  await testInfo.attach("environment", {
    body: JSON.stringify(
      {
        date: new Date().toISOString(),
        os: `${os.platform()} ${os.release()} ${os.arch()}`,
        engine: browserName,
        version: browser.version(),
        channel: testInfo.project.use.channel ?? "bundled engine",
        project: testInfo.project.name,
        viewport: page.viewportSize(),
        emulation: {
          isMobile: testInfo.project.use.isMobile ?? false,
          hasTouch: testInfo.project.use.hasTouch ?? false,
          deviceScaleFactor: testInfo.project.use.deviceScaleFactor ?? 1,
        },
        motion: testInfo.project.use.reducedMotion ?? "no-preference",
        dataMode: "demo",
        physicalDevice: false,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await page.addInitScript(() => {
    const contexts: WebGLRenderingContext[] = [];
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      const result = original.apply(this, args);
      if ((args[0] === "webgl" || args[0] === "webgl2") && result)
        contexts.push(result as WebGLRenderingContext);
      return result;
    } as typeof original;
    Object.assign(window, { matrixContexts: contexts });
  });
});

test.afterEach(async ({}, testInfo) => {
  await testInfo.attach("browser-events", {
    body: JSON.stringify(events, null, 2),
    contentType: "application/json",
  });
});

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator(".data-banner")).toContainText("DEMO DATA");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
}

async function selectRegion(page: Page, slug: string) {
  if ((page.viewportSize()?.width ?? 1440) < 768)
    await page.getByRole("button", { name: "List · 16", exact: true }).click();
  const link = page.locator(`.region-row[href='/region/${slug}']`);
  await link.focus();
  await link.press("Enter");
  if ((page.viewportSize()?.width ?? 1440) < 768) {
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("link", { name: "View dashboard", exact: true }).click();
  }
  await expect(page).toHaveURL(`/region/${slug}`);
}

test("real WebGL, native geolocation grant, finite motion and territory keyboard navigation", async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 3, longitude: 101.5, accuracy: 25 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const webgl = await page.evaluate(() => {
    const contexts = (window as unknown as { matrixContexts: WebGLRenderingContext[] })
      .matrixContexts;
    return contexts.map((gl) => ({
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      lost: gl.isContextLost(),
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
    }));
  });
  expect(webgl.length).toBeGreaterThan(0);
  expect(webgl.every((gl) => !gl.lost && gl.width > 0 && gl.height > 0)).toBe(true);
  await testInfo.attach("actual-webgl", {
    body: JSON.stringify(webgl, null, 2),
    contentType: "application/json",
  });
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  await page.locator(".map-stage").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("map-viewport.png") });
  await page.screenshot({ path: testInfo.outputPath("overview.png"), fullPage: true });
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-button")).toHaveAttribute("data-location-phase", "settled");
  await expect(page.locator(".near-me-station")).toBeVisible();
  if (testInfo.project.use.reducedMotion === "reduce") {
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      true,
    );
    expect(
      await page.locator(".near-me-ring").evaluate((ring) => getComputedStyle(ring).animationName),
    ).toBe("none");
  }
  await expect
    .poll(() =>
      page
        .locator(".near-me-ring")
        .evaluate(
          (ring) =>
            ring.getAnimations().filter((animation) => animation.playState === "running").length,
        ),
    )
    .toBe(0);
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  await page.screenshot({ path: testInfo.outputPath("location.png"), fullPage: true });
  await page.getByRole("button", { name: "Dismiss location result" }).click();
  await selectRegion(page, "putrajaya");
  await expect(page.locator(".location-heading h1")).toHaveText("Putrajaya");
  await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".location-heading h1")).toHaveText("Putrajaya");
  expect(errors).toEqual([]);
});

test("touch-capable replay controls, pause, latest, sheet focus and viewport rotation", async ({
  page,
  isMobile,
}, testInfo) => {
  await ready(page);
  const slider = page.getByRole("slider", { name: "Observation time" });
  const latest = await slider.inputValue();
  if (isMobile) {
    await slider.scrollIntoViewIfNeeded();
    const bounds = await slider.boundingBox();
    expect(bounds).not.toBeNull();
    await page.touchscreen.tap(bounds!.x + bounds!.width * 0.4, bounds!.y + bounds!.height / 2);
    await expect(slider).not.toHaveValue(latest);
  }
  await slider.press("ArrowLeft");
  await expect(page.locator("main.overview-page")).not.toHaveAttribute(
    "data-snapshot-at",
    new Date(Number(latest)).toISOString(),
  );
  await page.getByRole("combobox", { name: "Playback speed" }).selectOption("0.5");
  await page.getByRole("button", { name: "Play hourly observations" }).click();
  await page.getByRole("button", { name: "Pause playback" }).click();
  await expect(page.getByRole("button", { name: "Play hourly observations" })).toBeVisible();
  await page.getByRole("button", { name: "Latest available", exact: true }).click();
  await expect(slider).toHaveValue(latest);
  if (isMobile) {
    await page.getByRole("button", { name: "List · 16", exact: true }).tap();
    const link = page.locator(".region-row[href='/region/labuan']");
    await link.focus();
    await link.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("sheet.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(link).toBeFocused();
  }
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`layout-${viewport.width}.png`),
      fullPage: true,
    });
  }
});

test("WebGL context failure keeps accessible list navigation", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.locator(".map-fallback")).toBeVisible();
  await page.locator(".map-fallback").getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Search regions" })).toBeFocused();
  await expect(page.locator(".region-list a")).toHaveCount(16);
  await selectRegion(page, "labuan");
  await expect(page.locator(".location-heading h1")).toHaveText("Labuan");
});

test("offline replay keeps last committed snapshot and permits retry", async ({
  page,
  context,
}) => {
  await ready(page);
  const committed = await page.locator("main.overview-page").getAttribute("data-snapshot-at");
  await context.setOffline(true);
  await page.getByRole("slider", { name: "Observation time" }).press("ArrowLeft");
  await expect(page.locator("main.overview-page")).toHaveAttribute("data-snapshot-at", committed!);
  await expect(page.locator(".playback-status")).toContainText(
    "previous snapshot remains displayed",
  );
  await context.setOffline(false);
  await page.getByRole("slider", { name: "Observation time" }).press("ArrowLeft");
  await expect(page.locator("main.overview-page")).not.toHaveAttribute(
    "data-snapshot-at",
    committed!,
  );
});

test("native permission denial followed by granted retry", async ({
  page,
  context,
  browserName,
}, testInfo) => {
  await context.grantPermissions([]);
  await ready(page);
  const permission = await page.evaluate(async () => ({
    secure: isSecureContext,
    state: (await navigator.permissions.query({ name: "geolocation" })).state,
  }));
  await testInfo.attach("native-permission", {
    body: JSON.stringify(permission),
    contentType: "application/json",
  });
  expect(permission.secure).toBe(true);
  expect(permission.state).toBe(browserName === "webkit" ? "prompt" : "denied");
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-card")).toContainText("permission denied");
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 3, longitude: 101.5, accuracy: 25 });
  if (browserName === "webkit") {
    await testInfo.attach("webkit-permission-reload", {
      body: "WebKit retains native denial on the current page after the automation grant changes. Reload before retry; no geolocation callback is mocked.",
      contentType: "text/plain",
    });
    await page.reload();
    await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  }
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-button")).toHaveAttribute("data-location-phase", "settled");
  await expect(page.locator(".near-me-station")).toBeVisible();
});

test("map navigation keeps window listeners, markers and canvases bounded", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      const key = `${type}:${typeof options === "boolean" ? options : Boolean(options?.capture)}`;
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(listener);
      add(type, listener, options);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      const key = `${type}:${typeof options === "boolean" ? options : Boolean(options?.capture)}`;
      listeners.get(key)?.delete(listener);
      remove(type, listener, options);
    }) as typeof window.removeEventListener;
    Object.assign(window, {
      matrixListenerCounts: () =>
        Object.fromEntries([...listeners].map(([key, value]) => [key, value.size])),
    });
  });
  await ready(page);
  const samples: { listeners: Record<string, number>; markers: number; canvases: number }[] = [];
  for (const slug of ["selangor", "sabah", "labuan", "putrajaya"]) {
    await selectRegion(page, slug);
    await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
    await page.goBack();
    await expect(page).toHaveURL("/");
    await expect(page.locator(".overview-heading h1")).toHaveText("MALAYSIA AIR QUALITY");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".map-shell")).toHaveAttribute("data-camera-state", "idle");
    await testInfo.attach(`before-focus-reset-${slug}`, {
      body: JSON.stringify(
        await page.evaluate(() => ({
          activeElement: document.activeElement?.outerHTML,
          previews: document.querySelectorAll(".map-preview").length,
          exitingPanels: document.querySelectorAll(".region-information.is-exiting").length,
          listeners: (
            window as unknown as { matrixListenerCounts: () => Record<string, number> }
          ).matrixListenerCounts(),
        })),
      ),
      contentType: "application/json",
    });
    await page.getByRole("button", { name: "Near me", exact: true }).focus();
    await page.locator(".overview-heading h1").hover();
    await expect(page.locator(".map-preview")).toHaveCount(0);
    await expect(page.locator(".region-information")).toHaveCount(0);
    if (samples.length > 0) {
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { matrixListenerCounts: () => Record<string, number> }
            ).matrixListenerCounts(),
          ),
        )
        .toEqual(samples[0].listeners);
    }
    samples.push(
      await page.evaluate(() => ({
        listeners: (
          window as unknown as { matrixListenerCounts: () => Record<string, number> }
        ).matrixListenerCounts(),
        markers: document.querySelectorAll(".maplibregl-marker").length,
        canvases: document.querySelectorAll("canvas.maplibregl-canvas").length,
      })),
    );
  }
  await testInfo.attach("lifecycle-counts", {
    body: JSON.stringify(samples, null, 2),
    contentType: "application/json",
  });
  for (const sample of samples.slice(1)) {
    expect(sample.canvases).toBe(1);
    expect(sample.markers).toBe(samples[0].markers);
    expect(sample.listeners).toEqual(samples[0].listeners);
  }
});
