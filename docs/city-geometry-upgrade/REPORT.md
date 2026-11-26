# City geometry upgrade

This pass replaces the area-and-seed building heights and the flat ground with the approved playable boundary, the reconciliation table, and a 10 m Maryland DEM grid. It does not merge into `main`, and it does not merge the landmark or audit branches.

The audit documents and tables are included from `grok/geographic-data-audit` under `docs/geographic-audit/`. Runtime files are under `public/data/`. Per-building evidence is in `docs/city-geometry-upgrade/data/heights-applied.csv`.

Screenshots were taken in headless Chrome with SwiftShader (ANGLE). They show the procedural city. They are not a claim that a facade matches a photograph.

## Playable boundary

The outline is `docs/geographic-audit/data/playable-boundary.geojson`. West stays on −77.155, north stops at the Hungerford 800 block, the east edge follows the rail and bulges around the Metro parking lot, and the south edge keeps 208 Monroe Street and 700 Rockville Pike while leaving Richard Montgomery High School outside. Montgomery College stays north of the cutoff.

Inside that polygon the county snapshot has the 508 audit footprints plus four more whose polygon centroids also fall inside:

| Object | Address | Height | Why it is extra |
| --- | --- | --- | --- |
| 231351 | 819 Hungerford Drive | 4.79 m Estimated | Centroid inside; not in the 508-row table |
| 134158 | 208 Monroe Street | 9.43 m Estimated | Second footprint at an address whose other footprint is High at 9.43 m |
| 134153 | 210 Monroe Street | 5.12 m Estimated | Centroid inside the south dip; no joined measurement |
| 130318 | 204 Highland Avenue | 5.12 m Estimated | At −77.1445, 39.0847, on the station side. The Highland Avenue circle near −77.1426, 39.0852 stays outside |

231 low-detail backdrop footprints sit within 55 m outside the line. They are flat 7 m masses, or they are omitted beyond that apron. Backdrop trees use one unmeasured crown (trunk 2.4 m, crown 6.5 m). The ground changes from the urban colour to grass across about 18 m. Nothing in the collision test blocks a point only because it crossed the boundary.

## Height coverage

Of the 508 audit footprints:

| Confidence | Count | Meaning |
| --- | --- | --- |
| High | 137 | Approved measured value, unchanged |
| Medium | 132 | Approved measured value, unchanged |
| Estimated | 239 | Was Unresolved. Now filled and labelled an estimate |

No height uses `massHeight` or a random seed. The tallest mass is 51 Monroe Place at the High value 73.65 m. The shortest measured mass is 0.95 m.

How the 239 estimates were chosen:

| Method | Count | Rule |
| --- | --- | --- |
| median-of-measured-neighbours | 70 | Median of nearby High/Medium buildings in the same size class |
| single-measured-source | 51 | The only GIS height on that footprint, which the audit had left blank |
| same-address-measured | 44 | No height on this part; another footprint at the same address is High or Medium |
| median-of-lowrise-district | 27 | Fewer than three same-class neighbours, so the district median of that size band |
| higher-measured-lowrise | 24 | Both GIS heights exist, the taller is at most 16 m, and the gap exceeds the Medium band |
| higher-measured | 15 | Both GIS heights exist and the taller is kept so a podium figure does not replace the measured mass |
| lower-measured-large-footprint | 4 | Footprint over 2,200 m² and the two heights differ by more than 80 percent, so the lower value is the main mass |
| published-plan-height | 4 | City of Rockville 22 July 2013 height, or the Rockville measurement it corroborates |
| published-roof | 2 | A published roof, not an average of the two GIS values |
| published-storeys | 2 | A published storey count selects one of the two GIS values |

The four extra footprints add four more Estimated rows, so the runtime file has 243 Estimated entries. Every evidence string is stored on the building and in the CSV.

Roof codes: Rockville `ROOF_TYPE` when a part joined the footprint, otherwise flat. Gable roofs use a 2 m ridge along the long axis. That ridge is a placeholder. There is no DSM, so the ridge height is not a measurement. The mesh name and the height record both say so.

Shared wall faces that overlap another footprint are dropped up to the lower roof. About 11,700 m of wall face was removed in the headless build. That count includes both sides of a party wall, so it is not the audit's one-sided 7,030 m figure. The Circuit Court is drawn as two Planning parts instead of one extrusion. The DHHS building at 401 Hungerford keeps the High main mass of 4.54 m and adds the 31.24 m Planning part on its own polygon.

## The six skyline buildings

