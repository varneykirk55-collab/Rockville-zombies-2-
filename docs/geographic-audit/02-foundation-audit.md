# Existing foundation audit

The playable scene is a browser Three.js map. It already loads Montgomery County footprints and extrudes them. This audit does not replace that. It records what the extrusion knows and what it invents.

## What is already geographic

| Piece | Where | What it uses |
| --- | --- | --- |
| Bounds | `src/config.js` `BOUNDS` | West −77.155, south 39.080, east −77.140, north 39.095. About 1,298 m east–west and 1,665 m north–south. |
| Origin | `ORIGIN` | Longitude −77.152, latitude 39.086, near Town Square. |
| Local metres | `src/utils.js` | Tangent projection. X east, Z south, Y up. |
| Footprints | `src/footprints.js` | Live query of the county footprint service, nine tiles, GeoJSON, all fields, deduped by `OBJECTID`. |
| Masses | `src/buildings.js` | One extrusion per polygon ring. Courtyard holes in the source ring are kept. |
| Streets | `src/config.js` `ROAD_CENTERLINES`, drawn in `src/scene.js` | 315 static polyline parts. Sum of segment lengths 33,058 m. That sum counts overlapping samples in the file, so it is not a de-duplicated network length. |
| Spawn | `src/camera.js` | 14.5 m east and 2.45 m south of East Montgomery Avenue at Helen Heneghan Way (`DOWNTOWN`). Eye height 1.68 m. |

The footprint request asks for every attribute. The only attribute the mesh uses is `OBJECTID`, and only as a stable seed. Address, name, and `BLDG_CLASS` arrive in the browser and are discarded.

## Heights are estimated

`massHeight` in `src/buildings.js` ignores every measured height:

```
lowRise = 5 + 29 * (1 - exp(-max(0, area - 85) / 1200))
height = clamp(lowRise + (seed - 0.22) * 9, 5, 40)
```

`seed` is a 32-bit mix of `OBJECTID` (`Math.imul` with `0x45d9f3b`). Area is the polygon area in the local metre frame, with holes subtracted. A convex footprint taller than 17 m can get a recessed upper story. The recess does not change the total height.

On the 1,243 matched footprints with feature code 2201 and area at least 30 m², that formula produces 5.00 m to 39.12 m, mean 10.45 m, median 9.23 m. The Planning largest-part heights for the same footprints have median 6.51 m and maximum 73.65 m. Seven of them are over the 40 m cap. Three hundred fifty-three are under the 5 m floor. The numeric comparison is in [04-height-comparison.md](04-height-comparison.md).

Nothing in the repository reads `BLDG_HEIGHT`. The service the game calls does not have that field. The field is on the Planning 3D MapServer, which the game does not call.

## Roofs, shared walls, courtyards

Every roof in the game is a flat cap on the extrusion, textured with the tarred-gravel map. Rockville's building layer, inside the same bounds, codes 1,631 roofs Flat, 202 Gable, and 1 Not Applicable. The gable minority is real in that table. The game has no gable test, so those 202 roofs are drawn flat.

