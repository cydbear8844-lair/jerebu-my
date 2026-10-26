import "server-only";
import { REGIONS } from "./regions";
import type { Observation, Station } from "./types";

import { DEMO_CLOCK, DEMO_START, HOUR_MS } from "./demo-time";
export { DEMO_CLOCK, DEMO_START, HOUR_MS } from "./demo-time";
export const DEMO_SOURCE = "demo-mys-ipu";

export const DEMO_STATIONS: Station[] = REGIONS.flatMap((region) =>
  [0, 1].map((index) => ({
    id: `demo-${region.id}-${index === 0 ? "a" : "b"}`,
    regionId: region.id,
    name: `Demo station / ${region.name} ${index === 0 ? "A" : "B"}`,
    coordinates: [region.center[0] + index * 0.005, region.center[1] + index * 0.005] as [
      number,
      number,
    ],
  })),
);

function seedFor(id: string): number {
  return [...id].reduce((seed, char) => (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0, 1729);
}

const demoStart = Date.parse(DEMO_START);
const demoEnd = Date.parse(DEMO_CLOCK);
const publicationDelay = 5 * 60_000;

function fixtureObservation(station: Station, hour: number, seed: number, regionIndex: number) {
  const time = demoStart + hour * HOUR_MS;
  if (hour < 0 || hour > 720 || (station.regionId === "kelantan" && time > demoEnd - 4 * HOUR_MS))
    return undefined;
  const missing =
    station.regionId === "perlis" ||
    (hour + seed) % 37 === 0 ||
    (station.id === "demo-selangor-b" && hour === 720);
  const hash = (Math.imul(seed ^ hour, 1664525) + 1013904223) >>> 0;
  const value = missing
    ? null
    : station.id === "demo-labuan-a" && hour === 720
      ? 0
      : Math.max(
          0,
          [36, 62, 74, 58, 83, 108, 127, 42, 149, 52, 68, 167, 91, 214, 32, 307][regionIndex] +
            (hash % 35) -
            17,
        );
  return {
    stationId: station.id,
    sourceId: DEMO_SOURCE,
    indexScale: "MY_IPU",
    observationKind: "demo",
    observedAt: new Date(time).toISOString(),
    fetchedAt: new Date(Math.min(time + publicationDelay, demoEnd)).toISOString(),
    value,
    qualityFlags: missing ? ["missing"] : [],
  } satisfies Observation;
}

export function fixtureSeries(station: Station): Observation[] {
  const seed = seedFor(station.id);
  const regionIndex = REGIONS.findIndex((r) => r.id === station.regionId);
  return Array.from({ length: 721 }, (_, hour) =>
    fixtureObservation(station, hour, seed, regionIndex),
  ).filter((observation): observation is Observation => observation !== undefined);
}

export function fixtureSnapshot(asOf: string): Observation[] {
  const time = Date.parse(asOf);
  const hour = time === demoEnd ? 720 : Math.floor((time - demoStart - publicationDelay) / HOUR_MS);
  return DEMO_STATIONS.map((station) =>
    fixtureObservation(
      station,
      Math.min(hour, station.regionId === "kelantan" ? 716 : 720),
      seedFor(station.id),
      REGIONS.findIndex((region) => region.id === station.regionId),
    ),
  ).filter((observation): observation is Observation => observation !== undefined);
}
