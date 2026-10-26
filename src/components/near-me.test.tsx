// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { Snapshot } from "@/lib/types";
import { useNearMe, NearMeCard, NearMeMapEffects, NearMeButton } from "./near-me";

const mockUseMap = vi.hoisted(() => vi.fn());
vi.mock("./ui/map", () => ({
  useMap: mockUseMap,
  MapMarker: ({ children }: { children: React.ReactNode }) => children,
  MarkerContent: ({ children }: { children: React.ReactNode }) => children,
}));
const time = "2026-09-21T04:00:00.000Z";
const snapshot: Snapshot = {
  mode: "demo",
  status: "available",
  message: "demo",
  asOf: time,
  sourceId: "demo-mys-ipu",
  indexScale: "MY_IPU",
  summaries: [],
  stations: [{ id: "a", regionId: "selangor", name: "Demo A", coordinates: [101.1, 3] }],
  observations: [
    {
      stationId: "a",
      sourceId: "demo-mys-ipu",
      indexScale: "MY_IPU",
      observationKind: "demo",
      observedAt: time,
      fetchedAt: time,
      value: 0,
      qualityFlags: [],
    },
  ],
};
const geo = {
  type: "FeatureCollection",
  features: [
    {
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [100, 0],
            [110, 0],
            [110, 10],
            [100, 10],
            [100, 0],
          ],
        ],
      },
    },
  ],
};
let callbacks: { success: PositionCallback; error: PositionErrorCallback }[];
const position = (longitude = 101): GeolocationPosition =>
  ({
    coords: {
      longitude,
      latitude: 3,
      accuracy: 20,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: 1,
    toJSON: () => ({}),
  }) as GeolocationPosition;

beforeEach(() => {
  localStorage.clear();
  callbacks = [];
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: vi.fn((success, error) => callbacks.push({ success, error })) },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => geo })),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  mockUseMap.mockReturnValue({ map: null, isLoaded: false });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Near Me location intent", () => {
  it("requests only on click intent, suppresses duplicate requests, and ignores cancelled success", async () => {
    const { result } = renderHook(() => useNearMe(snapshot));
    expect(callbacks).toHaveLength(0);
    act(() => {
      result.current.locate();
      result.current.locate();
    });
    expect(callbacks).toHaveLength(1);
    act(() => result.current.cancel());
    await act(async () => callbacks[0].success(position()));
    expect(result.current.state.phase).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("ignores an old failure after a newer successful intent", async () => {
    const { result } = renderHook(() => useNearMe(snapshot));
    act(() => result.current.locate());
    act(() => {
      result.current.cancel();
      result.current.locate();
    });
    await act(async () => callbacks[1].success(position()));
    await waitFor(() => expect(result.current.state.phase).toBe("ping"));
    act(() => callbacks[0].error({ code: 1 } as GeolocationPositionError));
    expect(result.current.state.nearest?.station.id).toBe("a");
    expect(result.current.state.phase).toBe("ping");
  });
  it.each([
    [1, "denied"],
    [2, "could not be determined"],
    [3, "timed out"],
  ])("explains browser error %s without location", (code, message) => {
    const { result } = renderHook(() => useNearMe(snapshot));
    act(() => result.current.locate());
    act(() => callbacks[0].error({ code } as GeolocationPositionError));
    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.message).toContain(message);
    expect(result.current.state.position).toBeUndefined();
  });
  it("retains true outside coordinates without choosing a station or flight", async () => {
    const { result } = renderHook(() => useNearMe(snapshot));
    act(() => result.current.locate());
    await act(async () => callbacks[0].success(position(-74)));
    expect(result.current.state.position?.longitude).toBe(-74);
    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.nearest).toBeUndefined();
    expect(result.current.state.message).toContain("outside");
  });
  it("provides a no-eligible result at the selected snapshot without falling back", async () => {
    const { result } = renderHook(() => useNearMe({ ...snapshot, observations: [] }));
    act(() => result.current.locate());
    await act(async () => callbacks[0].success(position()));
    expect(result.current.state.message).toContain("No station");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("labels zero demo values, distance, freshness and station detail link honestly", async () => {
    const { result } = renderHook(() => useNearMe(snapshot));
    act(() => result.current.locate());
    await act(async () => callbacks[0].success(position()));
    act(() => result.current.transition(result.current.state.intent, "settled"));
    render(<NearMeCard controller={result.current} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText(/Fictional demo station/)).toBeInTheDocument();
    expect(screen.getByText(/Fresh at selected time/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View station" })).toHaveAttribute(
      "href",
      "/station/a",
    );
  });
  it("reveals station details only when the map settles", async () => {
    const { result } = renderHook(() => useNearMe(snapshot));
    act(() => result.current.locate());
    await act(async () => callbacks[0].success(position()));
    const { rerender } = render(<NearMeCard controller={result.current} />);
    expect(screen.queryByRole("link", { name: "View station" })).not.toBeInTheDocument();
    expect(screen.getByText(/Location found/)).toBeVisible();
    act(() => result.current.transition(result.current.state.intent, "flight"));
    rerender(<NearMeCard controller={result.current} />);
    expect(screen.getByText(/Moving to/)).toBeVisible();
    expect(screen.queryByRole("link", { name: "View station" })).not.toBeInTheDocument();
    act(() => result.current.transition(result.current.state.intent, "settled"));
    rerender(<NearMeCard controller={result.current} />);
    expect(screen.getByRole("link", { name: "View station" })).toBeInTheDocument();
  });
  it("preserves the selected Bahasa Malaysia button language", () => {
    localStorage.setItem("jerebu-language", "bm");
    const { result } = renderHook(() => useNearMe(snapshot));
    const { rerender } = render(<NearMeButton controller={result.current} />);
    expect(screen.getByRole("button", { name: "Berdekatan saya" })).toBeInTheDocument();
    act(() => result.current.locate());
    rerender(<NearMeButton controller={result.current} />);
    expect(screen.getByRole("button", { name: "Mencari lokasi…" })).toBeDisabled();
  });
  it("translates result details and permission errors in Bahasa Malaysia", async () => {
    localStorage.setItem("jerebu-language", "bm");
    const { result } = renderHook(() => useNearMe(snapshot));
    act(() => result.current.locate());
    await act(async () => callbacks[0].success(position()));
    act(() => result.current.transition(result.current.state.intent, "settled"));
    const { rerender } = render(<NearMeCard controller={result.current} />);
    expect(screen.getByRole("link", { name: "Lihat stesen" })).toBeInTheDocument();
    expect(screen.getByText(/Stesen dan bacaan demo rekaan/)).toBeInTheDocument();
    expect(screen.getByText(/Terkini pada masa dipilih/)).toBeInTheDocument();
    act(() => result.current.locate());
    act(() => callbacks[1].error({ code: 1 } as GeolocationPositionError));
    rerender(<NearMeCard controller={result.current} />);
    expect(screen.getByText(/Kebenaran lokasi ditolak/)).toBeInTheDocument();
    expect(screen.queryByText(/Location permission denied/)).not.toBeInTheDocument();
  });
  it("ignores boundary responses after unmount", async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      ),
    );
    const { result, unmount } = renderHook(() => useNearMe(snapshot));
    act(() => result.current.locate());
    act(() => {
      callbacks[0].success(position());
    });
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve({ ok: true, json: async () => geo }));
  });
  it("settles to a static result when no map effects are available", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNearMe(snapshot));
    act(() => result.current.locate());
    await act(async () => callbacks[0].success(position()));
    expect(result.current.state.phase).toBe("ping");
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.state.phase).toBe("settled");
    expect(result.current.state.nearest?.station.id).toBe("a");
  });
});

