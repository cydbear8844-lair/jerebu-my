import { describe, expect, it } from "vitest";
import {
  haversineKm,
  nearestEligibleStation,
  validPosition,
  pointInMalaysia,
} from "./nearest-station";
import type { Snapshot } from "./types";

const time = "2026-09-21T04:00:00.000Z";
const snapshot: Snapshot = {
  mode: "demo",
  status: "available",
  message: "demo",
  asOf: time,
  sourceId: "demo-mys-ipu",
  indexScale: "MY_IPU",
  summaries: [],
  stations: ["b", "a"].map((id) => ({ id, regionId: "selangor", name: id, coordinates: [101, 3] })),
  observations: ["b", "a"].map((stationId) => ({
    stationId,
    sourceId: "demo-mys-ipu",
    indexScale: "MY_IPU",
    observationKind: "demo",
    observedAt: time,
    fetchedAt: time,
    value: 0,
    qualityFlags: [],
  })),
};

describe("nearest eligible station", () => {
  it("uses great-circle distance and stable station ID ties, including zero", () => {
    expect(haversineKm([0, 0], [0, 1])).toBeCloseTo(111.195, 2);
    expect(nearestEligibleStation(snapshot, [101, 3])?.station.id).toBe("a");
    expect(nearestEligibleStation(snapshot, [101, 3])?.observation.value).toBe(0);
  });
  it.each(["stale", "future", "null", "foreign", "invalid", "wrong-kind"])(
    "excludes %s readings",
    (kind) => {
      const observations = snapshot.observations.map((o) => ({
        ...o,
        ...(kind === "stale" ? { observedAt: "2026-09-21T00:00:00.000Z" } : {}),
        ...(kind === "future" ? { fetchedAt: "2026-09-21T05:00:00.000Z" } : {}),
        ...(kind === "null" ? { value: null } : {}),
        ...(kind === "foreign" ? { sourceId: "other" } : {}),
        ...(kind === "invalid" ? { qualityFlags: ["invalid"] } : {}),
        ...(kind === "wrong-kind" ? { observationKind: "live" } : {}),
      }));
      expect(nearestEligibleStation({ ...snapshot, observations }, [101, 3])).toBeNull();
    },
  );
  it("rejects invalid coordinates and accuracy", () => {
    expect(validPosition({ longitude: NaN, latitude: 3, accuracy: 4 })).toBe(false);
    expect(validPosition({ longitude: 181, latitude: 3, accuracy: 4 })).toBe(false);
    expect(validPosition({ longitude: 101, latitude: 3, accuracy: -1 })).toBe(false);
    expect(validPosition({ longitude: 101, latitude: 3, accuracy: Infinity })).toBe(false);
    expect(validPosition({ longitude: 101, latitude: 3, accuracy: 0 })).toBe(true);
  });
  it("honours polygon holes rather than using a national bounding box", () => {
    const geometry = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "Polygon" as const,
            coordinates: [
              [
                [100, 0],
                [110, 0],
                [110, 10],
                [100, 10],
                [100, 0],
              ],
              [
                [102, 2],
                [104, 2],
                [104, 4],
                [102, 4],
                [102, 2],
              ],
            ],
          },
        },
      ],
    };
    expect(pointInMalaysia([101, 3], geometry)).toBe(true);
    expect(pointInMalaysia([103, 3], geometry)).toBe(false);
    expect(pointInMalaysia([-74, 40], geometry)).toBe(false);
  });
});
