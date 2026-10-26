// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { summarizeRegion } from "@/lib/domain";
import type { WindController } from "./wind/controls";
import { MalaysiaMap } from "./malaysia-map";

const captured = vi.hoisted(() => ({
  data: null as null | { features: { properties: { regionId: string; color: string } }[] },
  showValues: false,
  map: null as object | null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("./ui/map", () => ({
  Map: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MapGeoJSON: ({ data }: { data: typeof captured.data }) => {
    captured.data = data;
    return null;
  },
  MapMarker: () => null,
  MarkerContent: () => null,
  useMap: () => ({ map: captured.map, isLoaded: captured.map !== null }),
}));
vi.mock("./map-region-labels", () => ({
  MapRegionLabels: ({ showValues }: { showValues: boolean }) => {
    captured.showValues = showValues;
    return null;
  },
}));
const geography = JSON.parse(readFileSync("public/data/malaysia-regions.geojson", "utf8"));
beforeEach(() => {
  localStorage.clear();
  captured.data = null;
  captured.showValues = false;
  captured.map = null;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => geography }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(["MY_IPU", "WAQI_AQI"])(
  "preserves %s category fills and labels in combined mode, reserving neutral fills for wind-only",
  async (scale) => {
    const summaries = [
      { ...summarizeRegion("selangor", [], [], "2026-09-21T04:00:00Z"), value: 125 },
      { ...summarizeRegion("labuan", [], [], "2026-09-21T04:00:00Z"), value: 0 },
    ];
    const wind = (mode: "air" | "wind" | "combined") =>
      ({ preferences: { mode } }) as WindController;
    const view = render(
      <MalaysiaMap summaries={summaries} indexScale={String(scale)} wind={wind("air")} />,
    );
    await waitFor(() => expect(captured.data?.features).toHaveLength(16));
    const airColors = captured.data!.features.map((f) => f.properties.color);
    expect(captured.showValues).toBe(true);
    expect(new Set(airColors).size).toBeGreaterThan(1);
    view.rerender(
      <MalaysiaMap summaries={summaries} indexScale={String(scale)} wind={wind("combined")} />,
    );
    expect(captured.data!.features.map((f) => f.properties.color)).toEqual(airColors);
    expect(captured.showValues).toBe(true);
    view.rerender(
      <MalaysiaMap summaries={summaries} indexScale={String(scale)} wind={wind("wind")} />,
    );
    expect(captured.data!.features.every((f) => f.properties.color === "#41575b")).toBe(true);
    expect(captured.showValues).toBe(false);
  },
);

it.each([
  [1440, 410],
  [1920, 460],
  [1024, 0],
  [390, 0],
])("reset preserves the measured regional fit at %ipx", async (width, panelWidth) => {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: width });
  const fitBounds = vi.fn();
  captured.map = {
    getContainer: () => container,
    fitBounds,
    stop: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    touchZoomRotate: { disableRotation: vi.fn() },
    keyboard: { disableRotation: vi.fn() },
  };
  render(
    <>
      <aside
        className="region-information"
        ref={(element) => {
          if (element)
            vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
              width: panelWidth,
            } as DOMRect);
        }}
      />
      <MalaysiaMap summaries={[]} regionId="sabah" />
    </>,
  );
  await waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(1));
  const entry = fitBounds.mock.calls[0];
  expect(entry[1].padding).toEqual({ top: 85, bottom: 55, left: 45, right: panelWidth + 45 });
  fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
  const reset = fitBounds.mock.lastCall!;
  expect(reset[0]).toEqual(entry[0]);
  expect(reset[1].padding).toEqual(entry[1].padding);
  expect(reset[1].maxZoom).toBe(entry[1].maxZoom);
  expect(reset[1]).toMatchObject({ bearing: 0, pitch: 0, duration: 0 });
});