describe("Near Me camera lifecycle", () => {
  function setup(reduced = false) {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 1000 });
    const events = new Map<string, () => void>();
    let moving = false;
    const map = {
      getContainer: () => container,
      on: vi.fn((event, callback) => events.set(event, callback)),
      off: vi.fn((event) => events.delete(event)),
      fitBounds: vi.fn(() => {
        moving = !reduced;
      }),
      isMoving: () => moving,
      stop: vi.fn(() => {
        moving = false;
        events.get("moveend")?.();
      }),
    };
    mockUseMap.mockReturnValue({ map, isLoaded: true });
    const transition = vi.fn();
    const controller = {
      state: {
        phase: "ping" as const,
        intent: 1,
        position: { longitude: 101, latitude: 3, accuracy: 20 },
        nearest: {
          station: snapshot.stations[0],
          observation: snapshot.observations[0],
          distanceKm: 11,
        },
      },
      transition,
      stopMotion: { current: null as (() => void) | null },
      locate: vi.fn(),
      cancel: vi.fn(),
      dismiss: vi.fn(),
    };
    const rendered = render(<NearMeMapEffects controller={controller} />);
    return { ...rendered, map, events, container, transition, controller };
  }
  it("starts with an anchored ping, flies after 200ms and settles on moveend", () => {
    const { map, events, transition, unmount } = setup();
    expect(screen.getByRole("img", { name: "Your approximate location" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(199));
    expect(map.fitBounds).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(map.fitBounds).toHaveBeenCalledOnce();
    expect(transition).toHaveBeenLastCalledWith(1, "flight");
    act(() => vi.advanceTimersByTime(1000));
    expect(transition).not.toHaveBeenCalledWith(1, "settled");
    act(() => events.get("moveend")?.());
    expect(transition).toHaveBeenLastCalledWith(1, "settled");
    unmount();
    expect(events.size).toBe(0);
  });
  it("stops and settles a camera if moveend never arrives within the bounded safeguard", () => {
    const { map, transition, events } = setup();
    act(() => vi.advanceTimersByTime(200));
    expect(transition).not.toHaveBeenCalledWith(1, "settled");
    act(() => vi.advanceTimersByTime(1501));
    expect(map.stop).toHaveBeenCalledOnce();
    expect(transition.mock.calls.filter((call) => call[1] === "settled")).toHaveLength(1);
    expect(events.size).toBe(0);
  });
  it("cancels delayed travel on manual interaction", () => {
    const { map, container, transition } = setup();
    act(() => container.dispatchEvent(new Event("pointerdown")));
    act(() => vi.advanceTimersByTime(2000));
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(transition).toHaveBeenLastCalledWith(1, "settled");
  });
  it("settles reduced motion without waiting for an event that may never occur", () => {
    const { map, transition } = setup(true);
    act(() => vi.advanceTimersByTime(1));
    expect(map.fitBounds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: 0, bearing: 0 }),
    );
    expect(transition).toHaveBeenLastCalledWith(1, "settled");
  });
  it("invalidates the pending location intent on a manual gesture", () => {
    const { controller, container, rerender, map } = setup();
    rerender(
      <NearMeMapEffects controller={{ ...controller, state: { phase: "locating", intent: 2 } }} />,
    );
    act(() => container.dispatchEvent(new Event("wheel")));
    expect(controller.cancel).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(2000));
    expect(map.fitBounds).not.toHaveBeenCalled();
  });
});
