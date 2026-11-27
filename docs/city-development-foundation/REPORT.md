# City development foundation

This branch starts from `grok/city-geometry-upgrade` (PR #4). It does not merge into `main`, and it does not merge PR #4. The geographic audit from PR #3 is already on that branch under `docs/geographic-audit/`; nothing further had to be cherry-picked.

The game still loads Three.js r187 from the CDN. Axes are unchanged: +X east, +Y up, −Z north, 1 unit = 1 metre. Measured terrain, footprint rings, and the height table are the same files as PR #4. Heights still run from 0.95 m to 73.65 m. High 137, Medium 132, Estimated 243.

## Playable boundary

The outline the game uses is `public/data/playable-boundary.geojson`. It is the audit polygon: west −77.155, north at gLeaf (808 Hungerford), east along the rail and around the Metro station including the rear lot, south keeping 700 Rockville Pike and 208 Monroe Street and leaving Richard Montgomery High School outside. `src/main.js` used to read the copy under `docs/geographic-audit/`. It now reads the game file.

## Defect fixes

### Windows and entrances

Openings are cut into the wall instead of sitting 11 cm proud of it. Each opening is kept inside the visible wall and at least 0.45 m above the terrain sample at that column, so a ground-floor window no longer starts in the hillside. Where two footprints share a wall, the upper wall still begins at the lower roof, and the openings begin there too, so they do not hang in the gap. Upper masses (the DHHS tower on 401 Hungerford) overlap the parent roof by 8 cm instead of floating 5 cm above it. Wall bases follow the terrain along the footprint, about every 8 m, so a downhill face meets the ground and an uphill face is not a buried plinth with openings in it.

Headless result: 5,817 openings placed, 0 buried, 0 rejected for leaving the wall. The previous build placed 9,303. The drop is the openings that used to start below grade or below a neighbour roof.

### Roads through footprints

Carriageway and sidewalk ribbons stop at a footprint instead of drawing through it. On the integrated run, 91 ribbon pieces were narrowed and 13 were omitted.

The 14 samples that ran through 34 Maryland Avenue were one east-west centreline chord in `src/config.js` (from −77.15096, 39.086192 to −77.150632, 39.086193). That chord crossed footprint 153949. The north-south Maryland Avenue centreline on the west side of the block was already clear, so the chord was removed and the spur now starts on the clear east side of the block. The building was not cut open and no height changed.

After that edit the walk is 7,816 centreline samples. None are interior to a building with no way around. 19 samples still touch a footprint: 15 have a clear shoulder within 6 m and 4 have a detour within 16 m. Those are 51 Monroe Street (131008) and 111 Rockville Pike (126956), plus body-radius grazes. The downtown controller still walks 32.06 m with no fully blocked step. A one-second nudge through the gameplay loop moved 5.16 m.

Five centreline steps still rise more than 0.45 m. The worst is 0.97 m over 2 m. That is the 10 m DEM on a steep cell, the same figure as PR #4, not a broken road join.

## Districts

Every playable footprint has one district. The 508 audit rows are all owned. Four extra footprints whose centroids also sit inside the polygon are owned as well, so the runtime set of 512 has no leftover.

| Code | District | Playable buildings | Of which are in the 508 |
| --- | --- | --- | --- |
| A | Town Square | 19 | 19 |
| B | Hungerford Corridor | 198 | 197 |
| C | Regal and Courthouse | 31 | 31 |
| D | Rockville Pike and Metro | 264 | 261 |

The four extras are 819 Hungerford Drive (B), and 204 Highland Avenue, 208 Monroe Street's second footprint, and 210 Monroe Street (all D).

Assignment is by address and centroid, then the district polygon is the Voronoi cell of those centroids (plus five open-ground anchors for the plaza, the courthouse lawn, and the Metro platform) clipped to the playable boundary. The four polygons do not overlap. Their union is the playable polygon. Every centroid falls in the polygon for its own district. `scripts/validate_foundation.py` checks that.

Town Square is the plaza cluster: Helen Heneghan Way, the Cambria at 196 East Montgomery, the 198 East Montgomery podiums, and the East Middle Lane row. Regal, the colonnade footprint at 199 East Montgomery, Maryland Avenue, Courthouse Square, the red-brick courthouse, the grey courthouse, Circuit Court, District Court, City Hall, and the Executive Office Building are C. Hungerford Drive's northern commercial stretch, both sides, inside the boundary, including 808 Hungerford, is B. Everything else inside the line, including the Metro station, the Pike, and 1 Church Street, is D.

Map: [maps/district-ownership.png](maps/district-ownership.png)

Boundaries: `public/data/districts/boundaries.geojson` (WGS84 and game metres on each ring).

Ownership: `public/data/ownership.json` and [data/building-ownership.csv](data/building-ownership.csv).

![District ownership](maps/district-ownership.png)

## Landmark files

Every GLB under `public/landmarks/` matches its source commit byte for byte. Nothing was rebuilt, simplified, or re-exported. SHA-256 of the working tree equals SHA-256 of `git show <commit>:<path>`.

| File | SHA-256 | Source | Match |
| --- | --- | --- | --- |
| `clock_tower_building.glb` | `0fcfd6003b213f407e277c7b091877e69cd0353bbb439e562a0bf044e4908020` | `grok/rockville-landmarks` `30ed3aa` (PR #2) | yes |
| `turret_corner_building.glb` | `73abdb84332587571b5349f288751af1cb4bf413fcdbce9caca76f6f1698d792` | same commit | yes |
| `regal.glb` | `0605a64ad922d1691b400be740e81f9fe4fc475d38c7643234bd7b58e8d77332` | PR #9 commit `3975de5` | yes |
| `white-columned.glb` | `804a24684de52e43e6b3b17e8f612b15053ecfd984ce0fae1d45eb4c643e2ac8` | `3975de5` | yes |
| `courthouse.glb` | `5ac46f92e620d062dee9e991d993e8067c5341ff854ea77026afcb2b50125f67` | `3975de5` | yes |
| `district-court.glb` | `8459933131f653003e10f4e9b31deb026d5463c1782ae940f3513f871582f812` | `3975de5` | yes |
| `roundabout-plaza.glb` | `0e24560d2c42684df23dffd945709322fbf99cd00bc166bd625035a484bc3587` | `3975de5` | yes |
| `historic_courthouse.glb` | `6f37f742aaec3bb2d1c3a96f585813ad253b0c4ab7a7f4530cbbebd71708d1f5` | `landmark/historic-courthouse` `c34966f`, and the same bytes in `3975de5` | yes |
| `regal-cinemas.glb` | `6b088300056ffb223e9cb6d6cad9e9edba40f5cfce81d9ee0ca1d52e9d232ab7` | PR #1 `369a2db` | yes |
| `montgomery-colonnade.glb` | `444e17ab842e895e0979a85920c8161b65aab78cb21ae60b7e00ff9057c5a252` | PR #1 `369a2db` | yes |

### Regal and the white-columned complex, two versions each

Neither file was deleted or overwritten.

| | PR #1 `regal-cinemas.glb` | PR #9 `regal.glb` | PR #1 `montgomery-colonnade.glb` | PR #9 `white-columned.glb` |
| --- | --- | --- | --- | --- |
| Triangles | 5,820 | 22,254 | 6,452 | 6,518 |
| Materials | 14 flat colours | 23 named finishes | 7 flat colours | 16 named finishes |
| Size X × Z × Y | 30.2 × 25.9 × 28.4 m | 48.1 × 35.1 × 24.2 m | 51.1 × 22.3 × 11.8 m | 55.0 × 24.1 × 15.3 m |
| Origin | ground centre, min Y = 0 | ground centre, min Y = 0 | ground centre, min Y = 0 | ground centre, min Y = 0 |
| Street side | +Z (awnings, marquee) | +Z (marquee and REGAL letters out to z ≈ +19) | +Z | +Z (columns and canvas out to z ≈ +11) |

The scene uses the PR #9 files. The owner has approved `regal.glb` and `white-columned.glb` for use. The PR #1 files stay on disk and stay inactive.

## Placement

Regal and the white-columned model are owner-approved. The other six are still unapproved, and one instanced orange pole marks those six. No model was scaled, and no GLB byte changed. District ownership was not edited. 1 Church Street (129521) is a normal procedural building again.

Collision for a replaced building is no longer the county polygon. The county ring is removed once, and the collider is a set of 4 m boxes on the model's own ground vertices (between 0.15 m and 3.2 m above the placement elevation). That drops the invisible walls past the clock tower and past the uncovered ends of 199 East Montgomery, and it leaves the diagonal corners of the District Court and the Circuit Court steps walkable because those corners have no mesh. The white-columned colonnade ignores ground vertices with local z above 6 m, so the columned walkway stays open. The roundabout paving, curb, and shrubs are not colliders. Four 0.7 m boxes sit on the lamp poles.

| Landmark | Footprint removed | Address | Model X × Z × height | County box | Origin vs footprint centre | Rotation |
| --- | --- | --- | --- | --- | --- | --- |
| Clock tower | 131322 | 200 E Middle Lane | 42.8 × 20.2 × 41.8 m | 62.3 × 24.9 m, height record 24.2 m | 0 m (origin is the model centre) | 0. Facade (+Z) faces south onto the open frontage. Tower at the west end. |
| Turret | 227492 | 33 Maryland Ave, next north of the Starbucks block at 39 Maryland Ave (127071) | 31.5 × 30.5 × 45.1 m | 25.4 × 37.4 m, height record 24.2 m | 0 m | π/2, rounded corner toward the Starbucks corner. The generic π suggestion pointed the corner northeast and was not used. |
| Regal | 277318, shared | 199 E Montgomery Ave, east half | 48.1 × 35.1 × 24.2 m | whole footprint 140.6 × 28.0 m, height record 15.1 m | model centre on the east half | 0, marquee south |
| White-columned | same 277318 | 199 E Montgomery Ave, west half | 55.0 × 24.1 × 15.3 m | same footprint | model centre on the west half | 0, columns south |
| Circuit Court | 129186 | 50 Maryland Ave | 91.7 × 134.6 × 34.1 m | 90.0 × 133.7 m, north tower record 46.0 m | about 1 m (model bbox centre is 1.1 m east and 2.7 m south of the origin) | 0. The materials named North sit on model −Z, which is world north. |
| District Court | 132710 | 191 E Jefferson St | 94.4 × 84.8 × 24.0 m | 92.3 × 83.4 m, height record 36.8 m | about 1 m | 0, axes match the footprint |
| Historic courthouse | 129058 | 29 Courthouse Sq | 23.9 × 38.5 × 30.2 m | 30.9 × 37.3 m, height record 12.8 m | origin on the footprint centre; the bbox centre is 1.2 m west and 2.5 m north of the origin | −26°, so the −Z entry faces 26° east of north, the footprint's long-axis bearing |
| Roundabout plaza | none | open ground south of 29 Courthouse Sq | 41.6 × 46.2 × 4.2 m | no building | placed on open ground | 0. Lamp poles collide. The plaza surface does not. |

The two Montgomery models together cover about 103 m of the 141 m frontage. The leftover ~19 m at each end is open ground. See the alignment section for why that ground was not filled with a procedural mass, and why none of the three courthouse heights were scaled.

![Clock tower](screenshots/integrated/landmark-clock-tower.png)

![Turret](screenshots/integrated/landmark-turret.png)

![Regal](screenshots/integrated/landmark-regal.png)

![White-columned complex](screenshots/integrated/landmark-white-columned.png)

![Circuit Court](screenshots/integrated/landmark-circuit-court.png)

![District Court](screenshots/integrated/landmark-district-court.png)

![Historic courthouse](screenshots/integrated/landmark-historic-courthouse.png)

![Roundabout](screenshots/integrated/landmark-roundabout.png)

![Elevated courthouse group](screenshots/integrated/elevated-courthouse.png)

![Overview](screenshots/integrated/overview.png)

## Landmark inventory

No owner approval is recorded for any model. The clock-tower rebuild that was requested was stopped. The historic-courthouse specification says awaiting approval. `grok/hungerford-corridor` was not on the remote.

A manifest row with `glb: null` (`missing-model-fallback`) is the empty-file test. The loader reports `fallback: procedural` and does not remove a building. 1 Church Street (129521) is no longer a landmark target.

## Parallel structure

`public/data/modules.json` names the six slots. `src/runtime/modules.js` imports each `module.js` and, only when that owner's `module.json` sets `extension`, imports the extension. Landmark manifests are loaded from the same index. Details, the `register(ctx)` contract, and the Hungerford rebase steps are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Validation

`python3 scripts/validate_foundation.py` reports no problems. Headless Chrome, SwiftShader, 1280×720, the same flags as PR #4.

| Check | Result |
| --- | --- |
| Audit buildings with one owner | 508 / 508 |
| Playable buildings with one owner | 512 / 512 |
| District polygon overlap | none |
| Union of districts vs playable polygon | the same polygon |
| Buried openings | 0 |
| Openings rejected for leaving the wall | 0 |
| Road pieces trimmed or omitted at footprints | 91 trimmed, 13 omitted |
| Centreline samples with no way around a building | 0 (was 14, through 34 Maryland Avenue) |
| Centreline samples that still touch a footprint | 19, each with a shoulder within 6 m (15) or a detour within 16 m (4) |
| Placeholders removed | 131322, 227492, 277318, 129186, 132710, 129058 |
| Roundabout | placed, no placeholder, lamp colliders only |
| Missing model | procedural fallback, no building removed |
| Console errors | none |
| Controller | 32.06 m, 0 blocked steps |
| Gameplay nudge | 5.16 m |

There is no zombie actor on `main` or on this branch. The loop that runs is the existing first-person loop: walk, sprint, aim, and render. That loop advanced, and the nudge above is a one-second walk through it.

### Performance

Same machine, same SwiftShader, before any of these edits and after them. The published PR #4 numbers are in the third column. This machine's before-shot did not reproduce 16 draw calls; the triangle count did match, so the scene is the same and the draw-call counter here includes the shadow pass and the individual street lights.

Renderer: ANGLE SwiftShader (Subzero), Vulkan 1.3.0, on this VM's Intel Xeon. 1280×720. The published 16 draw calls were not reproduced on this machine; the before triangle count matches PR #4, and the counter here includes the shadow pass and the individual street lights.

| | Before this work | Eight landmarks, unbatched | Same view after batching | Published PR #4 |
| --- | --- | --- | --- | --- |
| Draw calls | 47 | 129 | 72 | 16 |
| Rendered triangles | 334,823 | 340,715 | 476,683 | 334,261 |
| Scene triangles | | 383,953 | 383,953 | |
| Frame time | 417 ms | | 443 ms | 285 ms |

The 129 and the 72 are the same overview camera (x 180 m, 420 m up, looking toward x 220, z 40), 1280×720, SwiftShader on this Intel Xeon. An earlier row of 122 draws and 337,915 triangles was that camera before this pass. Batching runs at load. Untextured materials become one mesh with vertex colour and a roughness/metalness attribute. Textured materials merge by material. Emissive meshes stay separate. The GLB files are not rewritten. Per landmark the draw counts are clock 2, turret 2, Regal 1, white-columned 1, Circuit Court 1, District Court 1, historic courthouse 4, roundabout 1, plus one instanced pole mesh.

Rendered triangles go up because a merged landmark is one object, so a partial view draws the whole mesh, and the shadow pass counts that mesh again. The scene triangle total, 383,953, is the same with batching on or off. Window instances are still 5,817.

## Screenshots

Street views use the same stands as PR #4. Before frames are the branch before these edits. After frames are this branch.

| View | Before | After |
| --- | --- | --- |
| Overview | [before](screenshots/before/overview.png) | [after](screenshots/after/overview.png) |
| Town Square | [before](screenshots/before/town-square.png) | [after](screenshots/after/town-square.png) |
| Hungerford | [before](screenshots/before/hungerford.png) | [after](screenshots/after/hungerford.png) |
| Maryland and Regal | [before](screenshots/before/maryland-regal.png) | [after](screenshots/after/maryland-regal.png) |
| Courthouse Square | [before](screenshots/before/courthouse-square.png) | [after](screenshots/after/courthouse-square.png) |
| Rockville Pike | [before](screenshots/before/rockville-pike.png) | [after](screenshots/after/rockville-pike.png) |
| Metro | [before](screenshots/before/metro.png) | [after](screenshots/after/metro.png) |

District stands and the placement tests are after only:

| View | File |
| --- | --- |
| District A | [screenshots/after/district-a.png](screenshots/after/district-a.png) |
| District B | [screenshots/after/district-b.png](screenshots/after/district-b.png) |
| District C | [screenshots/after/district-c.png](screenshots/after/district-c.png) |
| District D, Metro | [screenshots/after/district-d-metro.png](screenshots/after/district-d-metro.png) |
| Clock tower placement | [screenshots/after/clock-tower.png](screenshots/after/clock-tower.png) |
| Entrance at grade | [screenshots/after/entrance-grade.png](screenshots/after/entrance-grade.png) |

![Town Square after](screenshots/after/town-square.png)

![Entrance at grade](screenshots/after/entrance-grade.png)

## Landmark alignment

Cameras stand outside the models. Overhead frames draw the county ring in yellow. Full set: `docs/city-development-foundation/screenshots/alignment/`.

### Clock tower, 200 East Middle Lane (131322)

The county polygon is one address and one ring (10 vertices, a bar with a small west notch), not two parcels joined together. The nearest other footprint is 38 Maryland Avenue, about 18 m away. The model is 42.8 m along a 62.3 m frontage, so about 9.8 m at each end of the same building has no mesh. The model was not stretched, and those ends were not given a procedural mass, because they are not a separate building. The county collider is gone. Collision is the visible ground only, and the ends are open ground. The 24.2 m county height is the roof record. The model spire is 41.8 m and was not scaled down.

![Clock tower from the street](screenshots/alignment/clock-tower-street.png)

![Clock tower, elevated](screenshots/alignment/clock-tower-elevated.png)

![Clock tower and the neighbouring block](screenshots/alignment/clock-tower-context.png)

![Clock tower over the county ring](screenshots/alignment/clock-tower-overhead.png)

### Turret, 33 Maryland Avenue (227492)

The county frontage is 25.40 m east-west and 37.42 m north-south. The model plan is 30.52 m by 31.52 m. Putting the shorter axis across the street still leaves 5.1 m that cannot sit inside the lot. Centred, that is about 2.6 m past the line on each side. The east side is the sidewalk: Maryland Avenue's centreline is at about x = 90 m and the model stops at x = 78.4 m, so it does not reach the carriageway. The west edge clips the north corner of 115 Gibbs Street (227491) by about 2.5 m. Starbucks, 39 Maryland Avenue (127071), does not intersect the model. Rotation stays π/2 so the rounded corner points southeast, toward that Starbucks block. A uniform scale of about 0.83 would drop the 45.05 m finial to about 37.5 m, and there is no architectural source for that shorter tower, so the model was not scaled. Collision matches the visible ground, including the overhang.

![Turret from the street](screenshots/alignment/turret-corner-street.png)

![Turret, elevated](screenshots/alignment/turret-corner-elevated.png)

![Turret and Maryland Avenue](screenshots/alignment/turret-corner-context.png)

![Turret over its county ring](screenshots/alignment/turret-corner-overhead.png)

### Regal and the white-columned block, 199 East Montgomery (277318)

One polygon, one address. The footprints across the street are other addresses. The uncovered ~19 m at each end is the same structure, not an adjoining garage or shop with its own county ring, so it is open ground. The models were not stretched. Together they cover x 122.9 m to 226.0 m of a footprint that runs 104.1 m to 244.7 m. The county collider is removed. Each model collides on its own ground. The white-columned walkway (local z above 6 m) is left open. The Regal marquee sits above 4.4 m, so it is not a ground collider. The marquee's local +Z faces south, toward the Circuit Court, and the walkable street on the north side sees the plain wall.

![Regal from the north](screenshots/alignment/regal-cinemas-street.png)

![Regal, elevated](screenshots/alignment/regal-cinemas-elevated.png)

![Regal, the colonnade, and the street](screenshots/alignment/regal-cinemas-context.png)

![199 East Montgomery, county ring past both models](screenshots/alignment/regal-cinemas-overhead.png)

![White-columned from the street](screenshots/alignment/white-columned-street.png)

![White-columned, elevated](screenshots/alignment/white-columned-elevated.png)

![White-columned and the neighbouring block](screenshots/alignment/white-columned-context.png)

![White-columned over the shared ring](screenshots/alignment/white-columned-overhead.png)

### Circuit Court (129186)

The model plan is 91.7 m by 134.6 m. The county box is 90.0 m by 133.7 m. The 46.02 m record is the north tower (9 storeys). The model height of 34.1 m is the whole complex, and the audit's south tower is 25.6 m. A uniform scale up to 46 m would raise the podium and the south wing and would enlarge the plan, which already matches. Not scaled.

![Circuit Court from the street](screenshots/alignment/circuit-court-street.png)

![Circuit Court, elevated](screenshots/alignment/circuit-court-elevated.png)

![Circuit Court and the surrounding blocks](screenshots/alignment/circuit-court-context.png)

![Circuit Court over its county ring](screenshots/alignment/circuit-court-overhead.png)

### District Court (132710)

The model plan is 94.4 m by 84.8 m against a county box of 92.3 m by 83.4 m. The county ring itself is a diagonal bar, and the model's ground vertices follow that bar rather than filling the box. The 36.83 m record is the 6-storey mass with a tall atrium (the audit kept 120.8 ft, about 20 ft a storey). A uniform scale of 36.8 / 24.0 would stretch the matching plan to about 145 m. Not scaled. Collision follows the occupied ground, so the road through the empty corner of the box stays open.

![District Court from the street](screenshots/alignment/district-court-street.png)

![District Court, elevated](screenshots/alignment/district-court-elevated.png)

![District Court and the neighbouring streets](screenshots/alignment/district-court-context.png)

![District Court over its county ring](screenshots/alignment/district-court-overhead.png)

### Historic red-brick courthouse (129058)

The model finial is 30.24 m and was not shrunk. The 12.84 m county record matches the main cornice in the historic-courthouse specification (cornice about 10.5–12.5 m, tower and finial about 28–31 m), not the tower. Rotation stays −26°, with the entry toward the footprint's long edge.

![Historic courthouse from the street](screenshots/alignment/historic-red-brick-courthouse-street.png)

![Historic courthouse, elevated](screenshots/alignment/historic-red-brick-courthouse-elevated.png)

![Historic courthouse, the square, and the clock tower](screenshots/alignment/historic-red-brick-courthouse-context.png)

![Historic courthouse over its county ring](screenshots/alignment/historic-red-brick-courthouse-overhead.png)

### Courthouse roundabout

The plaza model sits on open ground south of the red-brick courthouse. The road and sidewalk ribbons are the existing clipped geometry. The four lamp clusters collide. The paving does not, and a 16-point ring around the plaza is clear. There is still no OSM `junction=roundabout` for this circle.

![Roundabout from the street](screenshots/alignment/courthouse-roundabout-street.png)

![Roundabout, elevated](screenshots/alignment/courthouse-roundabout-elevated.png)

![Roundabout, the courthouse, and the roads](screenshots/alignment/courthouse-roundabout-context.png)

![Roundabout from above](screenshots/alignment/courthouse-roundabout-overhead.png)

![All eight landmarks](screenshots/alignment/all-eight-overview.png)

### Pedestrian check

7,816 centreline samples. 0 are interior with no way around. 19 still touch a footprint: 15 with a shoulder within 6 m, 4 with a detour within 16 m. That is the same remainder as before this collision change (51 Monroe Street and 111 Rockville Pike). A point 2.2 m off the south face of every landmark is clear. Samples on a ring around a landmark do hit the neighbouring buildings. That is the neighbour, not an invisible footprint wall. The turret's ring is the crowded one (8 of 16), because Gibbs Street and the Starbucks block stand against it.

## Known limitations

- 239 of the 508 audit heights are still estimates. This pass did not resurvey them.
- Gable ridges are still the 2 m placeholder.
- Regal and the white-columned model are owner-approved. The other six landmarks are not, and they carry the orange pole.
- The clock tower stays on 200 East Middle Lane (131322), district D. About 10 m at each end of that one county building is open ground. The spire stays 41.8 m against a 24.2 m roof record.
- The turret stays centred on 33 Maryland Avenue, district C. About 2.6 m of the 30.5 m plan hangs past the 25.4 m frontage on each side. The east overhang does not reach Maryland Avenue. The west overhang clips 115 Gibbs Street. It was not scaled.
- The Regal marquee faces south, toward the Circuit Court. The north wall is the plain street face. The ~19 m ends of 199 East Montgomery are open ground.
- Circuit Court stays 34.1 m, not the 46.0 m north tower. District Court stays 24.0 m, not the 36.8 m atrium record. The historic courthouse keeps its 30.2 m tower. The 12.8 m record is the cornice.
- The roundabout lamps collide. The plaza surface does not. There is still no OSM `junction=roundabout`.
- 19 centreline samples still touch a footprint, with a shoulder or a short detour. Five DEM steps over 0.45 m are unchanged (worst 0.97 m in 2 m).
- The pedestrian bridge deck elevation, clearance, and width are still null.
- District polygons follow centroids. They are ownership areas, not surveyed neighbourhood lines.
- No zombie actors exist in this repository. The verified loop is movement, aim, sprint, and render.
- `grok/hungerford-corridor` did not exist yet. The District B paths are reserved for it. See CONTRIBUTING.md.
- Rendered triangle counts rise under batching when the shadow pass draws a merged mesh that is only partly in view. The scene triangle total does not.
