import { DEMO_CLOCK, DEMO_START, HOUR_MS } from "./demo-time";

export interface WindVector {
  u: number;
  v: number;
}
export interface WindPosition {
  lng: number;
  lat: number;
}
export interface WindField {
  id: string;
  source: "demo" | "open-meteo";
  kind: "synthetic" | "forecast" | "historical-forecast" | "reanalysis";
  model: string;
  heightM: number;
  validAt: string;
  fetchedAt: string;
  issuedAt?: string;
  width: number;
  height: number;
  bounds: { west: number; south: number; east: number; north: number };
  u: number[];
  v: number[];
  valid: boolean[];
  sampleCoordinates?: [number, number][];
  resolution: string;
  attribution: { name: string; url: string }[];
}

export const WIND_COLOR_STOPS = [
  [0, "#48a7d7"],
  [10, "#69d9cd"],
  [20, "#c9e78c"],
  [40, "#f4b860"],
  [60, "#ef7479"],
] as const;

export function windVectorFrom(
  speedKmh: number | null,
  directionFromDegrees: number | null,
): WindVector | null {
  if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh < 0) return null;
  if (speedKmh === 0) return { u: 0, v: 0 };
  if (directionFromDegrees === null || !Number.isFinite(directionFromDegrees)) return null;
  const angle = (directionFromDegrees * Math.PI) / 180;
  return { u: (-speedKmh / 3.6) * Math.sin(angle), v: (-speedKmh / 3.6) * Math.cos(angle) };
}

export function describeWind({ u, v }: WindVector) {
  const speedKmh = Math.hypot(u, v) * 3.6;
  if (speedKmh < 1e-10) return { speedKmh: 0, directionFromDegrees: null, compass: null };
  const directionFromDegrees = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  const compass = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ][Math.round(directionFromDegrees / 22.5) % 16];
  return { speedKmh, directionFromDegrees, compass };
}

export function sampleWind(field: WindField, lng: number, lat: number): WindVector | null {
  const { west, east, south, north } = field.bounds;
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    field.width < 2 ||
    field.height < 2 ||
    east <= west ||
    north <= south ||
    lng < west ||
    lng > east ||
    lat < south ||
    lat > north
  )
    return null;
  const x = ((lng - west) / (east - west)) * (field.width - 1);
  const y = ((lat - south) / (north - south)) * (field.height - 1);
  const col = Math.min(Math.floor(x), field.width - 2);
  const row = Math.min(Math.floor(y), field.height - 2);
  const corners = [
    row * field.width + col,
    row * field.width + col + 1,
    (row + 1) * field.width + col,
    (row + 1) * field.width + col + 1,
  ];
  if (
    corners.some(
      (i) => !field.valid[i] || !Number.isFinite(field.u[i]) || !Number.isFinite(field.v[i]),
    )
  )
    return null;
  const dx = x - col,
    dy = y - row;
  const weights = [(1 - dx) * (1 - dy), dx * (1 - dy), (1 - dx) * dy, dx * dy];
  return {
    u: corners.reduce((sum, index, i) => sum + field.u[index] * weights[i], 0),
    v: corners.reduce((sum, index, i) => sum + field.v[index] * weights[i], 0),
  };
}

