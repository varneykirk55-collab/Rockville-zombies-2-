# Proposed districts

These five rectangles tile the working boundary (west option A). They are assignment areas for later parallel work. They are not municipal neighborhoods, zoning districts, or historic districts. No zoning layer was used.

Map: [maps/districts.png](maps/districts.png)

GeoJSON: [data/districts.geojson](data/districts.geojson)

Shared edges belong to the district named first in the list below. If west option B (−77.160) is chosen, districts 1 and 2 grow west and this cut should be redrawn before anyone starts.

| District | Longitude | Latitude | What the data shows there | Later work, still not started |
| --- | --- | --- | --- | --- |
| hungerford-corridor | −77.15500 to −77.14930 | 39.08850 to 39.09505 | Hungerford Drive, including 808 Hungerford and the 811 shopping-center footprint on the opposite side. Low Planning heights at that block (about 5–6 m). College buildings are north of 39.096 and outside. | Corridor kits: low commercial, both sidewalks, no college buildings. |
| town-center-core | −77.15500 to −77.14760 | 39.08240 to 39.08850 | East Montgomery, Maryland Avenue, Monroe, Washington. The tall county buildings are here, and so is the height conflict at 51 Monroe Place and 101 Monroe Street. The shared-edge weld (about 7,030 m across the whole bounds) matters most in this box because the footprints are the largest. | Height-rule test district. Do not extrude 51 Monroe Place until the 241 ft / 74 ft conflict is decided. |
| metro-and-bridge | −77.14760 to −77.14220 | 39.08240 to 39.08850 | Station point, both parking sides, OSM footway bridge, and the approximate Highland Avenue circle at the east edge. | Bridge model, station lots, and the east-edge decision. |
| south-pike-approach | −77.15500 to −77.14220 | 39.08050 to 39.08240 | Rockville Pike approaching the school. The OSM school polygon's north tip is 39.080413, just outside. | Pike section and the sidewalk gaps. Do not include the school. |
| northeast-residential | −77.14930 to −77.14220 | 39.08850 to 39.09505 | The 2023 ortho shows houses, canopy, and local streets east of Hungerford. Rockville roof codes in the whole bounds are 11% gable; this is where those gables concentrate, though this audit did not compute the gable count per district. | Gable kit and canopy instances. Confirm the gable count in this box before building the kit. |

Game-frame corners for each district are in the GeoJSON properties (`vertices_wgs84_and_game_frame`).

## What each assignment must not do

- Do not edit `src/` until the owner accepts the boundary and the height rule. These boxes are paper.
- Do not give a district its own copy of the footprint service. One fetch, filtered to the box, keeps `OBJECTID`s stable so the height seed and any future joined height stay attached to the same building.
- Do not model Montgomery College or Richard Montgomery High School inside a neighboring box. The college envelope and the school polygon are in the boundary GeoJSON with `status: exclude`.
- The metro district owns the bridge. The town-center district should stop at the west end of OSM way 266681164 and not build a second bridge.

## Parallel split

Five assignments match the five polygons. The town-center assignment is the one that has to settle the tall-building cross-check, because the conflicting roofs are in that box. The metro assignment is blocked on the east-edge question in [03-playable-boundary.md](03-playable-boundary.md) if its scope includes anything east of −77.14460. The other three can proceed from the working rectangle without that answer, as long as they do not freeze the west edge.