Shared walls were measured on the 1,998 county footprints by snapping edges to a 5 cm grid. 459 edge pieces, about 7,030 m, are shared by two footprints, and 438 footprints touch another footprint. Only 53 footprints are class `Q` (the county's connected-building class). Most attached buildings are separate polygons that share an edge. The game extrudes each polygon on its own, so a shared wall becomes two coincident faces.

Only 2 of the 1,998 footprints have an interior ring. The code that keeps courtyard holes is doing the right thing for those two. Most open courts in this district, if they exist, are gaps between polygons rather than holes in one polygon. This audit did not measure those gaps.

## Terrain

The ground is a 3,600 m square at Y = −0.02. Roads sit at Y = 0.018. Building bases sit at Y = 0.

The Maryland 2020–2021 DEM, at the points in the inventory, runs from 123.76 m at the RMHS building centroid to 140.97 m at 808 Hungerford. That is 17.2 m of relief, several storeys, across the current map. Street `F_ELEV` / `T_ELEV` cannot fill this in: the inspected downtown segments are 0.

Planning `BLDG_ELEV` is a base elevation in feet and, at the two tall county buildings, sits within about 1.3 m of the DEM. The game never reads it, so a building whose real base is uphill is drawn at the same floor as one downhill.

## Streets, sidewalks, parking

Carriageway half-widths in the static file are five constants: 4.1 m (219 parts), 6.0 m (55), 3.1 m (26), 3.0 m (10), and 5.5 m (5). The file's own comment calls them estimated. The county centerline service has speed and functional class, not width.

Sidewalks are drawn only where the half-width is at least 4 m, as a ribbon 2.0 m outside the carriageway. The Planning sidewalk layer has 2,826 polygons in the same bounds, and the Rockville slope layer has 1,065 sidewalk lines with a width and a slope from the 2014–15 DEM. Neither is used. Eighty Rockville "missing sidewalk" lines are also unused, which matters if the game should not invent a sidewalk where the city says there is a gap.

Parking is not a layer in the game. Planning has 197 parking polygons in the bounds. The 2023 ortho shows large station lots on both sides of the tracks; the county centerline table names some of those drives `METRO PARKING LOT`.

The pedestrian bridge is not an object. Nearby Pike centerlines in `ROAD_CENTERLINES` are ordinary flat ribbons. The county segment named `ROCKVILLE METRO PED BRG` and OSM way 266681164 are the bridge. Planning polygon 1319 is its planimetric footprint. None of those are in the scene.

## Trees and the edge of downtown

There are no tree meshes and no forest polygon. The 2014–2018 canopy service has 48.2 ha of "No Change" canopy and 9.97 ha of "Gain" inside the game bounds, in 28,810 polygons. The forest layer contributes 26 small polygons whose `ACRES` values sum to 8.98. Downtown is not a forest. The canopy is fragmented and is mostly the residential edges and the station landscaping visible on the 2023 ortho, not a solid woods.

## Performance budget already in the code

These are the limits the current scene was built around. A generator should stay inside them.

- Three.js r187, loaded by the page. No build step.
- Pixel ratio capped at 1.75, or 1.35 on a coarse pointer. Antialiasing off on touch.
- One shadow map, 2048 or 1024, not updated every frame (`autoUpdate` is false).
- Fog from 140 m to 670 m.
- Facade windows only within 152 m of the East Montgomery junction. A "downtown" shadow flag extends to 235 m.
- Wall and roof geometry is merged into 96 m chunks. Glass is instanced.
- Collision uses the footprint rings, cell size 32 m, body radius 0.36 m.
- The county fetch is nine live tiles. A failed tile is warned and the rest of the map still builds.

Adding a mesh per canopy polygon (28,810 of them) or a unique material per building would break that budget. Instanced trunks and a shared facade atlas would not.

## Discrepancies, with the numbers

| Topic | Game | Measured |
| --- | --- | --- |
| Height | 5–40 m from area and `OBJECTID` | Planning largest-part median 6.51 m, max 73.65 m on the 1,243-footprint set. Mean error (game minus Planning) +2.84 m, MAE 4.56 m, RMSE 6.97 m. The tall county buildings are the other way: the game is 42–44 m short of the Planning values, and those Planning values themselves disagree with Rockville. |
| Roof | All flat | Rockville: 202 gable, 1,631 flat in the game bounds. |
| Shared walls | Double faces | About 7,030 m of shared edge. |
| Courtyard holes | Preserved | Only 2 source polygons have holes. |
| Terrain | Flat | 17.2 m of DEM relief from the school building to 808 Hungerford. |
| Bridge | Absent | OSM footway bridge, county `ROCKVILLE METRO PED BRG`, Planning polygon 1319. |
| Sidewalks | Offset ribbon | 2,826 planimetric polygons; 80 segments the city marks missing. |
| Parking | Absent | 197 polygons. |
| Canopy | Absent | 48.2 ha unchanged plus 9.97 ha gain, 2014–2018. |
| Identity of gLeaf | Not labelled | Address and OSM name agree; county building name is blank. See the boundary note. |

The footprint outlines themselves are the county polygons, not a hand model. Horizontal footprint error against the county source is zero by construction, aside from the tangent projection across this 1.7 km window. The audit did not compare those outlines to the Planning 3D split parts edge by edge. 281 of 1,865 Planning parts had a centroid that fell in no county footprint, so the two footprint generations are not identical.