| Building | Height | Confidence | How it was resolved |
| --- | --- | --- | --- |
| Circuit Court north tower, 50 Maryland Avenue | 46.02 m (151 ft) | Estimated | Nine storeys above grade ([county history](https://www.montgomerycountymd.gov/circuit-court/about-us/history-our-court)). [SkyscraperPage](https://skyscraperpage.com/b194191/rockville/montgomery-county-judicial-center) Google Earth roof is 151 ft. Planning 169.44 ft (51.65 m) is 18 ft higher and was not used. |
| Circuit Court south tower, same address | 25.60 m (84 ft) | Estimated | Six storeys in the [15 May 2014 press release](https://www2.montgomerycountymd.gov/mcgportalapps/Press_Detail.aspx?Item_ID=11847). Rockville's 84 ft is 14 ft per storey. Drawn on the southern Planning part. |
| 32 Courthouse Square | 13.78 m (45.2 ft) | Estimated | Four storeys ([LoopNet](https://www.loopnet.com/Listing/32-Courthouse-Sq-Rockville-MD/22393107/), Cityfeet). Rockville measured 45.2 ft, which is 11.3 ft per storey. Planning 144.3 ft is not a four-storey building and was not used. |
| 1 Church Street | 38.10 m (125 ft) | Estimated | Nine storeys (Cushman & Wakefield, CompStak). [SkyscraperPage](https://skyscraperpage.com/b194188/rockville/one-church-street-office) Google Earth roof is 125 ft. Planning 139 ft and Rockville 107 ft were not averaged. |
| District Court, 191 East Jefferson | 36.83 m (120.83 ft) | Medium | Already chosen in the approved CSV from the single Planning measurement. Left as Medium. Contemporary reports call the finished building six storeys ([Southern Maryland News, 3 Aug 2011](https://www.somdnews.com/archive/news/rockville-courthouse-reopened-thursday-after-problems-with-sewer-line/article_52d511fd-df3d-5df9-befb-22a79e934a3a.html); a 2008 preview said seven). 120.8 ft over six storeys is 20.1 ft per storey, which is tall and matches a courthouse with a multi-storey atrium, so the measured Planning figure was not replaced by a floor-count guess. The audit narrative still lists a Rockville value of 28.52 m; the approved CSV has no Rockville join within 25 m. |
| Cambria / west tower, 196 East Montgomery | 41.77 m (137.03 ft) | Estimated | [Choice Hotels, 11 May 2015](https://media.choicehotels.com/2015-05-11-Choice-Hotels-Cambria-hotels-suites-Opens-at-Home-Rockville-MD), eight hotel floors in a 15-storey tower. The [city slide of 22 July 2013](https://planning.maryland.gov/Documents/Our-Engagement/773/2013/CityRockvillePresentation072213.pdf) lists 144 ft. Rockville measured 137.03 ft, 2.1 m under that slide. The as-built figure is used. Planning 28.83 m is too short for 15 storeys. |
| 451 Hungerford Drive, Exchange Place | 29.87 m (98.01 ft) | Estimated | Seven storeys, built 1980 ([LoopNet](https://www.loopnet.com/Listing/451-Hungerford-Dr-Rockville-MD/7700922/), Compass, CompStak). Planning 98.01 ft is 14.0 ft per storey. Rockville 70.61 ft is about 10 ft per storey, in line with the listing's unfinished ceiling rather than the roof. |

The same 2013 slide lists 173 ft for the 18-storey Duball tower. No GIS height joined the 2021 Ansel footprints. 52.73 m Estimated is applied to 2 Helen Heneghan Way (735 m²), 4 Helen Heneghan Way (574 m²), and 33 Monroe Street (389 m²). Smaller unmeasured bays on Middle Lane stay in the low-rise neighbour rule. [Comstock's 23 March 2022 release](https://comstock.gcs-web.com/news-releases/news-release-details/comstock-acquires-ansel-rockville-town-center) is the 18-storey identification, not a surveyed roof.

## Terrain

Source: Maryland `MD_montgomery_dem_m`, 2020–21 bare earth, bilinear samples on a 10 m grid (129 by 187). Game Y is elevation minus 133.531 m, the DEM at the origin (−77.152, 39.086). The committed file is `public/data/terrain.json` (83 KB). Raw lidar was not committed.

Buildings sit on the uphill sample under the footprint, with a skirt down to the lowest sample so the downhill side does not float. Roads and the ribbon sidewalks are subdivided about every 8 m and draped on the same grid. 103 Planning parking polygons are draped the same way. The player eye is 1.68 m above the grid plus 4 cm.

The playable grid runs from 122.90 m to 143.75 m, a span of 20.84 m. The audit's 17.2 m figure is the school building (outside the polygon) to 808 Hungerford, not the min and max inside the polygon.

Eleven check points, game grid against a fresh DEM sample and against USGS EPQS:

| Point | Grid − DEM | DEM − EPQS |
| --- | --- | --- |
| Origin | 0.00 m | +0.06 m |
| 808 Hungerford | +0.03 m | −0.07 m |
| Town Square | +0.01 m | −0.03 m |
| 451 Hungerford | +0.01 m | +0.01 m |
| Circuit Court | +0.02 m | +0.11 m |
| Court centroid | +0.08 m | +0.11 m |
| 101 Monroe | +0.03 m | −0.00 m |
| 51 Monroe | +0.09 m | −0.08 m |
| Bridge midpoint | +0.09 m | −0.08 m |
| Metro station | +0.08 m | +0.21 m |
| Pike south stand | 0.00 m | +0.14 m |

The 10 m grid stays within 0.09 m of a direct DEM sample at these points. DEM versus EPQS is within about 0.14 m except at the Metro station point, where the DEM is 0.21 m above EPQS. The audit's three-point check was about 0.05–0.11 m. A direct sample at the 808 Hungerford centroid used here is 140.665 m; the audit recorded 140.966 m at that published centroid.

## Landmarks and the bridge

`public/data/landmarks.json` keys placements to footprint ids.

- Clock tower: footprint 129521, 1 Church Street. `rotationY` aligns the GLB's long axis with the county footprint and turns the facade toward west. Base elevation comes from the DEM. If `public/landmarks/clock_tower_building.glb` is present, the procedural mass and its collider are removed and a single box collider matches the GLB. The file is not on this branch. The headless run got a 404 and kept the procedural mass. The GLB remains on `grok/rockville-landmarks`, which this branch does not modify.
- Turret corner: reserved, `hideProcedural` false. The nearest downtown footprint to the GLB's 31.5 m by 30.5 m plan is 1 Helen Heneghan Way, measured about 29 m by 43 m. That is not a confirmed match, so the county mass is not removed.
- Pedestrian bridge, OSM way 266681164. West end −77.147906, 39.084072. East end −77.146665, 39.084408. Ground under those landings is in the manifest. `deckElevationM`, `clearanceOverPikeM`, and `deckWidthM` are null. The scene marks the two landings on the ground. It does not draw a deck.

## Collision and the walk test

The old rectangle no longer blocks movement. Collision is the footprint ring, with a 0.36 m body radius, the same controller as before. Eye height follows the DEM.

Headless walk, 2 m steps along road centerlines whose midpoint is inside the polygon:

| Check | Result |
| --- | --- |
| Samples | 7,833 |
| Blocked by a building | 33 (0.42%). These are centerline samples that enter a footprint, not a boundary wall |
| Largest ground rise on one road segment | 0.97 m over a 2 m step |
| Steps rising more than 0.45 m | 5 |
| Points past the boundary with no building | Not blocked (tested west of −77.155, north of 39.0951, and east of the rail) |
| Controller from the downtown spawn, 40 steps west | Moved 32 m, 0 steps fully blocked |

## Performance

Headless Chrome, SwiftShader, 1280×720, one shadow map:

| Measure | Value |
| --- | --- |
| Draw calls | 16 |
| Triangles | 334,261 |
| Frame time | 285 ms |

That frame time is software WebGL. It is not a phone GPU measurement. Walls and roofs are merged into a few meshes. Glass is instanced (9,303 windows). The building meshes alone are about 15,200 triangles; the rest is the terrain grid, the road ribbons, and the window instances.

Committed city data is about 1.0 MB (terrain 83 KB, footprints 369 KB, heights 255 KB, parking 245 KB, plus the boundary and landmark files). The four surface textures already in the repo add about 2.7 MB.

## Screenshots

Street-level frames from the headless run:

| View | File |
| --- | --- |
| Hungerford Drive commercial corridor | `docs/city-geometry-upgrade/screenshots/hungerford.png` |
| Town Square | `docs/city-geometry-upgrade/screenshots/town-square.png` |
| Maryland Avenue and Regal | `docs/city-geometry-upgrade/screenshots/maryland-regal.png` |
| Courthouse Square | `docs/city-geometry-upgrade/screenshots/courthouse-square.png` |
| Rockville Pike | `docs/city-geometry-upgrade/screenshots/rockville-pike.png` |
| Metro station | `docs/city-geometry-upgrade/screenshots/metro.png` |

Public pages used as references, not embedded: the county court history, the 2014 south-tower release, the 2013 city slides, the Choice Hotels Cambria release, and the leasing pages linked above. A city photo of the glass bridge is the [1 December 2020 repair notice](https://www.rockvillemd.gov/news/2020/12/01/rockville-metro-pedestrian-bridge-repairs-underway/).

## What is still wrong or unfinished

- 239 of the 508 heights are estimates. Most unresolved rows had no measurement at all; the neighbour and same-address rules are deterministic, and they are not surveys.
- The two published roofs (151 ft and 125 ft) are Google Earth figures from SkyscraperPage, not a new lidar measurement. They disagree with Planning.
- Gable ridges are a 2 m placeholder.
- Road half-widths are still the five estimated constants. Sidewalks are still the offset ribbons, draped on the DEM, not the 2,826 Planning sidewalk polygons. The 80 segments the city marks missing were not removed one by one.
- Tree height is one unmeasured crown.
- The bridge deck elevation, clearance, and width are unknown. They are null on purpose.
- The clock-tower and turret GLBs are not in this branch. The turret footprint is not confirmed.
- A few window instances read as detached where a taller mass stands behind a lower one, and the Maryland Avenue frame is tight against a street wall.
- Five road steps rise about 0.5–1.0 m in 2 m. That is the 10 m grid on a steep cell, not a broken join, and it is still a noticeable step.
- DEM and EPQS differ by 0.21 m at the Metro station point.
- The headless frame time is software rendering. A GPU run was not measured.
