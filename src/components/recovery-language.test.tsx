// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotFound from "@/app/not-found";
import ErrorPage from "@/app/error";
import Loading from "@/app/loading";
import { AppHeader } from "./app-header";
import type { Snapshot } from "@/lib/types";

vi.mock("next/navigation", () => ({ usePathname: () => "/unknown" }));
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

describe("JMY-007 recovery language", () => {
  it("hydrates persisted BM for unknown routes and follows a switch back to English", () => {
    localStorage.setItem("jerebu-language", "bm");
    render(
      <>
        <AppHeader snapshot={snapshot} />
        <NotFound />
      </>,
    );
    expect(document.documentElement).toHaveAttribute("lang", "ms");
    expect(screen.getByRole("heading", { name: "Lokasi itu tiada pada peta ini." })).toBeVisible();
    expect(screen.getByText("404 / LOKASI TIDAK DITEMUI")).toBeVisible();
    expect(
      screen.getByText(
        "Pilih salah satu daripada 16 wilayah Malaysia atau kembali ke gambaran keseluruhan.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Kembali ke Malaysia" })).toHaveAttribute("href", "/");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(
      screen.getByRole("heading", { name: "That location is not on this map." }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Malaysia" })).toHaveAttribute("href", "/");
  });

  it("translates the error explanation and preserves retry and return actions", () => {
    localStorage.setItem("jerebu-language", "bm");
    const reset = vi.fn();
    const retry = vi.fn();
    render(
      <>
        <AppHeader snapshot={snapshot} />
        <ErrorPage {...{ reset, retry }} />
      </>,
    );
    expect(
      screen.getByRole("heading", { name: "Papan pemuka tidak dapat dimuatkan." }),
    ).toBeVisible();
    expect(
      screen.getByText("Semak sambungan anda dan cuba lagi. Tiada bacaan gantian dimasukkan."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cuba lagi" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Kembali ke Malaysia" })).toHaveAttribute("href", "/");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(2);
    expect(reset).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "The dashboard could not load." })).toBeVisible();
  });

  it("translates the loading status and restores English on preference changes", () => {
    localStorage.setItem("jerebu-language", "bm");
    render(
      <>
        <AppHeader snapshot={snapshot} />
        <Loading />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Memuatkan papan pemuka…" })).toBeVisible();
    expect(screen.getByText("Menyediakan pemerhatian wilayah dan geografi.")).toBeVisible();
    expect(
      screen.getByText("Menyediakan pemerhatian wilayah dan geografi.").closest("main"),
    ).toHaveAttribute("role", "status");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("heading", { name: "Loading dashboard…" })).toBeVisible();
  });
});
