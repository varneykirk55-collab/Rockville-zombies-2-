# Playable boundary

The working polygon is a proposal. It is drawn so the owner can accept or move an edge. It is not a claim that the rectangle matches a legal downtown boundary. No Town Center zoning polygon was retrieved; the Central Business District service timed out and was not used.

Map: [maps/playable-boundary.png](maps/playable-boundary.png)

GeoJSON: [data/playable-boundary.geojson](data/playable-boundary.geojson)

Geometries are WGS84. Each vertex also carries `game_x_m` and `game_z_m` in the repository frame (origin −77.152, 39.086; X east; Z south).

## Working rectangle

| Corner | Longitude | Latitude | Game X (m) | Game Z (m) |
| --- | --- | --- | --- | --- |
| Southwest | −77.15500 | 39.08050 | −259.56 | 610.59 |
| Southeast | −77.14220 | 39.08050 | 847.91 | 610.59 |
| Northeast | −77.14220 | 39.09505 | 847.91 | −1004.71 |
| Northwest | −77.15500 | 39.09505 | −259.56 | −1004.71 |

Game coordinates above are the same tangent used in `src/utils.js`. West option A is the west edge of this rectangle, which is also the current repository west bound.

The current game rectangle is wider on the east (−77.140 instead of −77.14220) and 0.00050 degrees further south (39.080 instead of 39.08050). It is drawn dashed on the map.

## North: Hungerford Drive at gLeaf

The county footprint for `808 HUNGERFORD DR 20850` (`OBJECTID` 338888, class P, name blank) has centroid −77.153844, 39.094821 and a north edge at 39.094982. In the game frame that centroid is X −159.55 m, Z −979.28 m.

OSM node 13626911178 is named gLeaf at −77.153775, 39.094797, 6.6 m from the centroid, inside the same footprint. The county attribute table does not contain the name gLeaf. The link is the address plus that OSM name.

The Hungerford centerline address range 800–810 / 801–811 ends at latitude 39.09506. The working north edge is 39.09505, which includes that block and the footprint. Buildings on both sides of the drive at that block were inside the footprint download: 808 and 804 on the west side of the centerline, and the shopping-center footprint at 811 Hungerford (centroid −77.152790, 39.094797, Planning height 4.92 m) on the east side.

Montgomery College's 19 named Rockville campus footprints start at latitude 39.096234, about 131 m north of this line, and are outside the rectangle. The orange envelope on the map is their extent, not a parcel survey. This audit did not inventory unnamed buildings in the 131 m gap. The instruction was to stop at gLeaf and to exclude the college, so the line is the north end of the 800 block, not the college fence.

## South: Rockville Pike immediately before the high school

The county building named Richard Montgomery High School, 250 Richard Montgomery Drive, reaches north only to 39.079875. The OSM school polygon (way 239942500) reaches 39.080413 at −77.146141. That tip is about 60 m north of the building. The current game south bound, 39.080, cuts through that campus polygon.

The working south edge is 39.08050, about 10 m north of the campus tip, so the OSM school polygon is outside. 611 Rockville Pike (centroid latitude 39.080228) falls inside the school latitude band and is outside the working rectangle. Courthouse Exxon at 700 Rockville Pike (centroid 39.080439) is also just south of 39.08050 and is outside. If the owner wants the last Pike business before the campus included, the south edge has to move south by a few metres and be checked against the school polygon again. This audit did not have a school parcel, only the building footprint and the OSM school way.

The south edge is a straight latitude across the whole rectangle. West of the school, that also drops a thin strip of Monroe Street. 208 Monroe Street sits at 39.079969 and is excluded with the school even though it is not the school. That is a consequence of using one latitude. It is called out so it can be changed.

## East: both sides of the station, and a circle that still needs a name

Included, with coordinates:

