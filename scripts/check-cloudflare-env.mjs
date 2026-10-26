import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const modes = ["production", "development", "test"];
const envFiles = [
  ".env",
  ".env.local",
  ...modes.flatMap((mode) => [`.env.${mode}`, `.env.${mode}.local`]),
].filter((filename) => existsSync(path.resolve(filename)));

if (envFiles.length) {
  console.error(
    `Cloudflare builds embed local environment files: ${envFiles.join(", ")}. ` +
      "Use a clean checkout without these files and configure runtime secrets in Cloudflare. " +
      "Keep private files in your original development workspace.",
  );
  process.exitCode = 1;
} else if (process.argv.includes("--artifact")) {
  const artifact = path.resolve(".open-next/cloudflare/next-env.mjs");
  const expected = modes.map((mode) => `export const ${mode} = {};`).join("\n");
  if (!existsSync(artifact)) {
    console.error("Cloudflare artifact missing. Run npm run build:cloudflare first.");
    process.exitCode = 1;
  } else if (readFileSync(artifact, "utf8").replace(/\s/g, "") !== expected.replace(/\s/g, "")) {
    console.error(
      "Cloudflare artifact contains embedded environment values or an unsupported format. " +
        "Rebuild from a clean checkout before preview, checking or deployment.",
    );
    process.exitCode = 1;
  }
}
