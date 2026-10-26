# Data sources

## Explicit demo

Synthetic fixtures use a fixed reference clock of 21 September 2026, 12:00 MYT and deliberate missing/stale readings. They are separate from provider observations. No failed or unconfigured real feed becomes demo data.

## Air quality

The optional WAQI current-observation adapter runs on the server. [WAQI API terms](https://aqicn.org/api/) govern access, attribution, quotas and reuse; a private token alone is not public-use permission. Retain attribution to WAQI and originating agencies. The public terms restrict paid-application/data-sale and cached/archive redistribution. Clarify any operator/use or donation arrangement not expressly covered before a public live launch. No provider permission is claimed by this source release.

The interface labels WAQI AQI separately from Malaysian IPU, preserves observation/retrieval timestamps and applies a disclosed two-hour application freshness policy. Provider locations are not independently certified physical monitoring sites. Live history and retention remain unavailable without an appropriate source contract. No official DOE/APIMS machine feed is invented; the official portal is a reference link.

## Wind

Synthetic spatial fields and the optional Open-Meteo/ECMWF path remain distinct. Real wind uses a coarse spatial sampling grid, a labelled 10m model field, explicit valid time and vector interpolation. See [Open-Meteo terms](https://open-meteo.com/en/terms), [ECMWF](https://www.ecmwf.int/) and [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This visualisation does not predict haze transport or pollution arrival times. Missing fields remain unavailable, never calm or synthetic fallback.

## Geography

All 16 region geometries come from the pinned geoBoundaries MYS ADM1 dataset, with OpenStreetMap/Wambacher origin and ODbL 1.0 licensing. The dataset represents 2017 boundaries. Geometry parts and territory holes are preserved. See [attribution](ATTRIBUTION.md), [the retained notice](../public/data/LICENSE.md) and vendored metadata. `npm run geo:validate` verifies the local geometry without fetching a new source.

Local test results do not establish public-provider permission, nationwide coverage, physical-device certification or hosting quota compliance. Resolve those conditions for the intended deployment.
