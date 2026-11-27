# City development foundation

Six owners can work at the same time. Each owner has a source directory, a data directory, and an asset directory. Adding a model, a road change, or a tree does not require an edit to `src/main.js`, `src/scene.js`, or `src/buildings.js`.

The playable boundary the game actually loads is `public/data/playable-boundary.geojson`. It is the owner-accepted outline from the geographic audit: west edge −77.155, east along the railroad and around the Metro station including the rear lot, south keeping 700 Rockville Pike and 208 Monroe Street and excluding Richard Montgomery High School, north at gLeaf (808 Hungerford Drive).

## Owners

| Role | Code | Directory | Data | Assets |
| --- | --- | --- | --- | --- |
| District A, Town Square | A | `src/districts/town-square/` | `public/data/districts/town-square/` | `public/assets/districts/town-square/` |
| District B, Hungerford Corridor | B | `src/districts/hungerford/` | `public/data/districts/hungerford/` | `public/assets/districts/hungerford/` |
| District C, Regal and Courthouse | C | `src/districts/regal-courthouse/` | `public/data/districts/regal-courthouse/` | `public/assets/districts/regal-courthouse/` |
| District D, Rockville Pike and Metro | D | `src/districts/pike-metro/` | `public/data/districts/pike-metro/` | `public/assets/districts/pike-metro/` |
| Roads and pedestrian infrastructure | — | `src/infrastructure/` | `public/data/infrastructure/` | `public/assets/infrastructure/` |
| Vegetation and landscaping | — | `src/vegetation/` | `public/data/vegetation/` | `public/assets/vegetation/` |

`CODEOWNERS` at the repository root is the same map. The names there are roles, not GitHub accounts.

District B also owns `docs/hungerford-corridor/` when that work exists. This branch does not create that folder, so a rebase of `grok/hungerford-corridor` does not collide with a foundation copy of it.

## What an owner edits

`public/data/modules.json` lists the six slots. Owners do not add themselves to it.

Each slot has a `module.json` in its data directory. `extension` is `null` until that owner has code of their own. Set it to a path relative to the slot's `module.js`. For District B that file is `src/districts/hungerford/module.js`, so an extension file beside it is `./extension.js`. The loader imports it and calls `register(ctx)` if that export exists. A missing extension is not requested, so the console stays quiet.

Landmark models are rows in `public/data/districts/<id>/landmarks.json`. The loader reads every district manifest. A new row is enough. No central JavaScript changes.

## Rebase of `grok/hungerford-corridor` into District B

That branch was not on the remote when this foundation was cut. It is expected to use `src/districts/hungerford/` and `docs/hungerford-corridor/`.

1. Rebase `grok/hungerford-corridor` onto `integration/city-development-foundation`. Do not merge it into `main` or into `grok/city-geometry-upgrade` from here.
2. Keep their new files under `src/districts/hungerford/`, `public/data/districts/hungerford/`, `public/assets/districts/hungerford/`, and `docs/hungerford-corridor/`.
3. If both sides created `src/districts/hungerford/module.js`, keep the `export async function register(ctx)` from this branch and call their code from it, or point `public/data/districts/hungerford/module.json` `extension` at their file.
4. Do not copy their edits into `src/main.js`. The context object below is what their `register` receives.
5. Building ids inside District B are the Hungerford rows in `public/data/ownership.json`. The boundary polygon is the feature with `"code": "B"` in `public/data/districts/boundaries.geojson`.

## Context passed to `register(ctx)`

| Field | What it is |
| --- | --- |
| `scene` | The Three.js scene. |
| `world` | The group that holds the city. Add meshes here. |
| `terrain` | `sampleGameY(x, z)`, `insidePlayable(x, z)`, `distanceOutside(x, z)`, and the boundary ring. Game Y is the Maryland DEM minus 133.531 m. |
| `maps` | The four surface textures already loaded. |
| `features` | The footprint GeoJSON features, playable and backdrop. |
| `heights` | `public/data/building-heights.json`. |
| `boundary` | The playable-boundary GeoJSON. |
| `buildings` | The result of `buildBuildings`, including `collisionPolygons` and `separateGroups`. |
| `shared` | A bag the modules fill. Infrastructure sets `shared.roads`. Vegetation sets `shared.trees`. |
| `extension` | The owner's extension URL, or `null`. |
| `district` | The slot record from `modules.json` (`id`, `code`, paths). |

Collision is the footprint ring plus a 0.36 m body radius, the same controller as before. A landmark that replaces a building may add one more ground rectangle from `collision.size` in its manifest. It does not delete the measured footprint collider.

## Landmark manifest

One object per model:

| Field | Meaning |
| --- | --- |
| `id` | Unique across districts. |
| `buildingId` | County `OBJECTID`, or `null` when the footprint is not confirmed. |
| `approval` | `approved` or `unapproved`. Unapproved placements get an orange pole and a name that starts with `UNAPPROVED`. |
| `active` | `false` keeps the file registered and out of the scene. |
| `glb` | Path under `public/`, or `null`. A null or failed file leaves the procedural building in place. |
| `longitude`, `latitude` | Placement. The loader converts them with the same origin as the rest of the game. |
| `rotationY`, `scale`, `elevationOffsetM` | Ground plane is terrain at that point plus the offset. |
| `replaceProcedural` | `true` removes the procedural mass for `buildingId`. `false` loads the file for a check and does not add a second mesh on top of the county building. |
| `collision.size` | Optional `[width, depth]` in metres, in the model's local axes, used only when the procedural mass is replaced. |

Two manifests must not claim the same `buildingId` for placement. The second one is rejected and the procedural building stays.

## What this foundation does not do

It does not design district architecture, plant landscaping, or model new landmarks. Those belong to the six owners after this branch is accepted.
