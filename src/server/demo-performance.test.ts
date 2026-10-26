import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  DEMO_CLOCK,
  DEMO_START,
  DEMO_STATIONS,
  fixtureSeries,
  fixtureSnapshot,
  HOUR_MS,
} from "../lib/fixtures";
import { latestObservations, observationStatus } from "../lib/domain";

const series = DEMO_STATIONS.map(fixtureSeries);

it("prepares and verifies every fixed demo timeline frame against the full-series policy", () => {
  const cursors = series.map(() => -1);
  const frames: { at: string; freshCount: number }[] = [];
  for (let time = Date.parse(DEMO_START); time <= Date.parse(DEMO_CLOCK); time += HOUR_MS) {
    const at = new Date(time).toISOString();
    let freshCount = 0;
    series.forEach((observations, index) => {
      while (
        cursors[index] + 1 < observations.length &&
        Date.parse(observations[cursors[index] + 1].fetchedAt) <= time
      )
        cursors[index]++;
      if (observationStatus(observations[cursors[index]], at) === "fresh") freshCount++;
    });
    frames.push({ at, freshCount });
  }
  const expected = { start: DEMO_START, end: DEMO_CLOCK, frames };
  const filename = path.resolve("src/lib/demo-timeline.json");
  if (process.env.JEREBU_GENERATE_DEMO_TIMELINE === "1")
    writeFileSync(filename, JSON.stringify(expected, null, 2) + "\n");
  expect(JSON.parse(readFileSync(filename, "utf8"))).toEqual(expected);
});

it("selects the same observations as the full archive at publication, gap and stale boundaries", () => {
  const archive = series.flat();
  const times = [DEMO_START, DEMO_CLOCK];
  for (const hour of [0, 1, 24, 37, 350, 715, 716, 717, 719]) {
    for (const offset of [0, 299_999, 300_000, HOUR_MS - 1])
      times.push(new Date(Date.parse(DEMO_START) + hour * HOUR_MS + offset).toISOString());
  }
  for (const at of times)
    expect(latestObservations(fixtureSnapshot(at), at)).toEqual(latestObservations(archive, at));
});
