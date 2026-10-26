// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@/lib/types";
import RootLayout from "@/app/layout";
import StationPage from "@/app/station/[stationId]/page";
import { getRequestSnapshot } from "@/server/request-snapshot";
import { AppHeader } from "./app-header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/station/waqi-saved",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/request-snapshot", () => ({ getRequestSnapshot: vi.fn() }));
vi.mock("./territory-workspace", () => ({
  TerritoryWorkspace: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./station-dashboard", () => ({ StationDashboard: () => null }));
const snapshot: Snapshot = {
  mode: "live",
  status: "unavailable",
  message: "Provider request timed out.",
  asOf: "2026-10-19T00:00:00Z",
  sourceId: "waqi",
  indexScale: "WAQI_AQI",
  stations: [],
  observations: [],
  summaries: [],
};
beforeEach(() => {
  localStorage.clear();
  vi.mocked(getRequestSnapshot).mockResolvedValue(snapshot);
});
afterEach(cleanup);

describe("JMY-007 layout and unavailable station integration", () => {
  it("renders BM footer from the actual root layout and follows EN switching", async () => {
    localStorage.setItem("jerebu-language", "bm");
    const layout = await RootLayout({ children: <main id="main" /> });
    render(layout.props.children.props.children);
    expect(document.documentElement).toHaveAttribute("lang", "ms");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Peneroka kualiti udara Malaysia");
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Data sempadan © penyumbang OpenStreetMap · ODbL",
    );
    expect(screen.getByRole("link", { name: "Data & Kredit" })).toHaveAttribute(
      "href",
      "/about#credits",
    );
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Malaysia air-quality explorer");
    expect(screen.getByRole("link", { name: "Data & Credits" })).toHaveAttribute(
      "href",
      "/about#credits",
    );
  });

  it.each(["unavailable", "partial"])(
    "translates the actual %s station route and retains source details",
    async (mode) => {
      const data: Snapshot =
        mode === "partial"
          ? {
              ...snapshot,
              status: "available",
              coverage: {
                discovered: 2,
                requested: 2,
                received: 1,
                omitted: 1,
                failed: 0,
                limited: false,
              },
            }
          : snapshot;
      vi.mocked(getRequestSnapshot).mockResolvedValue(data);
      localStorage.setItem("jerebu-language", "bm");
      const page = await StationPage({ params: Promise.resolve({ stationId: "waqi-saved" }) });
      render(
        <>
          <AppHeader snapshot={data} />
          {page}
        </>,
      );
      expect(document.documentElement).toHaveAttribute("lang", "ms");
      expect(
        screen.getByRole("heading", { name: "Pemerhatian stesen tidak tersedia" }),
      ).toBeVisible();
      expect(
        screen.getByText(
          "Lokasi yang diminta tidak tersedia dalam respons pembekal semasa. Tiada data sintetik digunakan sebagai gantian.",
        ),
      ).toBeVisible();
      expect(screen.getByText("Butiran pembekal:")).toBeVisible();
      expect(screen.getByText("Provider request timed out.")).toHaveAttribute("lang", "en");
      expect(screen.getByRole("link", { name: "Kembali ke Malaysia" })).toHaveAttribute(
        "href",
        "/",
      );
      fireEvent.click(screen.getByRole("button", { name: "EN" }));
      expect(
        screen.getByRole("heading", { name: "Station observations unavailable" }),
      ).toBeVisible();
      expect(screen.getByRole("link", { name: "Back to Malaysia" })).toHaveAttribute("href", "/");
    },
  );
});
