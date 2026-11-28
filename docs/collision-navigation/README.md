# City collision and navigation audit

For the final machine placements, Regal repair and road-source corrections, see the [Assignment 007B closeout](007b.md). The rest of this page records the initial PR #16 audit.

Baseline commit `a9e20c112b2cbdda1308e18951faa8aa9ad7d9ca`. Both builds loaded 743 buildings, six city modules and eight placed landmarks. Four of the modules are geographic districts. Infrastructure and vegetation cover the same map and do not define separate geographical borders.

[Diagnostic map](audit-map.svg) · [Coordinate ledger (gzip CSV)](observations.csv.gz)

Run `python3 -m http.server 8000` from the repository root and open `http://localhost:8000/?audit=1`. Inspect or export `window.__ROCKVILLE__.collisionAudit` once `window.__ROCKVILLE__.ready` is true. The same auditor was loaded into the baseline at the same startup point. The production game does not load this module.

## Root causes and repairs

- The ground sampler used bilinear interpolation while the surveyed mesh was split into two triangles per cell. Road ribbons used a centerline grade across their full width and horizontal disks at joins. The ground sampler now matches the terrain faces, and streets, sidewalks and markings follow the same triangulation wherever the original plane differs by more than 2.5 cm. The survey grid and the horizontal extent of the routes are unchanged.
- Landmark proxies marked an entire 4 m square when a sampled vertex hit it. Long faces without samples could disappear. The new proxies clip actual triangles to walking height, find occupied 1 m cells, fill closed interiors and merge neighboring cells into rectangles. An authored Circuit Court opening and the roundabout lamp colliders are preserved. Non-landmark procedural buildings already derive walls and collision from the same footprints.
- The camera was using the 36 cm player body clearance for its boom. It now sweeps with its own 18 cm radius. Character and zombie collision still use 36 cm. Movement checks the dominant direction first when a diagonal move is obstructed. Footprint queries reuse numeric spatial keys and collapse equivalent proxy rings at load time.
- Zombies previously followed a cardinal-only grid and could be recycled while alive after stalling or falling behind. The shared reverse route field now checks diagonals against the same collision query, reuses overlap between successive windows, and looks ahead only along clear segments. A wider field is built on demand. Stalled zombies retry earlier and temporarily stop applying crowd separation. A close zombie with an obstructed approach keeps routing around the obstacle. Live zombies remain in the world while rerouting.
- The two machine placements were derived at startup from the current terrain and collision. Their exact published coordinates are now explicit so collision changes cannot silently relocate them.

## Matched city audit

| Check | Samples | Baseline flags | Candidate flags |
|---|---:|---:|---:|
| Road-center clearance | 7,803 | 19 | 19 |
| Road endpoints and junction candidates | 309 | 5 | 5 |
| Sidewalk offset candidates | 13,815 | 152 | 172 |
| Building perimeter candidates | 3,991 | 806 | 804 |
| Landmark perimeter candidates | 416 | 79 | 83 |
| Walking-height landmark mesh hits outside collision | 209 | 114 | 24 |
| Geographic district edges | 266 | 69 | 75 |
| Two-metre district crossing candidates | 196 | 64 | 70 |
| Street and sidewalk surface error above 10 cm | 4 m cells | 1,580 | 0 |
| Surveyed road rises over 45 cm per sample interval | Up to 2 m spacing | 5 | 4 |
| Duplicate proxy rings | All proxies | 0 | 0 |
| Spawn candidates tested at four headings in each district | 192 | 0 invalid | 0 invalid |
| Local reachability samples around district anchors | 214 | 0 unreachable | 0 unreachable |

The 1,580 surface-cell flags are confirmed repairs. Walking-height landmark misses declined by 90 overall. Each group of candidates uses a fixed offset or a direct line. A building, machine or other visible solid may legitimately obstruct that point. Those flags are retained for inspection and are separate from confirmed surface defects. Raw proxy count grew from 820 to 941.

