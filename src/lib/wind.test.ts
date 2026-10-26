import { describe, expect, it } from "vitest";
import { DEMO_CLOCK, DEMO_START } from "./demo-time";
import {
  advectWind,
  createDemoWindField,
  describeWind,
  matchesWindTime,
  sampleWind,
  windColor,
  windHour,
  windVectorFrom,
} from "./wind";

describe("wind vectors and sampling", () => {
  it("converts meteorological FROM directions and km/h to m/s", () => {
    expect(windVectorFrom(36, 0)?.v).toBeCloseTo(-10);
    expect(windVectorFrom(36, 90)?.u).toBeCloseTo(-10);
    expect(windVectorFrom(36, 225)?.u).toBeCloseTo(Math.sqrt(50));
    expect(windVectorFrom(36, 225)?.v).toBeCloseTo(Math.sqrt(50));
    expect(describeWind({ u: -10, v: 0 })).toEqual({
      speedKmh: 36,
      directionFromDegrees: 90,
      compass: "E",
    });
  });
  it("distinguishes missing values from calm", () => {
    expect(windVectorFrom(null, 0)).toBeNull();
    expect(windVectorFrom(10, null)).toBeNull();
    expect(windVectorFrom(-1, 0)).toBeNull();
    expect(describeWind({ u: 0, v: 0 })).toEqual({
      speedKmh: 0,
      directionFromDegrees: null,
      compass: null,
    });
  });
  it("interpolates components across 359 and 1 degrees without reversing north", () => {
    const field = createDemoWindField(DEMO_CLOCK, "north")!;
    field.width = 2;
    field.height = 2;
    const vectors = [359, 1, 359, 1].map((angle) => windVectorFrom(36, angle)!);
    field.u = vectors.map((v) => v.u);
    field.v = vectors.map((v) => v.v);
    field.valid = [true, true, true, true];
    const vector = sampleWind(
      field,
      (field.bounds.west + field.bounds.east) / 2,
      (field.bounds.south + field.bounds.north) / 2,
    )!;
    expect(vector.u).toBeCloseTo(0);
    expect(vector.v).toBeLessThan(-9.99);
  });
  it("uses south-to-north rows and rejects any unsupported interpolation corner", () => {
    const field = createDemoWindField(DEMO_CLOCK, "north")!;
    Object.assign(field, {
      width: 2,
      height: 2,
      u: [0, 10, 20, 30],
      v: [0, 0, 0, 0],
      valid: [true, true, true, true],
    });
    expect(sampleWind(field, field.bounds.west, field.bounds.north)?.u).toBe(20);
    expect(sampleWind(field, field.bounds.east, field.bounds.south)?.u).toBe(10);
    expect(sampleWind(field, field.bounds.east + 1, 3)).toBeNull();
    field.valid[3] = false;
    expect(sampleWind(field, field.bounds.west, field.bounds.south)).toBeNull();
  });
});

describe("wind rendering calculations", () => {
  it("keeps the fixed colour stops, interpolates and saturates only colour", () => {
    expect([0, 10, 20, 40, 60, 90].map(windColor)).toEqual([
      "#48a7d7",
      "#69d9cd",
      "#c9e78c",
      "#f4b860",
      "#ef7479",
      "#ef7479",
    ]);
    expect(windColor(5)).toBe("#59c0d2");
    expect(describeWind({ u: 25, v: 0 }).speedKmh).toBe(90);
  });
  it("moves the same distance at 30, 60 and 120 fps within one millimetre", () => {
    const field = createDemoWindField(DEMO_CLOCK, "southwest")!;
    const positions = [30, 60, 120].map((fps) => {
      let point = { lng: 104, lat: 3 };
      for (let i = 0; i < fps; i++) point = advectWind(field, point, 1 / fps)!;
      return point;
    });
    for (const point of positions) {
      expect(point.lng).toBeGreaterThan(104);
      expect(point.lat).toBeGreaterThan(3);
      expect(Math.abs(point.lng - positions[0].lng) * 111_320).toBeLessThan(0.001);
      expect(Math.abs(point.lat - positions[0].lat) * 111_320).toBeLessThan(0.001);
    }
  });
  it("clamps suspended time, preserves calm, and cannot jump a missing cell", () => {
    const field = createDemoWindField(DEMO_CLOCK, "calm")!;
    expect(advectWind(field, { lng: 104, lat: 3 }, 60)).toEqual({ lng: 104, lat: 3 });
    const east = createDemoWindField(DEMO_CLOCK, "east")!;
    expect(advectWind(east, { lng: 104, lat: 3 }, 60)).toEqual(
      advectWind(east, { lng: 104, lat: 3 }, 0.1),
    );
    Object.assign(east, {
      width: 5,
      height: 2,
      bounds: { west: 0, east: 4, south: 0, north: 1 },
      u: Array(10).fill(10),
      v: Array(10).fill(0),
      valid: [true, true, false, true, true, true, true, false, true, true],
    });
    expect(advectWind(east, { lng: 0.1, lat: 0.5 }, 0.1, 400_000)).toBeNull();
  });
});

describe("deterministic demo wind time slices", () => {
  it("floors hourly times without borrowing a future or different field", () => {
    expect(windHour("2026-09-21T03:59:00Z")).toBe("2026-09-21T03:00:00.000Z");
    expect(windHour("2026-09-21T03:59:00")).toBeNull();
    expect(matchesWindTime(createDemoWindField(DEMO_CLOCK)!, "2026-09-21T03:59:00Z")).toBe(false);
    expect(createDemoWindField("2026-10-01T00:00:00Z")).toBeNull();
    expect(createDemoWindField(DEMO_START)).not.toBeNull();
  });
  it("repeats exactly while varying spatially and across time", () => {
    const field = createDemoWindField(DEMO_CLOCK)!;
    expect(createDemoWindField(DEMO_CLOCK)).toEqual(field);
    expect(new Set(field.u).size).toBeGreaterThan(10);
    expect(createDemoWindField("2026-09-21T03:00:00Z")?.u).not.toEqual(field.u);
    expect(createDemoWindField(DEMO_CLOCK, "holes")?.valid).toContain(false);
    expect(createDemoWindField(DEMO_CLOCK, "rotation")?.model).toContain("synthetic");
    const gradient = createDemoWindField(DEMO_CLOCK, "gradient")!;
    expect(Math.min(...gradient.u.map(Math.abs)) * 3.6).toBe(0);
    expect(Math.max(...gradient.u.map(Math.abs)) * 3.6).toBeGreaterThan(60);
  });
});
