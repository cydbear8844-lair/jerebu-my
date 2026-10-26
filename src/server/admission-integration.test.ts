import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { loadSnapshot } from "./data";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("keeps missing/invalid keys outside the budget, limits configured bundles, and reopens after expiry", async () => {
  vi.stubEnv("DATA_MODE", "live");
  const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => new Response(JSON.stringify({ status: "ok", data: [] })));
  for (const token of ["", "demo", "bad key", "", "", "", ""]) {
    vi.stubEnv("WAQI_API_TOKEN", token);
    expect((await loadSnapshot()).observations).toEqual([]);
  }
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv("WAQI_API_TOKEN", "test-key");
  for (let i = 0; i < 6; i++) await loadSnapshot();
  expect(fetcher).toHaveBeenCalledTimes(6);
  const limited = await loadSnapshot();
  expect(limited).toMatchObject({
    mode: "live",
    sourceId: "waqi",
    status: "unavailable",
    stations: [],
    observations: [],
  });
  expect(limited.message).toContain("budget");
  expect(fetcher).toHaveBeenCalledTimes(6);
  clock.mockReturnValue(159_999);
  await loadSnapshot();
  expect(fetcher).toHaveBeenCalledTimes(6);
  clock.mockReturnValue(160_000);
  await loadSnapshot();
  expect(fetcher).toHaveBeenCalledTimes(7);
});
