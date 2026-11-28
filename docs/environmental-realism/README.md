# Assignment 008 · City environmental realism

Baseline `baac2666ca8df7795448ac3c7125b8e3f4301bcb`.

This pass keeps Rockville's surveyed street and terrain layout and dresses the existing shells. It focuses detail on Gibbs Street and Town Square, Maryland Avenue, Regal and East Montgomery, Courthouse Square, the Metro approaches and Choice Hotels Circle. Washington Street and the background blocks receive the common wall, pavement, daylight and canopy treatment. The work is a visual upgrade of the procedural city. It remains short of a surveyed, building-by-building photoreal reconstruction.

## Geographic and architectural references

| Reference | How it informed the environment |
| --- | --- |
| [Montgomery County six-inch aerial imagery](https://geohub.montgomerycountymd.gov/imageserver/rest/services/Images/JPG2023/ImageServer) and [County Planning GIS](https://montgomeryplanning.org/tools/gis/) | Checked block edges, existing paved offsets and where there is physical space for planting or furniture. The runtime coordinates still derive from the project's surveyed centerlines, footprints and terrain. |
| [Existing source and OpenStreetMap inventory](../geographic-audit/01-dataset-inventory.md) and [Rockville Town Square on OpenStreetMap](https://www.openstreetmap.org/#map=17/39.0859/-77.1510) | Street relationships, access, parks, metro and prior corrections. OSM in the existing documentation is attributed to its contributors under ODbL. |
| [City of Rockville on Gibbs Street](https://www.rockvillemd.gov/news/2021/05/04/gathering-on-gibbs-street/), [Town Center Park](https://www.rockvillemd.gov/places/rockville-town-center-park/), and [architect's Town Square case study](https://www.mhgpa.com/rockville-town-square) | Brick pedestrian space, restrained greens, planters and grouped seating, shared shop bays and mixed-use entrances. The current game alignment and existing crossing behavior were kept. |
| [County Council Town Center photographs](https://www.flickr.com/photos/mococouncilmd/albums/72177720329810187) and [Town Square street-level reference](https://commons.wikimedia.org/wiki/File:Rockville_Town_Square_street_2022.jpg) | A warm brick and neutral masonry palette, framed glazing and streetscape scale. |
| [City of Rockville Courthouse Square Park](https://www.rockvillemd.gov/places/courthouse-square-park/) | Brick paths, street trees and hedged planted edges. The existing courthouse and plaza geometry were retained. |
| [Regal property plan, 199 East Montgomery Avenue](https://uedge.com/sites/default/files/ue-property/property-rockville-town-center-brochure.pdf) | Existing theater relation to Maryland Avenue, public-facing retail reference and accurate wayfinding text. Storefront atlas signs otherwise use neutral descriptions. |
| [Rockville Metro Station Study](https://www.rockvillemd.gov/projects/rockville-metro-station-study/) and [Assignment 007B imagery and alignment evidence](../collision-navigation/007b.md) | Ground-level transit approach and parking relationships, the existing elevated span, and Choice Hotels Circle's corrected paved arc. |

Reference imagery guided the dressing. The shipped images are licensed material and sky assets. Sign text and the two facade atlases are drawn locally from game specifications.

## Materials and asset inventory

All third-party 008 production images are [Poly Haven CC0](https://polyhaven.com/license). The local assets reside in [public/assets/environment](../../public/assets/environment) as WebP textures. Color maps are tagged sRGB. Normal and ARM data are sampled linearly. ARM red supplies ambient occlusion and green supplies roughness. Metal finishes on props use scalar metalness and roughness. The sky is a display-referred, tone-mapped panorama with its lower half blended into the atmospheric horizon.

| Local texture family | Source | Runtime size and use |
| --- | --- | --- |
| `wall-*` | [Brick Wall 08](https://polyhaven.com/a/brick_wall_08) | 512² diffuse, GL normal and packed AO/roughness. The diffuse was lifted before the building tint is applied. World-scale UVs keep mortar courses continuous across the shell subdivisions. |
| `street-*` | [Clean Asphalt](https://polyhaven.com/a/clean_asphalt) | 512² diffuse, normal and packed AO/roughness shared by roads and parking. |
| `walk-*` | [Rough Concrete](https://polyhaven.com/a/rough_concrete) | 512² diffuse, normal and packed AO/roughness. The diffuse adds subdued expansion seams on the two-metre tile. |
| `pavers-*` | [Brick Pavement](https://polyhaven.com/a/brick_pavement) | 512² diffuse, normal and packed AO/roughness for existing brick and the added plaza and park pavers. |
| `roof-*` | [Tarred Gravel](https://polyhaven.com/a/tarred_gravel) | 256² diffuse and packed AO/roughness for common roof surfaces. |
| `wood-diff` | [Oak Wood Planks](https://polyhaven.com/a/oak_wood_planks) | 256² diffuse for bench seats and shelter trim. |
| `grass-diff` | [Grass Ground](https://polyhaven.com/a/grass_ground) | 512² diffuse on the existing terrain, blended with the surveyed-terrain vertex colors. |
| `daylight` | [Kloofendal 48d Partly Cloudy Pure Sky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | 768 × 384 daytime panorama from linear HDR. |

The 17 environment files total 445,238 bytes. The earlier four diffuse files are retained in Git for provenance. The current city loader uses the new local set. GLBs, sound files, combat and player assets and the existing landmark texture assets were preserved.

## Implementation

- Building widths, surveyed heights and centers stay as published. Neutral masonry tints replace the previous broad color blocks. Existing window batches use two instanced flat layers for frame and glazing, dotted with restrained reflections and mullions. Central floor cadence and glazing sizes were refined using the existing facade dimensions. Ground-floor commercial and lobby treatments use a shared atlas. Flashing sits below the upper edge. Frontage panels require backing from the emitted wall geometry and are shared across spatial batches. Geometry winding is oriented to the actual outward wall normal.
- Existing ground triangles and road centerlines are preserved. Subtle paved seams, curbs, zebra stripes, bars, arrowheads, selected white and yellow markings, patch repairs and flush cover details follow terrain. Lane detail is representative where street photography or centerline data did not resolve the exact marking pattern. Choice Hotels Circle and Metro underpass alignment are preserved.
- Town Square, Courthouse Square, the Regal apron and Metro approaches gain draped paving, planted edges and fixtures. The landmarks keep their original models, transforms, textures and direct collision. Neutral, locally rasterized sign panels mark streets, civic sites, Regal and transit. The relocated machines remain at `(232, -0.415, 226)` and `(232, -0.440, 234)`.
- The skyline has a local partly cloudy sky, longer atmospheric depth, warmer directional sunlight, balanced hemisphere fill and less aggressive exposure. Existing shadow resolution and update controls remain preset-driven.
- New props share primitives and materials and are instanced by locality. Deciduous crowns switch detail by distance. The coastal-style conical backdrop trees have been replaced visually by irregular deciduous crown silhouettes at the same backdrop sites. Placement checks use the original solid geometry and nearby street and sidewalk widths and keep a clearance around both machines. Ground collision uses the existing spatial index. Camera and weapon queries can pass above low fixtures at their actual modeled height.

## Known visual and technical limits

Architectural details remain shared treatments over the existing survey shells. Verified storefront directories, exact curb-ramp and parking-meter locations, custom rooftop equipment, individual railings, dynamic traffic lights, and block-by-block reconstruction of West Montgomery and South Washington were not completed. The vegetation represents layered deciduous and ornamental forms. It is not a species-by-species streetscape inventory. Texture repetition can still be seen on long walls. Glazing uses a shared static reflection treatment. Landmark integration was through its surroundings, with all custom models kept intact. The inherited Metro deck remains non-playable. Desktop GPU, phone GPU and physical controller performance remain unverified.

## Delivered detail counts

| Inventory | Count |
| --- | ---: |
| Instanced facade windows in city loader | 11,481 |
| Backed entrance or storefront bays / roof flashing strips | 74 / 956 |
| Street and ornamental trees / existing backdrop tree positions | 16 / 681 |
| Planter beds / benches / lights / sign assemblies | 4 / 6 / 8 / 6 |
| Bins / bicycle rack / bollards / transit shelter | 2 / 1 / 2 / 1 |
| Hydrants / signal fixtures / utility cabinet | 3 / 2 / 1 |
| Paved sites / registered prop collision outlines | 4 / 56 |
| Lane marking segments / stop bars / crosswalk stripes | 46 / 1 / 20 |
| Curb strips / drain and manhole covers / patch decals / directional arrows | 56 / 11 / 6 / 3 |

The new signs identify public destinations or use neutral storefront wording. The new traffic signal heads are static scene fixtures. The published shelter, lighting and furniture placements are representative renderings checked against gameplay clearance.

## Collision audit

| Required measure | Baseline | Candidate |
| --- | ---: | ---: |
| Road and sidewalk elevation flags | 0 | 0 |
| Walking-height landmark wall misses | 0 | 0 |
| Blocked road-center samples | 0 | 0 |
| Invalid zombie spawn samples | 0 | 0 |

The standard audit took 209 walking-height wall probes, 7,801 road-center samples and 192 spawn samples. It loaded 743 city footprint entries, six registered modules and eight placed landmarks. The separate broad proximity inventories retain the prior 163 sidewalk candidate flags, 106 landmark perimeter offsets, 74 district offset flags, one Station 3 Drive endpoint against a real building and four surveyed steep-grade intervals.

## Matched performance

Chromium 131 with ANGLE SwiftShader in a 480 × 270 device-scale-one viewport. Low rendered at 360 × 202; Medium and High rendered at 480 × 270. The same player camera, local server and staged zombie positions and speed were used for both builds. Each case discarded three warm-up frames and retained ten animation-frame intervals with a GL completion wait. P95 is the maximum in a ten-frame sample. The 50-zombie case is an assisted stress fixture. The gameplay cap remains 24. Cases ran in preset and population order in the same browser context per build, so late samples include retained renderer resources and may see software rendering stalls. Heap is a CDP JavaScript heap snapshot.

| Preset | Zombies | Frame median ms | Frame P95 ms | Mean draws | Mean triangles | Texture count | JS heap MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Low | 0 | 16.7 → 16.7 | 16.8 → 66.6 | 213.0 → 276.0 | 492,730 → 509,894 | 34 → 51 | 12.50 → 16.17 |
| Low | 10 | 316.7 → 558.4 | 566.7 → 716.6 | 336.6 → 399.6 | 760,591 → 777,755 | 53 → 70 | 13.24 → 19.30 |
| Low | 24 | 466.6 → 541.6 | 916.6 → 700.0 | 476.6 → 539.6 | 1,055,473 → 1,072,637 | 67 → 84 | 16.21 → 15.92 |
| Low | 50 | 641.6 → 733.3 | 1200.0 → 850.0 | 736.6 → 799.6 | 1,603,111 → 1,620,275 | 93 → 110 | 18.66 → 21.20 |
| Medium | 0 | 975.0 → 1099.9 | 1083.2 → 2249.9 | 224.2 → 276.0 | 517,392 → 509,894 | 93 → 110 | 19.89 → 20.49 |
| Medium | 10 | 316.7 → 408.2 | 616.7 → 866.7 | 348.4 → 411.4 | 1,026,748 → 1,043,912 | 93 → 110 | 19.06 → 20.55 |
| Medium | 24 | 583.3 → 658.3 | 1133.2 → 1399.9 | 488.4 → 551.4 | 1,609,970 → 1,627,134 | 93 → 110 | 19.04 → 20.79 |
| Medium | 50 | 975.0 → 1058.3 | 1883.3 → 2116.6 | 748.4 → 823.2 | 2,157,608 → 2,208,635 | 93 → 110 | 19.35 → 20.77 |
| High | 0 | 1283.2 → 1358.3 | 2566.6 → 2849.8 | 213.0 → 276.0 | 492,730 → 509,894 | 93 → 110 | 18.95 → 20.67 |
| High | 10 | 383.3 → 416.7 | 649.9 → 849.9 | 372.0 → 435.0 | 1,094,474 → 1,111,638 | 93 → 110 | 18.90 → 21.30 |
| High | 24 | 633.2 → 716.7 | 1183.3 → 766.7 | 512.0 → 575.0 | 1,699,876 → 1,717,040 | 93 → 110 | 19.49 → 21.23 |
| High | 50 | 1016.6 → 1133.3 | 2116.6 → 1883.1 | 772.0 → 835.0 | 2,602,394 → 2,619,558 | 93 → 110 | 19.21 → 20.99 |

The observed load-to-combat-ready was 3,413 → 4,409 ms in this run. Browser transfer through the first case was 53.45 → 51.21 MB. Smaller local image payloads reduced transferred bytes. Loader time also includes constructing street batches and facade geometry, and the benchmark did not isolate those CPU costs. Retained texture count rose by 17. Final JS heap was 19.21 → 20.99 MiB in the last stress sample. GPU memory was not measured.

At the default 24-zombie cap, median software frame time increased by about 13–16% across the three presets. P95 improved on Low and High and rose on Medium in these short samples. The direct rendering difference at 24 was 63 additional draw calls and about 17,200 additional submitted triangles. The city also samples additional material channels. No evidence from this run establishes the relative contribution of shader cost, submission cost and software-renderer scheduling. Existing shadow presets and zombie rendering controls were kept. Physical hardware results remain unverified.

[Raw matched benchmark frames](benchmark-frames.json)

## Final regression

- Automated foundation validation returned no problems. The standard city collision audit and cold offline start passed, all local materials loaded, and the browser recorded zero console errors and zero external runtime requests.
- Real keyboard input traversed all four geographic districts, five district-boundary pairs, exterior segments of all eight landmarks, Choice Hotels Circle and the ground-level Metro route. The fixtures staged the player before each walk. Infrastructure and vegetation are the other two loaded modules.
- The normal first zombie spawned without staging. Assisted checks verified navigation around a new bench, above-bench camera and weapon clearance, pursuit around Regal, shoulder switching, wall obstruction, both machine transactions, and firing all six base and upgraded weapon variants.
- Five assisted waves advanced to round six with 59 kills. This fixture shortened wave delays and applied scripted hits through normal damage handling. Death and restart passed.
- All three presets selected successfully. Simulated touch aim and shoulder switching and emulated standard gamepad movement passed. Physical input devices and a fully unassisted five-wave survival run remain unverified.
- All matched screenshots use identical camera coordinates and lens settings. The archive includes 11 High preset pairs and Low and Medium pairs at East Montgomery Avenue. Gameplay footage uses staged zombies and live movement and shooting controls.
