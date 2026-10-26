# JEREBU / MY

A Malaysia air-quality dashboard built with Next.js, TypeScript and MapLibre/mapcn. Explore all 16 regions, inspect provider locations, use optional wind visualisation and switch between English and Bahasa Malaysia.

## Run locally

Use Node.js 22 or newer and npm:

```sh
npm ci
npm run dev:demo
```

Open http://localhost:3000. Explicit demo mode needs no credentials. Its fixed reference time is 21 September 2026, 12:00 MYT. Stations, readings and history in this mode are synthetic and never represent current conditions. Live failures never fall back to demo values.

For a production build:

```sh
npm run build
npm run start:demo
```

## Vercel setup

Import this repository as a Next.js project. Use the repository root, the committed npm lockfile and the default `npm run build` command. Begin with `DATA_MODE=demo` in the project environment. No database, tile-service key or paid resource is required for demo mode. This repository does not create a deployment or paid service automatically.

Private live configuration uses `DATA_MODE=live` and a server-only `WAQI_API_TOKEN` in your local `.env.local` or the host's environment settings. Never prefix that token with `NEXT_PUBLIC_`, commit it or include it in screenshots. A token does not establish permission for public use: review [WAQI's terms](https://aqicn.org/api/) and the conditions applicable to your own operator/use before launch.

WAQI AQI is provider-reported and US-EPA-based, distinct from official Malaysian IPU. Source labels, originating-agency credit and observation times remain visible. Live historical storage/replay is not enabled; the project does not manufacture an archive from forecasts or failed requests. The optional real wind layer uses Open-Meteo/ECMWF, with its model, height, valid time, resolution and attribution displayed separately.

## Development checks

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run geo:validate
```

`npm run test:e2e` runs Playwright scenarios after installing the desired Playwright browser binaries. Ordinary unit tests and explicit demo scenarios require no private provider credential. Browser output belongs in ignored test/evidence directories. Test helpers are not permission to query real providers.

## Source layout

- `src/app/`: routes and server API handlers.
- `src/components/`: map, dashboards, history, preferences and support UI.
- `src/lib/`: domain rules and deterministic fixtures.
- `src/server/`: server-side provider access and request controls.
- `public/data/`: licensed administrative boundaries and source metadata.
- `docs/licenses/` and `public/licenses/`: retained third-party notices.
- `tests/e2e/`: browser checks.

## Copyright, credits and support

Copyright 2026 CydBear. JEREBU / MY. The project's ownership notice is separate from the licences for third-party code, fonts, icons, geometry and provider data. See [attribution](docs/ATTRIBUTION.md), [source notes](docs/DATA_SOURCES.md) and the in-app Data & Credits page. No project-wide open-source licence is supplied by this repository.

The owner intentionally publishes the PayPal receiving link, original PayPal/Maybank receiving QR images and recipient name shown on `/support`. These are optional support details, not API credentials. Contributions unlock no features; payment processing happens in PayPal or the user's bank. The application does not confirm transfers. QR payload/payment-app scanning and successful transfers must be independently checked before relying on them.

Public support settings are in `src/lib/project-info.ts`. `supportInLive` controls visibility only; it does not represent provider approval. Core features remain available without contributing. `/privacy` describes browser storage, user-initiated local geolocation and external links.

## Repository scope

This is the sanitised application source. Local secrets, browser profiles, internal build prompts, private correspondence and development evidence are excluded. Keep credentials in environment settings, preserve required attribution, and review deployment-specific privacy, provider limits and reuse conditions before publication of a live service.
