import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createWindLoader, WIND_POINTS, validateWindBundle, loadWind } from "./wind-provider";
import { GET } from "../app/api/wind/route";
import { DEMO_CLOCK } from "../lib/demo-time";
const now = Date.parse("2026-10-19T12:00:00Z");
function body(day = "2026-10-19") {
  return WIND_POINTS.map((p) => ({
    ...p,
    utc_offset_seconds: 0,
    hourly_units: { time: "unixtime", wind_speed_10m: "m/s", wind_direction_10m: "°" },
    hourly: {
      time: Array.from({ length: 24 }, (_, i) => Date.parse(`${day}T00:00:00Z`) / 1000 + i * 3600),
      wind_speed_10m: Array<number | null>(24).fill(10),
      wind_direction_10m: Array<number | null>(24).fill(90),
    },
  }));
}
describe("wind server boundary", () => {
  it("deduplicates concurrent day slices, preserves units, rows, source and floor hour", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body())));
    const load = createWindLoader(fetcher, () => now);
    const [a, b] = await Promise.all([load("2026-10-19T10:59:00Z"), load("2026-10-19T11:00:00Z")]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a.validAt).toBe("2026-10-19T10:00:00.000Z");
    expect(a.u[0]).toBeCloseTo(-10);
    expect(a.v[0]).toBeCloseTo(0);
    expect(a.source).toBe("open-meteo");
    expect(a.issuedAt).toBeUndefined();
    expect(a.sampleCoordinates?.[0]).toEqual([98, 0]);
    expect(a.sampleCoordinates?.[59]).toEqual([120, 8]);
    expect(b.validAt).not.toBe(a.validAt);
    await load("2026-10-19T10:00:00Z");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps calm valid and missing data masked", async () => {
    const data = body();
    data[0].hourly.wind_speed_10m[10] = 0;
    data[1].hourly.wind_speed_10m[10] = null;
    const field = await createWindLoader(
      vi.fn().mockResolvedValue(new Response(JSON.stringify(data))),
      () => now,
    )("2026-10-19T10:00:00Z");
    expect(field.valid.slice(0, 2)).toEqual([true, false]);
    expect(Math.hypot(field.u[0], field.v[0])).toBe(0);
  });
  it("rejects snapped, duplicate, reversed coordinates and wrong time/unit", () => {
    for (const mutate of [
      (d: ReturnType<typeof body>) => {
        d[0].longitude += 0.25;
      },
      (d: ReturnType<typeof body>) => {
        d[1] = d[0];
      },
      (d: ReturnType<typeof body>) => {
        d.reverse();
      },
      (d: ReturnType<typeof body>) => {
        d[0].hourly.time[0]++;
      },
      (d: ReturnType<typeof body>) => {
        d[0].hourly_units.wind_speed_10m = "km/h";
      },
    ]) {
      const data = body();
      mutate(data);
      expect(() => validateWindBundle(data, "2026-10-19")).toThrow();
    }
  });
  it("loads matching archived forecast without pretending it is reanalysis", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(body("2026-10-18"))));
    const field = await createWindLoader(fetcher, () => now)("2026-10-18T10:00:00Z");
    expect(field.kind).toBe("historical-forecast");
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.hostname).toBe("historical-forecast-api.open-meteo.com");
    expect(url.searchParams.get("models")).toBe("ecmwf_ifs025");
    expect(url.searchParams.get("elevation")?.split(",")).toHaveLength(60);
  });
  it("rejects unsupported/future times without upstream requests", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const load = createWindLoader(fetcher, () => now);
    await expect(load("2020-01-01T00:00:00Z")).rejects.toThrow("unavailable");
    await expect(load("2026-10-20T00:00:00Z")).rejects.toThrow("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not fall back after failure and enforces retry cooldown", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 503 }));
    const load = createWindLoader(fetcher, () => now);
    await expect(load("2026-10-19T10:00:00Z")).rejects.toThrow("503");
    await expect(load("2026-10-19T10:00:00Z")).rejects.toThrow("budget");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("bounds unique day requests to four per rolling hour", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async (input) =>
          new Response(
            JSON.stringify(body(new URL(String(input)).searchParams.get("start_date")!)),
          ),
      );
    const load = createWindLoader(fetcher, () => now);
    for (const day of [19, 18, 17, 16]) await load(`2026-10-${day}T10:00:00Z`);
    await expect(load("2026-10-15T10:00:00Z")).rejects.toThrow("budget");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("route validates timestamps and returns explicit demo or unavailable", async () => {
    expect((await GET(new Request("http://localhost/api/wind?at=bad"))).status).toBe(400);
    expect(
      (
        await GET(
          new Request("http://localhost/api/wind?source=open-meteo&at=2020-01-01T00:00:00Z"),
        )
      ).status,
    ).toBe(503);
    expect((await loadWind("demo", DEMO_CLOCK)).source).toBe("demo");
  });
});
