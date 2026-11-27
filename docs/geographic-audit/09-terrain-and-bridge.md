# Terrain, bridge, and the other layers

## Terrain source

Use the Maryland Montgomery County DEM in metres:

[MD_montgomery_dem_m](https://mdgeodata.md.gov/lidar/rest/services/Montgomery/MD_montgomery_dem_m/ImageServer)

It is a bare-earth mosaic. The service description says nominal pulse spacing 0.35 m, USGS Base Lidar Specification 2.1, collected late 2020 to early 2021, delivered as NAVD88 GEOID12B feet and served here in metres. Pixel size in the service is 1. Identify calls return metres.

USGS EPQS at the same three points agrees within 5–11 cm (origin 133.473 m versus 133.521 m, Executive Office Building 129.015 m versus 129.003 m, 808 Hungerford 141.027 m versus 140.966 m). That is the check that this DEM is a usable ground. From the high-school building centroid (123.76 m) to 808 Hungerford (140.97 m) the ground rises 17.2 m. The game plane does not.

Street `F_ELEV` / `T_ELEV` stay unused. They were 0 on the downtown segments.

Method for a later mesh: sample this image service on a 10 m grid over the polygon, subtract 133.52 m (the DEM at the game origin), and set each building base from Planning `BLDG_ELEV` in the same way. Do not sample a 1 m grid into triangles. The shadow map and the fog distances in `src/scene.js` are built for one ground.

## Point clouds that were not available

The public USGS EPT index at `hobuinc/usgs-lidar` `boundaries/resources.geojson` (2,284 projects, downloaded 26 November 2026) has no polygon that contains downtown Rockville. A point-in-polygon test against every Maryland and National Capital project in that file missed. Names that do exist, and do not cover this point, include `MD_VA_NCB_KGeorge_1_2020`, `USGS_LPC_MD_VA_Sandy_NCR_2014_LAS_2015`, and `MD_PotomacRiver_Bathy_2019`. There is no `MD_Montgomery_2020` EPT. Direct requests for eight likely keys on `s3://usgs-lidar-public` returned 404.

The Montgomery lidar that MD iMAP describes is already baked into the DEM above. The LAS tiles were not in the public EPT bucket, and they were not downloaded. The Montgomery lidar folder on MD iMAP has DEM, hillshade, slope, aspect, and shaded relief. It has no DSM or nDSM, so roof height cannot be recomputed from that service.

An OpenTopography catalog request for the Rockville box returned global rasters first (Copernicus GLO-30, GEDTM, GEBCO). Those are 30 m class surfaces, not a substitute for the 1 m county DEM, and they were not downloaded.

Fallback if the Maryland image service is down: USGS EPQS, which matched it to about a decimetre at the three tested points. EPQS does not return a project name. The 3DEP ImageServer identify call still returns NoData here, so it is not the fallback.

## Pedestrian bridge

The bridge has a plan and two ends. It does not yet have a deck elevation.

| Item | Value |
| --- | --- |
| OSM | Way 266681164, `highway=footway`, `bridge=yes`, `layer=1`. West end −77.147906, 39.084072 (game X 354 m, Z 214 m). East end −77.146665, 39.084408 (game X 462 m, Z 177 m). |
| County centerline | Name `ROCKVILLE METRO PED BRG`. |
| Planning bridge polygon 1319 | Same footprint. `SHAPE.AREA` 4,664.6 square feet (about 433 m²). `SURFACE` is Asphalt. Source code 5 (Captured 2014). |
| Ends | West landing is on the Town Center side of the Pike. East landing is at the station, west of the platform. The county station point is 3 m from the east end. |
| Ground under it | Maryland DEM about 129.7 m. That is the road and rail bed, not the deck. |
| Deck elevation | Not measured. The DEM is bare earth. No EPT project covers the point. Street elevation attributes are 0. |
| Enclosure | City notice of 1 December 2020 describes glass panels over Rockville Pike. The planimetric surface code says Asphalt. Both stand. The glass is the enclosure; the code may be the deck surface. A section was not found. |

The bridge is the connection the owner wants kept walkable. A later model can be placed on way 266681164. Until a deck height is measured, do not invent the clearance over the Pike. The polygon already includes both landings and the east station loop, so the path has somewhere to arrive.

## Roofs, party walls, canopy, parking, plazas

These methods did not change. The counts are from the first audit and still apply inside the old rectangle; the new polygon is the western and station portion of that rectangle.

- Roofs: Rockville `ROOF_TYPE` in the old rectangle is 1,631 flat and 202 gable. Use that code when a Rockville part joins the footprint. Otherwise flat, and say so. Do not invent a ridge height. The Planning 3D service text mentions roof type and the field list does not have it.
- Party walls: about 7,030 m of county-footprint edge is shared inside the old rectangle. Drop one of the two coincident faces when extruding. Class `Q` only marks 53 footprints; the shared edge is the real test.
- Canopy: the 2014–2018 change service (WKID 2248) has 48.2 ha of No Change and 9.97 ha of Gain in the old rectangle, in 28,810 polygons. Instance a point per cell. Do not mesh every polygon. The 2023 canopy-height geodatabase (about 5.9 GB on the planning download page) was not fetched, so tree height is still unmeasured.
- Forest: 26 polygons, 8.98 acres on the `ACRES` attribute, not a clip. This is not a continuous woods.
- Parking: 197 Planning polygons in the old rectangle. The station lots are named and are inside the bulge. Draw them as surfaces on the DEM, not as buildings.
- Plazas: no plaza polygon was found as its own layer. Town Square is the junction already used as the spawn, at East Montgomery and Helen Heneghan. It is paving and footprints, not a separate dataset.
- Sidewalks: 2,826 Planning polygons, 1,065 Rockville lines with width and 2014–15 slope, and 80 segments the city marks missing. Replace the fixed +2 m ribbon with those polygons, and do not draw a sidewalk on a missing segment.
