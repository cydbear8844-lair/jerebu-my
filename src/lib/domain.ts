import { z } from "zod";
import type { Observation, RegionSummary, Station } from "./types";

export const timestampSchema = z.iso.datetime({ offset: true });
export const DEMO_FRESHNESS_MS = 2 * 60 * 60 * 1000;
export const CATEGORIES = [
  { id: "good", label: "Good", labelBm: "Baik", color: "#75C987" },
  { id: "moderate", label: "Moderate", labelBm: "Sederhana", color: "#E7C95A" },
  { id: "unhealthy", label: "Unhealthy", labelBm: "Tidak Sihat", color: "#E89751" },
  {
    id: "very-unhealthy",
    label: "Very unhealthy",
    labelBm: "Sangat Tidak Sihat",
    color: "#E16C67",
  },
  { id: "hazardous", label: "Hazardous", labelBm: "Berbahaya", color: "#D88DA8" },
] as const;

export const WAQI_CATEGORIES = [
  CATEGORIES[0],
  CATEGORIES[1],
  {
    id: "sensitive",
    label: "Unhealthy for sensitive groups",
    labelBm: "Tidak sihat untuk kumpulan sensitif",
    color: "#E89751",
  },
  { ...CATEGORIES[2], color: "#E16C67" },
  { ...CATEGORIES[3], color: "#D88DA8" },
  { ...CATEGORIES[4], color: "#C995A8" },
] as const;

export function indexDefinition(scale: string) {
  if (scale === "MY_IPU")
    return {
      label: "Malaysian IPU",
      unit: "IPU",
      categories: CATEGORIES,
      limits: [50, 100, 200, 300, Infinity],
      thresholds: ["0–50", "51–100", "101–200", "201–300", ">300"],
      samples: [20, 75, 150, 250, 350],
    };
  if (scale === "WAQI_AQI")
    return {
      label: "WAQI AQI (US-EPA-based)",
      unit: "AQI",
      categories: WAQI_CATEGORIES,
      limits: [50, 100, 150, 200, 300, Infinity],
      thresholds: ["0–50", "51–100", "101–150", "151–200", "201–300", ">300"],
      samples: [20, 75, 125, 175, 250, 350],
    };
  return {
    label: "Unknown index",
    unit: "—",
    categories: [],
    limits: [],
    thresholds: [],
    samples: [],
  };
}

export function categoryFor(value: unknown, scale = "MY_IPU") {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  const definition = indexDefinition(scale);
  return definition.categories[definition.limits.findIndex((limit) => value <= limit)] ?? null;
}

export function formatMYT(timestamp: string, options?: Intl.DateTimeFormatOptions): string {
  if (!timestampSchema.safeParse(timestamp).success) return "Invalid timestamp";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(timestamp));
}

export function observationStatus(obs: Observation | undefined, asOf: string): string {
  if (!obs) return "missing";
  if (![obs.observedAt, obs.fetchedAt, asOf].every((t) => timestampSchema.safeParse(t).success))
    return "invalid";
  const age = Date.parse(asOf) - Date.parse(obs.observedAt);
  if (age < 0 || Date.parse(obs.fetchedAt) > Date.parse(asOf)) return "future";
  if (
    obs.qualityFlags.some(
      (flag) =>
        flag !== "missing" &&
        !(flag === "unvalidated" && obs.sourceId === "waqi" && obs.indexScale === "WAQI_AQI"),
    )
  )
    return "invalid";
  if (obs.value === null) return "missing";
  if (!categoryFor(obs.value, obs.indexScale)) return "invalid";
  return age <= DEMO_FRESHNESS_MS ? "fresh" : "stale";
}

export type SeriesSelection = { sourceId: string; indexScale: string; observationKind: string };
export const DEMO_SELECTION: SeriesSelection = {
  sourceId: "demo-mys-ipu",
  indexScale: "MY_IPU",
  observationKind: "demo",
};

export function latestObservations(
  observations: Observation[],
  asOf: string,
  selection: SeriesSelection = DEMO_SELECTION,
): Observation[] {
  if (!timestampSchema.safeParse(asOf).success) return [];
  const limit = Date.parse(asOf);
  const latest = new Map<string, Observation>();
  for (const observation of observations) {
    if (
      observation.sourceId !== selection.sourceId ||
      observation.indexScale !== selection.indexScale ||
      observation.observationKind !== selection.observationKind
    )
      continue;
    if (
      ![observation.observedAt, observation.fetchedAt].every(
        (t) => timestampSchema.safeParse(t).success,
      )
    )
      continue;
    if (Date.parse(observation.observedAt) > limit || Date.parse(observation.fetchedAt) > limit)
      continue;
    const previous = latest.get(observation.stationId);
    const order = previous
      ? Date.parse(observation.observedAt) - Date.parse(previous.observedAt) ||
        Date.parse(observation.fetchedAt) - Date.parse(previous.fetchedAt) ||
        JSON.stringify(observation).localeCompare(JSON.stringify(previous))
      : 1;
    if (order > 0) latest.set(observation.stationId, observation);
  }
  return [...latest.values()].sort((a, b) => a.stationId.localeCompare(b.stationId));
}

export function summarizeRegion(
  regionId: string,
  stations: Station[],
  observations: Observation[],
  asOf: string,
  selection: SeriesSelection = DEMO_SELECTION,
): RegionSummary {
  const regionalStations = stations.filter((s) => s.regionId === regionId);
  const ids = new Set(regionalStations.map((s) => s.id));
  const latest = latestObservations(observations, asOf, selection).filter((o) =>
    ids.has(o.stationId),
  );
  const eligible = latest
    .filter((o) => observationStatus(o, asOf) === "fresh")
    .sort((a, b) => b.value! - a.value! || a.stationId.localeCompare(b.stationId));
  const dates = eligible.map((o) => new Date(o.observedAt).toISOString()).sort();
  const value = eligible[0]?.value ?? null;
  const statuses = latest.map((o) => observationStatus(o, asOf));
  return {
    regionId,
    value,
    contributor: eligible[0] ? regionalStations.find((s) => s.id === eligible[0].stationId)! : null,
    contributorObservedAt: eligible[0] ? new Date(eligible[0].observedAt).toISOString() : null,
    freshCount: eligible.length,
    stationCount: regionalStations.length || null,
    min: eligible.length ? Math.min(...eligible.map((o) => o.value!)) : null,
    max: value,
    oldestAt: dates[0] ?? null,
    newestAt: dates.at(-1) ?? null,
    status: eligible.length
      ? "fresh"
      : statuses.includes("stale")
        ? "stale"
        : statuses.includes("invalid")
          ? "invalid"
          : "missing",
  };
}
