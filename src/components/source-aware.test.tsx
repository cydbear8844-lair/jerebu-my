// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REGIONS } from "@/lib/regions";
import { summarizeRegion } from "@/lib/domain";
import { nearestEligibleStation } from "@/lib/nearest-station";
import type { Snapshot } from "@/lib/types";
import { Overview } from "./overview";
import { AppHeader } from "./app-header";
import { History } from "./history";

it.each([
  [
    "en",
    "Chart points use observation time. Map replay uses only readings received by the selected time.",
  ],
  [
    "bm",
    "Titik carta mengikut masa pemerhatian. Peta ulang tayang hanya menggunakan bacaan yang diterima sebelum atau pada masa dipilih.",
  ],
])("explains the different history and replay clocks in %s", (lang, text) => {
  localStorage.setItem("jerebu-language", lang);
  render(<History stations={[]} initialStationId="" asOf="2026-09-21T04:00:00.000Z" />);
  expect(screen.getByText(text, { exact: false })).toBeVisible();
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function MapTestDouble() {
      return null;
    },
}));

function providerSnapshot(): Snapshot {
  const asOf = "2026-10-19T06:00:00.000Z";
  const stations: Snapshot["stations"] = [
    {
      id: "waqi-test-location",
      name: "Mock provider location",
      regionId: "selangor",
      coordinates: [101.5, 3],
      recordType: "provider_location",
    },
  ];
  const observations: Snapshot["observations"] = [
    {
      stationId: stations[0].id,
      sourceId: "waqi",
      indexScale: "WAQI_AQI",
      observationKind: "observed",
      value: 125,
      observedAt: asOf,
      fetchedAt: asOf,
      qualityFlags: ["unvalidated"],
    },
  ];
  return {
    mode: "live",
    status: "available",
    message: "Mocked provider response",
    asOf,
    sourceId: "waqi",
    indexScale: "WAQI_AQI",
    stations,
    observations,
    summaries: REGIONS.map((r) =>
      summarizeRegion(r.id, stations, observations, asOf, {
        sourceId: "waqi",
        indexScale: "WAQI_AQI",
        observationKind: "observed",
      }),
    ),
    attribution: [{ name: "Mock originating agency", url: "https://example.org/agency" }],
    history: { available: false, reason: "No verified hourly history contract." },
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("provider-aware presentation with mocked data, not live verification", () => {
  it("uses WAQI bands, attribution and totals without synthetic history requests", () => {
    const snapshot = providerSnapshot();
    render(
      <>
        <AppHeader snapshot={snapshot} />
        <Overview initial={snapshot} />
      </>,
    );
    expect(screen.getByText("Mock originating agency")).toHaveAttribute(
      "href",
      "https://example.org/agency",
    );
    expect(screen.getAllByText("Unhealthy for sensitive groups").length).toBeGreaterThan(0);
    expect(screen.getByText("Mock provider location", { exact: false })).toBeVisible();
    expect(screen.queryByRole("slider", { name: "Observation time" })).not.toBeInTheDocument();
    expect(screen.getByText("Current observations only.", { exact: false })).toBeVisible();
    expect(screen.queryByText(/^IPU$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/DEMO DATA/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(nearestEligibleStation(snapshot, [101.5, 3])?.station.id).toBe(snapshot.stations[0].id);
  });
  it("keeps the banner unavailable when live configuration has no observations", () => {
    render(
      <AppHeader
        snapshot={{
          ...providerSnapshot(),
          status: "unavailable",
          message: "WAQI_API_TOKEN is missing.",
          stations: [],
          observations: [],
        }}
      />,
    );
    expect(screen.getByText("WAQI_API_TOKEN is missing.")).toBeVisible();
    expect(screen.queryByText("WAQI · AQI")).not.toBeInTheDocument();
    expect(screen.queryByText(/DEMO DATA/)).not.toBeInTheDocument();
  });
  it("disables the entire live chart rather than exposing simulated ranges or source labels", () => {
    render(
      <History
        stations={providerSnapshot().stations}
        initialStationId="waqi-test-location"
        asOf={providerSnapshot().asOf}
        disabled
      />,
    );
    expect(screen.getByText("Current observations only.", { exact: false })).toBeVisible();
    expect(screen.getByRole("link", { name: "History & coverage" })).toHaveAttribute(
      "href",
      "/about#history",
    );
    expect(screen.queryByRole("button", { name: "30d" })).not.toBeInTheDocument();
    expect(screen.queryByText(/IPU|simulated|demo-mys-ipu/i)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
