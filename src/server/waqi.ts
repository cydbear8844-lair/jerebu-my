import "server-only";
import { setTimeout as wait } from "node:timers/promises";
import { z } from "zod";
import { summarizeRegion, timestampSchema } from "../lib/domain";
import { pointInMalaysia } from "../lib/nearest-station";
import { REGIONS } from "../lib/regions";
import type { Attribution, Observation, Snapshot, Station } from "../lib/types";
import { loadGeography } from "./geography";

export const WAQI_HISTORY_REASON =
  "Live history and replay are unavailable: no authorised station-history endpoint or retention contract is configured. WAQI API terms restrict cached and archived redistribution.";
const attribution = [{ name: "World Air Quality Index project", url: "https://waqi.info/" }];
const selection = { sourceId: "waqi", indexScale: "WAQI_AQI", observationKind: "observed" };
export const WAQI_HYDRATION_BUDGET_MS = 20_000;
const candidateSchema = z.array(z.object({ uid: z.number().int().positive() })).max(2000);
const feedSchema = z.object({
  idx: z.number().int().positive(),
  aqi: z.unknown(),
  city: z.object({
    name: z.string().trim().min(1).max(500),
    geo: z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]),
    url: z.string().optional(),
  }),
  time: z
    .object({ iso: z.string().optional(), s: z.string().optional(), tz: z.string().optional() })
    .optional(),
  attributions: z
    .array(z.object({ name: z.string().trim().max(500), url: z.string().optional() }))
    .max(30)
    .optional(),
});
type Options = {
  token?: string;
  fetcher?: typeof fetch;
  now?: () => string;
  retryDelayMs?: number;
  budgetMs?: number;
  signal?: AbortSignal;
};
class ProviderFailure extends Error {
  constructor(
    message: string,
    public readonly stopHydration = false,
  ) {
    super(message);
  }
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return;
    return url.href;
  } catch {
    return;
  }
}

export function waqiUnavailable(asOf: string, message: string): Snapshot {
  return {
    mode: "live",
    status: "unavailable",
    message,
    asOf,
    sourceId: "waqi",
    indexScale: "WAQI_AQI",
    stations: [],
    observations: [],
    attribution,
    history: { available: false, reason: WAQI_HISTORY_REASON },
    summaries: REGIONS.map((r) => ({
      ...summarizeRegion(r.id, [], [], asOf, selection),
      status: "source-error",
    })),
  };
}

async function request(
  pathname: string,
  token: string,
  fetcher: typeof fetch,
  delay: number,
  signal: AbortSignal,
  admit: () => boolean,
): Promise<unknown> {
  const url = new URL(pathname, "https://api.waqi.info");
  url.searchParams.set("token", token);
  if (pathname.startsWith("/v2/map/")) {
    url.searchParams.set("latlng", "0.8,99.0,7.5,119.6");
    url.searchParams.set("networks", "official");
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted)
      throw new ProviderFailure("WAQI request cancelled or hydration deadline reached.", true);
    if (!admit()) throw new ProviderFailure("WAQI upstream request budget reached.", true);
    try {
      const response = await fetcher(url, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if ([401, 403].includes(response.status))
        throw new ProviderFailure("WAQI rejected the configured credential.", true);
      if (response.status === 429)
        throw new ProviderFailure("WAQI rate limit reached; try again later.", true);
      if (!response.ok) {
        if (response.status >= 500 && attempt === 0) {
          await wait(delay, undefined, { signal });
          continue;
        }
        throw new ProviderFailure("WAQI request failed.");
      }
      const body = await response.json();
      if (signal.aborted)
        throw new ProviderFailure("WAQI request cancelled or hydration deadline reached.", true);
      if (!body || body.status !== "ok") {
        const stop =
          typeof body?.data === "string" &&
          /invalid.*(?:key|token)|(?:key|token).*invalid|quota|rate.?limit|too many requests/i.test(
            body.data,
          );
        throw new ProviderFailure("WAQI rejected the request or returned unavailable data.", stop);
      }
      return body.data;
    } catch (error) {
      if (signal.aborted)
        throw new ProviderFailure("WAQI request cancelled or hydration deadline reached.", true);
      if (error instanceof ProviderFailure) throw error;
      if (attempt === 1)
        throw new ProviderFailure("WAQI request timed out or returned an invalid response.");
      try {
        await wait(delay, undefined, { signal });
      } catch {
        throw new ProviderFailure("WAQI request cancelled or hydration deadline reached.", true);
      }
    }
  }
  throw new ProviderFailure("WAQI request failed.");
}

export function hasWaqiToken(token = process.env.WAQI_API_TOKEN ?? ""): boolean {
  return /^[A-Za-z0-9_-]{1,200}$/.test(token) && token.toLowerCase() !== "demo";
}

