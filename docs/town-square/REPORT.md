# Town Square architectural development

This pass dresses the Rockville Town Square footprints on the city-geometry branch. Footprints, roof heights, terrain, roads, and gameplay are unchanged. Other districts keep the generic walls. The work is not merged.

The district is the 2007 mixed-use blocks between Beall Avenue and East Middle Lane, plus the Cambria hotel and the later Helen Heneghan / East Middle Lane towers that the height table already ties to Town Square. Courthouse Square, City Hall, Monroe, Hungerford, and the Metro bulge are not restyled.

Sources for the block roles: the [Terrain.org case study](https://www.terrain.org/unsprawl/27/) (WDG Architecture for the retail and housing, Grimm + Parker for the library, a six-storey clock on Maryland Avenue, Gibbs Street on the west of the plaza) and the [JHU Town Square case study](https://jscholarship.library.jhu.edu/server/api/core/bitstreams/7dba20d7-44ce-4064-a9a4-1e62728c8a1e/content). Photographs used for the comparisons are cited below. This is not a claim that each bay matches a survey.

## Modules

Shared across the district. Repeated boxes are instanced. Walls, gables, and the clock face are merged meshes.

| Module | What it is |
| --- | --- |
| Brick shell | Poly Haven [brick_wall_001](https://polyhaven.com/a/brick_wall_001) (CC0), 1K. White vertex tint for the red 2007 blocks, a brown tint for Wesmond, the hotel, and the 2015 mid-rise. |
| Masonry shell | Poly Haven [clay_plaster](https://polyhaven.com/a/clay_plaster) (CC0), 1K. Cream on the library, a cooler stone tint on garages, podiums, and spandrels. |
| Storefront bay | Ground-floor glass, dark frame, cream sign band, and one awning colour per block. |
| Residential windows | Regular punched openings. The top floor of the 2007 brick blocks adds an arched head. The centre column is a lighter pane. |
| Balcony | Slab and metal rail on the upper floors of long residential edges that open onto a street or the plaza. |
| Cornice | A shallow band at the roof line. |
| Gable | One street-facing peak on the longer 2007 brick edges. The peak sits on the roof. It is not a surveyed ridge. |
| Clock tower | A 7.2 m brick shaft on the plaza face of 130 Gibbs Street, clock at 10:07, hip roof above the county eave. |
| Library corner towers | Square cream piers at the ends of the library's longest exposed edge, a few metres above the roof. |
| Glass curtain | Floor-to-floor glass with mullions on the library's longest edge, and a tighter curtain on the 52 m towers. |
| Hotel pier-and-glass | Brick piers and glass bays on the Cambria and 40–44 Maryland Avenue masses. |
| Garage slots | Horizontal slot windows on low, large footprints. |
| Kiosk | Brick shell only, for two 5 m² county fragments in the plaza. |

Awnings and balconies are omitted where the facing gap is only a few metres, so they do not close the passage.

## Which block got which modules

| Role | Footprints | Modules |
| --- | --- | --- |
| Library | 21 Maryland Avenue (127891) | Cream masonry, glass curtain on the longest edge, corner towers, plaza storefronts, larger civic windows |
| Gallery / VisArts pieces | 141 Gibbs (232961, 232962, 211255), 152 Gibbs (247224) | Red brick, larger gallery windows, storefronts, cornice |
| 2007 brick street | 150 Gibbs, 130 Gibbs's neighbours, 100 / 107 / 113 / 115 / 120 Gibbs, 24 / 26 / 37 / 38 Maryland, 101 Gibbs, 200 East Middle, 225 North Washington | Red brick, storefronts, burgundy or black awnings, punched windows, arches, balconies, gables, cornice |
| Wesmond / brown brick | 33 and 39 Maryland, and the hotel-side mid-rise | Brown brick, green awnings, the same residential kit |
| Clock block | 130 Gibbs Street (227490) | The brick-street kit, plus the one clock tower on the edge that faces the plaza |
| Garage | 20 Maryland, 154–156 Gibbs | Stone masonry, slot windows, cornice |
| Garage front | 36 Maryland Avenue (126987), the low mass east of the plaza | Storefronts on edges that face the plaza, slots on the other faces |
| Low retail | 29, 31, and 34 Maryland | Brick and storefronts, no upper floors |
| Hotel | Cambria at 196 East Montgomery (240005), 40 / 42 / 44 Maryland | Pier-and-glass, lobby storefront, no gables |
| Glass towers | 2 and 4 Helen Heneghan, 33 Monroe, and the 38 m East Middle Lane slivers | Curtain wall and spandrel bands. Balconies are not put on the 5 m slivers. |
| Mid-rise | 1 Helen Heneghan (129621), 35 Monroe (272794) | Brown brick, storefronts, balconies, flat roof |
| Liner | 199 East Montgomery (277318), the long bar named Rockville Town Square | Brick, repeating storefronts, punched windows, no gables |
| Podium | The 5 m East Middle and 198 East Montgomery fragments, 31 Monroe | Stone masonry and slots |
| Kiosk | 119 and 135 Gibbs (212553, 212554), about 5 m² and 4.5 m | Brick shell and cornice only |

58 footprints, 341 exposed edges.

## Landmarks

Both GLBs from `grok/rockville-landmarks` are copied and not edited: `public/landmarks/clock_tower_building.glb` (42.8 m × 20.2 m) and `public/landmarks/turret_corner_building.glb` (31.5 m × 30.5 m).

Neither replaces a county mass.

- The clock model does not fit 1 Church Street (34 m × 34 m, 38.1 m, east of MD 355, outside this district). On 130 Gibbs Street, the same rectangle overhangs the irregular polygon by up to 3.6 m, which would cover plaza ground. `hideProcedural` stays false, so the 1 Church Street office remains. The visible clock is the module on 130 Gibbs, facing the plaza. The real accounts put the six-storey clock on Maryland Avenue, on the east side of the plaza. This module is on the west (Gibbs) frontage. That is a real discrepancy.
- The turret model does not fit 1 Helen Heneghan Way (43.0 m × 27.1 m, 28.83 m, a 2015 slab). Placing it would leave a gap in that block or overlap the slab. It is not drawn. The library corner piers are a separate module, not that model. The round corner tower in the 2024 photograph is not reproduced.

No procedural placeholder was deleted. Deleting one would have removed an approved footprint.

## Verification

Headless Chrome, SwiftShader (ANGLE), one shadow map. The frame times are software WebGL. They are not a desktop or phone GPU measurement.

Overview camera, whole scene in frame:

| Viewport | Draw calls | Triangles | Frame time | fps |
| --- | --- | --- | --- | --- |
| 1280 × 720 | 21 | 471,276 | 1055 ms | 0.95 |
| 390 × 844 | 21 | 471,276 | 828 ms | 1.21 |

The Town Square meshes are 177,651 of those triangles. The geometry branch reported 16 draw calls and 334,261 triangles before these facades.

Collision uses the same footprint rings and 0.36 m body. Decorative meshes are not colliders.

| Walk | Result |
| --- | --- |
| Plaza, x = 8 to 72 at z = −6, 64 m | 144 samples, 0 blocked, 0 stuck steps, arrived, largest drop 0.032 m |
| Passage between 107 Gibbs and 39 Maryland | The body followed the open centre from z = 26 to z = 88 (62 m), 0 stuck steps, largest drop 0.011 m. A straight line at x = 32 stops, because the gap is about a metre wide and shifts. |

## Screenshots

Street, plaza, passage, storefront, residential, library side, overview, and the east towers are in `docs/town-square/screenshots/`. Side-by-side frames, photograph on the left:

| Comparison | Photograph | In-game frame |
| --- | --- | --- |
| North entrance and library | [Rockville Town Square and Rockville Library.jpg](https://commons.wikimedia.org/wiki/File:Rockville_Town_Square_and_Rockville_Library.jpg), CC0, Rock & roll is not dead, 16 May 2024 | `compare-library.png` |
| Gibbs Street | [2008 10 11 - Rockville - Gibbs St S1.jpg](https://commons.wikimedia.org/wiki/File:2008_10_11_-_Rockville_-_Gibbs_St_S1.jpg), CC BY-SA 2.5, Andrew Bossi | `compare-gibbs.png` |
| Plaza at night | [Rockville town center roof top fridays.jpeg](https://commons.wikimedia.org/wiki/File:Rockville_town_center_roof_top_fridays.jpeg), public domain, Tammy Farrugia, September 2009 | `compare-plaza.png` |

## What is still wrong

- The library's curved glass wall along Maryland Avenue is a flat curtain on the longest county edge. The footprint has no curve. The library frame in this set shows the cream side more than that curtain.
- The round corner tower in the 2024 photograph is not in the model. The approved turret GLB does not match a footprint, so it was not placed.
- The clock stands on 130 Gibbs Street, west of the plaza. The published description puts it on Maryland Avenue, east of the plaza.
- 119 and 135 Gibbs Street are 5 m², 4.5 m county fragments. They read as brick piers in the plaza. They were not removed, because the footprints stay.
- Storefront glass is opaque. Awnings are flat boxes. There are no tenant names, trees, fountain, or plaza paving changes. Those were left alone on purpose.
- Gables are a silhouette device. They are not measured ridges. The 2 m gable placeholder on other districts is untouched.
- The 2015 towers are still the split county polygons, including slivers a few metres wide. The curtain wall follows those edges.
- One console 404 remained in the headless run. The brick and plaster maps did load; they are visible on the walls. The landmark files are not requested, because neither model is placed.
- The fps figures are SwiftShader. A GPU run was not measured.
