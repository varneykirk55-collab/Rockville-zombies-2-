# Rockville Town Center

A no-build Three.js first-person map foundation set in Rockville, Maryland. The browser loads Three.js r187 and the live Montgomery County building footprint tiles.

## Run locally

From the repository root, run `python3 -m http.server 8000` on macOS or Linux, or `py -m http.server 8000` on Windows.

Open [http://localhost:8000](http://localhost:8000) in a modern browser with WebGL 2 and select **Enter downtown**. Keep the server running. Three.js and the county data need internet access. If the map reports a failed tile, refresh to retry. The developer console includes the tile number, bounds, and error.

| Action | Desktop | Phone |
| --- | --- | --- |
| Move | WASD or arrow keys | Left thumbstick |
| Look | Mouse with pointer lock | Drag the scene |
| Sprint forward | Hold Shift | Tap Sprint |
| Aim-down-sights placeholder | Hold right mouse button | Tap Aim |
| Pause | Esc | Leaving the page clears movement input |

## Downtown pass

The player starts just east of East Montgomery Avenue and Helen Heneghan Way, facing toward the junction. Brick is applied to the two carriageways within the small junction patch. The other road surfaces are asphalt. Roads follow county centerlines with estimated widths and sidewalk offsets on the flat base. Downtown adds crosswalks, lane paint, streetlights, façade windows, hard sun shadows, and a limited warm/cool color palette.

Building heights are estimated from area and a stable seed, with a 5–40 m design range. Tall convex footprints can receive a recessed upper story. Source L-shaped outlines and courtyard holes continue through the lower building geometry and the collision outline.

The camera uses a 1.68 m eye height, walk/sprint speeds of 4.3/6.9 m/s, and a narrower aim FOV. Collision uses a 0.36 m radius against the original footprint polygons, so the camera slides along walls and courtyards retain their interior space.

## Source layout

`main.js` connects the scene, camera, loading status, and existing update loop. `footprints.js` still queries nine WGS84 tiles, paginates and deduplicates intersecting features by object ID. `buildings.js` builds the visible masses and exports their collision outlines. `camera.js` handles first-person input and movement. `scene.js` configures the renderer, street surfaces, and lighting. `config.js` holds the map bounds and sampled road centerlines. `utils.js` converts longitude and latitude to local meters (+X east, +Y up, −Z north).

## Materials and data

The four [Poly Haven CC0](https://polyhaven.com/license) diffuse maps are 2K WebP copies of the source images. Scalar roughness, tint, and lighting keep the style consistent and the material count low. Glazing uses opaque tinted materials.

| Asset | Use |
| --- | --- |
| [Clean Asphalt](https://polyhaven.com/a/clean_asphalt) | Roadway grain with low visual noise |
| [Brick Pavement](https://polyhaven.com/a/brick_pavement) | Red interlocking pavers at the junction |
| [Rough Concrete](https://polyhaven.com/a/rough_concrete) | Matte sidewalks and tinted wall faces |
| [Tarred Gravel](https://polyhaven.com/a/tarred_gravel) | Dark aggregate for flat roof caps and terraces |

Building footprint data comes from the Montgomery County Planning Department, Maryland-National Capital Park and Planning Commission (M-NCPPC), and Montgomery County GIS / Technology & Enterprise Business Solutions. Road centerlines come from Montgomery County GIS / TEBS. [Building Footprints](https://geohub.montgomerycountymd.gov/mapping1/rest/services/Structures/Building_Footprints/FeatureServer/0) · [Street Centerline](https://geohub.montgomerycountymd.gov/mapping1/rest/services/Transportation/Street_Centerline/FeatureServer)