- County station point, 251 Hungerford Drive: −77.146634, 39.084431. Game X 464.27 m, Z 174.19 m.
- OSM footway bridge, way 266681164: −77.147906, 39.084072 to −77.146665, 39.084408. The west landing is on the Town Center side of the Pike. The east landing is at the station. Game position of the west end is about X 354 m, Z 214 m.
- Planning bridge polygon 1319 covers that same footprint. Its surface attribute says Asphalt. The city's 1 December 2020 notice describes glass panels. Both are recorded. They are not the same claim.
- The 2023 three-inch ortho shows the bus loop on the Pike side of the tracks and a parking lot on the east side of the tracks. County centerlines in that pavement are named `METRO PARKING LOT` and `ROCKVILLE METRO PED BRG`.

The working east edge is longitude −77.14220, just east of an approximate Highland Avenue traffic circle at −77.14260, 39.08520 (game X 813.3 m, Z 88.8 m). That circle is visible on the 2023 ortho and the Highland Avenue centerline runs through it. No county street and no OSM way in the queries was tagged as the station's roundabout. The station pavement itself, in the ortho export, is a bus loop and parking, not a roundabout.

If the intended "rear roundabout" is the station bus loop rather than the Highland Avenue circle, use the orange dashed line at −77.14460 instead. That alternative still includes both sides of the station and the bridge, and it drops the residential blocks between the parking lot and Highland Avenue. Both lines are on the map. Neither is approved.

## West: two proposals

**Option A, used by the filled polygon.** Longitude −77.155, the current repository west bound. Every Washington Street address in the height table has its centroid on or east of −77.154824 (500 N Washington Street). 315 N Washington Street, Planning height 40.83 m, is at −77.153027 and is inside. This option includes both sides of Washington Street as far as those inspected addresses.

**Option B, the purple dashed line.** Longitude −77.160. A Planning 3D query of the strip −77.162 to −77.155, latitudes 39.082 to 39.094, returned 750 building parts, average height 28.4 ft (8.7 m), maximum 118.0 ft (36.0 m). Option B takes in that fabric. The college buildings remain north of 39.096, so this west edge does not by itself include the campus. Land use inside the strip was not broken out building by building. The average near 28 ft means the strip is mostly low buildings, with at least one part at 118 ft.

Option A is the tighter downtown cut and matches the bound the game already uses. Option B is the wider cut and is supported only by that height summary, not by a named district boundary. The owner needs to pick one. The districts in [06-districts.md](06-districts.md) are drawn on option A. If option B is chosen, the Hungerford and Town Center districts grow west to −77.160 and should be re-cut before anyone is assigned to them.

## Screenshot pairs

Visual comparison was not captured in the game. Running the existing page would not require a code change, and it was not done in this audit. The pairs below are the set to shoot after the owner accepts a boundary. Each in-game shot is from the current first-person camera (eye 1.68 m). Each real-world mate should be the same heading, from the Rockville 2023 ortho for an overhead check and from a street-level photo for the facade check. Mapillary was not queried.

| View | Stand here (WGS84) | Game X, Z | Look | What the pair is for |
| --- | --- | --- | --- | --- |
| 1 | East Montgomery at Helen Heneghan, the current spawn, about 15 m east of −77.150007, 39.084093 | about 187, 214 | West along East Montgomery | The junction the game already dresses with brick. Tests footprint alignment and the estimated heights around Town Square. |
| 2 | West end of the footbridge, −77.147906, 39.084072 | 354, 214 | East, toward the station | Whether the bridge exists at all, and whether both sides of the Pike read as connected. |
| 3 | East end of the footbridge, −77.146665, 39.084408 | 462, 177 | West, back to Town Center | The station side of the same link. |
| 4 | Sidewalk at 101 Monroe Street, −77.149407, 39.083040 | 224, 329 | Toward the Executive Office Building mass | Height. Planning says 67.9 m, Rockville says 63.2 m, the game says 24.3 m. A pair will show the miss. It will not decide which GIS height is right. |
| 5 | Hungerford Drive at 808, −77.153844, 39.094821 | −160, −979 | South along the drive | The north edge and both sides of the commercial corridor. |
| 6 | Rockville Pike at 39.08060, about −77.1465 | about 476, 599 | North, away from the school | The south edge. The school should be behind the camera and outside the map. |

Until those pairs exist, this audit does not call the scene a visual match to downtown Rockville.
