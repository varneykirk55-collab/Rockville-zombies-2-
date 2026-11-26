# Limitations and open questions

## Conflicts that block a height

- **51 Monroe Place.** Planning 3D: 241.63 ft for one part covering the footprint. Rockville: 74.36 ft for the part named MC Government at that location, with lower parts beside it. Both carry source code 5. This audit did not open the LiDAR points, so it cannot say which number is the roof. Do not extrude either until the owner chooses a rule.
- **Executive Office Building.** Planning 222.89 ft, Rockville 207.23 ft, about 4.8 m apart, same building within about 2 m. Close enough to show both tables are in feet and in the same range. Not close enough to publish a single height without saying which table.
- **Circuit Court.** Planning 169.44 ft at 50 Maryland Avenue. A Rockville Circuit Court part 22 m away is 84 ft. They were not overlayed as the same polygon.
- **Bridge surface.** Planning polygon 1319 says Asphalt. The city notice of 1 December 2020 describes glass panels. The planimetric code is not the enclosure.

## Edges the owner has now set

West −77.155, north at gLeaf, east on the rail with a station bulge, south adjusted so 208 Monroe Street and 700 Rockville Pike are in and the school polygon is out. The Highland Avenue circle is excluded. Remaining edge questions are in the questions at the end of this file, not a choice between the old rectangles.

## Data that was not opened

- Montgomery Planning Buildings 3D **FeatureServer** returns HTTP 500. The MapServer was used instead.
- USGS 3DEP ImageServer identify returned `NoData` for the Rockville points. Elevations were taken from the Maryland DEM and from EPQS. The 3DEP project name for this cell was not retrieved.
- LAS / LAZ for the 2020–2021 and 2018 collections. No roof was recomputed from points. There is no DSM in the Maryland Montgomery lidar folder.
- The 2023 countywide canopy geodatabase (planning page: about 3.9 GB) and the canopy height and density geodatabases. The feature service used here is the 2014–2018 change layer.
- Countywide planimetric CAD downloads.
- NAIP image pixels and the NAIP year for this cell. Only the MD iMAP index service was opened.
- A statewide six-inch image service was not in the MD iMAP Imagery folder. The six-inch product that did respond is Rockville's 2017 ortho. Its pixels were not exported. The 2023 three-inch export was looked at and not committed.
- Mapillary. No client token.
- The 2001 Town Center Master Plan PDF itself. Quotations in this audit come from the 2005 WMATA station study and the city's 2020 bridge notice.
- A zoning or Town Center boundary polygon. The planning CBD service timed out.
- Rockville building heights for every footprint. The cross-check is the tall set and the gLeaf envelope, not all 1,464 rows.
- Gable counts per district. The 202 gable roofs are a bounds-wide total.
- Deck elevation and clearance of the pedestrian bridge. The plan gives the footprint, not the section.
- In-game screenshots. The six camera stands are listed in the boundary note. They were not shot.

## Technical limits of the sources that did respond

- Planning heights are a 1:1,200 planimetric attribute. The description says LiDAR. The source-code domain dates the footprint capture, and most parts in this window are still code 5 (2014) even though the 3D service text says March 2023.
- `YEAR_BUILT` is 0 on 577 of 1,865 parts. That cannot drive an era kit.
- Street `F_ELEV` / `T_ELEV` are 0 on the downtown segments inspected.
- The canopy layer's "Gain" class is 26,047 polygons for only 9.97 ha. Most pieces are tiny. Instancing them one-for-one is the wrong mesh.
- The forest layer's 8.98 acres is the sum of the `ACRES` attribute on intersecting polygons, not a clip, and the layer's own description says it is not a quality survey.
- The tangent projection in `src/utils.js` is the game's frame. Over 1.7 km it is the right frame to stay in. It is not a survey adjustment. This audit did not estimate the metres of difference between that tangent and Maryland State Plane.
- Rockville's building service source-code list stops at 2020. Planning's list includes 2023 and 2025. They are not the same vintage.
- OSM school and bridge geometry is ODbL and was used because the county school footprint does not cover the campus grounds. It is not a deed.

## Still open after 001B

- Deck elevation and clearance of the pedestrian bridge. Plan and endpoints are known. The public EPT index does not cover this point, so a LAS tile or a measured section is still required.
- Unresolved skyline rows in `height-reconciliation.csv`: Circuit Court (two towers), 32 Courthouse Square, 1 Church Street, the District Court at 191 East Jefferson, the Cambria / Town Square tower at 196 East Montgomery, and 451 Hungerford Drive. No chosen height is filled in for those.
- 239 of 508 footprints are Unresolved. Most of those have no joined measurement at all, not a conflict. They need a Planning or Rockville join before they get a height. They do not get the area-seed formula.
- Whether the east line should step off the western rail centerline onto the sidewalk. East-side shops that were tested, including 811 Hungerford and Giant, fall west of that centerline and are inside. A building that straddles the rail was not clipped on its own.
- The 131 m between latitude 39.09510 and the first named college footprint was not walked building by building. The cutoff is the 800 block, as directed.

## What would make the next pass shorter

- A LAS tile, or any other point cloud, over the bridge and over the unresolved skyline addresses.
- A deck elevation the owner already has for the glass bridge.
- A decision on the unresolved rows: leave them blank until measured, which is what this table does now.
