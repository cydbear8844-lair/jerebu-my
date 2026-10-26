import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection, Geometry } from "geojson";

let cached: FeatureCollection<Geometry> | undefined;

export async function loadGeography(signal: AbortSignal): Promise<FeatureCollection<Geometry>> {
  signal.throwIfAborted();
  if (cached) return cached;
  let assets: ReturnType<typeof getCloudflareContext>["env"]["ASSETS"];
  try {
    assets = getCloudflareContext().env.ASSETS;
  } catch {
    // Ordinary Node development has no Cloudflare request context.
  }
  let geography: FeatureCollection<Geometry>;
  if (assets) {
    const response = await assets.fetch("https://assets.invalid/data/malaysia-regions.geojson", {
      signal,
    });
    if (!response.ok) throw new Error("Boundary asset unavailable");
    geography = await response.json();
  } else {
    geography = JSON.parse(
      await readFile(path.join(process.cwd(), "public/data/malaysia-regions.geojson"), {
        encoding: "utf8",
        signal,
      }),
    );
  }
  signal.throwIfAborted();
  cached = geography;
  return geography;
}
