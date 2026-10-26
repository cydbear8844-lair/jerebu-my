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

The build script explicitly selects demo mode. `wrangler.json` sets `DATA_MODE=demo` at runtime. For local Worker preview, copy `.dev.vars.example` to `.dev.vars`; it contains only non-secret demo settings. Keep `.dev.vars`, `.env.local`, `.wrangler/` and `.open-next/` out of Git. Provider credentials are unnecessary for the initial deployment.

Build and deploy from a clean checkout without `.env` or mode-specific `.env.*` files. OpenNext 1.20.13 embeds those files into its generated server environment module, including development/test files. The Cloudflare scripts reject such source files and refuse generated environment modules containing values. Keep private files in the original development workspace; do not move or delete them to bypass the guard. Use Cloudflare runtime Secrets for any separately authorised future live integration. `.env.example` and `.dev.vars` are allowed because they are not embedded by that adapter step.

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
| Runtime mode | Committed `DATA_MODE=demo` |

The adapter and Wrangler are pinned to 1.20.13 and 4.153.0. Next.js stays at 16.4.2. The configuration uses Node.js compatibility, static assets and a self-reference binding. It enables no storage, scheduler, image service or paid add-on. Hosting remains subject to the account's plan and limits; no paid upgrade is authorised implicitly.

`/_next/static/*` receives immutable caching because those filenames are content-addressed. API responses keep their existing no-store policy. Geometry, support images, notices and fonts remain static assets. No persistent live history or new provider feed is introduced. The demo indicator remains visible, and a failed live feed never becomes demo data.

The scoped `@node-minify/core` override uses patched `glob` 10.5.0 for [CVE-2025-64756](https://github.com/advisories/GHSA-5j98-mcp5-4vw2). It avoids downgrading the adapter or changing unrelated dependency versions. Recheck this override when upgrading that build dependency.

## Verification and rollback

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
