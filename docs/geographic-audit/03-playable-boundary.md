# Playable boundary

The owner replaced the rectangle. The outline is irregular: west stays on longitude −77.155, the north edge stops at gLeaf, the east edge follows the west rail of the CSX / Metrorail bundle, and that edge bulges east only around Rockville Metro Station. Montgomery College and Richard Montgomery High School are outside. Residential blocks east of the tracks, including the Highland Avenue circle, are outside.

Map: [maps/playable-boundary.png](maps/playable-boundary.png)

Polygon: [data/playable-boundary.geojson](data/playable-boundary.geojson)

Each vertex carries `game_x_m` and `game_z_m` (origin −77.152, 39.086; X east; Z south; 1 unit = 1 metre). `scripts/finalize_audit.py` rebuilds the ring and checks the points below.

## Edges

| Edge | What was drawn |
| --- | --- |
| West | Longitude −77.155, from latitude 39.08070 up to 39.09510. This is the game's existing west bound. 315 N Washington Street (−77.153027) is inside. |
| North | Latitude 39.09510. That is 4 m north of the Hungerford 800-block centerline end at 39.09506, and just past the 808 Hungerford footprint's north edge at 39.094982. An OSM restaurant node at 39.09518 is outside. The college buildings start at 39.096234. |
| East | The western rail centerline, sampled from county `METRORAIL` / `CSX` track segments. At 39.09510 the rail is −77.152440. It runs southeast to about −77.1478 at the station, then the boundary leaves the rail and goes around the station parking. |
| South | Latitude 39.08070 along the west, a dip to 39.07970 between −77.15050 and −77.14960 so both 208 Monroe Street footprints are inside, then 39.08058 across the school frontage (18 m north of the OSM school's northern tip at 39.080413), then a dip to 39.08018 between −77.14420 and −77.14310 so the whole 700 Rockville Pike footprint is inside. No OSM school vertex falls inside the polygon. |

## Station rear

There is no `junction=roundabout` in OSM between the station and Highland Avenue, and no county street with that name. What is east of the platform is a closed parking circulation, in three layers that agree:

| Evidence | What it is |
| --- | --- |
| OSM way 46963870 | Closed `highway=service`, `service=parking_aisle`, about 45 m by 68 m, from −77.145854, 39.084683 to −77.145333, 39.085288. It sits immediately east of the platform (OSM way 46963880 reaches −77.14543). This is the rear bus / kiss-and-ride loop. |
| OSM way 367104667 | A second closed parking aisle further into the lot, from −77.145600, 39.084281 to −77.144078, 39.083527. |
| OSM way 46963862 | Closed way named Rockville Metro Station Parking. East corner −77.143955, 39.083535. That corner is the rear of the lot. |
| Planning parking layer | A polygon named Rockville Metro Station Parking Lot, source code 6 (Captured 2017), extent −77.14596, 39.08320 to −77.14398, 39.08537. `SHAPE.AREA` 155,580 square feet. Same rear edge as the OSM way. |
| County centerlines | Segments named `METRO PARKING LOT` on the station pavement, plus `ROCKVILLE METRO PED BRG`. |
| Rockville 2023 three-inch ortho | Bus loop on the Pike side of the tracks, platforms, and the east parking lot. The Highland Avenue circle is a separate residential circle near −77.14260, 39.08520, about 120 m east of the lot's rear corner. It is marked on the map and left outside. |

The bulge in the playable polygon follows that lot: east to −77.143820, south to 39.08305, then back to the rail. Both the Pike-side frontage and the east lot are inside. The county station point (−77.146634, 39.084431; game X 464.27 m, Z 174.19 m) is inside.

## Hungerford corridor inside the north cutoff

Both sides of Hungerford Drive from the 800 block south to the town center are inside the rail and the west line. Checked points:

| Place | Source | Longitude, latitude |
| --- | --- | --- |
| gLeaf, 808 Hungerford | County footprint centroid; OSM node named gLeaf is 6.6 m away | −77.153844, 39.094821 |
| Fresh Baguette | OSM cafe | −77.15436, 39.09462 |
| Shopping center, 811 Hungerford | County name "Shopping Center" | −77.152790, 39.094797 |
| Great Wall Supermarket | OSM shop | −77.15427, 39.09308 |
| Giant | OSM supermarket | −77.15194, 39.09249 |
| Wells Fargo | OSM bank | −77.15326, 39.09085 |
| Rockville Fire Station 3 | OSM `amenity=fire_station` | −77.15081, 39.08761 |

The county footprint table for `STREET_NAME='HUNGERFORD'` inside this latitude band has 124 footprints. Named shopping centers in that extract include 827, 819, 811, 771, and 755 Hungerford Drive, plus Rockville Sunoco at 790 and Hungerford Gulf at 801. OSM along the same stretch also has Bank of America, PNC, Capital One, Revere Bank, a Shell station, and restaurants including Bob's Shanghai 66, Pho 75, and Popeyes. Those OSM points that were tested sit west of the rail and south of 39.09510, so they are inside. The county file does not label the fire station; the OSM node is the evidence for it.

Apartments on this corridor are in the same footprint set (many Hungerford addresses have no building name). They are not a separate layer. East of the rail, Frederick Avenue apartments and Lincoln Park are outside. Named examples lost versus the previous rectangle include Lincoln Park Community Center, the Rocklin Park apartments on Lenmore Avenue, and churches on North Stonestreet Avenue and North Horners Lane.

## What the polygon adds and drops

Counts are county-footprint centroids. The full id list is [data/boundary-change.csv](data/boundary-change.csv).

| Comparison | Gained | Lost |
| --- | --- | --- |
| Versus the game rectangle (−77.155, 39.080, −77.140, 39.095) | 2: 208 Monroe Street, and 817 Hungerford Drive (centroid 39.095005, just outside the old north line) | 1,447, almost all of them east of the rail |
| Versus the previous audit rectangle | 3: 208 Monroe Street, 204 Monroe Street, and 700 Rockville Pike (Courthouse Exxon) | 936, including the east residential blocks the rectangle had reached to −77.14220 |

508 footprints have centroids inside the new polygon. That is the set in the reconciliation table.

## Screenshot stands

The six stands in the first audit still apply. Two of them move with this outline: the south Pike shot should stand at 39.08060 near −77.1465, looking north, with the school behind the camera and outside the polygon. The station shot should include the east loop at −77.1456, 39.0850, not the Highland Avenue circle. In-game pictures were not taken.
