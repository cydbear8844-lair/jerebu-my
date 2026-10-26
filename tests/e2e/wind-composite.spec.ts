import { test, expect, type Page } from "@playwright/test";
import { REGIONS } from "../../src/lib/regions";

type ProbeWindow = Window & { windUploads: number; disconnectWind: boolean };

async function field(page: Page, pattern: string) {
  await page.locator(".wind-settings").evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.getByRole("combobox", { name: "Demo field", exact: true }).selectOption(pattern);
  await page.locator(".wind-settings").evaluate((e) => ((e as HTMLDetailsElement).open = false));
  await expect(page.locator(".wind-source-canvas")).toHaveAttribute(
    "data-field-id",
    new RegExp(`demo-wind-${pattern}-`),
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function finalPixels(page: Page) {
  return page.locator("canvas.maplibregl-canvas").evaluateHandle((canvas: HTMLCanvasElement) => {
    const target = document.createElement("canvas");
    target.width = canvas.width;
    target.height = canvas.height;
    const ctx = target.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    };
  });
}

test("final WebGL image preserves a geographic missing hole and detects a disconnected wind texture", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const w = window as unknown as ProbeWindow;
    w.windUploads = 0;
    w.disconnectWind = false;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).startsWith("webgl"))
        args[1] = { ...(args[1] as WebGLContextAttributes), preserveDrawingBuffer: true };
      return original.apply(this, args);
    } as typeof original;
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const method of ["texImage2D", "texSubImage2D"] as const) {
        const upload = prototype[method];
        Object.defineProperty(prototype, method, {
          configurable: true,
          value: function (this: WebGLRenderingContext, ...args: unknown[]) {
            const source = args.find(
              (v) => v instanceof HTMLCanvasElement && v.classList.contains("wind-source-canvas"),
            ) as HTMLCanvasElement | undefined;
            if (source) {
              w.windUploads++;
              if (w.disconnectWind) {
                const blank = document.createElement("canvas");
                blank.width = source.width;
                blank.height = source.height;
                args[args.indexOf(source)] = blank;
              }
            }
            return (upload as (...values: unknown[]) => void).apply(this, args);
          },
        });
      }
    }
  });
  await page.goto("/");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await page.getByRole("combobox", { name: "Map layers", exact: true }).selectOption("wind");
  await page.locator(".map-stage").scrollIntoViewIfNeeded();
  await expect(page.locator(".wind-source-canvas")).toHaveAttribute(
    "data-valid-at",
    "2026-09-21T04:00:00.000Z",
  );
  await page.getByRole("button", { name: "Pause wind animation", exact: true }).click();
  await field(page, "calm");
  const anchors = await page.locator(".territory-leaders").evaluate(
    (svg, regions) =>
      regions.map((r) => {
        const line = svg.querySelector(`[data-leader-id="${r.id}"]`)!;
        return {
          lng: r.center[0],
          lat: r.center[1],
          x: Number(line.getAttribute("x1")),
          y: Number(line.getAttribute("y1")),
        };
      }),
    REGIONS.filter((r) => ["kuala-lumpur", "labuan"].includes(r.id)),
  );
  const calm = await finalPixels(page);
  const size = await calm.evaluate(({ width, height }) => ({ width, height }));
  await field(page, "holes");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as ProbeWindow).windUploads))
    .toBeGreaterThan(0);
  const holes = await finalPixels(page);
  const canvasSize = await page.locator("canvas.maplibregl-canvas").boundingBox();
  const [a, b] = anchors;
  const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const project = (lng: number, lat: number) => ({
    x: ((a.x + ((lng - a.lng) * (b.x - a.x)) / (b.lng - a.lng)) * size.width) / canvasSize!.width,
    y:
      ((a.y +
        ((mercatorY(lat) - mercatorY(a.lat)) * (b.y - a.y)) /
          (mercatorY(b.lat) - mercatorY(a.lat))) *
        size.height) /
      canvasSize!.height,
  });
  const changed = (
    image: typeof calm,
    west: number,
    south: number,
    east: number,
    north: number,
  ) => {
    const nw = project(west, north),
      se = project(east, south);
    expect(nw.x).toBeGreaterThan(0);
    expect(nw.y).toBeGreaterThan(0);
    expect(se.x).toBeLessThan(size.width);
    expect(se.y).toBeLessThan(size.height);
    return image.evaluate(
      (next, { baseline, nw, se }) => {
        let count = 0;
        for (let y = Math.ceil(nw.y); y < se.y; y++)
          for (let x = Math.ceil(nw.x); x < se.x; x++) {
            const i = (y * next.width + x) * 4;
            if ([0, 1, 2, 3].some((c) => Math.abs(next.pixels[i + c] - baseline.pixels[i + c]) > 3))
              count++;
          }
        return count;
      },
      { baseline: calm, nw, se },
    );
  };
  const holeInterior = await changed(holes, 107.5, 3, 109, 4);
  const supportedArea = await changed(holes, 114, 2.5, 116, 4);
  expect(holeInterior).toBe(0);
  expect(supportedArea).toBeGreaterThan(50);
  await page.locator(".map-stage").screenshot({ path: info.outputPath("final-hole.png") });
  const before = await page.evaluate(() => (window as unknown as ProbeWindow).windUploads);
  await page.evaluate(() => ((window as unknown as ProbeWindow).disconnectWind = true));
  await field(page, "calm");
  await field(page, "holes");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as ProbeWindow).windUploads))
    .toBeGreaterThan(before);
  const disconnected = await finalPixels(page);
  const disconnectedArea = await changed(disconnected, 114, 2.5, 116, 4);
  expect(disconnectedArea).toBe(0);
  expect(disconnectedArea).toBeLessThan(supportedArea);
  await page
    .locator(".map-stage")
    .screenshot({ path: info.outputPath("disconnected-negative-control.png") });
  await page.evaluate(() => ((window as unknown as ProbeWindow).disconnectWind = false));
  await page.getByRole("button", { name: "Play wind animation", exact: true }).click();
  const animatedSamples = [];
  for (let sample = 0; sample < 2; sample++) {
    const previous = Number(await page.locator(".wind-source-canvas").getAttribute("data-frames"));
    await expect
      .poll(async () =>
        Number(await page.locator(".wind-source-canvas").getAttribute("data-frames")),
      )
      .toBeGreaterThan(previous + 2);
    const animated = await finalPixels(page);
    const interior = await changed(animated, 107.5, 3, 109, 4);
    const supported = await changed(animated, 114, 2.5, 116, 4);
    expect(interior).toBe(0);
    expect(supported).toBeGreaterThan(50);
    animatedSamples.push({ interior, supported });
    await animated.dispose();
  }
  await page.locator(".map-stage").screenshot({ path: info.outputPath("animated-hole.png") });
  await info.attach("geographic-final-pixel-oracle", {
    body: JSON.stringify({
      anchors,
      holeInterior,
      supportedArea,
      disconnectedArea,
      animatedSamples,
      injection:
        "test-context-only transparent replacement for wind WebGL texture uploads; no app hook",
    }),
    contentType: "application/json",
  });
  await Promise.all([calm.dispose(), holes.dispose(), disconnected.dispose()]);
  await page.getByRole("combobox", { name: "Map layers", exact: true }).selectOption("air");
  await expect(page.locator(".wind-source-canvas")).toHaveCount(0);
  await page.goto("about:blank");
});
