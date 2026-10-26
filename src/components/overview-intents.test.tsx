// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TerritoryWorkspace } from "./territory-workspace";
import { Overview } from "./overview";
import { REGIONS } from "@/lib/regions";
import { summarizeRegion } from "@/lib/domain";
import type { Snapshot } from "@/lib/types";

const route = vi.hoisted(() => ({ path: "/", push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.path,
  useRouter: () => ({ push: route.push, refresh: route.refresh }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

const asOf = "2026-09-21T04:00:00.000Z";
const older = "2026-09-21T02:00:00.000Z";
const stations: Snapshot["stations"] = [
  {
    id: "demo-selangor-a",
    name: "Demo station / Selangor A",
    regionId: "selangor",
    coordinates: [101.5, 3],
  },
  {
    id: "demo-selangor-b",
    name: "Demo station / Selangor B",
    regionId: "selangor",
    coordinates: [101.6, 3],
  },
];
function fixture(mode: Snapshot["mode"] = "demo"): Snapshot {
  const sourceId = mode === "demo" ? "demo-mys-ipu" : "waqi";
  const indexScale = mode === "demo" ? "MY_IPU" : "WAQI_AQI";
  const observationKind = mode === "demo" ? "demo" : "provider_aqi";
  const observations = stations.map((s, i) => ({
    stationId: s.id,
    sourceId,
    indexScale,
    observationKind,
    observedAt: i ? asOf : older,
    fetchedAt: asOf,
    value: i ? 20 : 200,
    qualityFlags: [],
  }));
  return {
    mode,
    status: "available",
    message: "Test fixture",
    asOf,
    sourceId,
    indexScale,
    stations,
    observations,
    summaries: REGIONS.map((r) => ({
      ...summarizeRegion(r.id, stations, observations, asOf, {
        sourceId,
        indexScale,
        observationKind,
      }),
      contributorObservedAt: r.id === "selangor" ? older : null,
    })),
  };
}
let success: PositionCallback;
beforeEach(() => {
  route.path = "/";
  route.push.mockClear();
  localStorage.clear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("max-width"),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((onSuccess) => {
        success = onSuccess;
      }),
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("timeline")
          ? { start: "2026-09-20T04:00:00.000Z", end: asOf, frames: [{ at: asOf, freshCount: 2 }] }
          : {
              type: "FeatureCollection",
              features: [
                {
                  geometry: {
                    type: "Polygon",
                    coordinates: [
                      [
                        [100, 0],
                        [110, 0],
                        [110, 10],
                        [100, 10],
                        [100, 0],
                      ],
                    ],
                  },
                },
              ],
            },
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("supersedes pending geolocation when a mobile region preview is selected", async () => {
  render(<Overview initial={fixture()} />);
  fireEvent.click(screen.getByRole("button", { name: "Near me" }));
  expect(document.querySelector(".near-me-button")).toHaveAttribute(
    "data-location-phase",
    "locating",
  );
  fireEvent.click(screen.getByRole("button", { name: "List · 16" }));
  fireEvent.click(document.querySelector('.region-row[href="/region/labuan"]')!);
  await act(async () =>
    success({ coords: { latitude: 3, longitude: 101.5, accuracy: 25 } } as GeolocationPosition),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("Labuan");
  expect(document.querySelector(".near-me-button")).toHaveAttribute("data-location-phase", "idle");
  expect(document.querySelector(".near-me-card")).toBeNull();
});

it.each(["/about", "/saved", "/station/demo-selangor-a", "/region/sabah"])(
  "closes the mobile portal on navigation to %s",
  async (path) => {
    const snapshot = fixture();
    const view = render(
      <TerritoryWorkspace initial={snapshot}>
        <main>Destination</main>
      </TerritoryWorkspace>,
    );
    fireEvent.click(screen.getByRole("button", { name: "List · 16" }));
    const trigger = document.querySelector<HTMLAnchorElement>(
      '.region-row[href="/region/labuan"]',
    )!;
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();
    const focus = vi.spyOn(trigger, "focus");
    route.path = path;
    view.rerender(
      <TerritoryWorkspace initial={snapshot}>
        <main>Destination</main>
      </TerritoryWorkspace>,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(focus).not.toHaveBeenCalled();
    route.path = "/";
    view.rerender(
      <TerritoryWorkspace initial={snapshot}>
        <main>Destination</main>
      </TerritoryWorkspace>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

it("ignores boundary completion after a mobile region supersedes location", async () => {
  let release!: (value: unknown) => void;
  const boundary = new Promise((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith(".geojson")
        ? boundary
        : {
            ok: true,
            json: async () => ({
              start: "2026-09-20T04:00:00.000Z",
              end: asOf,
              frames: [{ at: asOf, freshCount: 2 }],
            }),
          },
    ),
  );
  render(<Overview initial={fixture()} />);
  fireEvent.click(screen.getByRole("button", { name: "Near me" }));
  let pending: void;
  act(() => {
    pending = success({
      coords: { latitude: 3, longitude: 101.5, accuracy: 25 },
    } as GeolocationPosition);
  });
  fireEvent.click(screen.getByRole("button", { name: "List · 16" }));
  fireEvent.click(document.querySelector('.region-row[href="/region/labuan"]')!);
  await act(async () => {
    release({ ok: true, json: async () => ({ type: "FeatureCollection", features: [] }) });
    await pending;
  });
  expect(document.querySelector(".near-me-button")).toHaveAttribute("data-location-phase", "idle");
  expect(screen.getByRole("dialog")).toHaveTextContent("Labuan");
  expect(document.querySelector(".near-me-card")).toBeNull();
});

it("pairs overview and preview maxima with the contributor observation time", () => {
  render(<Overview initial={fixture()} />);
  expect(document.querySelector(".highest-summary")).toHaveTextContent("21 Sept 2026, 10:00 MYT");
  fireEvent.click(screen.getByRole("button", { name: "List · 16" }));
  fireEvent.click(document.querySelector('.region-row[href="/region/selangor"]')!);
  expect(screen.getByRole("dialog")).toHaveTextContent("21 Sept 2026, 10:00");
});

it.each([
  ["en", "List · 16", "Snapshot"],
  ["bm", "Senarai · 16", "Masa rujukan"],
])("uses a visible neutral %s snapshot label for a fresh live preview", (lang, list, label) => {
  localStorage.setItem("jerebu-language", lang);
  render(<Overview initial={fixture("live")} />);
  fireEvent.click(screen.getByRole("button", { name: list }));
  fireEvent.click(document.querySelector('.region-row[href="/region/selangor"]')!);
  expect(screen.getByRole("dialog").querySelector(".source-caption")).toHaveTextContent(
    `waqi · WAQI AQI (US-EPA-based) · ${label}`,
  );
  expect(screen.getByRole("dialog")).not.toHaveTextContent("Demo snapshot");
});
