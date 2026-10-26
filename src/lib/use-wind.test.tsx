// @vitest-environment jsdom
import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDemoWindField } from "./wind";
import { useWindField, type WindPreferences } from "./use-wind";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const preferences: WindPreferences = {
  mode: "wind",
  source: "demo",
  pattern: "varied",
  paused: false,
  opacity: 0.8,
  shading: false,
  quality: "balanced",
};
const first = "2026-09-21T03:00:00.000Z",
  second = "2026-09-21T04:00:00.000Z";
it("ignores late responses after rapid time changes and hides the previous field immediately", async () => {
  const replies: ((value: Response) => void)[] = [];
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => replies.push(resolve)));
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(({ at }) => useWindField(at, preferences), {
    initialProps: { at: first },
  });
  rerender({ at: second });
  expect(result.current.field).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => {
    replies[1](Response.json(createDemoWindField(second)));
  });
  await waitFor(() => expect(result.current.field?.validAt).toBe(second));
  await act(async () => {
    replies[0](Response.json(createDemoWindField(first)));
  });
  expect(result.current.field?.validAt).toBe(second);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("shows real-source failure without selecting a synthetic field", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "Provider offline" }, { status: 503 })),
  );
  const { result } = renderHook(() =>
    useWindField(second, { ...preferences, source: "open-meteo" }),
  );
  await waitFor(() => expect(result.current.error).toBe("Provider offline"));
  expect(result.current.field).toBeNull();
  expect(result.current.loading).toBe(false);
});
it("does not request disabled or invalid time slices", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(
    ({ at, mode }: { at: string; mode: WindPreferences["mode"] }) =>
      useWindField(at, { ...preferences, mode }),
    { initialProps: { at: second, mode: "air" } },
  );
  expect(result.current.loading).toBe(false);
  rerender({ at: "not-a-date", mode: "wind" });
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBe("Invalid wind time.");
  expect(fetcher).not.toHaveBeenCalled();
});
