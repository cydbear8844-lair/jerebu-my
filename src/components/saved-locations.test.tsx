// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot, Station } from "@/lib/types";
import { SavedLocations } from "./saved-locations";
import { LocationActions } from "./location-actions";
import { AppHeader } from "./app-header";

vi.mock("next/navigation", () => ({ usePathname: () => "/saved" }));
const station: Station = {
  id: "waqi-saved",
  name: "Test station",
  regionId: "selangor",
  coordinates: [101, 3],
};
const other: Station = { ...station, id: "demo-other", name: "Other mode station" };
const snapshot: Snapshot = {
  mode: "live",
  status: "unavailable",
  message: "Unavailable",
  asOf: "2026-10-19T00:00:00Z",
  sourceId: "waqi",
  indexScale: "WAQI_AQI",
  stations: [],
  observations: [],
  summaries: [],
};
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("JMY-005 saved IDs survive catalogue changes", () => {
  it("keeps a saved station visible through omission, reload, mode switch and restoration", () => {
    const action = render(<LocationActions id={station.id} />);
    fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    action.unmount();
    const page = render(<SavedLocations stations={[station]} />);
    expect(screen.getByRole("link", { name: /Test station/ })).toHaveAttribute(
      "href",
      "/station/waqi-saved",
    );
    page.rerender(<SavedLocations stations={[]} />);
    expect(screen.getByRole("link", { name: /waqi-saved/ })).toHaveTextContent(
      "Unavailable in the current station catalogue",
    );
    expect(screen.queryByText("Save a region or station to find it here.")).not.toBeInTheDocument();
    page.unmount();
    const reloaded = render(<SavedLocations stations={[other]} />);
    expect(screen.getByRole("button", { name: "Remove saved location: waqi-saved" })).toBeVisible();
    expect(screen.queryByText(/Other mode station/)).not.toBeInTheDocument();
    expect(localStorage.getItem("jerebu-saved")).toBe('["waqi-saved"]');
    reloaded.rerender(<SavedLocations stations={[station]} />);
    expect(screen.getByRole("link", { name: /Test station/ })).toBeVisible();
    expect(
      screen.queryByText(/Unavailable in the current station catalogue/),
    ).not.toBeInTheDocument();
  });

  it("removes an unresolved station and updates the header count and empty state together", () => {
    localStorage.setItem("jerebu-saved", '["waqi-saved"]');
    render(
      <>
        <AppHeader snapshot={snapshot} />
        <SavedLocations stations={[]} />
      </>,
    );
    const headerSaved = screen.getByRole("link", { name: /Saved.*01/ });
    expect(headerSaved).toBeVisible();
    expect(screen.queryByText("Save a region or station to find it here.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove saved location: waqi-saved" }));
    expect(localStorage.getItem("jerebu-saved")).toBe("[]");
    expect(screen.getByRole("link", { name: /Saved.*00/ })).toBeVisible();
    expect(screen.getByText("Save a region or station to find it here.")).toBeVisible();
  });

  it("preserves legacy region IDs and translates unresolved status/removal in BM", () => {
    localStorage.setItem("jerebu-language", "bm");
    localStorage.setItem("jerebu-saved", '["selangor","waqi-saved"]');
    render(<SavedLocations stations={[]} />);
    expect(screen.getByRole("link", { name: /Selangor/ })).toHaveAttribute(
      "href",
      "/region/selangor",
    );
    const missing = screen.getByRole("link", { name: /waqi-saved/ });
    expect(within(missing).getByText("Tiada dalam katalog stesen semasa")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Buang lokasi tersimpan: waqi-saved" }));
    expect(localStorage.getItem("jerebu-saved")).toBe('["selangor"]');
  });
});
