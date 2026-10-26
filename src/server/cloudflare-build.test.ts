import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";

const script = path.resolve("scripts/check-cloudflare-env.mjs");
const temporary: string[] = [];
function workspace() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "jerebu-cloudflare-"));
  temporary.push(directory);
  return directory;
}
function guard(cwd: string, artifact = false) {
  return spawnSync(process.execPath, [script, ...(artifact ? ["--artifact"] : [])], {
    cwd,
    encoding: "utf8",
  });
}
function artifact(directory: string, body: string) {
  const folder = path.join(directory, ".open-next/cloudflare");
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, "next-env.mjs"), body);
}
afterEach(() => {
  for (const directory of temporary.splice(0)) {
    expect(path.dirname(path.resolve(directory))).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(directory)).toMatch(/^jerebu-cloudflare-/);
    rmSync(directory, { recursive: true, force: true });
  }
});

it("allows public examples and local Worker variables without baking them into the artifact", () => {
  const directory = workspace();
  writeFileSync(path.join(directory, ".env.example"), "WAQI_API_TOKEN=\n");
  writeFileSync(path.join(directory, ".dev.vars"), "DATA_MODE=demo\n");
  expect(guard(directory).status).toBe(0);
});

it.each([
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.development",
  ".env.development.local",
  ".env.test",
  ".env.test.local",
])("rejects %s before the adapter runs, without printing its values", (filename) => {
  const directory = workspace();
  writeFileSync(path.join(directory, filename), "WAQI_API_TOKEN=private-test-value\n");
  const result = guard(directory);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(filename);
  expect(result.stderr).not.toContain("private-test-value");
});

it("accepts the adapter's empty production, development and test environment exports", () => {
  const directory = workspace();
  artifact(
    directory,
    ["production", "development", "test"].map((mode) => `export const ${mode} = {};\n`).join(""),
  );
  expect(guard(directory, true).status).toBe(0);
});

it("rejects embedded credentials even when the original env file has been removed", () => {
  const directory = workspace();
  artifact(directory, 'export const production = {"WAQI_API_TOKEN":"private-test-value"};\n');
  const result = guard(directory, true);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("embedded environment");
  expect(result.stderr).not.toContain("private-test-value");
});

it("fails closed when the artifact is missing", () => {
  const result = guard(workspace(), true);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("artifact missing");
});

it("fails closed if the adapter changes the environment-module format", () => {
  const directory = workspace();
  artifact(directory, "export default {};\n");
  expect(guard(directory, true).status).toBe(1);
});
