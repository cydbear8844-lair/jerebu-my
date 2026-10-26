import type { FeatureCollection, Geometry, Position } from "geojson";
import { latestObservations, observationStatus } from "./domain";
import type { Observation, Snapshot, Station } from "./types";

export type UserPosition = { longitude: number; latitude: number; accuracy: number };
export type NearestStation = { station: Station; observation: Observation; distanceKm: number };

export function validPosition(position: UserPosition): boolean {
  return (
    Number.isFinite(position.longitude) &&
    Math.abs(position.longitude) <= 180 &&
    Number.isFinite(position.latitude) &&
    Math.abs(position.latitude) <= 90 &&
    Number.isFinite(position.accuracy) &&
    position.accuracy >= 0
  );
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const latitude = Math.sin(((b[1] - a[1]) * rad) / 2);
  const longitude = Math.sin(((b[0] - a[0]) * rad) / 2);
  const h =
    latitude * latitude + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * longitude * longitude;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function nearestEligibleStation(
  snapshot: Snapshot,
  coordinates: [number, number],
): NearestStation | null {
  if (
    snapshot.status !== "available" ||
    !validPosition({ longitude: coordinates[0], latitude: coordinates[1], accuracy: 0 })
  )
    return null;
  const observations = latestObservations(snapshot.observations, snapshot.asOf, {
    sourceId: snapshot.sourceId,
    indexScale: snapshot.indexScale,
    observationKind: snapshot.mode === "demo" ? "demo" : "observed",
  });
  const eligible = new Map(
    observations
      .filter((o) => observationStatus(o, snapshot.asOf) === "fresh")
      .map((o) => [o.stationId, o]),
  );
  const candidates = snapshot.stations.flatMap((station) => {
    const observation = eligible.get(station.id);
    if (
      !observation ||
      !validPosition({
        longitude: station.coordinates[0],
        latitude: station.coordinates[1],
        accuracy: 0,
      })
    )
      return [];
    return [{ station, observation, distanceKm: haversineKm(coordinates, station.coordinates) }];
  });
  candidates.sort(
    (a, b) => a.distanceKm - b.distanceKm || a.station.id.localeCompare(b.station.id),
  );
  return candidates[0] ?? null;
}

function inRing(point: [number, number], ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i];
    const [previousX, previousY] = ring[j];
    if (
      y > point[1] !== previousY > point[1] &&
      point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x
    )
      inside = !inside;
  }
  return inside;
}

export function pointInMalaysia(
  point: [number, number],
  geography: FeatureCollection<Geometry>,
): boolean {
  return geography.features.some(({ geometry }) => {
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates
          : [];
    return polygons.some(
      (rings) =>
        rings.length > 0 &&
        inRing(point, rings[0]) &&
        !rings.slice(1).some((ring) => inRing(point, ring)),
    );
  });
}
