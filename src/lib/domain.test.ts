import { describe, expect, it } from "vitest";
import { categoryFor, formatMYT, observationStatus, summarizeRegion } from "./domain";
import type { Observation, Station } from "./types";

const clock = "2026-09-21T04:00:00.000Z";
const stations: Station[] = ["a", "b"].map((id) => ({
  id,
  name: id,
  regionId: "selangor",
  coordinates: [101, 3],
}));
const obs = (extra: Partial<Observation> = {}): Observation => ({
  stationId: "a",
  sourceId: "demo-mys-ipu",
  indexScale: "MY_IPU",
  observationKind: "demo",
  observedAt: clock,
  fetchedAt: clock,
  value: 42,
  qualityFlags: [],
  ...extra,
});

describe("IPU categories", () => {
  it.each([
    [0, "good"],
    [50, "good"],
    [51, "moderate"],
    [100, "moderate"],
    [101, "sensitive"],
    [150, "sensitive"],
    [151, "unhealthy"],
    [200, "unhealthy"],
    [201, "very-unhealthy"],
    [300, "very-unhealthy"],
    [301, "hazardous"],
  ])("keeps WAQI's distinct category boundary at %s", (value, category) => {
    expect(categoryFor(value, "WAQI_AQI")?.id).toBe(category);
  });
  it("preserves unvalidated provenance without accepting other provider errors", () => {
    const provider = obs({
      sourceId: "waqi",
      indexScale: "WAQI_AQI",
      observationKind: "observed",
      value: 125,
      qualityFlags: ["unvalidated"],
    });
    expect(observationStatus(provider, clock)).toBe("fresh");
    expect(
      observationStatus({ ...provider, qualityFlags: ["unvalidated", "rejected"] }, clock),
    ).toBe("invalid");
    expect(observationStatus({ ...provider, sourceId: "other" }, clock)).toBe("invalid");
  });
  it.each([
    [0, "good"],
    [50, "good"],
    [51, "moderate"],
    [100, "moderate"],
    [101, "unhealthy"],
    [200, "unhealthy"],
    [201, "very-unhealthy"],
    [300, "very-unhealthy"],
    [301, "hazardous"],
  ])("categorizes %s", (value, id) => expect(categoryFor(value as number)?.id).toBe(id));
  it.each([null, undefined, NaN, Infinity, -1, 50.5])("rejects invalid IPU %s", (value) =>
    expect(categoryFor(value)).toBeNull(),
  );
  it("does not assign Malaysian categories to unknown scales", () =>
    expect(categoryFor(42, "US_AQI")).toBeNull());
});

describe("observation eligibility", () => {
  it("retains zero", () => expect(observationStatus(obs({ value: 0 }), clock)).toBe("fresh"));
  it("distinguishes null from invalid", () => {
    expect(observationStatus(obs({ value: null }), clock)).toBe("missing");
    expect(observationStatus(obs({ value: NaN }), clock)).toBe("invalid");
  });
  it("uses observation age and includes the two-hour boundary", () => {
    expect(observationStatus(obs({ observedAt: "2026-09-21T02:00:00Z" }), clock)).toBe("fresh");
    expect(observationStatus(obs({ observedAt: "2026-09-21T01:59:59Z" }), clock)).toBe("stale");
  });
  it("rejects future and timezone-less timestamps", () => {
    expect(observationStatus(obs({ observedAt: "2026-09-21T05:00:00Z" }), clock)).toBe("future");
    expect(observationStatus(obs({ observedAt: "2026-09-21T04:00:00" }), clock)).toBe("invalid");
    expect(observationStatus(obs({ fetchedAt: "nonsense" }), clock)).toBe("invalid");
  });
  it("does not trust flagged values", () =>
    expect(observationStatus(obs({ qualityFlags: ["invalid"] }), clock)).toBe("invalid"));
});

