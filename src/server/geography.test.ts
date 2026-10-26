import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: context.get }));
const geography = JSON.parse(readFileSync("public/data/malaysia-regions.geojson", "utf8"));
afterEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

it("reads and reuses only static boundaries from the Cloudflare asset binding", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(geography));
  context.get.mockReturnValue({ env: { ASSETS: { fetch: fetcher } } });
  const { loadGeography } = await import("./geography");
  const signal = new AbortController().signal;
  expect(await loadGeography(signal)).toEqual(geography);
  expect(await loadGeography(signal)).toEqual(geography);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith("https://assets.invalid/data/malaysia-regions.geojson", {
    signal,
  });
});

it("keeps Node filesystem compatibility when no Cloudflare request context exists", async () => {
  context.get.mockImplementation(() => {
    throw new Error("No Cloudflare context");
  });
  const { loadGeography } = await import("./geography");
  expect(await loadGeography(new AbortController().signal)).toEqual(geography);
});

it("does not disguise an asset failure as filesystem data or retain a failed load", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(Response.json(geography));
  context.get.mockReturnValue({ env: { ASSETS: { fetch: fetcher } } });
  const { loadGeography } = await import("./geography");
  const signal = new AbortController().signal;
  await expect(loadGeography(signal)).rejects.toThrow("Boundary asset unavailable");
  expect(await loadGeography(signal)).toEqual(geography);
});

it("honours cancellation even when static geography is already cached", async () => {
  context.get.mockReturnValue({
    env: { ASSETS: { fetch: vi.fn().mockResolvedValue(Response.json(geography)) } },
  });
  const { loadGeography } = await import("./geography");
  await loadGeography(new AbortController().signal);
  const controller = new AbortController();
  controller.abort();
  await expect(loadGeography(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});
