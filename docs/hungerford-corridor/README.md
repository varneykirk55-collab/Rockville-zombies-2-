# Hungerford Drive corridor

Architectural pass on the approved city geometry (`grok/city-geometry-upgrade`, PR #4). Footprints, measured heights, terrain, and collision are unchanged. This branch does not merge.

The per-building sheet is [buildings.csv](buildings.csv). Screenshots are in [screenshots/](screenshots/).

## District boundary

Ownership is the `hungerford-corridor` polygon in `docs/geographic-audit/data/districts.geojson` (audit document [06-districts.md](../geographic-audit/06-districts.md)). A playable footprint is in the district when its shoelace centroid is inside that ring. The ring is west −77.155, north 39.09510 at gLeaf, east along the rail, south from (−77.155, 39.08850) to (−77.150023, 39.08880).

That test selects **125 playable footprints**. Montgomery College stays north of 39.09510, outside the playable boundary.

Three places the owner brief names are **not** in this polygon, so they were left on the baseline mass:

| Place | Footprint | Why it is not dressed |
| --- | --- | --- |
| Walgreens, 430 Hungerford Drive (Hungerford Plaza) | 126073 | Centroid 39.088644, −77.151848 sits in the gap between this ring and `town-center-core`. The two south/north edges are not the same line. |
| Fire Station 3, 380 Hungerford Drive | 125245 | Centroid is inside `town-center-core` (39.08755). The districts note mentions the station in the Hungerford sentence; the polygon puts it in town center. |
| 5 Dawson Avenue | 225291 | Same south-edge gap as Walgreens. |

The gap is recorded rather than guessed. The fire-station and Walgreens screenshots look south from inside the district and show those buildings still in the generic baseline style.

## What was dressed

125 footprints, plus the DHHS upper Planning part (parent 122429), which is also inside the ring.

| Style | Count | What it is |
| --- | --- | --- |
| Townhouse | 54 | 620 and 622 Hungerford rows, Martins Square Lane, Ivy League Lane, 10 North Street |
| Storefront | 51 | One-storey retail, restaurants, the low Great Wall shed |
| Cottage | 5 | Small Dawson Avenue buildings |
| Shed | 4 | Class S outbuildings |
| Gas | 3 | 801 Gulf/Marathon, 790 Sunoco, 510 fuel |
| Civic | 2 | Post office, DHHS low wing |
| Grocery, garage, bank, apartment, office ribbon, office punched | 1 each | Giant, City Center garage, Wells Fargo, Heritage House, the 1971 tower, Exchange Place |

Named businesses matched to a footprint from the county name or one OpenStreetMap point (lz4.overpass-api.de, 26 Nov 2026). Each name is used once.

gLeaf (808), Fresh Baguette (804), Taipei Cafe (802), 7-Eleven (779), Yi Fang Tea (777), Smile Dental (775), Pho 75 (771, OSM tag says 711), Asian Bakery (757), Great Wall (700), Giant Food (625), Bread Corner (591), Aria (595), Popeyes (587), Hong Kong Tea House (605), Rockville Post Office (500 N Washington), Wells Fargo (502), fuel at 510 (county name Freestate), City Center garage (501), Exchange Place (451), Heritage House (95 Dawson), DHHS (401), Corner Bites (316 N Washington), T-Swirl (313), Bob's Shanghai 66 (309), Montgomery County ABS (300 N Washington), Vibes (1 Dawson), Gimme More Thai (13 Dawson).

Signs are plain text on a colour block. They are not logo artwork.

## Modules

Applied from `public/districts/hungerford/styles.json`, not from a random seed.

- Brick skin (Poly Haven `red_brick`, CC0, 1K WebP)
- Panel skin for stucco and concrete (Poly Haven `concrete_wall_001`, CC0, 1K WebP), tinted per building
- Storefront bays, parapet lip, fabric awnings, metal canopies, entry canopies
- Grocery entry and billboard band
- Fuel canopy on columns, stopped short of the travel lane and of other footprints
- Bank windows, civic punched windows
- Office ribbon (1971 tower, 10 bands on the measured 40.83 m) and punched bronze office (451 Hungerford, 7 floors)
- Apartment windows and alternate balconies (Heritage House, 6 floors inside the measured 19.11 m)
- Townhouse door, hood, and upper windows
- Garage deck slots (501 Hungerford, 5 levels; courtyard holes left open)
- Text signs on one shared canvas
- Rooftop units, 0.85 m, set back on roofs that ask for them

The base extrusion, roof height, party-wall cut, and collider stay in `src/buildings.js`. The district code only adds a skin and openings about 4–10 cm proud of walls that are already drawn. Canopies and balconies do not add collision.

## Shared hooks

Kept in the shared files so a parallel district can pass the same arguments and otherwise be ignored:

- `src/buildings.js` accepts `districtIds` and `districtColor`, skips the generic window grid for those ids, and returns `facadeEdges` after the party-wall trim.
- `src/main.js` loads the style file, calls `dressHungerford`, and exposes the district walk in audit mode.
- `src/utils.js` adds `worldToLonLat`.
- `src/walk-test.js` honours optional `shot.eye`, `shot.lookEye`, and `shot.locked`.

District code and textures live in `src/districts/hungerford/` and `public/districts/hungerford/`. Roads, parking, terrain, and other districts were not edited.

## Reference photos

Google Street View frames and Bing aerials were not downloaded. There is no Street View key here, and those images are not licensed for the repo. County pictometry was not opened. What was used: the county footprint and height table, the audit polygon, OpenStreetMap names, and the public pages linked below. Materials for unnamed bays follow the year band in the style script (brick before 1975, warm panel from 1975, cream panel from 1990). That is a documented rule, not a photograph of each bay.

| Render | Real-world reference (link only) |
| --- | --- |
| gLeaf, north end | County 808 Hungerford; OSM node gLeaf. No embeddable storefront photo. |
| Giant | [Giant store page, 625 Hungerford](https://stores.giantfood.com/md/rockville/625-hungerford-drive) |
| Popeyes row | [Popeyes, 587 Hungerford](https://www.popeyes.com/restaurants/restaurant_84528) |
| Wells Fargo | [Wells Fargo, 502 Hungerford](https://locations.wellsfargo.com/md/rockville/502-hungerford-dr) |
| Office tower | [401 N Washington / Gateway](https://www.401nwashington.com/) and the SSA listing for 315 N Washington. The measured 40.83 m mass, year 1971, is on footprint 208937. |
| Heritage House | [Quantum listing, 95 Dawson](https://www.qpmgmt.com/properties/heritage-house/) |
| Walgreens, not dressed | [Walgreens, 430 Hungerford](https://www.walgreens.com/locator/walgreens-430+hungerford+dr-rockville-md-20850/id=15117) |
| Fire Station 3, not dressed | OSM `amenity=fire_station` at 380 Hungerford, inside town-center-core |

## Screenshots

Headless Chrome, SwiftShader, 1280×720. The overview frame extends fog from 670 m to 1600 m so the whole district is visible. The other frames use the game fog.

| View | File |
| --- | --- |
| gLeaf, looking north | `screenshots/gleaf-north.png` |
| North end, looking south | `screenshots/gleaf-south.png` |
| Giant | `screenshots/giant.png` |
| Popeyes and the tenant row | `screenshots/popeyes.png` |
| South edge toward Fire Station 3 | `screenshots/fire-station.png` |
| South edge toward Walgreens | `screenshots/walgreens.png` |
| Wells Fargo | `screenshots/wells-fargo.png` |
| Taller buildings | `screenshots/apartments.png` |
| Townhouse rows | `screenshots/townhouses.png` |
| Hungerford looking north | `screenshots/street-north.png` |
| Hungerford looking south | `screenshots/street-south.png` |
| Elevated overview | `screenshots/overview.png` |

## Walk test

Same harness as PR #4. Decorations are not colliders.

| Check | This branch | PR #4 baseline |
| --- | --- | --- |
| City road samples | 7,833 | 7,833 |
| Blocked by a building | 33 (0.42%) | 33 (0.42%) |
| Hungerford-ring road samples | 1,313 | not split out |
| Blocked inside the ring | 0 | — |

## Performance

Same headless Chrome and SwiftShader as the geometry report. Published PR #4 numbers were 16 draw calls, 334,261 triangles, 285 ms.

On this VM:

| Camera | Draw calls | Triangles | Frame time |
| --- | --- | --- | --- |
| Metro stand (new meshes out of view) | 16 | 305,245 | 557 ms |
| Hungerford, looking north | 18 | 319,492 | 643 ms |

The metro camera still issues 16 draws, matching the baseline count, and it is already at 557 ms on this machine. The published 285 ms was a different SwiftShader run. The corridor view adds 2 draw calls. The dresser itself is 6 meshes and 16,088 triangles (32 signs). Triangle count is lower than 334,261 because Hungerford no longer uses the citywide window instances.

New district files under `public/districts/hungerford/` are 252 KB (brick 93 KB, concrete panel 10 KB, the rest the style JSON).

## Limitations

- No Street View or aerial photo was available to copy a facade from, so unnamed bays share a year-band material and a blank sign.
- Great Wall's node sits on 700 Hungerford, whose measured height is 2.84 m. The sign is on that low shed. It is not a full grocery hall.
- Popeyes is a 3 m by 20 m county sliver. The sign is on that sliver.
- Pho 75 is tagged 711 Hungerford. There is no 711 footprint. The name is on 771, 8 m from the node.
- The 40.83 m tower is addressed 315 N Washington in the county file and marketed as Gateway at 401 N Washington. The ribbon is on the footprint that carries the height. There is no GATEWAY or SSA wordmark.
- Heritage House listings say 7 storeys. The measured roof is 19.11 m, so the facade uses 6 floors.
- 401 N Washington's low pad is an estimated 5.66 m. It is a stucco storefront at that estimate.
- Rooftop units add up to 0.85 m above the measured roof, set back from the edge.
- Walgreens and Fire Station 3 are outside the polygon and are still generic.
- Fuel brands disagree (county Gulf versus OSM Marathon at 801; county Sunoco was not in the OSM fuel query). Those canopies say FUEL. Sunoco keeps the county name as plain text.
- The overview is the only frame with fog pushed out to 1600 m.
- Frame time is software WebGL on this VM, not a phone GPU.
