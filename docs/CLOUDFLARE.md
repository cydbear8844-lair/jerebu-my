# Cloudflare Workers

The application uses OpenNext to run its existing Next.js App Router pages and API handlers on Workers. MapLibre, station details, wind and history retain the same application code. A static Pages export would remove server capabilities and is not the configured target.

## Local commands

Use Node.js 22 or newer and the npm lockfile. The locally tested Node version is 24.11.1.

```sh
npm ci
npm run dev:demo
```

For the Workers runtime, stop the development server if its port conflicts, then run:

```sh
npm run build:cloudflare
npm run check:cloudflare
npm run preview:cloudflare
```

The build script selects demo mode only while compiling. `wrangler.json` selects live mode at deployment runtime. For local demo Worker preview, copy `.dev.vars.example` to `.dev.vars`; it overrides the deployment setting without a provider key. Keep `.dev.vars`, `.env.local`, `.wrangler/` and `.open-next/` out of Git.

Configure `WAQI_API_TOKEN` as a Production runtime **Secret** in Cloudflare, never as a build variable or `NEXT_PUBLIC` value. The owner authorised public live use on 27 October 2026 while WAQI's clarification about individual, donation-supported use remains pending. This is an operator decision, not provider approval. Keep mandatory attribution, unvalidated/source labels and free access; disable the relevant integration or support function if WAQI rejects the arrangement. Live history remains unavailable.

`WAQI_MAX_REQUESTS=45` bounds actual upstream attempts per snapshot, including discovery and retries, below Cloudflare Free's 50-subrequest limit. Four concurrent hydrations and the existing 20-second deadline remain. Once the budget is exhausted, completed observations remain available with explicit partial coverage. No missing region is filled from demo data. Without this setting, the existing Node deployment permits at most 162 attempts (discovery plus 80 feeds, each with one retry). The six-snapshot-per-minute admission control is process-local, not a global quota across Worker isolates.

The server loads licensed boundaries through the Worker's `ASSETS` binding. Node development uses the existing local file. Only this static geography is reused in memory; settled WAQI observations are not cached. A local mocked-provider Worker reproduced the old filesystem `ENOENT` failure before this change; the asset request returned the original 505,497-byte boundary file. Failed or cancelled loads remain failures.

Build and deploy from a clean checkout without `.env` or mode-specific `.env.*` files. OpenNext 1.20.13 embeds those files into its generated server environment module, including development/test files. The Cloudflare scripts reject such source files and refuse generated environment modules containing values. Keep private files in the original development workspace; do not move or delete them to bypass the guard. Provider credentials belong only in Cloudflare runtime Secrets. `.env.example` and `.dev.vars` are allowed because they are not embedded by that adapter step.

OpenNext warns that native Windows support is incomplete; use Cloudflare's Linux build environment for deployment. `npm run dev:demo`, `npm run build` and `npm run start:demo` remain available for the existing Node.js workflow. A restricted local runner may need `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` and `WRANGLER_LOG_PATH` directed to writable, ignored workspace directories; do not reset system permissions to run preview.

## Git deployment

Connect only `cydbear8844-lair/jerebu-my` to Cloudflare Workers & Pages. Do not grant the hosting integration access to the private development archive.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | Repository root |
| Install | `npm ci` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| Build runtime | Node.js 24, selected by `.node-version` |
| Runtime mode | Committed `DATA_MODE=live`; runtime token required |

The adapter and Wrangler are pinned to 1.20.13 and 4.153.0. Next.js stays at 16.4.2. The configuration uses Node.js compatibility, static assets and a self-reference binding. It enables no storage, scheduler, image service or paid add-on. Hosting remains subject to the account's plan and limits; no paid upgrade is authorised implicitly.

`/_next/static/*` receives immutable caching because those filenames are content-addressed. API responses keep their existing no-store policy. Geometry, support images, notices and fonts remain static assets. No persistent live history or new provider feed is introduced. Demo previews retain the demo indicator; live pages identify WAQI's US-EPA-based AQI separately from Malaysian IPU. A failed live feed never becomes demo data.

The scoped `@node-minify/core` override uses patched `glob` 10.5.0 for [CVE-2025-64756](https://github.com/advisories/GHSA-5j98-mcp5-4vw2). It avoids downgrading the adapter or changing unrelated dependency versions. Recheck this override when upgrading that build dependency.

## Verification and rollback

The fixed demo snapshot generates only the latest eligible candidate for each station, then applies the shared source, timestamp and freshness policy. It does not rebuild the 30-day archive on every request. The availability ruler uses `src/lib/demo-timeline.json`, generated from the full synthetic archive with `npm run demo:prepare`. Run that command after changing demo fixtures or freshness rules. Regression tests compare all 721 availability frames with the original calculation and check snapshot equivalence at publication, missing-data and stale boundaries. This precomputation applies only to explicit demo data; it is not a live-data cache.

Before publishing, run the unit/API suite, lint, formatting, typecheck, geography validation, the Cloudflare build and dry run. Exercise the actual Worker preview, including deep links, API timestamps, history gaps, map assets, wind, station navigation, Near Me, BM/EN and mobile controls. Keep current run evidence separate from historical results; a successful package build alone does not verify a hosted deployment.

After deployment, confirm the HTTPS URL, demo/source labels, region/station reloads, map WebGL output and the absence of unintended provider requests. Check runtime errors and CPU limits before treating the Free plan as suitable for the full workload. Do not remove requested features or upgrade the account automatically to resolve a plan limit.

Use Cloudflare's deployment rollback controls to restore a previously verified deployment if one exists. For this first deployment, no prior hosted version is assumed. The existing Node.js build remains the local fallback; rollback does not require changing data semantics or the source/index definitions.

## Sources

- [OpenNext setup](https://opennext.js.org/cloudflare/get-started)
- [OpenNext compatibility and Windows support](https://opennext.js.org/cloudflare)
- [Cloudflare Next.js deployment paths](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Worker limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Runtime and build environment variables](https://opennext.js.org/cloudflare/howtos/env-vars)

Cloudflare currently recommends vinext for its default automatic setup. This project uses its documented OpenNext path to preserve the existing Next.js build. The upstream OpenNext overview lists older compressed-size limits; use Cloudflare's current platform limits and the actual deployment result when assessing the bundle.
