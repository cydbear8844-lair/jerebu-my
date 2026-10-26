// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegionInformation } from "./region-information";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("retained region panel", () => {
  it("keeps outgoing content inert until its own exit animation completes", () => {
    const { rerender, container } = render(
      <RegionInformation regionId="selangor">
        <h1>Selangor</h1>
      </RegionInformation>,
    );
    rerender(
      <RegionInformation>
        <span>unused</span>
      </RegionInformation>,
    );
    expect(screen.getByText("Selangor")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("inert");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    fireEvent.animationEnd(container.firstElementChild!);
    expect(screen.queryByText("Selangor")).not.toBeInTheDocument();
  });
  it("honours a newer region while an older exit is pending", () => {
    const { rerender } = render(
      <RegionInformation regionId="selangor">
        <h1>Selangor</h1>
      </RegionInformation>,
    );
    rerender(<RegionInformation>{null}</RegionInformation>);
    rerender(
      <RegionInformation regionId="sabah">
        <h1>Sabah</h1>
      </RegionInformation>,
    );
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("heading")).toHaveTextContent("Sabah");
    expect(screen.queryByText("Selangor")).not.toBeInTheDocument();
  });
  it("removes outgoing content immediately for reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { rerender } = render(
      <RegionInformation regionId="labuan">
        <h1>Labuan</h1>
      </RegionInformation>,
    );
    rerender(<RegionInformation>{null}</RegionInformation>);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.queryByText("Labuan")).not.toBeInTheDocument();
  });
});