export function windColor(speedKmh: number): string {
  const speed = Math.max(0, Math.min(60, Number.isFinite(speedKmh) ? speedKmh : 0));
  const upper = WIND_COLOR_STOPS.findIndex(([value]) => value >= speed);
  if (upper <= 0) return WIND_COLOR_STOPS[0][1];
  const [low, from] = WIND_COLOR_STOPS[upper - 1];
  const [high, to] = WIND_COLOR_STOPS[upper];
  const fraction = (speed - low) / (high - low);
  return (
    "#" +
    [1, 3, 5]
      .map((offset) => {
        const a = parseInt(from.slice(offset, offset + 2), 16);
        const b = parseInt(to.slice(offset, offset + 2), 16);
        return Math.round(a + (b - a) * fraction)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

export function advectWind(
  field: WindField,
  point: WindPosition,
  elapsedSeconds: number,
  multiplier = 1,
): WindPosition | null {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(multiplier) || multiplier < 0)
    return null;
  let remaining = Math.max(0, Math.min(0.1, elapsedSeconds)) * multiplier;
  let current = { ...point };
  const cellLng = (field.bounds.east - field.bounds.west) / (field.width - 1);
  const cellLat = (field.bounds.north - field.bounds.south) / (field.height - 1);
  for (let iteration = 0; iteration < 1024; iteration++) {
    const vector = sampleWind(field, current.lng, current.lat);
    if (!vector) return null;
    if (remaining === 0 || (vector.u === 0 && vector.v === 0)) return current;
    const cosine = Math.cos((current.lat * Math.PI) / 180);
    if (Math.abs(cosine) < 1e-6) return null;
    const dLng = vector.u / (111_320 * cosine),
      dLat = vector.v / 111_320;
    const step = Math.min(
      remaining,
      (0.2 * cellLng) / Math.abs(dLng),
      (0.2 * cellLat) / Math.abs(dLat),
    );
    const next = { lng: current.lng + dLng * step, lat: current.lat + dLat * step };
    if (!sampleWind(field, next.lng, next.lat)) return null;
    current = next;
    remaining -= step;
  }
  return null;
}

export function windHour(time: string): string | null {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(time)) return null;
  const timestamp = Date.parse(time);
  return Number.isFinite(timestamp)
    ? new Date(Math.floor(timestamp / HOUR_MS) * HOUR_MS).toISOString()
    : null;
}

export function matchesWindTime(field: WindField, time: string): boolean {
  const hour = windHour(time);
  return hour !== null && Date.parse(field.validAt) === Date.parse(hour);
}

export type DemoWindPattern =
  "varied" | "north" | "east" | "southwest" | "gradient" | "rotation" | "calm" | "holes";

export function createDemoWindField(
  time: string,
  pattern: DemoWindPattern = "varied",
): WindField | null {
  const validAt = windHour(time);
  if (
    !validAt ||
    Date.parse(validAt) < Date.parse(DEMO_START) ||
    Date.parse(time) > Date.parse(DEMO_CLOCK)
  )
    return null;
  const field: WindField = {
    id: `demo-wind-${pattern}-${validAt}`,
    source: "demo",
    kind: "synthetic",
    model: `Deterministic synthetic ${pattern} field`,
    heightM: 10,
    validAt,
    fetchedAt: DEMO_CLOCK,
    width: 49,
    height: 25,
    bounds: { west: 96, south: -3, east: 122, north: 10 },
    u: [],
    v: [],
    valid: [],
    resolution: "Synthetic regular 49 × 25 grid, south-to-north rows; approximately 0.54° spacing",
    attribution: [{ name: "JEREBU deterministic synthetic demo", url: "/about" }],
  };
  const hour = (Date.parse(validAt) - Date.parse(DEMO_START)) / HOUR_MS;
  for (let row = 0; row < field.height; row++) {
    for (let col = 0; col < field.width; col++) {
      const x = col / (field.width - 1),
        y = row / (field.height - 1);
      let vector: WindVector;
      if (pattern === "calm") vector = { u: 0, v: 0 };
      else if (pattern === "rotation") vector = { u: -(y - 0.5) * 24, v: (x - 0.5) * 24 };
      else if (pattern === "gradient") vector = { u: (x * 80) / 3.6, v: 0 };
      else if (["north", "east", "southwest"].includes(pattern))
        vector = windVectorFrom(36, pattern === "north" ? 0 : pattern === "east" ? 90 : 225)!;
      else
        vector = windVectorFrom(
          5 + 60 * (0.55 * x + 0.45 * y) + 5 * Math.sin((hour * Math.PI) / 12),
          35 + 130 * x + 35 * Math.sin(y * Math.PI * 2 + (hour * Math.PI) / 12),
        )!;
      field.u.push(vector.u);
      field.v.push(vector.v);
      field.valid.push(!(pattern === "holes" && x > 0.4 && x < 0.6 && y > 0.35 && y < 0.65));
    }
  }
  return field;
}
