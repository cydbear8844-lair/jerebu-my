import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "public/vendor/**",
    "src/components/ui/map.tsx",
    "playwright-report/**",
    "test-results/**",
    ".serena/**",
    ".cache/**",
    ".omo/**",
    "docs/evidence/**",
    "docs/review/**/data-ui/before-*.mjs",
  ]),
]);
