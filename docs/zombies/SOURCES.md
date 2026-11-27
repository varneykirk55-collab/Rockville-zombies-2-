# Prisoner Zombie and survival configuration

**Zombie Prisoner** by **Vinish.Dev** is licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). See the [source listing](https://vinish.dev/free-3d-models/zombies) and the [original individual GLB](https://vinish-models.pages.dev/zombies/zombie-prisoner.glb). The downloaded original was 3,237,068 bytes with SHA-256 `cf58f6ec538707db4dc99ec5eb8bcb1dd1454810041d017d6da83f1f00e57f29`.

Rockville modifies the mesh index lists using meshoptimizer. The GLB retains the original orange jumpsuit, vertex colors, material slots, embedded textures, skeleton, joint weights, and Idle, Walk, Run, Attack, Bite, Hit, Death, and Scream. The model uses shared GPU geometry, local root frustum culling and skinned LOD switching. Clones each own one bone pose and GPU bone texture across all material primitives. Geometry and materials are shared between zombies. The far LOD omits small facial and clothing details beyond 32 m.

| Detail | Triangle count |
| --- | ---: |
| Source | 74,313 |
| Near, under 13 m from camera | 43,243 |
| Mid, under 32 m | 21,063 |
| Far | 7,210 in the GLB, 6,045 rendered with small parts culled |

The optimized GLB is 3,670,656 bytes and includes all three LOD index sets. Animated zombies outside the current view update at 4 Hz, the far view at about 6 Hz, and mid-distance at about 13 Hz. At most three nearby visible zombies cast shadows from the body and jumpsuit. Zombie-only shadow refresh is limited to 10 Hz. The pool reuses bodies and animation mixers, with at most 12 corpses pending cleanup.

Zombie, player damage, death, and round audio comes from [Arena Mortis 2 main at 4d05984](https://github.com/varneykirk55-collab/Arena-mortis-2-/tree/4d05984aa14407a6a6ec42238438c9433339a380) and is stored in `public/zombies/`. Wave, attack, headshot, regeneration, and scoring values come from its wave configuration, weapon resources, player, zombie, and economy scripts. Rockville automatically advances after the source three-second intermission instead of opening the Arena Mortis shop.

| Setting | Value |
| --- | --- |
| Wave population | Round `r`: round(6 + 2.4 × (r−1) + 0.15 × (r−1)²) |
| Active cap | 24 living, configurable |
| Spawn interval | Starts at 2 s, ×0.94 per round, 0.45 s floor before ±30% jitter |
| Zombie health | 150 + 100 per additional round through round 9, then ×1.1 per round |
| Attack | 35 damage, 1.55 m trigger, 2.05 m hit reach, 0.45 s windup, 1 s animation |
| Player health | 100, regenerates 30/s after 4 s without damage |
| Zombie scoring | 10 per hit, plus 60 per body kill or 100 per headshot kill |
| Round bonus | 50 × completed round |
| Headshots | M4 and MK35 2.2×, M1911 2.5×, including their upgraded versions |

The configurable Rockville additions are a 12–46 m spawn band, a 42 m awareness radius with a delayed pursuit fallback, bite chance 28%, 0.45 s between attack sequences, and seven seconds of corpse retention. Zombie paths use a moving local grid tied to the city collider, including the two machine footprints. Spawn candidates must connect to the current player cell and be outside the forward camera cone. The surveyed playable boundary limits the spawn grid. Walking far outside it can pause incoming spawns until the player returns.
