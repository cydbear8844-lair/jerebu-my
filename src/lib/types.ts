export type Region = {
  id: string;
  slug: string;
  name: string;
  nameBm: string;
  kind: "state" | "federal_territory";
  center: [number, number];
};
export type Attribution = { name: string; url?: string };
export type Station = {
  id: string;
  regionId: string;
  name: string;
  coordinates: [number, number];
  externalId?: string;
  sourceId?: string;
  url?: string;
  recordType?: "monitoring_station" | "provider_location";
  attribution?: Attribution[];
};
export type Observation = {
  stationId: string;
  sourceId: string;
  indexScale: string;
  observationKind: string;
  observedAt: string;
  fetchedAt: string;
  value: number | null;
  qualityFlags: string[];
};
export type RegionSummary = {
  regionId: string;
  value: number | null;
  contributor: Station | null;
  contributorObservedAt?: string | null;
  freshCount: number;
  stationCount: number | null;
  min: number | null;
  max: number | null;
  oldestAt: string | null;
  newestAt: string | null;
  status: string;
};
export type Snapshot = {
  mode: "demo" | "live" | "unconfigured";
  status: "available" | "unavailable" | "configuration";
  message: string;
  asOf: string;
  sourceId: string;
  indexScale: string;
  stations: Station[];
  observations: Observation[];
  summaries: RegionSummary[];
  attribution?: Attribution[];
  history?: { available: boolean; reason: string };
  coverage?: {
    discovered: number;
    requested: number;
    received: number;
    omitted: number;
    failed: number;
    limited: boolean;
  };
};
export type HistoryPoint = { observedAt: string; value: number | null };
