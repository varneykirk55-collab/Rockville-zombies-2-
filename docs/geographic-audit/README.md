# Downtown Rockville geographic audit

Research only, 26 November 2026. Nothing in `src/`, `public/`, or `index.html` was changed. The city was not rebuilt.

This folder records what the repository already does, which public datasets actually contain measured heights and elevations, and a proposed playable boundary. A claim is tied to a query, a count, or a measurement. Where a source was not opened, the report says so.

## Read in this order

| Document | What it answers |
| --- | --- |
| [01-dataset-inventory.md](01-dataset-inventory.md) | Which services responded, what fields they expose, dates, and licenses that were actually present |
| [02-foundation-audit.md](02-foundation-audit.md) | What the current Three.js map contains, and where it departs from the measured data |
| [03-playable-boundary.md](03-playable-boundary.md) | North, south, east, and two west options, with the map and GeoJSON |
| [04-height-comparison.md](04-height-comparison.md) | Game height formula versus Planning 3D heights, and the Rockville cross-check |
| [05-generation-pipeline.md](05-generation-pipeline.md) | How to generate blocks from the data already in hand, without modelling every building by hand |
| [06-districts.md](06-districts.md) | Five proposed assignment areas inside the working boundary |
| [07-limitations.md](07-limitations.md) | Missing data, conflicts, and what this audit did not open |

## Maps and tables

| File | Contents |
| --- | --- |
| [maps/playable-boundary.png](maps/playable-boundary.png) | Working boundary over OpenStreetMap, plus the two unapproved alternatives |
| [maps/districts.png](maps/districts.png) | The five proposed districts |
| [data/playable-boundary.geojson](data/playable-boundary.geojson) | WGS84 geometries. Game-frame meters are in properties |
| [data/districts.geojson](data/districts.geojson) | District polygons in the same frame |
| [data/height-comparison.csv](data/height-comparison.csv) | 1,464 footprints joined to a Planning 3D part |
| [data/tall-building-crosscheck.csv](data/tall-building-crosscheck.csv) | Planning versus Rockville heights for the buildings that were queried twice |

## Scripts

`scripts/compare_heights.py` re-queries the county footprint service and the Planning 3D MapServer and rewrites the comparison CSV. `scripts/build_maps.py` redraws the GeoJSON and the two PNGs from the coordinates recorded in that script. OpenStreetMap tiles are downloaded only while the map script runs; they are not committed.

## Coordinate frame already in the game

`src/utils.js` places the origin at longitude `-77.152`, latitude `39.086`. X is east, Y is up, Z is south, and 1 unit is 1 metre. At that origin the script computes 86,521.410 metres per degree of longitude and 111,017.096 metres per degree of latitude. Those constants are the ones used in the GeoJSON properties.

## Stop condition

Do not treat the working polygon as an approved map. The west edge and the Highland Avenue circle are proposals. Do not replace estimated heights until the owner chooses which height source wins where Planning and Rockville disagree.
