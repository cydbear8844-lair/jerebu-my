import "server-only";
import { z } from "zod";
import { latestObservations, summarizeRegion, timestampSchema } from "../lib/domain";
import {
  DEMO_CLOCK,
  DEMO_SOURCE,
  DEMO_START,
  DEMO_STATIONS,
  fixtureSeries,
  fixtureSnapshot,
  HOUR_MS,
} from "../lib/fixtures";
import { REGIONS } from "../lib/regions";
import demoTimeline from "../lib/demo-timeline.json";
import type { HistoryPoint, Snapshot, Station } from "../lib/types";
import { fetchWaqiSnapshot, hasWaqiToken, waqiUnavailable, WAQI_HISTORY_REASON } from "./waqi";
import { createAdmissionBudget } from "./admission";

let pendingSnapshot: Promise<Snapshot> | undefined;
const admitLiveRequest = createAdmissionBudget();
export async function loadSnapshot(at?: string): Promise<Snapshot> {
  if (process.env.DATA_MODE !== "live") return getSnapshot(at);
  if (at !== undefined) throw new DataError(WAQI_HISTORY_REASON, 503);
  if (!pendingSnapshot) {
    if (!hasWaqiToken()) return fetchWaqiSnapshot();
    if (!admitLiveRequest())
      return waqiUnavailable(
        new Date().toISOString(),
        "Live request budget reached for this server process (six requests per minute). Try again after the current window expires.",
      );
    pendingSnapshot = fetchWaqiSnapshot().finally(() => {
      pendingSnapshot = undefined;
    });
  }
  return pendingSnapshot;
}

export class DataError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 503,
  ) {
    super(message);
    this.name = "DataError";
  }
}

function coveredTimestamp(value: string): string {
  if (!timestampSchema.safeParse(value).success)
    throw new DataError("Use an ISO timestamp with an explicit timezone.", 400);
  const time = Date.parse(value);
  if (time < Date.parse(DEMO_START) || time > Date.parse(DEMO_CLOCK))
    throw new DataError(`Available demo coverage: ${DEMO_START} to ${DEMO_CLOCK}.`, 400);
  return new Date(time).toISOString();
}

export function getSnapshot(asOf?: string, mode = process.env.DATA_MODE): Snapshot {
  if (mode !== "demo") {
    return {
      mode: mode === "live" ? "live" : "unconfigured",
      status: mode === "live" ? "unavailable" : "configuration",
      message:
        mode === "live"
          ? "Live provider unavailable. No authorised live integration is configured."
          : "Set DATA_MODE=demo to view clearly labelled synthetic data.",
      asOf: new Date().toISOString(),
      sourceId: "unconfigured",
      indexScale: "unknown",
      stations: [],
      observations: [],
      summaries: REGIONS.map((region) => ({
        ...summarizeRegion(region.id, [], [], DEMO_CLOCK),
        status: mode === "live" ? "source-error" : "configuration",
      })),
    };
  }
  const selectedTime = coveredTimestamp(asOf ?? DEMO_CLOCK);
  const observations = latestObservations(fixtureSnapshot(selectedTime), selectedTime);
  return {
    mode: "demo",
    status: "available",
    message: "DEMO DATA — NOT CURRENT READINGS",
    asOf: selectedTime,
    sourceId: DEMO_SOURCE,
    indexScale: "MY_IPU",
    stations: DEMO_STATIONS,
    observations,
    summaries: REGIONS.map((region) =>
      summarizeRegion(region.id, DEMO_STATIONS, observations, selectedTime),
    ),
  };
}

export function getTimeline() {
  if (process.env.DATA_MODE !== "demo") throw new DataError(WAQI_HISTORY_REASON, 503);
  return demoTimeline;
}

export type StationHistory = {
  station: Station;
  points: HistoryPoint[];
  sourceId: string;
  indexScale: string;
  mode: "demo";
  resolution: "hourly";
  start: string;
  end: string;
};
export const historyQuerySchema = z.object({
  stationId: z.string().min(1).max(100),
  start: timestampSchema,
  end: timestampSchema,
});

export function getHistory(stationId: string, start: string, end: string): StationHistory {
  if (process.env.DATA_MODE !== "demo") throw new DataError(WAQI_HISTORY_REASON, 503);
  if (!historyQuerySchema.safeParse({ stationId, start, end }).success)
    throw new DataError("Provide stationId, start and end with explicit ISO timezones.", 400);
  const normalizedStart = coveredTimestamp(start);
  const normalizedEnd = coveredTimestamp(end);
  const duration = Date.parse(end) - Date.parse(start);
  if (duration < 0 || duration > 30 * 24 * HOUR_MS)
    throw new DataError("History range must be ordered and at most 30 days.", 400);
  const station = DEMO_STATIONS.find((s) => s.id === stationId);
  if (!station) throw new DataError("Unknown demo station.", 404);
  const series = new Map(fixtureSeries(station).map((o) => [Date.parse(o.observedAt), o.value]));
  const points: HistoryPoint[] = [];
  for (
    let time = Math.ceil(Date.parse(start) / HOUR_MS) * HOUR_MS;
    time <= Date.parse(end);
    time += HOUR_MS
  ) {
    points.push({ observedAt: new Date(time).toISOString(), value: series.get(time) ?? null });
  }
  return {
    station,
    points,
    sourceId: DEMO_SOURCE,
    indexScale: "MY_IPU",
    mode: "demo",
    resolution: "hourly",
    start: normalizedStart,
    end: normalizedEnd,
  };
}

export function dataErrorResponse(error: unknown): Response {
  const status = error instanceof DataError ? error.status : 503;
  const message = error instanceof DataError ? error.message : "Data source unavailable.";
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
