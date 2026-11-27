# Arena Mortis 2 combat sources

The source is [Arena Mortis 2, main at 4d05984](https://github.com/varneykirk55-collab/Arena-mortis-2-/tree/4d05984aa14407a6a6ec42238438c9433339a380). The weapon loader serves byte-identical copies from `public/weapons/`. The source GLBs retain their embedded PBR textures, original proportions, and separate moving components. The rifles use the Grok v3 LOD1 exports from `codex/grok-weapon-integration` at `d29702d`. The pistol is the updated M1911 export from `bjorn/am2-asset-prep` at `454307f`.

| Weapon | Source GLB | Local GLB | Git blob |
| --- | --- | --- | --- |
| M4 Carbine | `assets/models/weapon_m4.glb` | `m4.glb` | `c43dc894a657e6272cdeac2f93e080865d4a9bc5` |
| MK35 ISR | `assets/models/weapon_mk35.glb` | `mk35.glb` | `d7e2303b8879294103bb6783b220f31cea6d5a33` |
| M1911 | `assets/models/weapon_pistol_new.glb` | `pistol.glb` | `7560cfd1691a4ae6b672e4a301ca81a88c8ed8c4` |

The M4 and MK35 were already optimized for runtime as LOD1 GLBs. Both have separate bolt and magazine mesh nodes. The M1911 has slide and magazine nodes. Rifle grip and muzzle coordinates come from `tools/import/grok_weapon.gd`, while the pistol uses its embedded markers. The original firing, reload, dry fire, switch, and stone impact clips come from `assets/audio/`. Weapon balance starts from `resources/weapons/{m4,mk35,pistol}.tres`. Rockville's tunable values are in `src/combat.js`.

## Animation

`public/combat/armed-spine.json` contains rest-space-relative rotation tracks retargeted from `assets/models/player_samurai.glb` at `4d05984`. The source asset contains armed idle, walk, run, aim idle, and fire recoil for both rifles and pistols. The port uses three upper-body bones resampled at 15 Hz. The cowgirl's locomotion mixer continues to drive the underlying pose, including jump, fall, and land. Inverse kinematics places her hands at the source weapon grips.

Arena Mortis 2's samurai GLB has no dedicated third-person strafe, backward, draw, holster, or reload clips. The current pass uses the cowgirl's locomotion with aiming-relative strafe and reverse playback for backward movement. Draw, holster, and reload use procedural transitions and moving weapon parts. Dedicated animation for these actions and authored finger grips remain outstanding.

## Runtime

Weapons load once and stay attached to their active or holstered sockets. The back displays one stored rifle at a time. Muzzle and impact meshes and audio voices are pooled. The camera sweeps the entire boom against the same footprint collision used by the player and keeps a terrain margin. Shots check the path from the character to the muzzle and from the muzzle to the crosshair convergence point. Wall checks use footprint volumes and sampled terrain. Rooftop-height-specific shot collision is outside this foundation.
