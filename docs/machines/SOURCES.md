# Machine sources and port

The source is [Arena Mortis 2 at 4d05984](https://github.com/varneykirk55-collab/Arena-mortis-2-/tree/4d05984aa14407a6a6ec42238438c9433339a380). Both model blobs last changed at `5a8ef6b` and were selected by the source game's current interactable scenes. The files in `public/machines/` retain their original geometry, local pivots, and embedded PBR textures.

| Source model | Git blob |
| --- | --- |
| `assets/models/mystery_box_new.glb` | `046964dcf066e60a0c71e6802cbc96652454608f` |
| `assets/models/pack_a_punch_new.glb` | `b6da8fc6b78cc583d2d5fdce78576421b76a2ed6` |

The two GLBs have movable nodes and no baked animation clips. Rockville ports the scripted lid, disc, and gear motion, warm lights, processing pulse, and completion flash from `scripts/interactables/{mystery_box,pack_a_punch}.gd`. The original box, denial, processor, completion, and upgraded weapon WAVs are served locally. The animated upgrade pattern is ported from `resources/shaders/upgrade_camo.gdshader`.

## Economy and rewards

The source game's 500 starting points, 950-point box, and 5,000-point upgrade come from `resources/economy/economy_config.tres`. Rockville's loopback-only testing switch credits points without adding a production income source. Both machines hold one transaction at a time. Training target hits award no points.

The source rolls M4, MK35, and Jupiter with weights 85, 40, and 12, respectively. The M1911's source weight is zero and it is absent from that scene's reward list. This draft keeps the two eligible Rockville weights in their original ratio. The M1911 is represented in the Rockville configuration at its original zero weight pending owner approval of a positive weight or another pool mapping.

| Weapon | Original source odds | Rockville draft odds |
| --- | ---: | ---: |
| M4 | 62.04% | 68% |
| MK35 | 29.20% | 32% |
| Jupiter | 8.76% | Out of pool |
| M1911 | 0% | 0% |

The box cycles for 3.4 seconds and presents the roll for 9 seconds. Collection refills and equips the matching weapon because all three weapons are already carried. An uncollected offer expires without a refund.

## Pack-a-Punch

The source charges on successful completion after a 3.2-second processing cycle. A single upgrade tier refills both capacities and stays with the weapon when switching. Rockville adds a visible insertion and a deliberate retrieval at the machine as requested. The source completed the upgrade directly in the held inventory.

| Weapon | Upgraded name | Damage before falloff | Magazine | Reserve | Rounds/s |
| --- | --- | ---: | ---: | ---: | ---: |
| M4 | Legio Fulminata | 84 | 40 | 315 | 13.75 |
| MK35 | Praetorian Tempest | 96 | 40 | 270 | 11 |
| M1911 | Mars Ultor | 112.5 | 12 | 144 | 8.4 |

The models are seated near the existing downtown spawn using the surveyed terrain. Site selection excludes building footprints and leaves clearance outside carriageways and sidewalks. Fitted collider footprints enter the existing movement and camera collision index. Both sites are temporary.
