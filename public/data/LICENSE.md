# Malaysia administrative boundaries

© OpenStreetMap contributors. Source: OpenStreetMap / Wambacher, distributed by geoBoundaries.

The source and normalized boundary databases in this directory are available under the [Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Preserve this notice and the licence URI when redistributing them. See [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright).

The normalized database is available at `malaysia-regions.geojson`. Original data and dataset-specific licence metadata are retained under `source/`. These files contain geometry only; application observations are separate.

Dataset: `MYS-ADM1-15666254`, represented year 2017. geoBoundaries commit: `9469f09592ced973a3448cf66b6100b741b64c0d`. Source update: 2023-01-19. Dataset build: 2023-12-12. Retrieved: 2026-10-16.

Preparation changes feature ordering and properties, adds stable region IDs and licence/source notices, and serializes compact JSON. It does not simplify, round, move, enlarge, merge, or repair coordinates. The upstream simplified geometry is used unchanged.

Rebuild from pinned upstream downloads with `npm run geo:prepare`. Rebuild from vendored bytes with `node scripts/prepare-geography.mjs --offline`. Verify offline with `npm run geo:validate`. The script verifies SHA-256 digests before processing either source file.