| Sampled rendered layer | Maximum separation from feet before | After |
|---|---:|---:|
| Asphalt streets | 1.540 m | 0.029 m |
| Concrete sidewalks | 2.126 m | 0.035 m |
| Downtown brick | 0.087 m | 0.020 m |

The parallel legacy road audit also found 19 blocked points out of 7,816. Fifteen had nearby shoulder clearance and four had wider detours. Two existing procedural footprints, 131008 and 126956, cross the source road centerline. These are visible solid walls. Their centerline conflicts and questions about the adjacent source data remain open. The steepest sampled road rise after correction is 1.413 m over an interval of up to 2 m, reflecting the surveyed surface.

## Landmark findings

| Placed landmark | Walking-height misses before → after | Placement finding |
|---|---:|---|
| Clock tower | 7 → 0 | Model 42.75 m across X versus 62.29 m for its parcel. The proxy follows the shorter model; the parcel discrepancy remains. |
| Turret near Gibbs Street | 13 → 0 | Published manifest places it at 33 Maryland Avenue on footprint 227492. The model extends about 2.55 m past each end of the parcel along X. Its raster proxy overlaps neighboring footprint 227491 by about 4.77 m². This is a plan-view proxy intersection and does not establish an exact visual overlap area. |
| Regal Cinemas | 22 → 15 | Published collision retained to preserve both machine interactions. The visible north facade remains underrepresented. |
| White-columned building | 34 → 7 | The published mesh sampler produced no proxy for this model. It now has a walking-height proxy. Seven mesh-ray flags remain. |
| Circuit Court | 20 → 2 | Mesh proxy with the existing authored opening. Two mesh-ray flags remain. |
| District Court | 18 → 0 | Mesh proxy follows the model outline. |
| Historic Red Brick Courthouse | 0 → 0 | Mesh proxy refreshed. |
| Courthouse roundabout | — | Existing lamp colliders retained. There is no enclosing shell. |

All model files, X/Z placements, scales and rotations were preserved. Ground contact on the refitted terrain sampler shifted five landmarks vertically by 2–30 mm. The Regal and white-columned model bounds together leave substantial unused width on the shared geographic parcel. The parcel dimensions and remaining overlaps require a placement decision.

### Regal machine conflict

The published Mystery Box stands at `(192.456, -0.150, 221.329)` and Pack-a-Punch at `(185.802, -0.071, 223.111)`. Direct rays hit Regal’s continuous north facade at `z ≈ 219.22` at both machine X coordinates, at heights from 0.4 to 3.2 m above the exterior ground. Applying the new full mesh proxy made Pack-a-Punch unreachable within its approved 3 m interaction range. The candidate keeps the published four-rectangle Regal proxy and the exact machine coordinates. A complete collision repair there requires approved exterior machine sites or an approved architectural placement change. The wall gap is still visible in the audit.

The road-grade Metro pedestrian bridge deck remains outside the available published vertical survey data. This pass uses the existing grade and makes no claim about a walkable elevated deck.

## Matched software-rendered performance

Headless Chromium with ANGLE SwiftShader, WebGL 2, High preset, 480 × 270 viewport, same starting camera and deterministic placement of 0, 10, 24 and 50 active test zombies. The zombies move slowly after placement so the exact per-frame culling and LOD can diverge. Four warm-up frames and 12 measured animation frames per case. Each sample used a WebGL completion wait. P95 is the maximum of a 12-frame sample. Navigation CPU time includes movement time. Movement CPU time covers the shared player and zombie movement primitive, excluding camera and combat queries. Heap is a single CDP used-JS snapshot and includes garbage-collection variation.

