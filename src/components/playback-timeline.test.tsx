// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackTimeline } from "./playback-timeline";
import type { SnapshotPlayback } from "@/lib/playback";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
function playback(): SnapshotPlayback {
  const end = "2026-09-21T04:00:00.000Z";
  const start = "2026-09-20T04:00:00.000Z";
  return {
    snapshot: {
      mode: "demo",
      status: "available",
      message: "Demo",
      asOf: end,
      sourceId: "demo",
      indexScale: "MY_IPU",
      observations: [],
      stations: [],
      summaries: [],
    },
    requestedAt: end,
    busy: false,
    error: "",
    playing: false,
    speed: 1,
    rangeHours: 24,
    start,
    end,
    availability: {
      start,
      end,
      frames: [
        { at: start, freshCount: 4 },
        { at: end, freshCount: 0 },
      ],
    },
    availabilityError: "",
    setRangeHours: vi.fn(),
    seek: vi.fn(),
    refresh: vi.fn(),
    latest: vi.fn(),
    pause: vi.fn(),
    cancelPending: vi.fn(),
    togglePlay: vi.fn(),
    setSpeed: vi.fn(),
  };
}

describe("timeline controls", () => {
  it("exposes native timestamp range and renders real availability gaps", () => {
    const p = playback();
    const { container } = render(<PlaybackTimeline playback={p} />);
    const slider = screen.getByRole("slider", { name: "Observation time" });
    expect(slider).toHaveAttribute("min", String(Date.parse(p.start)));
    expect(slider).toHaveAttribute("max", String(Date.parse(p.end)));
    expect(slider).toHaveAttribute("step", "3600000");
    expect(container.querySelectorAll(".playback-availability .available")).toHaveLength(1);
    expect(container.querySelectorAll(".playback-availability .gap")).toHaveLength(24);
    fireEvent.change(slider, { target: { value: Date.parse(p.start) } });
    expect(p.seek).toHaveBeenCalledWith(p.start);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(p.pause).toHaveBeenCalled();
  });

  it("wires play, step, speed, range and latest controls", () => {
    const p = playback();
    p.snapshot.asOf = p.start;
    render(<PlaybackTimeline playback={p} />);
    fireEvent.click(screen.getByRole("button", { name: "Play hourly observations" }));
    expect(p.togglePlay).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Previous hour" }));
    expect(p.seek).toHaveBeenCalledWith("2026-09-21T03:00:00.000Z");
    fireEvent.change(screen.getByRole("combobox", { name: "Playback speed" }), {
      target: { value: "2" },
    });
    expect(p.setSpeed).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "30d" }));
    expect(p.setRangeHours).toHaveBeenCalledWith(720);
    fireEvent.click(screen.getByRole("button", { name: "Latest available" }));
    expect(p.latest).toHaveBeenCalledOnce();
  });

  it("labels loading time separately from displayed time and shows failures", () => {
    const p = playback();
    p.requestedAt = p.start;
    p.busy = true;
    const { rerender } = render(<PlaybackTimeline playback={p} />);
    expect(screen.getByRole("status")).toHaveTextContent("Previous snapshot remains displayed");
    expect(screen.getByText(/Displayed:/)).toHaveTextContent("21 Sept");
    p.busy = false;
    p.error = "This frame could not load. The previous snapshot remains displayed.";
    rerender(<PlaybackTimeline playback={p} />);
    expect(screen.getByRole("status")).toHaveTextContent("This frame could not load");
  });

  it("refreshes the selected historical snapshot with pending and success feedback", () => {
    const p = playback();
    p.snapshot = { ...p.snapshot, asOf: p.start };
    p.requestedAt = p.start;
    const { rerender } = render(<PlaybackTimeline playback={p} />);
    expect(screen.getByText("DEMO / Historical")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Refresh observations" }));
    expect(p.refresh).toHaveBeenCalledOnce();
    expect(p.latest).not.toHaveBeenCalled();
    p.busy = true;
    rerender(<PlaybackTimeline playback={p} />);
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
    p.busy = false;
    p.snapshot = { ...p.snapshot };
    rerender(<PlaybackTimeline playback={p} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Observations refreshed. Selected time retained.",
    );
  });

  it("localizes timeline controls using the saved BM preference", () => {
    localStorage.setItem("jerebu-language", "bm");
    render(<PlaybackTimeline playback={playback()} />);
    expect(screen.getByRole("slider", { name: "Masa pemerhatian" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Muat semula pemerhatian" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Jam sebelumnya" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Kelajuan main balik" })).toBeVisible();
  });
});