describe("regional aggregation and replay", () => {
  it("pairs the maximum with its own observation time while retaining coverage span", () => {
    const earlier = "2026-09-21T02:00:00.000Z";
    expect(
      summarizeRegion(
        "selangor",
        stations,
        [obs({ value: 200, observedAt: earlier }), obs({ stationId: "b", value: 20 })],
        clock,
      ),
    ).toMatchObject({
      value: 200,
      contributor: { id: "a" },
      contributorObservedAt: earlier,
      oldestAt: earlier,
      newestAt: clock,
      freshCount: 2,
      min: 20,
      max: 200,
    });
  });
  it("keeps the selected tie's time when station input order changes", () => {
    const earlier = "2026-09-21T02:00:00.000Z";
    for (const candidates of [stations, [...stations].reverse()]) {
      expect(
        summarizeRegion(
          "selangor",
          candidates,
          [obs({ stationId: "b", value: 0 }), obs({ value: 0, observedAt: earlier })],
          clock,
        ),
      ).toMatchObject({ value: 0, contributor: { id: "a" }, contributorObservedAt: earlier });
    }
  });
  it.each([
    { value: null },
    { observedAt: "2026-09-21T01:59:59Z" },
    { observedAt: "2026-09-21T04:00:01Z" },
    { sourceId: "other" },
  ])("does not supply a contributor time for an ineligible observation %j", (extra) => {
    expect(summarizeRegion("selangor", stations, [obs(extra)], clock)).toMatchObject({
      value: null,
      contributor: null,
      contributorObservedAt: null,
    });
  });
  it("selects the maximum with deterministic station tie and coverage", () => {
    const result = summarizeRegion(
      "selangor",
      stations,
      [obs({ stationId: "b", value: 80 }), obs({ value: 80 })],
      clock,
    );
    expect(result).toMatchObject({
      value: 80,
      contributor: { id: "a" },
      freshCount: 2,
      stationCount: 2,
      min: 80,
      max: 80,
      oldestAt: clock,
      newestAt: clock,
    });
  });
  it("excludes foreign sources, scales, kinds and unknown stations", () => {
    const result = summarizeRegion(
      "selangor",
      stations,
      [
        obs(),
        obs({ stationId: "b", sourceId: "foreign", value: 400 }),
        obs({ stationId: "b", indexScale: "US_AQI", value: 400 }),
        obs({ stationId: "b", observationKind: "forecast", value: 400 }),
        obs({ stationId: "unknown", value: 400 }),
      ],
      clock,
    );
    expect(result).toMatchObject({ value: 42, freshCount: 1 });
  });
  it("deduplicates repeat retrievals and uses latest correction known at selected time", () => {
    const observations = [
      obs({ observedAt: "2026-09-21T03:00:00Z", fetchedAt: "2026-09-21T03:05:00Z", value: 20 }),
      obs({ observedAt: "2026-09-21T03:00:00Z", fetchedAt: "2026-09-21T03:30:00Z", value: 70 }),
      obs({ observedAt: "2026-09-21T03:00:00Z", fetchedAt: "2026-09-21T05:00:00Z", value: 200 }),
    ];
    expect(
      summarizeRegion("selangor", stations, [...observations, ...observations], clock),
    ).toMatchObject({ value: 70, freshCount: 1 });
  });
  it("preserves a latest null gap instead of reviving an earlier value", () =>
    expect(
      summarizeRegion(
        "selangor",
        stations,
        [obs({ observedAt: "2026-09-21T03:00:00Z", value: 90 }), obs({ value: null })],
        clock,
      ),
    ).toMatchObject({ value: null, freshCount: 0, status: "missing" }));
  it("changes contributor across replay without future lookahead", () => {
    const observations = [
      obs({ observedAt: "2026-09-21T03:00:00Z", fetchedAt: "2026-09-21T03:00:00Z", value: 90 }),
      obs({ stationId: "b", value: 150 }),
    ];
    expect(
      summarizeRegion("selangor", stations, observations, "2026-09-21T03:00:00Z").contributor?.id,
    ).toBe("a");
    expect(summarizeRegion("selangor", stations, observations, clock).contributor?.id).toBe("b");
  });
  it("keeps unknown metadata denominator null", () =>
    expect(summarizeRegion("unknown", [], [], clock).stationCount).toBeNull());
  it("marks stale-only regions stale", () =>
    expect(
      summarizeRegion("selangor", stations, [obs({ observedAt: "2026-09-20T04:00:00Z" })], clock),
    ).toMatchObject({ value: null, status: "stale" }));
  it("formats explicit Malaysia day boundaries", () =>
    expect(
      formatMYT("2026-09-20T16:00:00Z", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    ).toContain("21/09/2026, 00:00"));
});