export async function fetchWaqiSnapshot(options: Options = {}): Promise<Snapshot> {
  const now = options.now ?? (() => new Date().toISOString());
  const token = options.token ?? process.env.WAQI_API_TOKEN ?? "";
  if (!hasWaqiToken(token))
    return waqiUnavailable(
      now(),
      "Configure a private WAQI_API_TOKEN in .env.local to request live observations. No demo readings are substituted.",
    );
  const fetcher = options.fetcher ?? fetch;
  const maxRequests =
    process.env.WAQI_MAX_REQUESTS === undefined ? 162 : Number(process.env.WAQI_MAX_REQUESTS);
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 162)
    return waqiUnavailable(now(), "WAQI_MAX_REQUESTS must be an integer from 1 to 162.");
  let requests = 0;
  const admit = () => requests++ < maxRequests;
  const delay = options.retryDelayMs ?? 250;
  const budget = new AbortController();
  const requestedBudget = options.budgetMs ?? WAQI_HYDRATION_BUDGET_MS;
  const budgetMs = Number.isFinite(requestedBudget)
    ? Math.max(1, Math.min(WAQI_HYDRATION_BUDGET_MS, requestedBudget))
    : WAQI_HYDRATION_BUDGET_MS;
  const deadline = setTimeout(() => budget.abort(), budgetMs);
  const signal = options.signal ? AbortSignal.any([budget.signal, options.signal]) : budget.signal;
  try {
    const candidates = candidateSchema.parse(
      await request("/v2/map/bounds/", token, fetcher, delay, signal, admit),
    );
    const ids = [...new Set(candidates.map((c) => c.uid))].sort((a, b) => a - b);
    const selected = ids.slice(0, 80);
    const geography = await loadGeography(signal);
    const stations: Station[] = [];
    const observations: Observation[] = [];
    let omitted = 0,
      failed = 0,
      missingCredit = 0,
      cursor = 0;
    let stopHydration = false;
    await Promise.all(
      Array.from({ length: Math.min(4, selected.length) }, async () => {
        while (cursor < selected.length && !stopHydration && !signal.aborted) {
          const id = selected[cursor++];
          try {
            const parsed = feedSchema.safeParse(
              await request(`/feed/@${id}/`, token, fetcher, delay, signal, admit),
            );
            if (!parsed.success || parsed.data.idx !== id) {
              failed++;
              continue;
            }
            const data = parsed.data;
            const coordinates: [number, number] = [data.city.geo[1], data.city.geo[0]];
            const regions = geography.features.filter((feature) =>
              pointInMalaysia(coordinates, { type: "FeatureCollection", features: [feature] }),
            );
            const regionId = regions.length === 1 ? regions[0].properties?.regionId : undefined;
            if (!REGIONS.some((r) => r.id === regionId)) {
              omitted++;
              continue;
            }
            const sourceAttributions: Attribution[] =
              data.attributions
                ?.filter((entry) => entry.name)
                .map((entry) => ({
                  name: entry.name,
                  url: safeUrl(entry.url),
                })) ?? [];
            if (!sourceAttributions.length) {
              failed++;
              missingCredit++;
              continue;
            }
            const station: Station = {
              id: `waqi-${id}`,
              externalId: String(id),
              sourceId: "waqi",
              name: data.city.name,
              coordinates,
              regionId,
              recordType: "provider_location",
              url: safeUrl(data.city.url),
              attribution: [...attribution, ...sourceAttributions],
            };
            const timestamp =
              data.time?.iso ??
              (data.time?.s && data.time?.tz
                ? `${data.time.s.replace(" ", "T")}${data.time.tz}`
                : "");
            const validTime = timestampSchema.safeParse(timestamp).success;
            const value =
              typeof data.aqi === "number" && Number.isInteger(data.aqi) && data.aqi >= 0
                ? data.aqi
                : null;
            const qualityFlags = validTime ? ["unvalidated"] : ["unvalidated", "invalid-timestamp"];
            if (value === null)
              qualityFlags.push(data.aqi == null || data.aqi === "-" ? "missing" : "invalid-value");
            const observation: Observation = {
              stationId: station.id,
              ...selection,
              observedAt: validTime ? new Date(timestamp).toISOString() : "",
              fetchedAt: now(),
              value,
              qualityFlags,
            };
            stations.push(station);
            observations.push(observation);
          } catch (error) {
            failed++;
            if (error instanceof ProviderFailure && error.stopHydration) stopHydration = true;
          }
        }
      }),
    );
    stations.sort((a, b) => a.id.localeCompare(b.id));
    observations.sort((a, b) => a.stationId.localeCompare(b.stationId));
    const asOf = now();
    const limited = ids.length > cursor;
    return {
      mode: "live",
      status: stations.length ? "available" : "unavailable",
      asOf,
      sourceId: "waqi",
      indexScale: "WAQI_AQI",
      message: `WAQI latest observations. ${stations.length} provider locations received; ${failed} failed; ${omitted} outside or ambiguously assigned. ${missingCredit ? `${missingCredit} missing originating-agency credit; affected readings withheld. ` : ""}${signal.aborted ? "Partial coverage: request cancelled or hydration deadline reached; unfinished candidates remain unavailable. " : limited ? "Partial coverage: request limit or provider rejection stopped remaining candidates. " : ""}Freshness uses a two-hour application policy, not a verified source cadence.`,
      stations,
      observations,
      summaries: REGIONS.map((r) => summarizeRegion(r.id, stations, observations, asOf, selection)),
      attribution: [
        ...new Map(
          [...attribution, ...stations.flatMap((s) => s.attribution ?? [])].map((a) => [
            a.url + a.name,
            a,
          ]),
        ).values(),
      ],
      history: { available: false, reason: WAQI_HISTORY_REASON },
      coverage: {
        discovered: ids.length,
        requested: cursor,
        received: stations.length,
        omitted,
        failed,
        limited,
      },
    };
  } catch (error) {
    return waqiUnavailable(
      now(),
      signal.aborted
        ? "WAQI request cancelled or hydration deadline reached. No demo readings are substituted."
        : error instanceof ProviderFailure
          ? error.message
          : "WAQI returned invalid metadata or the Malaysia boundary file is unavailable.",
    );
  } finally {
    clearTimeout(deadline);
  }
}
