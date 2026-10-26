import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const commit = "9469f09592ced973a3448cf66b6100b741b64c0d";
const base = `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/${commit}/releaseData/gbOpen/MYS/ADM1/`;
const sourceName = "geoBoundaries-MYS-ADM1_simplified.geojson";
const metadataName = "geoBoundaries-MYS-ADM1-metaData.json";
const sourceDigest = "fb0f76f0f987c748b732ef02049113946db2dd5fc604130d4a0fbab4e74d4012";
const metadataDigest = "09204e14398a49a7703d98542545246639f61c33d4a4b4ee1f0d720047d0afcb";
const outputPath = new URL("public/data/malaysia-regions.geojson", root);
const evidencePath = new URL("docs/evidence/geography-validation.json", root);
const license = "https://opendatacommons.org/licenses/odbl/1-0/";
const regionRows = [
  ["MY-01", "johor", "Johor"],
  ["MY-02", "kedah", "Kedah"],
  ["MY-03", "kelantan", "Kelantan"],
  ["MY-04", "melaka", "Melaka"],
  ["MY-05", "negeri-sembilan", "Negeri Sembilan"],
  ["MY-06", "pahang", "Pahang"],
  ["MY-07", "pulau-pinang", "Pulau Pinang"],
  ["MY-08", "perak", "Perak"],
  ["MY-09", "perlis", "Perlis"],
  ["MY-10", "selangor", "Selangor"],
  ["MY-11", "terengganu", "Terengganu"],
  ["MY-12", "sabah", "Sabah"],
  ["MY-13", "sarawak", "Sarawak"],
  ["MY-14", "kuala-lumpur", "Kuala Lumpur"],
  ["MY-15", "labuan", "Labuan"],
  ["MY-16", "putrajaya", "Putrajaya"],
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const polygons = (geometry) =>
  geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
const flags = new Set(process.argv.slice(2));
assert(
  [...flags].every((flag) => ["--validate", "--offline"].includes(flag)),
  "Use --validate or --offline",
);

async function sourceFile(name, expectedDigest) {
  const path = new URL(`public/data/source/${name}`, root);
  if (!flags.has("--validate") && !flags.has("--offline")) {
    const response = await fetch(`${base}${name}`, { signal: AbortSignal.timeout(30_000) });
    assert(response.ok, `Download failed: ${response.status} ${name}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(digest(bytes), expectedDigest, `Unexpected upstream bytes: ${name}`);
    await writeFile(path, bytes);
  }
  const bytes = await readFile(path);
  assert.equal(digest(bytes), expectedDigest, `Source checksum mismatch: ${name}`);
  return JSON.parse(bytes.toString("utf8"));
}

function sameRing(a, b) {
  if (a.length !== b.length) return false;
  const points = a.slice(0, -1).map((point) => JSON.stringify(point));
  const other = b.slice(0, -1).map((point) => JSON.stringify(point));
  return other.some(
    (point, start) =>
      point === points[0] &&
      [1, -1].some((direction) =>
        points.every(
          (value, index) =>
            value === other[(start + direction * index + other.length) % other.length],
        ),
      ),
  );
}

async function main() {
  await mkdir(new URL("public/data/source/", root), { recursive: true });
  const source = await sourceFile(sourceName, sourceDigest);
  const metadata = await sourceFile(metadataName, metadataDigest);
  assert.equal(source.type, "FeatureCollection");
  assert.equal(source.features.length, 16);
  assert.equal(metadata.boundaryID, "MYS-ADM1-15666254");
  assert.equal(metadata.boundaryLicense, "Open Data Commons Open Database License 1.0");
  const features = regionRows.map(([iso, slug, name]) => {
    const matches = source.features.filter((feature) => feature.properties.shapeISO === iso);
    assert.equal(matches.length, 1, `Expected one feature for ${iso}`);
    const original = matches[0];
    return {
      type: "Feature",
      id: slug,
      properties: {
        regionId: slug,
        slug,
        name,
        shapeISO: iso,
        sourceName: original.properties.shapeName,
      },
      geometry: original.geometry,
    };
  });
  const output = {
    type: "FeatureCollection",
    name: "Malaysia states and federal territories",
    license,
    attribution: "© OpenStreetMap contributors; geoBoundaries / Wambacher. ODbL 1.0.",
    source: `${base}${sourceName}`,
    features,
  };
  const bytes = `${JSON.stringify(output)}\n`;
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const regions = features.map((feature) => {
    assert(
      ["Polygon", "MultiPolygon"].includes(feature.geometry.type),
      `Invalid geometry: ${feature.id}`,
    );
    const parts = polygons(feature.geometry);
    assert(parts.length > 0);
    let vertices = 0;
    for (const rings of parts) {
      assert(rings.length > 0);
      for (const ring of rings) {
        assert(ring.length >= 4, `Short ring: ${feature.id}`);
        assert.deepEqual(ring[0], ring.at(-1), `Open ring: ${feature.id}`);
        let area = 0;
        for (const [index, point] of ring.entries()) {
          assert.equal(point.length, 2);
          const [lon, lat] = point;
          assert(Number.isFinite(lon) && Number.isFinite(lat));
          assert(
            lon >= 99 && lon <= 120 && lat >= 0 && lat <= 8,
            `Coordinate order/range: ${feature.id}`,
          );
          bounds[0] = Math.min(bounds[0], lon);
          bounds[1] = Math.min(bounds[1], lat);
          bounds[2] = Math.max(bounds[2], lon);
          bounds[3] = Math.max(bounds[3], lat);
          if (index > 0) area += ring[index - 1][0] * lat - lon * ring[index - 1][1];
        }
        assert(Math.abs(area) > 1e-12, `Zero-area ring: ${feature.id}`);
        vertices += ring.length;
      }
    }
    return {
      regionId: feature.id,
      shapeISO: feature.properties.shapeISO,
      geometryType: feature.geometry.type,
      polygons: parts.length,
      holes: parts.reduce((sum, rings) => sum + rings.length - 1, 0),
      vertices,
    };
  });
  assert.deepEqual(bounds, [99.64049690000013, 0.853821, 119.26905670000008, 7.3628175]);
  const byId = Object.fromEntries(features.map((feature) => [feature.id, feature]));
  const selangor = polygons(byId.selangor.geometry);
  const holes = selangor.flatMap((rings) => rings.slice(1));
  assert.equal(selangor.length, 7);
  assert.equal(holes.length, 2);
  for (const territory of ["kuala-lumpur", "putrajaya"]) {
    const exterior = polygons(byId[territory].geometry)[0][0];
    assert(
      holes.some((hole) => sameRing(hole, exterior)),
      `Territory hole mismatch: ${territory}`,
    );
  }
  assert.equal(polygons(byId.labuan.geometry).length, 3);
  for (const feature of features) {
    const east = ["sabah", "sarawak", "labuan"].includes(feature.id);
    for (const rings of polygons(feature.geometry)) {
      assert(
        rings[0].every(([lon]) => (east ? lon > 109 : lon < 105)),
        `West/east separation: ${feature.id}`,
      );
    }
  }
  if (flags.has("--validate")) {
    assert.equal(
      await readFile(outputPath, "utf8"),
      bytes,
      "Normalized file differs from deterministic source transformation",
    );
  } else {
    await writeFile(outputPath, bytes);
  }
  const report = {
    status: "pass",
    invocation: `node scripts/prepare-geography.mjs${flags.size ? ` ${[...flags].join(" ")}` : ""}`,
    validatedAt: new Date().toISOString(),
    sourceCommit: commit,
    sourceSha256: sourceDigest,
    metadataSha256: metadataDigest,
    normalizedSha256: digest(bytes),
    featureCount: features.length,
    bounds,
    checks: {
      pinnedSourceAndMetadataChecksums: true,
      exactSixteenRegionMapping: true,
      finiteLongitudeLatitudeCoordinates: true,
      closedNonzeroRings: true,
      allSourceCoordinatesAndIslandsPreserved: true,
      selangorHolesMatchKualaLumpurAndPutrajaya: true,
      labuanThreePartsPreserved: true,
      peninsulaAndBorneoSeparation: true,
      deterministicOutput: true,
    },
    limitations: [
      "No general self-intersection, overlap, or topology-repair algorithm was run.",
      "Boundaries represent the source's 2017 vintage; this check does not establish current administrative accuracy.",
    ],
    regions,
  };
  await mkdir(new URL("docs/evidence/", root), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        status: report.status,
        featureCount: report.featureCount,
        normalizedSha256: report.normalizedSha256,
        artifact: fileURLToPath(evidencePath),
      },
      null,
      2,
    ),
  );
}

await main();