| Active | Mean ms before → after | Median ms before → after | P95 ms before → after | Draw calls before → after | Triangles before → after | Heap MiB before → after |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 16.66 → 16.67 | 16.7 → 16.7 | 16.7 → 16.8 | 170 → 170 | 324,901 → 402,353 | 33.67 → 11.44 |
| 10 | 280.55 → 254.15 | 266.7 → 250.1 | 450.1 → 449.9 | 329 → 319.2 | 793,551 → 842,789 | 30.47 → 14.32 |
| 24 | 481.93 → 493.03 | 475.0 → 475.0 | 583.3 → 683.3 | 469 → 469 | 1,088,433 → 1,165,888 | 24.33 → 29.56 |
| 50 | 690.24 → 690.25 | 616.7 → 666.6 | 1,333.3 → 1,200.1 | 729 → 729 | 1,636,071 → 1,713,526 | 26.97 → 19.14 |

| Active | Navigation CPU ms/frame before → after | Movement CPU ms/frame before → after | Zombie animation CPU ms/frame before → after |
|---:|---:|---:|---:|
| 0 | 0.000 → 0.000 | 0.000 → 0.000 | 0.000 → 0.000 |
| 10 | 0.156 → 0.129 | 0.019 → 0.012 | 0.525 → 0.482 |
| 24 | 0.325 → 0.275 | 0.056 → 0.025 | 1.012 → 0.938 |
| 50 | 0.381 → 0.413 | 0.031 → 0.031 | 1.325 → 1.325 |

The 24-zombie median held while these sampled navigation and movement CPU costs fell. At 24 the tail was slower, and at 50 the median was about 8% slower. The conforming street surfaces add roughly 77,000 rendered triangles in the test view with no additional draw calls for those surfaces. This sample does not support collision or navigation as a major cause of the earlier 24-zombie slowdown. It does not characterize the cost of every route-window rebuild. Geometry and texture counts matched for each corresponding case. Physical hardware, GPU timing and extended memory stability remain unverified.

## Regression runs

| Test | Result and method |
|---|---|
| Assets, module counts and offline startup | Both builds loaded 743 buildings, six modules and eight landmarks. The candidate browser runs blocked external requests and recorded zero browser errors on passed runs. The existing foundation validator reported no problems. |
| Roads, sidewalks and district boundaries | Real keyboard input after assisted staging. Passed short walks in all four geographic districts, five distinct district boundary pairs and three repaired surface sections captured in gameplay. Perimeters and other crossings were sampled by the automated audit. |
| Locomotion and third-person camera | Keyboard walking, forward/backward/lateral/diagonal motion, sprint, aim, jump, fall, land and reload while moving. Shoulder switching while moving and near-wall boom compression passed in a staged wall test. |
| Zombie pursuit and spawning | Natural first-wave spawning, movement and a live rifle hit passed, with assisted aiming for the hit. In a separate recorded fixture, three zombies started with obstructed lines and reached within 3.5 m of the player around the turret with zero final stall time. Placement and attack suppression were assisted for that fixture. |
| Weapon obstruction and scoring | Actual game trace blocked a shot at a wall, found torso and head hits in the clear, and awarded 120 points for the staged body hit and headshot kill. All three base weapons fired and reloaded. All three upgraded variants fired. |
| Machines, waves, death and restart | Mystery Box purchase and collection, all three Pack-a-Punch transactions, death and restart passed using test credits or staged positions. Five complete waves advanced to round six with 59 kills and 5,380 points. Normal spawning ran, while the test accelerated delays and invoked damage through the game hit function. |
| Controls and presets | Desktop keyboard/mouse, simulated touch and emulated standard gamepad passed. Low, Medium and High loaded offline. The Prisoner Zombie loaded all eight source clips. |

The 1 m landmark proxies remain approximate at thin architectural details. The navigation grids are bounded, so a zombie cut off by a long detour or a passage narrower than the local grid sampling can still stall outside tested routes. Five waves were tested with assistance. Full unassisted survival, manual traversal of every street and perimeter, physical touch and controller devices, and long-session hardware performance remain unverified.
