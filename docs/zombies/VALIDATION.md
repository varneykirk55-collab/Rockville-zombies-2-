# Survival validation

Chromium used the full Rockville city, with Three.js r187 resolved from a local copy for testing and external requests blocked. The city audit loaded 743 buildings, six modules, and eight placed landmarks. Every browser run below logged zero browser errors unless indicated.

| Check | Actual result |
| --- | --- |
| Original Prisoner asset | Local GLB loaded. Idle, Walk, Run, Attack, Bite, Hit, Death, and Scream each advanced in the mixer in a state-forced clip test. |
| Natural spawning and pursuit | Default first-wave spawn and subsequent detection/pursuit observed. Other functional tests used fixtures for precise placement and timing. |
| Obstacle routing | A path initially blocked by city collision reached within 0.47 m of the player cell in 106 collision-checked steps. |
| Standard and upgraded weapons | Actual combat inputs landed head and torso hits across all six variants. Aimed targets and placement were controlled by the harness. The first upgrade went through the machine, the other two were applied through the same combat upgrade API. |
| Five consecutive rounds and scoring | Progressed from round 1 through round 6 with accelerated spawn timing and scripted hits through the live damage/scoring API. Balances after rounds 1–5 were 1,240, 2,330, 3,690, 5,540, and 7,770. |
| Machines | Collected a 950-point Mystery Box reward and a 5,000-point Pack-a-Punch upgrade using points earned from those kills. |
| Damage, cleanup, death and restart | Observed corpse cleanup, a lethal zombie attack, the game-over screen, and reset to round 1 with 100 health and 500 points. |
| Desktop, touch, and gamepad | Desktop combat inputs, simulated touch aim, swap, shoulder, and jump, and emulated standard gamepad startup, movement, aim, switching, firing, and reload passed. |
| Hordes | Rendered 10, 25 and 50 visible Prisoners in the existing city. Geometry count stayed 133 across the entire test. Heap and bone texture counts held near their high-water marks when returning from 50 to 10. |

The five-round run covers progression and economy logic with test assistance. It is not a manual playthrough at default speed. Its recording is a silent capture of that assisted run.

## Software Chromium benchmark

Chromium used SwiftShader at a 480 × 270 drawing buffer. Each tier used a fixed placement fixture, 4 warm-up and 10 measured frames, synchronized WebGL submission, and 10, 25, or 50 visible zombies. Navigation and animation ran in the full city. The horde fixture slowed zombies to keep the sample in frame and disabled their attacks. The 50 tier is above the default gameplay cap of 24. These small samples include software-renderer variability and do not establish physical GPU or mobile performance.

| Visible zombies | Mean ms | Median ms | P95 ms | Mean calls | Mean triangles | JS heap MiB | Chrome RSS MiB | Animation ms/frame | Navigation ms/frame |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 496.6 | 350.0 | 1,466.6 | 254 | 853,368 | 11.0 | 1,309.8 | 0.59 | 0.14 |
| 25 | 493.3 | 483.3 | 950.0 | 404 | 1,169,313 | 13.7 | 1,339.9 | 1.29 | 0.40 |
| 50 | 1,180.0 | 1,216.6 | 1,666.6 | 665 | 1,729,750 | 17.8 | 1,385.2 | 2.66 | 3.61 |

Heap figures are post-GC. RSS is the sum of reported Chrome process RSS and may count shared pages more than once. Returning from 50 to 10 left 40 zombies in the reusable pool, 133 geometries, and 87 textures. The heap was 17.8 MiB and aggregate RSS fell slightly. This exercises high-water reuse. Extended-session memory stability, default-speed manual balance, and performance on physical hardware remain unverified.
