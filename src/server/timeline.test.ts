import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getTimeline, getSnapshot } from "./data";
import { GET } from "../app/api/overview/route";

afterEach(() => vi.unstubAllEnvs());
describe("timeline availability metadata", () => {
  it("matches eligible snapshot coverage, including the unavailable first frame", () => {
    vi.stubEnv("DATA_MODE", "demo");
    const timeline = getTimeline();
    expect(timeline.frames).toHaveLength(721);
    expect(timeline.frames[0].freshCount).toBe(0);
    for (const index of [0, 1, 24, 350, 719, 720]) {
      const frame = timeline.frames[index];
      const snapshot = getSnapshot(frame.at, "demo");
      expect(frame.freshCount).toBe(snapshot.summaries.reduce((sum, s) => sum + s.freshCount, 0));
    }
  });
  it("returns no-store metadata and refuses synthetic availability in live mode", async () => {
    vi.stubEnv("DATA_MODE", "demo");
    const response = await GET(new Request("http://localhost/api/overview?timeline=1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    vi.stubEnv("DATA_MODE", "live");
    const live = await GET(new Request("http://localhost/api/overview?timeline=1"));
    expect(live.status).toBe(503);
    expect(await live.json()).not.toHaveProperty("frames");
  });
});
