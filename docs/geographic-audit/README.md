# Downtown Rockville geographic audit

Research only. Nothing in `src/`, `public/`, or `index.html` was changed, and the branch is not merged.

Assignment 001 recorded the foundation and the datasets. Assignment 001B, in the same folder, replaces the rectangle with the owner's irregular boundary and replaces the "keep a guessed height when the tables disagree" rule. A chosen height is either a measured value with a confidence level or it is left blank.

## Read in this order

| Document | What it answers |
| --- | --- |
| [01-dataset-inventory.md](01-dataset-inventory.md) | Services that responded, fields, dates, and licenses |
| [02-foundation-audit.md](02-foundation-audit.md) | What the current Three.js map contains |
| [03-playable-boundary.md](03-playable-boundary.md) | The irregular boundary, the station loop, and the Hungerford corridor |
| [08-height-reconciliation.md](08-height-reconciliation.md) | Why the two height tables differ, and the confidence rules |
| [09-terrain-and-bridge.md](09-terrain-and-bridge.md) | DEM source, the missing point cloud, and the pedestrian bridge |
| [05-generation-pipeline.md](05-generation-pipeline.md) | How a later change would apply this without hand-modelling every building |
| [06-districts.md](06-districts.md) | Four assignment areas on the new outline |
| [04-height-comparison.md](04-height-comparison.md) | The first pass against Planning only. Superseded where it conflicts with 08 |
| [07-limitations.md](07-limitations.md) | What is still unresolved |

## Maps and tables

| File | Contents |
| --- | --- |
| [maps/playable-boundary.png](maps/playable-boundary.png) | Irregular boundary over OpenStreetMap |
| [maps/districts.png](maps/districts.png) | Four districts on that outline |
| [data/playable-boundary.geojson](data/playable-boundary.geojson) | WGS84 polygon. Game-frame metres are on each vertex |
| [data/districts.geojson](data/districts.geojson) | District polygons in the same frame |
| [data/boundary-change.csv](data/boundary-change.csv) | Footprints gained or lost versus the game rectangle and the previous audit rectangle |
| [data/height-reconciliation.csv](data/height-reconciliation.csv) | One row per footprint inside the polygon: sources, chosen height, confidence, evidence |
| [data/height-comparison.csv](data/height-comparison.csv) | Earlier Planning-only join for the game rectangle |
| [data/tall-building-crosscheck.csv](data/tall-building-crosscheck.csv) | First tall-building sample. The rulings are in the reconciliation file |

## Scripts

`scripts/finalize_audit.py` writes the polygon, the district file, the gain/loss table, and the reconciliation CSV from the coordinates and rules in that script. `scripts/build_maps.py` draws the two PNGs from those GeoJSON files. `scripts/compare_heights.py` still rebuilds the earlier Planning-only CSV. OpenStreetMap tiles are downloaded only while a map is rendered; they are not committed.

## Coordinate frame already in the game

`src/utils.js` places the origin at longitude `-77.152`, latitude `39.086`. X is east, Y is up, Z is south, and 1 unit is 1 metre. At that origin the script computes 86,521.410 metres per degree of longitude and 111,017.096 metres per degree of latitude. Those constants are the ones used in the GeoJSON properties.

## Stop condition

The boundary now follows the owner's edges. Height rows with confidence High or Medium are measured values. Rows marked Unresolved have no chosen height. Geometry is not implemented in this branch.
