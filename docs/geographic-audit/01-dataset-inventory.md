# Dataset inventory

Every service below was requested on 26 November 2026 unless the row says otherwise. "Empty copyright" means the layer JSON's `copyrightText` was an empty string. It does not mean the data is unlicensed.

## Services the game already calls

| Dataset | Endpoint | What was verified |
| --- | --- | --- |
| Montgomery County building footprints | [FeatureServer layer 0](https://geohub.montgomerycountymd.gov/mapping1/rest/services/Structures/Building_Footprints/FeatureServer/0) | Query returned 1,998 polygons intersecting the current game bounds. Fields include `OBJECTID`, `BLDG_ID`, `BLDG_NAME`, `BLDG_CLASS`, `ADDRESS`, `STREET_NAME`, `BLDG_TYPE`. There is no height, stories, roof, or elevation field. `BLDG_TYPE` was null on the landmark records inspected. |
| Montgomery County street centerlines (CLINE) | [FeatureServer layer 0](https://geohub.montgomerycountymd.gov/mapping1/rest/services/Transportation/Street_Centerline/FeatureServer/0) | Fields include name, address ranges, `SPEED`, `CFCC`, and `F_ELEV` / `T_ELEV`. There is no width field. Copyright text: "Montgomery County Geographical Information Systems". On the Hungerford, Rockville Pike, and Washington segments inside the study window, `F_ELEV` and `T_ELEV` were 0. Those fields are not usable terrain. |

The footprint layer description explains `BLDG_CLASS`: `P` is the largest footprint of an address, `S` is a smaller separated footprint of the same address, and `Q` marks large connected footprints. In the game bounds the classes were P 1,375, S 570, Q 53.

## Measured building height

| Dataset | Endpoint | Height | What was verified |
| --- | --- | --- | --- |
| Montgomery Planning Buildings 3D | [MapServer layer 0](https://montgomeryplans.org/server/rest/services/Overlays/Buildings_3D/MapServer/0) | `BLDG_HEIGHT` and `BLDG_ELEV`, both doubles. The layer description says height is in feet. There is no unit column. | 1,865 parts intersect the game bounds. Feature code 2201 (Buildings): 1,848, height 3.64 to 241.63, mean 24.93. Feature code 2205 (Parking Garage): 17, height 7.94 to 45.38. No null heights. `HasZ` is not set; the height is an attribute, not a Z coordinate. The description also says each feature has a roof type. The field list does not include `ROOF_TYPE`. |
| Same layer, FeatureServer | [FeatureServer](https://montgomeryplans.org/server/rest/services/Overlays/Buildings_3D/FeatureServer) | — | HTTP 500: `Server object extension 'featureserver' not found`. Use the MapServer. |
| Montgomery Planning Buildings (2D) | [FeatureServer layer 0](https://montgomeryplans.org/server/rest/services/Overlays/Buildings/FeatureServer/0) | None | The description repeats the "height in feet and roof type" sentence. The field list has `YEAR_BUILT`, `NAME`, `LANDUSE`, and no height or roof field. `HasZ` is false. |
| City of Rockville buildings | [Impervious Surface MapServer layer 4](https://maps.rockvillemd.gov/agsint/rest/services/PublicWorks/ImperviousSurface/MapServer/4) | `HEIGHT`, `ELEVATION`, `ROOF_TYPE` | Description: height in feet, captured for mapping at 1:1,200, derived, clipped to the city boundary plus 500 feet. Roof domain: Gable, Flat, Uncertain, Not Applicable. In the game bounds: 1,835 features, Flat 1,631, Gable 202, Not Applicable 1. Source-code domain stops at Captured 2020. Planning's domain continues through Captured 2025, so this Rockville copy is an older extract. |

`BLDG_ELEV` on the two tallest Planning parts (422.21 ft and 418.90 ft) converts at 0.3048 m/ft to 128.69 m and 127.68 m. The Maryland bare-earth DEM at those centroids is 129.79 m and 129.00 m. The bases match the ground within about 1.3 m, which is the evidence that the elevation numbers are feet rather than metres. A 241 m building does not exist in this district, and a median part height of 20.5 ft matches low buildings. The same conversion is used for `BLDG_HEIGHT` in the comparison table. See [04-height-comparison.md](04-height-comparison.md) before treating any single height as the roof height: Planning and Rockville disagree on the county buildings.

Planning source codes inside the game bounds: 1,516 Captured 2014 (code 5), 137 Captured 2023 (code 8), 119 Captured 2017 (code 6), 93 Captured 2020 (code 7). The service description says the 3D buildings were created by adding LiDAR height to split footprints. The source code is the footprint vintage, not a separate height date. `YEAR_BUILT` is populated on every part, but 577 of 1,865 values are 0 and are not construction years.

Land use on the 1,865 parts: Single Family Detached 816, Shed 518, Multi-Family 134, Office 96, Warehouse 79, Single Family Attached 64, Retail 60, Institutional/Community Facility 54, and smaller classes.

## Elevation

| Dataset | Endpoint | What was verified |
| --- | --- | --- |
| Maryland Montgomery County DEM, metres | [MD_montgomery_dem_m](https://mdgeodata.md.gov/lidar/rest/services/Montgomery/MD_montgomery_dem_m/ImageServer) | Bare-earth mosaic. Pixel size 1 by 1 in EPSG:2893. Description: nominal pulse spacing 0.35 m, USGS Base Lidar Specification 2.1, collected late 2020 to early 2021, original delivery NAVD88 GEOID12B in feet, classified LAS 1.4. Identify results are in metres (the service name and the values both say so). |
| USGS 3DEP ImageServer | [3DEPElevation](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer) | Service JSON loaded. Copyright text: "USGS National Map 3D Elevation Program (3DEP). October 27, 2026." Point identify at the same Rockville coordinates returned `NoData` and an empty catalog, so this audit did not read a 3DEP project name from that call. |
| USGS Elevation Point Query Service | [EPQS](https://epqs.nationalmap.gov/v1/json?x=-77.152&y=39.086&units=Meters&wkid=4326) | Returned a value, `rasterId` 98255, and `resolution` 1. No license field in the JSON. |

Sampled ground elevations, metres:

| Place | Maryland DEM | USGS EPQS |
| --- | --- | --- |
| Game origin (−77.152, 39.086) | 133.521 | 133.473 |
| 808 Hungerford centroid | 140.966 | 141.027 |
| 101 Monroe St centroid | 129.003 | 129.015 |
| 51 Monroe Pl centroid | 129.788 | not requested |
| County metro point | 130.489 | not requested |
| Pedestrian bridge midpoint | 129.725 | not requested |
| RMHS building centroid | 123.760 | not requested |
| OSM school north tip | 127.516 | not requested |

The DEM and EPQS agree to about 5–11 cm at the three points requested from both. From the RMHS building centroid to 808 Hungerford the Maryland DEM rises 17.2 m. The game ground is a single plane.

There is no DSM or first-return surface in the Montgomery lidar folder. The folder lists DEM, aspect, hillshade, slope, and shaded relief only. Building height cannot be recomputed from these image services. The LiDAR point cloud itself was not downloaded.

The 2018 Montgomery and Prince George's collection (0.7 m nominal pulse spacing, early to mid 2018) is a different project from the 2020–2021 DEM described above. This audit did not download either LAS archive. The NOAA InPort record for the 2018 collection was not opened beyond the search result that identified it.

## Roads, sidewalks, parking, bridges, canopy

Counts are features intersecting the current game bounds (−77.155, 39.080, −77.140, 39.095).

| Layer | Endpoint | Count | Fields that matter |
| --- | --- | --- | --- |
| Planning sidewalks and driveways | [MapServer layer 3](https://montgomeryplans.org/server/rest/services/Overlays/Sidewalks___Driveways/MapServer/3) | 2,826 | `FEATURE_CODE`, `SOURCE_CODE`, `SURFACE`, `NAME`. No width field. The FeatureServer URL for this service returned layer 0 as not found; the data is on MapServer layer 3. |
| Planning parking | [MapServer layer 6](https://montgomeryplans.org/server/rest/services/Overlays/Parking/MapServer/6) | 197 | Same planimetric fields. FeatureServer layer 0 was not found. |
| Planning bridges | [MapServer layer 1](https://montgomeryplans.org/server/rest/services/Overlays/Bridges/MapServer/1) | 5 | Same fields. Four fall in the station window. One of those four, object 1319, has the same extent as the OSM footway bridge (about −77.14788 to −77.14665, 39.08407 to 39.08443). Its `SURFACE` value is `Asphalt`. |
| Planning tree canopy change, 2014–2018 | [FeatureServer layer 0](https://montgomeryplans.org/server/rest/services/Overlays/Tree_Canopy/FeatureServer/0) | 28,810 | `CLASS` and `Shape__Area`. Spatial reference WKID 2248 (US feet). No Change: 2,763 polygons, 5,191,969.5 square feet (48.2 ha). Gain: 26,047 polygons, 1,073,616.7 square feet (9.97 ha). No Loss rows were returned. |
| Planning forests | [MapServer layer 0](https://montgomeryplans.org/server/rest/services/Overlays/Forests/MapServer/0) | 26 | `SOURCE_YEAR`, `UPDATE_YEAR`, `ACRES`, `STATUS`. Description: the 2008 forest layer edited from 2015 air photos; the edge follows the forest floor; quality is not recorded. The 26 intersecting polygons list 8.98 acres in total on the `ACRES` field. That sum is the attribute, not a clip to the game bounds. |
| Planning hard-surface trails | [MapServer layer 1](https://montgomeryplans.org/server/rest/services/Overlays/Hard_Surface_Trails/MapServer/1) | 0 | — |
| Planning pedestrian shortcuts | [FeatureServer layer 0](https://montgomeryplans.org/server/rest/services/Overlays/Pedestrian_Shortcuts/FeatureServer/0) | 0 | — |
| Rockville curb ramps | [MapServer layer 1](https://maps.rockvillemd.gov/agsint/rest/services/PublicWorks/Rockville_LGIM_Sidewalk_Curb_Ramps/MapServer/1) | 426 | `WIDTH`, `SLOPE`, `ADA_COMPLIANT`, `CONDITION` |
| Rockville sidewalk slopes | [MapServer layer 2](https://maps.rockvillemd.gov/agsint/rest/services/PublicWorks/Rockville_LGIM_Sidewalk_Curb_Ramps/MapServer/2) | 1,065 | Description: slope added from the 2014–15 LiDAR DEM. `WIDTH`, `Min_Slope`, `Max_Slope`, `Avg_Slope`. |
| Rockville missing sidewalks | [FeatureServer layer 0](https://maps.rockvillemd.gov/agsint/rest/services/PublicWorks/Missing_Sidewalks/FeatureServer/0) | 80 | Street names and priority. |

Montgomery Planning's public GIS page describes a separate 2023 tree-canopy geodatabase of about 3.9 GB, plus canopy height and density geodatabases. Those files were not downloaded. The feature service above is the 2014–2018 change layer, not that 2023 product.

Countywide planimetric CAD (buildings, bridges, parking, sidewalks, roads) is offered as large downloads from the same planning GIS page. Those files were not downloaded. The feature services above are the slice that was queried.

## Places used to draw the boundary

| Place | How it was located |
| --- | --- |
| gLeaf | County footprint `OBJECTID` 338888, address `808 HUNGERFORD DR 20850`, name blank, centroid −77.153844, 39.094821. OSM node 13626911178 is named gLeaf at −77.153775, 39.094797, 6.6 m from that centroid. The business page retrieved in search gives the same street address. The county record itself does not say gLeaf. |
| Hungerford at that address | Centerline segments with address ranges 800–810 and 801–811 run from about 39.09416 to 39.09506, just east of the footprint. Speed attribute 35. |
| Montgomery College, Rockville | 19 footprints named `Montgomery College - Rockville Campus`, addresses 51 Mannakee St and 51 N Campus Dr. Envelope −77.161632 to −77.154939, 39.096234 to 39.100850. That is north of the 800 block. |
| Richard Montgomery High School | County building `250 RICHARD MONTGOMERY DR`, north edge of the footprint 39.079875. OSM way 239942500, `amenity=school`, northernmost vertex 39.080413 at −77.146141. The campus polygon extends about 60 m north of the building at that tip. |
| Rockville station | County Metro Stations feature, name Rockville, address 251 Hungerford Dr, longitude −77.146634, latitude 39.084431. OSM station nodes sit slightly east, at −77.145931 and −77.146064. |
| Pedestrian bridge | OSM way 266681164, `highway=footway`, `bridge=yes`, `layer=1`, from −77.147906, 39.084072 to −77.146665, 39.084408. County centerline name `ROCKVILLE METRO PED BRG` covers the east end of the same span. Planning bridge polygon 1319 matches the footprint. |
| Highland Avenue circle | Not a named roundabout in the centerline table or in an OSM `junction=roundabout` query (that query returned no roundabouts). The Rockville 2023 ortho export shows a traffic circle on Highland Avenue. Centerline vertices pass through −77.14292, 39.08510 and −77.14250, 39.08525. The marked point −77.14260, 39.08520 is an estimate within about 25 m, not a surveyed center. |

The 2023 ortho of the station shows a bus loop on the Pike side of the tracks, the footbridge, platforms, and a surface parking lot on the east side. It does not show a roundabout in the station pavement itself. The only circle in that export is the Highland Avenue one, east of the parking.

## Imagery

| Dataset | What was verified |
| --- | --- |
| [Rockville ortho 2023, 3 inch](https://maps.rockvillemd.gov/rkvimg/rest/services/Rockville_Ortho2023_3in/ImageServer) | Pixel size 0.0762 m (3 inches) in Web Mercator. Copyright: "Maryland Geographical Information Office Dept. of Information Technology". Description: 0.25-foot, 4-band, Sanborn. An export of the station area returned a PNG and was used to look for the roundabout. The image was not committed. |
| [Rockville ortho 2017, 6 inch](https://maps.rockvillemd.gov/rkvimg/rest/services/Rockville_Ortho2017_6in/ImageServer) | Pixel size 0.1524 m. Copyright: "State of Maryland, City of Rockville". Description: "Rockville 2017 Orthophoto, 6-inch". Pixels were not exported. |
| Rockville image server folder | Also lists orthos for 1998, 2000, 2002, 2004, 2006, 2008, 2011, 2014 (3 in and 6 in), and 2020 (3 in). Those services were not opened individually. |
| [MD iMAP NAIP index](https://mdgeodata.md.gov/imap/rest/services/Imagery/MD_NAIPImageryGrid/MapServer) | Service JSON loaded. Copyright: "MD iMAP, USDA FSA". It is an index grid for the latest NAIP acquisition, not the imagery tiles. The year covering Rockville was not queried. |
| MD iMAP Imagery folder | Lists photo-center and tile-grid services plus the NAIP index. No statewide six-inch image service was in that folder. The six-inch coverage inspected for Rockville is the 2017 city service above. |
| Mapillary | Not queried. The public API needs a client token, and this audit did not have one. |
| OpenStreetMap | Overpass queries on 26 November 2026 returned the gLeaf node, the school polygon, the footway bridge, and the station nodes used above. Tiles for the maps came from `tile.openstreetmap.org`. License: ODbL. |

## Plans and identity sources

The 2001 Rockville Town Center Master Plan was not downloaded as its own PDF. Two documents that quote it were retrieved:

- The [August 2005 WMATA Rockville Station Access Improvement Study](https://www.rockvillemd.gov/wp-content/uploads/2025/09/WMATA-Rockville-Metro-Station-Access-Improvement-Study-August-2005.pdf) says the Mayor and Council adopted the Town Center Master Plan in October 2001, and that the plan called for a pedestrian promenade from the station across MD 355 to the Town Center.
- The City of Rockville news item [Rockville Metro Pedestrian Bridge Repairs Underway](https://www.rockvillemd.gov/news/2020/12/01/rockville-metro-pedestrian-bridge-repairs-underway/) (1 December 2020) describes the bridge linking Town Center and the station over Rockville Pike, including shattered glass panels. That is the evidence the enclosure is glass. It disagrees with the planimetric `SURFACE` value `Asphalt` on bridge polygon 1319.

This audit does not restate the master plan's design rules beyond those quoted passages.

## License notes that were actually on the payloads

- Street centerlines: "Montgomery County Geographical Information Systems".
- Footprints, Planning 3D, and the Rockville building layer: `copyrightText` empty. The footprint layer the game already cites is attributed in `src/footprints.js` to Montgomery County Planning, M-NCPPC, and Montgomery County GIS / TEBS. Planning's own service description names Information Technology & Innovation, Montgomery County Planning Department, MNCPPC.
- 2023 ortho and 2017 six-inch ortho: copyright strings quoted above.
- 3DEP ImageServer: USGS copyright string quoted above. EPQS returned no license field.
- Maryland DEM: description credits the Eastern Shore Regional GIS Cooperative and Maryland DoIT. `copyrightText` was empty.
- NAIP index: "MD iMAP, USDA FSA".
- OSM: ODbL.

The City of Rockville maps page says the city's GIS is provided as-is and is not a survey. That sentence is from the public page content retrieved in search, not from a dataset JSON field.
