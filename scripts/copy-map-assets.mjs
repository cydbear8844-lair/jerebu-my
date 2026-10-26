import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
await mkdir(path.join(root, "public/vendor"), { recursive: true });
for (const filename of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(
    path.join(root, "node_modules/maplibre-gl/dist", filename),
    path.join(root, "public/vendor", filename),
  );
}
console.log("Copied matching MapLibre worker and shared modules for local-only runtime.");
await mkdir(path.join(root, "docs/licenses"), { recursive: true });
for (const [source, target] of [
  ["maplibre-gl/LICENSE.txt", "maplibre-BSD.txt"],
  ["@fontsource/barlow-condensed/LICENSE", "barlow-condensed-OFL.txt"],
  ["@fontsource/ibm-plex-sans/LICENSE", "ibm-plex-sans-OFL.txt"],
  ["lucide-react/LICENSE", "lucide-LICENSE.txt"],
]) {
  await copyFile(path.join(root, "node_modules", source), path.join(root, "docs/licenses", target));
}
await mkdir(path.join(root, "public/licenses"), { recursive: true });
for (const filename of [
  "mapcn-MIT.txt",
  "maplibre-BSD.txt",
  "barlow-condensed-OFL.txt",
  "ibm-plex-sans-OFL.txt",
  "lucide-LICENSE.txt",
]) {
  await copyFile(
    path.join(root, "docs/licenses", filename),
    path.join(root, "public/licenses", filename),
  );
}
console.log("Retained map and font license notices.");
