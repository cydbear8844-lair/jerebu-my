# Attribution

Verified against downloaded source metadata and installed package licences on 2026-10-16.

## Boundaries

© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Malaysia administrative boundaries are distributed by [geoBoundaries](https://www.geoboundaries.org/), with source metadata naming OpenStreetMap and Wambacher. Dataset `MYS-ADM1-15666254` is licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

The map must retain visible attribution linked to OpenStreetMap and ODbL. The downloadable normalized database at `/data/malaysia-regions.geojson` and source files under `/data/source/` retain that licence. [The local notice](../public/data/LICENSE.md) records the source version and transformation. Geometry remains separate from synthetic observations and application code. Any redistributed derivative boundary database remains subject to the ODbL terms.

The dataset represents 2017 boundaries. Displaying it does not imply endorsement by DOE, OpenStreetMap, geoBoundaries, or any government agency. See [DATA_SOURCES.md](DATA_SOURCES.md) for provenance, checksums and validation limits.

## Map implementation and fonts

| Component | Licence and attribution | Retained notice |
| --- | --- | --- |
| mapcn source | MIT, © 2025 Anmoldeep Singh; pinned commit `e023805136caa3ec4b9a1ab4dd8c9c891583d4f6` | [MIT text](licenses/mapcn-MIT.txt) |
| MapLibre GL JS 6.14.0 | BSD-3-Clause, © 2023 MapLibre contributors | [BSD text](licenses/maplibre-BSD.txt) |
| Barlow Condensed, `@fontsource/barlow-condensed` 5.3.0 | SIL Open Font License 1.1, © 2017 The Barlow Project Authors | [OFL text](licenses/barlow-condensed-OFL.txt) |
| IBM Plex Sans, `@fontsource/ibm-plex-sans` 5.3.0 | SIL Open Font License 1.1, © 2019 IBM Corp. | [OFL text](licenses/ibm-plex-sans-OFL.txt) |
| Lucide icons | ISC; derived Feather icons retain MIT notices | [Licence text](licenses/lucide-LICENSE.txt) |

Font licences were read from the installed packages' `LICENSE` files. MapLibre's notice was read from `node_modules/maplibre-gl/LICENSE.txt`. Exact dependency versions are resolved by the lockfile; each dependency retains its own licence.

The default map uses local administrative geometry. It needs no third-party tile service, map key, remote sprites or remote map fonts. Additional basemaps would require their own service terms and attribution review.

As of 26 October 2026, the About page also links to public copies of these notices under `/licenses/`. `scripts/copy-map-assets.mjs` refreshes and publishes them from the retained mapcn text and installed packages. The application copyright notice remains separate from these licences.

## Demo content and visual reference

Station names, values and histories are synthetic demonstration fixtures. They do not represent government monitoring stations or current air quality. The official [DOE portal](https://eqms.doe.gov.my/APIMS/main) is linked as a source reference, without claiming a live integration.

The Carbon-inspired direction concerns original interface styling. No Need for Speed logos, screenshots, game art, sound effects or music are included as licensed project assets.
