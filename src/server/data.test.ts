import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getHistory, getSnapshot } from "./data";
import { GET as overview } from "../app/api/overview/route";
import { GET as history } from "../app/api/history/route";

const end = "2026-09-21T04:00:00.000Z";
const start = "2026-08-22T04:00:00.000Z";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("explicit data mode", () => {
  it.each(["live", "", "mistyped"])("never substitutes demo for %s", (mode) => {
    const result = getSnapshot(undefined, mode);
    expect(result.observations).toEqual([]);
    expect(result.stations).toEqual([]);
    expect(result.status).not.toBe("available");
    expect(result.summaries).toHaveLength(16);
    expect(result.summaries.every((r) => r.value === null && r.stationCount === null)).toBe(true);
  });
  it("returns compact deterministic fixtures with missing and stale regions", () => {
    const a = getSnapshot(undefined, "demo");
    expect(a).toEqual(getSnapshot(undefined, "demo"));
    expect(a.observations.length).toBe(a.stations.length);
    expect(a.summaries).toHaveLength(16);
    expect(a.stations.length).toBeGreaterThanOrEqual(32);
    expect(a.summaries.find((r) => r.regionId === "perlis")).toMatchObject({
      value: null,
      status: "missing",
    });
    expect(a.summaries.find((r) => r.regionId === "kelantan")).toMatchObject({
      value: null,
      status: "stale",
    });
    expect(a.observations.some((o) => o.value === 0)).toBe(true);
  });
  it("returns no later observation or revision during replay", () => {
    const replay = "2026-09-20T04:00:00Z";
    const result = getSnapshot(replay, "demo");
    expect(result.observations.length).toBeGreaterThan(0);
    expect(
      result.observations.every(
        (o) =>
          Date.parse(o.observedAt) <= Date.parse(replay) &&
          Date.parse(o.fetchedAt) <= Date.parse(replay),
      ),
    ).toBe(true);
  });
  it("preserves 30-day hourly history gaps and fixed station", () => {
    vi.stubEnv("DATA_MODE", "demo");
    const result = getHistory("demo-selangor-a", start, end);
    expect(result.points).toHaveLength(721);
    expect(result.points.some((p) => p.value === null)).toBe(true);
    expect(result.station.id).toBe("demo-selangor-a");
    expect(result.points[0].observedAt).toBe(start);
    expect(result.points.at(-1)?.observedAt).toBe(end);
  });

  it("distinguishes retrospective observation time from a five-minute publication delay in replay", () => {
    vi.stubEnv("DATA_MODE", "demo");
    const at = "2026-09-20T03:00:00.000Z";
    const id = "demo-selangor-a";
    const point = getHistory(id, at, at).points[0];
    expect(point.value).not.toBeNull();
    const earlier = getSnapshot(at, "demo").observations.find((o) => o.stationId === id)!;
    expect(Date.parse(earlier.observedAt)).toBeLessThan(Date.parse(at));
    const received = getSnapshot("2026-09-20T03:05:00.000Z", "demo").observations.find(
      (o) => o.stationId === id,
    )!;
    expect(received.observedAt).toBe(at);
    expect(received.fetchedAt).toBe("2026-09-20T03:05:00.000Z");
    expect(received.value).toBe(point.value);
  });
});

describe("HTTP data boundary", () => {
  it("returns demo snapshot with no-store", async () => {
    vi.stubEnv("DATA_MODE", "demo");
    const response = await overview(new Request("http://localhost/api/overview"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).mode).toBe("demo");
  });
  it.each([
    "2026-09-21T04:00:00",
    "2026-09-22T04:00:00Z",
    "2026-08-01T00:00:00Z",
    "garbage",
    "2026-02-30T00:00:00Z",
  ])("rejects invalid replay %s", async (at) => {
    vi.stubEnv("DATA_MODE", "demo");
    const response = await overview(
      new Request(`http://localhost/api/overview?at=${encodeURIComponent(at)}`),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([
    { stationId: "demo-selangor-a", start: end, end: start, status: 400 },
    { stationId: "demo-selangor-a", start: "2026-08-01T00:00:00Z", end, status: 400 },
    { stationId: "demo-selangor-a", start, end: "2026-09-22T04:00:00Z", status: 400 },
    { stationId: "demo-selangor-a", start: "2026-09-20T00:00:00", end, status: 400 },
    { stationId: "unknown", start, end, status: 404 },
  ])("rejects bad history request $status", async ({ status, ...query }) => {
    vi.stubEnv("DATA_MODE", "demo");
    const response = await history(
      new Request(`http://localhost/api/history?${new URLSearchParams(query)}`),
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("accepts explicit timezone offsets and normalizes UTC", async () => {
    vi.stubEnv("DATA_MODE", "demo");
    const query = new URLSearchParams({
      stationId: "demo-selangor-a",
      start: "2026-09-21T11:00:00+08:00",
      end: "2026-09-21T12:00:00+08:00",
    });
    const response = await history(new Request(`http://localhost/api/history?${query}`));
    expect(response.status).toBe(200);
    expect((await response.json()).points).toHaveLength(2);
  });
  it.each(["live", ""])("denies history in non-demo mode %s", async (mode) => {
    vi.stubEnv("DATA_MODE", mode);
    const upstream = vi.spyOn(globalThis, "fetch");
    const response = await history(
      new Request(
        `http://localhost/api/history?${new URLSearchParams({ stationId: "demo-selangor-a", start, end })}`,
      ),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const snapshot = await overview(new Request("http://localhost/api/overview"));
    if (mode === "live") {
      expect(snapshot.status).toBe(403);
      expect(await snapshot.json()).toEqual({ error: expect.stringContaining("proxy disabled") });
    } else {
      expect(snapshot.status).toBe(503);
      expect((await snapshot.json()).observations).toEqual([]);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
});
