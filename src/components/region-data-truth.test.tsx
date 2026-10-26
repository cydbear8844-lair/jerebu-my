// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeRegion } from "@/lib/domain";
import { REGIONS } from "@/lib/regions";
import type { Snapshot } from "@/lib/types";
import { RegionDashboard } from "./region-dashboard";
import { AppHeader } from "./app-header";

vi.mock("next/navigation", () => ({ usePathname: () => "/region/selangor" }));

const region = REGIONS.find((r) => r.id === "selangor")!;
function snapshot(mode: "demo" | "live" = "live"): Snapshot {
  const asOf = "2026-10-19T04:00:00.000Z";
  const selection =
    mode === "live"
      ? { sourceId: "waqi", indexScale: "WAQI_AQI", observationKind: "observed" }
      : { sourceId: "demo-mys-ipu", indexScale: "MY_IPU", observationKind: "demo" };
  const stations: Snapshot["stations"] = ["a", "b"].map((id) => ({
    id,
    name: `Station ${id.toUpperCase()}`,
    regionId: region.id,
    coordinates: [101.5, 3],
  }));
  const observations: Snapshot["observations"] = stations.map((station, i) => ({
    stationId: station.id,
    ...selection,
    value: i === 0 ? 200 : 20,
    observedAt: i === 0 ? "2026-10-19T02:00:00.000Z" : asOf,
    fetchedAt: asOf,
    qualityFlags: [],
  }));
  return {
    mode,
    status: "available",
    message: "Local fixture",
    asOf,
    ...selection,
    stations,
    observations,
    summaries: [summarizeRegion(region.id, stations, observations, asOf, selection)],
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ points: [] }))),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("regional observation and source truth", () => {
  it("renders Station A's maximum at 10:00 MYT while Station B is observed at 12:00 MYT", () => {
    const { container } = render(<RegionDashboard region={region} snapshot={snapshot()} />);
    const metric = within(container.querySelector(".regional-metric") as HTMLElement);
    expect(metric.getByRole("link", { name: "Station A" })).toHaveAttribute("href", "/station/a");
    expect(metric.getByText("200", { selector: ".reading" })).toBeVisible();
    expect(metric.getByText("Observed").nextElementSibling).toHaveTextContent("19 Oct 2026, 10:00");
    expect(metric.getByText("Observed").nextElementSibling).not.toHaveTextContent("12:00");
  });
  it.each([
    ["en", "Snapshot", "Data & sources", "Demo snapshot"],
    ["bm", "Masa rujukan", "Data & sumber", "Masa rujukan demo"],
  ])(
    "uses neutral live labels in the header and Sources in %s",
    (lang, label, sources, demoLabel) => {
      localStorage.setItem("jerebu-language", lang);
      const { container } = render(<RegionDashboard region={region} snapshot={snapshot()} />);
      expect(container.querySelector(".location-heading")).toHaveTextContent(`${label}:`);
      expect(container).not.toHaveTextContent(demoLabel);
      fireEvent.click(screen.getByRole("button", { name: sources }));
      expect(screen.getByText(label, { selector: "dt" })).toBeVisible();
      expect(container).not.toHaveTextContent(demoLabel);
    },
  );
  it.each([
    ["en", "Demo snapshot", "Data & sources", "DEMO DATA — NOT CURRENT READINGS"],
    ["bm", "Masa rujukan demo", "Data & sumber", "DATA DEMO"],
  ])("retains demo clock wording and disclosure in %s", (lang, label, sources, disclosure) => {
    localStorage.setItem("jerebu-language", lang);
    const value = { ...snapshot("demo"), stations: [] };
    const { container } = render(
      <>
        <AppHeader snapshot={value} />
        <RegionDashboard region={region} snapshot={value} />
      </>,
    );
    expect(container.querySelector(".location-heading")).toHaveTextContent(`${label}:`);
    expect(container).toHaveTextContent(disclosure);
    fireEvent.click(screen.getByRole("button", { name: sources }));
    expect(screen.getByText(label, { selector: "dt" })).toBeVisible();
    expect(container).toHaveTextContent(disclosure);
  });
  it("renders linkless agency credit as text and safe credit as a link", () => {
    render(
      <AppHeader
        snapshot={{
          ...snapshot(),
          attribution: [
            { name: "Text-only agency" },
            { name: "Linked agency", url: "https://example.org/" },
          ],
        }}
      />,
    );
    expect(screen.getByText("Text-only agency")).toBeVisible();
    expect(screen.getByText("Text-only agency").closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: "Linked agency" })).toHaveAttribute(
      "href",
      "https://example.org/",
    );
  });
});
