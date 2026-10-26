import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { loadSnapshot, getHistory, getTimeline } from "./data";
import { fetchWaqiSnapshot } from "./waqi";

const now = "2026-10-19T04:00:00.000Z";
const feed = (idx = 1, overrides = {}) => ({
  status: "ok",
  data: {
    idx,
    aqi: 0,
    city: { name: "Provider location", geo: [3.139, 101.687], url: "https://aqicn.org/city/test/" },
    time: { iso: "2026-10-19T12:00:00+08:00", v: 1 },
    attributions: [{ name: "Origin agency", url: "https://example.org/" }],
    ...overrides,
  },
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function upstream(feeds: unknown[]) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response({ status: "ok", data: feeds.map((_, i) => ({ uid: i + 1 })) }))
    .mockImplementation(async () => response(feeds.shift()));
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("WAQI current observations", () => {
  it("counts discovery and retries within the configured upstream request budget", async () => {
    vi.stubEnv("WAQI_MAX_REQUESTS", "7");
    const attempts = new Map<string, number>();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const pathname = new URL(String(url)).pathname;
      const attempt = (attempts.get(pathname) ?? 0) + 1;
      attempts.set(pathname, attempt);
      if (attempt === 1) return response({ status: "error" }, 503);
      if (pathname.startsWith("/v2/map"))
        return response({
          status: "ok",
          data: Array.from({ length: 80 }, (_, i) => ({ uid: i + 1 })),
        });
      return response(feed(Number(pathname.match(/@(\d+)/)?.[1])));
    });
    const result = await fetchWaqiSnapshot({
      token: "test-key",
      now: () => now,
      fetcher,
      retryDelayMs: 0,
    });
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(result.stations).toHaveLength(1);
    expect(result.coverage?.limited).toBe(true);
    expect(result.mode).toBe("live");
    expect(result.observations.every((observation) => observation.sourceId === "waqi")).toBe(true);
  });

  it.each(["0", "-1", "1.5", "invalid", "163"])(
    "rejects invalid request budget %s before calling the provider",
    async (value) => {
      vi.stubEnv("WAQI_MAX_REQUESTS", value);
      const fetcher = vi.fn<typeof fetch>();
      const result = await fetchWaqiSnapshot({ token: "test-key", now: () => now, fetcher });
      expect(result.status).toBe("unavailable");
      expect(result.message).toContain("WAQI_MAX_REQUESTS");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("bounds the whole hydration, preserves completed feeds and aborts pending work", async () => {
    vi.useFakeTimers();
    let pending = 0,
      aborted = 0;
    const requested: number[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname.startsWith("/v2/map"))
        return response({
          status: "ok",
          data: Array.from({ length: 80 }, (_, i) => ({ uid: i + 1 })),
        });
      const id = Number(pathname.match(/@(\d+)/)?.[1]);
      requested.push(id);
      if (id === 1) return response(feed(1));
      pending++;
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener(
          "abort",
          () => {
            pending--;
            aborted++;
            reject(init!.signal!.reason);
          },
          { once: true },
        );
      });
    });
    const task = fetchWaqiSnapshot({ token: "test-key", fetcher, now: () => now, budgetMs: 1000 });
    await vi.waitFor(() => expect(pending).toBe(4));
    await vi.advanceTimersByTimeAsync(1000);
    const result = await task;
    expect(result.status).toBe("available");
    expect(result.stations.map((s) => s.id)).toEqual(["waqi-1"]);
    expect(result.coverage).toMatchObject({
      discovered: 80,
      requested: 5,
      received: 1,
      failed: 4,
      limited: true,
    });
    expect(result.message).toContain("deadline");
    expect(pending).toBe(0);
    expect(aborted).toBe(4);
    await vi.advanceTimersByTimeAsync(60000);
    expect(requested).toHaveLength(5);
  });

  it("honours cancellation before discovery and while waiting for retry", async () => {
    const controller = new AbortController();
    controller.abort();
    const unused = vi.fn<typeof fetch>();
    const result = await fetchWaqiSnapshot({
      token: "test-key",
      fetcher: unused,
      signal: controller.signal,
    });
    expect(unused).not.toHaveBeenCalled();
    expect(result.status).toBe("unavailable");
    vi.useFakeTimers();
    const retryController = new AbortController();
    const failing = vi.fn<typeof fetch>().mockResolvedValue(response({}, 503));
    const task = fetchWaqiSnapshot({
      token: "test-key",
      fetcher: failing,
      signal: retryController.signal,
    });
    await vi.waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
    retryController.abort();
    await vi.runAllTimersAsync();
    expect((await task).status).toBe("unavailable");
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it.each([
    "https://example.org/?lang=en",
    "https://example.org/#agency",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "https://user:password@example.org/",
    undefined,
  ])("retains agency text independently of rejected or absent URL %s", async (url) => {
    const result = await fetchWaqiSnapshot({
      token: "test-key",
      now: () => now,
      fetcher: upstream([feed(1, { attributions: [{ name: "Origin agency", url }] })]),
    });
    expect(result.status).toBe("available");
    expect(result.stations[0].attribution).toContainEqual({
      name: "Origin agency",
      url: undefined,
    });
    expect(result.attribution).toContainEqual({ name: "Origin agency", url: undefined });
  });
  it.each([
    { attributions: undefined },
    { attributions: [] },
    { attributions: [{ name: "   ", url: "https://example.org/" }] },
  ])("withholds readings without a named originating credit: %j", async ({ attributions }) => {
    const result = await fetchWaqiSnapshot({
      token: "test-key",
      now: () => now,
      fetcher: upstream([feed(1, { attributions })]),
    });
    expect(result.status).toBe("unavailable");
    expect(result.stations).toEqual([]);
    expect(result.observations).toEqual([]);
    expect(result.coverage).toMatchObject({ failed: 1, received: 0 });
    expect(result.message).toContain("1 missing originating-agency credit");
  });
  it("keeps credited readings when another feed lacks credit", async () => {
    const result = await fetchWaqiSnapshot({
      token: "test-key",
      now: () => now,
      fetcher: upstream([feed(1), feed(2, { attributions: [] })]),
    });
    expect(result.status).toBe("available");
    expect(result.stations.map((s) => s.id)).toEqual(["waqi-1"]);
    expect(result.observations.map((o) => o.stationId)).toEqual(["waqi-1"]);
    expect(result.coverage).toMatchObject({ failed: 1, received: 1 });
    expect(result.message).toContain("1 missing originating-agency credit");
  });
  it("requires a private key and never requests the demo token", async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const token of ["", "demo"]) {
      const result = await fetchWaqiSnapshot({ token, fetcher, now: () => now });
      expect(result.status).toBe("unavailable");
      expect(result.stations).toEqual([]);
      expect(result.summaries).toHaveLength(16);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("hydrates metadata, preserves zero, attribution, scale and actual observation time", async () => {
    const fetcher = upstream([feed()]);
    const result = await fetchWaqiSnapshot({ token: "test-key", fetcher, now: () => now });
    expect(result.status).toBe("available");
    expect(result.stations[0]).toMatchObject({
      id: "waqi-1",
      regionId: "kuala-lumpur",
      recordType: "provider_location",
      externalId: "1",
    });
    expect(result.observations[0]).toMatchObject({
      value: 0,
      sourceId: "waqi",
      indexScale: "WAQI_AQI",
      observationKind: "observed",
      observedAt: now,
      fetchedAt: now,
    });
    expect(result.attribution?.some((a) => a.name === "Origin agency")).toBe(true);
    expect(result.summaries.find((s) => s.regionId === "kuala-lumpur")?.value).toBe(0);
    for (const [url, options] of fetcher.mock.calls) {
      expect(new URL(String(url)).hostname).toBe("api.waqi.info");
      expect(options?.cache).toBe("no-store");
      expect(options?.redirect).toBe("error");
    }
  });
  it("omits outside-Malaysia and mismatched identities and reports partial failure", async () => {
    const result = await fetchWaqiSnapshot({
      token: "test-key",
      now: () => now,
      fetcher: upstream([
        feed(1),
        feed(2, { city: { name: "Outside", geo: [1.29, 103.85] } }),
        feed(99),
        { status: "error", data: "bad test-key" },
      ]),
    });
    expect(result.stations).toHaveLength(1);
    expect(result.coverage).toMatchObject({ discovered: 4, received: 1, omitted: 1, failed: 2 });
    expect(JSON.stringify(result)).not.toContain("test-key");
  });
  it.each([null, "-", -1, 1.5, "42", ""])(
    "does not coerce invalid/missing AQI %s to zero",
    async (aqi) => {
      const result = await fetchWaqiSnapshot({
        token: "test-key",
        now: () => now,
        fetcher: upstream([feed(1, { aqi })]),
      });
      expect(result.observations[0].value).toBeNull();
      expect(result.summaries.every((s) => s.value === null)).toBe(true);
    },
  );
  it.each(["2026-10-19T01:00:00Z", "2026-10-19T05:00:00Z", "invalid"])(
    "excludes stale/future/invalid observation %s",
    async (iso) => {
      const result = await fetchWaqiSnapshot({
        token: "test-key",
        now: () => now,
        fetcher: upstream([feed(1, { time: { iso, v: 99999999 } })]),
      });
      expect(result.summaries.every((s) => s.value === null)).toBe(true);
    },
  );
  it("supports explicit s+tz without inventing timezone", async () => {
    const result = await fetchWaqiSnapshot({
      token: "test-key",
      now: () => now,
      fetcher: upstream([feed(1, { time: { s: "2026-10-19 12:00:00", tz: "+08:00" } })]),
    });
    expect(result.observations[0].observedAt).toBe(now);
  });
  it.each([401, 403, 429, 500])(
    "fails closed on HTTP %s without leaking upstream errors",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => response({ error: "SECRET" }, status));
      const result = await fetchWaqiSnapshot({
        token: "SECRET",
        now: () => now,
        fetcher,
        retryDelayMs: 0,
      });
      expect(result.status).toBe("unavailable");
      expect(result.observations).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("SECRET");
      expect(fetcher.mock.calls.length).toBe(status === 500 ? 2 : 1);
    },
  );
  it("bounds retries on a network timeout and sanitizes thrown URLs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("https://api.waqi.info/?token=SECRET"));
    const result = await fetchWaqiSnapshot({
      token: "SECRET",
      fetcher,
      now: () => now,
      retryDelayMs: 0,
    });
    expect(result.status).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
  it("rejects malformed candidate schema", async () => {
    const result = await fetchWaqiSnapshot({
      token: "test-key",
      now: () => now,
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ status: "ok", data: [{ uid: "../evil" }] })),
    });
    expect(result.status).toBe("unavailable");
  });
  it("deduplicates candidates and bounds hydration to 80 with four concurrent requests", async () => {
    let active = 0,
      peak = 0;
    const requested: number[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname.startsWith("/v2/map"))
        return response({
          status: "ok",
          data: [...Array.from({ length: 81 }, (_, i) => ({ uid: i + 1 })), { uid: 1 }],
        });
      const id = Number(pathname.match(/@(\d+)/)?.[1]);
      requested.push(id);
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return response(feed(id));
    });
    const result = await fetchWaqiSnapshot({ token: "test-key", now: () => now, fetcher });
    expect(new Set(requested).size).toBe(80);
    expect(peak).toBeLessThanOrEqual(4);
    expect(result.coverage).toMatchObject({
      discovered: 81,
      requested: 80,
      received: 80,
      limited: true,
    });
  });
  it("passes an abort deadline to upstream and fails closed when it aborts", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort());
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      options?.signal?.throwIfAborted();
      return response(feed());
    });
    const result = await fetchWaqiSnapshot({
      token: "test-key",
      now: () => now,
      fetcher,
      retryDelayMs: 0,
    });
    expect(result.status).toBe("unavailable");
    expect(timeout).toHaveBeenCalledWith(8000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("stops queued hydration when a feed returns a rate limit", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      return new URL(String(url)).pathname.startsWith("/v2/map")
        ? response({ status: "ok", data: Array.from({ length: 80 }, (_, i) => ({ uid: i + 1 })) })
        : response({ status: "error" }, 429);
    });
    const result = await fetchWaqiSnapshot({ token: "test-key", now: () => now, fetcher });
    expect(result.status).toBe("unavailable");
    expect(result.coverage?.requested).toBeLessThanOrEqual(4);
    expect(result.coverage?.limited).toBe(true);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(5);
  });
  it.each(["Invalid key", "Invalid token", "Over quota", "Rate limit exceeded"])(
    "stops queued hydration on HTTP200 %s envelopes",
    async (message) => {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
        return new URL(String(url)).pathname.startsWith("/v2/map")
          ? response({ status: "ok", data: Array.from({ length: 80 }, (_, i) => ({ uid: i + 1 })) })
          : response({ status: "error", data: message + " SECRET" });
      });
      const result = await fetchWaqiSnapshot({ token: "SECRET", now: () => now, fetcher });
      expect(result.coverage?.requested).toBeLessThanOrEqual(4);
      expect(result.coverage?.limited).toBe(true);
      expect(JSON.stringify(result)).not.toContain("SECRET");
    },
  );
  it("does not retain settled live payloads and deduplicates only in-flight calls", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("WAQI_API_TOKEN", "test-key");
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      return new URL(String(url)).pathname.startsWith("/v2/map")
        ? response({ status: "ok", data: [{ uid: 1 }] })
        : response(feed());
    });
    const [a, b] = await Promise.all([loadSnapshot(), loadSnapshot()]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await loadSnapshot();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("denies all live history and replay without contacting a provider", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("WAQI_API_TOKEN", "");
    expect(() => getTimeline()).toThrow();
    expect(() => getHistory("waqi-1", now, now)).toThrow();
    await expect(loadSnapshot(now)).rejects.toMatchObject({ status: 503 });
    expect((await loadSnapshot()).observations).toEqual([]);
  });
});
