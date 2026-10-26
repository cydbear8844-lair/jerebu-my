// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clampPlaybackTime, useSnapshotPlayback } from "./playback";
import type { Snapshot } from "./types";

const initial: Snapshot = {
  mode: "demo",
  status: "available",
  message: "Demo",
  asOf: "2026-09-21T04:00:00.000Z",
  sourceId: "demo",
  indexScale: "MY_IPU",
  stations: [],
  observations: [],
  summaries: [],
};
const earlier = "2026-09-21T02:00:00.000Z";
const later = "2026-09-21T03:00:00.000Z";
const metadata = {
  start: "2026-08-22T04:00:00.000Z",
  end: initial.asOf,
  frames: [
    { at: earlier, freshCount: 0 },
    { at: later, freshCount: 5 },
  ],
};
const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      response(
        url.includes("timeline")
          ? metadata
          : { ...initial, asOf: new URL(url, "http://localhost").searchParams.get("at") },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("snapshot playback", () => {
  it("cancels queued and in-flight seeks without changing displayed time, with stable action identity", async () => {
    const { result } = renderHook(() => useSnapshotPlayback(initial));
    await flush();
    const cancel = result.current.cancelPending;
    act(() => result.current.seek(earlier));
    act(() => cancel());
    await flush(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.requestedAt).toBe(initial.asOf);
    act(() => result.current.seek(earlier));
    await flush(100);
    expect(result.current.snapshot.asOf).toBe(earlier);
    expect(result.current.cancelPending).toBe(cancel);
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    act(() => result.current.seek(later));
    await flush(100);
    const signal = fetchMock.mock.calls[2][1].signal as AbortSignal;
    act(() => cancel());
    expect(signal.aborted).toBe(true);
    expect(result.current.requestedAt).toBe(earlier);
    expect(result.current.busy).toBe(false);
    await act(async () => finish(response({ ...initial, asOf: later })));
    expect(result.current.snapshot.asOf).toBe(earlier);
    expect(result.current.requestedAt).toBe(earlier);
    expect(result.current.playing).toBe(false);
  });

  it.each([
    { mode: "live" },
    { sourceId: "other" },
    { indexScale: "US_AQI" },
    {
      observations: [
        { observedAt: earlier, fetchedAt: later, sourceId: "demo", indexScale: "MY_IPU" },
      ],
    },
    {
      observations: [
        {
          observedAt: earlier,
          fetchedAt: "2026-09-21T02:00:00",
          sourceId: "demo",
          indexScale: "MY_IPU",
        },
      ],
    },
    {
      observations: [
        { observedAt: earlier, fetchedAt: earlier, sourceId: "other", indexScale: "MY_IPU" },
      ],
    },
  ])("rejects incompatible or future-fetched payload %j", async (changes) => {
    const { result } = renderHook(() => useSnapshotPlayback(initial));
    await flush();
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(response({ ...initial, asOf: earlier, ...changes })),
    );
    act(() => result.current.seek(earlier));
    await flush(100);
    expect(result.current.snapshot).toEqual(initial);
    expect(result.current.error).toContain("could not load");
    expect(result.current.busy).toBe(false);
  });

  it("loads real availability, stays opt-in, and clamps future time", async () => {
    const { result } = renderHook(() => useSnapshotPlayback(initial));
    await flush(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.availability?.frames[0].freshCount).toBe(0);
    expect(result.current.playing).toBe(false);
    expect(clampPlaybackTime("2099-01-01", metadata.start, initial.asOf)).toBe(initial.asOf);
  });

  it("accepts matching-source observations fetched exactly at the selected time", async () => {
    const { result } = renderHook(() => useSnapshotPlayback(initial));
    await flush();
    const observation = {
      stationId: "demo-a",
      observedAt: earlier,
      fetchedAt: earlier,
      sourceId: "demo",
      indexScale: "MY_IPU",
      observationKind: "demo",
      value: 0,
      qualityFlags: [],
    };
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(response({ ...initial, asOf: earlier, observations: [observation] })),
    );
    act(() => result.current.seek(earlier));
    await flush(100);
    expect(result.current.snapshot.observations).toEqual([observation]);
    expect(result.current.snapshot.asOf).toBe(earlier);
    expect(result.current.error).toBe("");
  });

  it("debounces scrubbing and commits time with the successful snapshot", async () => {
    const { result } = renderHook(() => useSnapshotPlayback(initial));
    await flush();
    act(() => {
      result.current.seek(earlier);
      result.current.seek(later);
    });
    expect(result.current.snapshot.asOf).toBe(initial.asOf);
    expect(result.current.requestedAt).toBe(later);
    expect(result.current.busy).toBe(true);
    await flush(99);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await flush(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.snapshot.asOf).toBe(later);
    expect(result.current.busy).toBe(false);
  });

  it("aborts superseded fetch and ignores its late resolution", async () => {
    const { result } = renderHook(() => useSnapshotPlayback(initial));
    await flush();
    let resolveOld!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveOld = resolve;
        }),
    );
    act(() => result.current.seek(earlier));
    await flush(100);
    const signal = fetchMock.mock.calls[1][1].signal as AbortSignal;
    act(() => result.current.seek(later));
    expect(signal.aborted).toBe(true);
    await flush(100);
    await act(async () => resolveOld(response({ ...initial, asOf: earlier })));
    expect(result.current.snapshot.asOf).toBe(later);
    expect(result.current.busy).toBe(false);
  });

  it("retains committed time on error and rejects future observations", async () => {
    const { result } = renderHook(() => useSnapshotPlayback(initial));
    await flush();
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        response({ ...initial, asOf: earlier, observations: [{ observedAt: initial.asOf }] }),
      ),
    );
    act(() => result.current.seek(earlier));
    await flush(100);
    expect(result.current.snapshot).toEqual(initial);
    expect(result.current.requestedAt).toBe(earlier);
    expect(result.current.error).toContain("previous snapshot");
    expect(result.current.busy).toBe(false);
  });

  it("advances at 1x one hour per second and stops at the final frame", async () => {
    const { result } = renderHook(() => useSnapshotPlayback(initial));
    await flush();
    act(() => result.current.seek(earlier));
    await flush(100);
    act(() => result.current.togglePlay());
    await flush(999);
    expect(result.current.snapshot.asOf).toBe(earlier);
    await flush(2);
    expect(result.current.snapshot.asOf).toBe(later);
    await flush(1001);
    expect(result.current.snapshot.asOf).toBe(initial.asOf);
    expect(result.current.playing).toBe(false);
  });

  it("pauses on page hide and clears queued seek on unmount", async () => {
    const { result, unmount } = renderHook(() => useSnapshotPlayback(initial));
    await flush();
    act(() => result.current.seek(earlier));
    await flush(100);
    act(() => result.current.togglePlay());
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current.playing).toBe(false);
    act(() => result.current.seek(later));
    const count = fetchMock.mock.calls.length;
    unmount();
    await flush(5000);
    expect(fetchMock).toHaveBeenCalledTimes(count);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  it.each([
    [0.5, 2000],
    [2, 500],
  ])("advances at %sx after %sms", async (speed, interval) => {
    const { result } = renderHook(() => useSnapshotPlayback(initial));
    await flush();
    act(() => result.current.seek(earlier));
    await flush(100);
    act(() => {
      result.current.setSpeed(speed);
      result.current.togglePlay();
    });
    await flush(interval - 1);
    expect(result.current.snapshot.asOf).toBe(earlier);
    await flush(2);
    expect(result.current.snapshot.asOf).toBe(later);
  });

  it("restarts from range start at latest and latest cancels pending scrub", async () => {
    const { result } = renderHook(() => useSnapshotPlayback(initial));
    await flush();
    act(() => result.current.togglePlay());
    await flush(1);
    expect(result.current.snapshot.asOf).toBe(result.current.start);
    expect(result.current.playing).toBe(true);
    act(() => {
      result.current.seek(earlier);
      result.current.latest();
    });
    await flush(100);
    expect(result.current.snapshot.asOf).toBe(initial.asOf);
    expect(result.current.requestedAt).toBe(initial.asOf);
    expect(result.current.playing).toBe(false);
  });
});
