import "server-only";
import { z } from "zod";
import {
  createDemoWindField,
  windHour,
  windVectorFrom,
  type DemoWindPattern,
  type WindField,
} from "../lib/wind";

export const WIND_POINTS = Array.from({ length: 60 }, (_, i) => ({
  longitude: 98 + (i % 12) * 2,
  latitude: Math.floor(i / 12) * 2,
}));
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export class WindError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 503 = 503,
  ) {
    super(message);
  }
}
const locationSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  utc_offset_seconds: z.literal(0),
  hourly_units: z.object({
    time: z.literal("unixtime"),
    wind_speed_10m: z.literal("m/s"),
    wind_direction_10m: z.literal("°"),
  }),
  hourly: z.object({
    time: z.array(z.number().int()).length(24),
    wind_speed_10m: z.array(z.number().finite().min(0).nullable()).length(24),
    wind_direction_10m: z.array(z.number().finite().min(0).max(360).nullable()).length(24),
  }),
});
type Locations = z.infer<typeof locationSchema>[];
export function windRequestUrl(day: string, historical: boolean) {
  const url = new URL(
    `https://${historical ? "historical-forecast-api" : "api"}.open-meteo.com/v1/forecast`,
  );
  Object.entries({
    latitude: WIND_POINTS.map((p) => p.latitude).join(","),
    longitude: WIND_POINTS.map((p) => p.longitude).join(","),
    elevation: WIND_POINTS.map(() => "nan").join(","),
    models: "ecmwf_ifs025",
    hourly: "wind_speed_10m,wind_direction_10m",
    wind_speed_unit: "ms",
    cell_selection: "nearest",
    timezone: "GMT",
    timeformat: "unixtime",
    start_date: day,
    end_date: day,
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}
export function validateWindBundle(body: unknown, day: string): Locations {
  const parsed = z.array(locationSchema).length(60).safeParse(body);
  if (!parsed.success) throw new WindError("Wind provider returned an invalid hourly field.");
  const start = Date.parse(`${day}T00:00:00Z`) / 1000;
  parsed.data.forEach((point, i) => {
    const requested = WIND_POINTS[i];
    // Native 0.25° cells coincide with these 2° samples; never relabel snapped cells.
    if (
      Math.abs(point.latitude - requested.latitude) > 0.00001 ||
      Math.abs(point.longitude - requested.longitude) > 0.00001 ||
      point.hourly.time.some((t, hour) => t !== start + hour * 3600)
    )
      throw new WindError(
        "Wind provider coordinates or valid times do not match the supported grid.",
      );
  });
  return parsed.data;
}
export function fieldFromWindBundle(
  points: Locations,
  at: string,
  fetchedAt: string,
  historical: boolean,
): WindField {
  const hour = new Date(at).getUTCHours();
  const vectors = points.map((point) =>
    windVectorFrom(
      point.hourly.wind_speed_10m[hour] === null ? null : point.hourly.wind_speed_10m[hour]! * 3.6,
      point.hourly.wind_direction_10m[hour],
    ),
  );
  if (!vectors.some(Boolean)) throw new WindError("Wind unavailable for this time.");
  return {
    id: `open-meteo:ecmwf_ifs025:${at}:${fetchedAt}`,
    source: "open-meteo",
    kind: historical ? "historical-forecast" : "forecast",
    model: "ECMWF IFS 0.25°",
    heightM: 10,
    validAt: at,
    fetchedAt,
    width: 12,
    height: 5,
    bounds: { west: 98, south: 0, east: 120, north: 8 },
    u: vectors.map((v) => v?.u ?? 0),
    v: vectors.map((v) => v?.v ?? 0),
    valid: vectors.map((v) => v !== null),
    sampleCoordinates: points.map((p) => [p.longitude, p.latitude]),
    resolution:
      "2° samples (~220 km); native 0.25° (~28 km). Components interpolated; hourly values may be temporally interpolated.",
    attribution: [
      { name: "Weather data by Open-Meteo", url: "https://open-meteo.com/" },
      { name: "ECMWF", url: "https://www.ecmwf.int/" },
      {
        name: "CC BY 4.0 · sampled and vector-interpolated",
        url: "https://creativecommons.org/licenses/by/4.0/",
      },
    ],
  };
}

export function createWindLoader(fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string, { points: Locations; fetchedAt: string; expires: number }>();
  const pending = new Map<
    string,
    Promise<{ points: Locations; fetchedAt: string; expires: number }>
  >();
  let admissions: number[] = [];
  let cooldown = 0;
  return async (at: string): Promise<WindField> => {
    const time = windHour(at);
    if (!time) throw new WindError("Use an ISO timestamp with an explicit timezone.", 400);
    const clock = now();
    if (Date.parse(time) < Date.parse("2024-02-03T00:00:00Z") || Date.parse(time) > clock)
      throw new WindError(
        "Wind unavailable for this time. Supported archive starts 2024-02-03; future times are excluded.",
      );
    const day = time.slice(0, 10);
    const historical = day < new Date(clock).toISOString().slice(0, 10);
    const key = `${historical}:${day}`;
    for (const [k, value] of cache) if (value.expires <= clock) cache.delete(k);
    let bundle = cache.get(key);
    if (!bundle) {
      let loading = pending.get(key);
      if (!loading) {
        admissions = admissions.filter((t) => t > clock - DAY);
        if (
          clock < cooldown ||
          admissions.length >= 16 ||
          admissions.filter((t) => t > clock - HOUR).length >= 4
        )
          throw new WindError("Wind request budget reached. Try again later.");
        admissions.push(clock);
        loading = (async () => {
          try {
            const response = await fetcher(windRequestUrl(day, historical), {
              signal: AbortSignal.timeout(15_000),
              cache: "no-store",
            });
            if (!response.ok)
              throw new WindError(`Wind provider unavailable (HTTP ${response.status}).`);
            const result = {
              points: validateWindBundle(await response.json(), day),
              fetchedAt: new Date(now()).toISOString(),
              expires: clock + (historical ? DAY : 6 * HOUR),
            };
            if (cache.size >= 16) cache.delete(cache.keys().next().value!);
            cache.set(key, result);
            return result;
          } catch (error) {
            cooldown = now() + 60_000;
            throw error instanceof WindError
              ? error
              : new WindError("Wind provider unavailable. No synthetic replacement was used.");
          } finally {
            pending.delete(key);
          }
        })();
        pending.set(key, loading);
      }
      bundle = await loading;
    }
    return fieldFromWindBundle(bundle.points, time, bundle.fetchedAt, historical);
  };
}
const loadRealWind = createWindLoader();
export async function loadWind(source: string, at: string, scenario = "varied") {
  if (source === "open-meteo") return loadRealWind(at);
  if (source !== "demo") throw new WindError("Choose demo or open-meteo wind.", 400);
  const patterns: DemoWindPattern[] = [
    "varied",
    "gradient",
    "north",
    "east",
    "southwest",
    "rotation",
    "calm",
    "holes",
  ];
  if (!patterns.includes(scenario as DemoWindPattern))
    throw new WindError("Unknown demo wind scenario.", 400);
  const field = createDemoWindField(at, scenario as DemoWindPattern);
  if (!field) throw new WindError("Demo wind unavailable for this time.");
  return field;
}
