// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LocationActions } from "./location-actions";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("browser location preferences", () => {
  it("recovers malformed stored favourites and persists save/removal", () => {
    localStorage.setItem("jerebu-saved", "malformed JSON");
    render(<LocationActions id="selangor" />);
    fireEvent.click(screen.getByRole("button", { name: "Save location" }));
    expect(JSON.parse(localStorage.getItem("jerebu-saved")!)).toEqual(["selangor"]);
    expect(screen.getByRole("button", { name: "Remove saved location" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove saved location" }));
    expect(JSON.parse(localStorage.getItem("jerebu-saved")!)).toEqual([]);
  });

  it("uses persisted BM labels while ignoring non-string saved entries", () => {
    localStorage.setItem("jerebu-language", "bm");
    localStorage.setItem("jerebu-saved", JSON.stringify([null, 42, "labuan"]));
    render(<LocationActions id="labuan" />);
    fireEvent.click(screen.getByRole("button", { name: "Buang lokasi tersimpan" }));
    expect(localStorage.getItem("jerebu-saved")).toBe("[]");
    expect(screen.getByRole("button", { name: "Simpan lokasi" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
