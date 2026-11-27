# Performance pass
The baseline was main at `88459db`. The benchmark uses the same downtown spawn pose and horde-placement fixture at 480 × 270, SwiftShader Chromium, desktop DPR 1, and a 2048 shadow map. The candidate uses High. Each tier warms up for four frames and measures ten. The horde fixture holds 10, 24, 25, or 50 visible zombies with attacks disabled and reduced approach speed. This keeps them in frame and does not change production configuration. Browser scheduling and shared CPU load add variance to small software-rendered samples. P95 and P99 both resolve to the worst frame at this sample size.

## Rendering and startup
City wall and roof batches are divided into 224 m tiles and window instancing into 144 m tiles. The tiles share their respective materials and let the renderer cull off-camera geometry. Higher draw-call counts are the cost of finer culling. Landmark attachments, original meshes, collider data and street layout are retained. The loop coalesces shadow refresh requests, and zombie-only shadow flags still use the existing proximity rules. The startup loop avoids rendering partial city frames and loads the zombie and machine assets concurrently.

Each pooled zombie is detached from the rendered scene until reused. The system reuses the existing skinned geometry, materials and bone textures. Navigation caches and staggers obstructed-route waypoint lookups while ordinary movement and collision checks still run every simulation tick. The machine HUD suppresses redundant text writes. Existing pooled impacts and audio voices stay in place. Skeletal instancing and district streaming were not introduced. They would require a larger renderer change and validation of independently animated poses, transitions and lighting.

## Before and after
Times are milliseconds. Positive percentages indicate shorter median frame times.
| Visible zombies | Mean before → after | Median before → after | Median improvement | P95 / P99 / worst before → after | Draw calls before → after | Triangles before → after |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 16.7 → 16.7 | 16.7 → 16.7 | +0.3% | 16.7 → 16.8 | 111 → 170 | 418572 → 324901 |
| 10 | 485.0 → 431.7 | 483.3 → 450.0 | +6.9% | 966.6 → 983.3 | 265 → 329 | 887230 → 793551 |
| 24 | 496.6 → 428.3 | 499.9 → 433.3 | +13.3% | 650.0 → 516.8 | 405 → 469 | 1182112 → 1088433 |
| 25 | 653.3 → 586.6 | 608.4 → 649.9 | -6.8% | 1299.9 → 683.3 | 415 → 467 | 1203175 → 1075636 |
| 50 | 770.0 → 613.3 | 675.0 → 633.3 | +6.2% | 1349.9 → 1033.3 | 665 → 729 | 1729750 → 1636071 |

| Visible zombies | Animation CPU ms/frame before → after | Navigation CPU ms/frame before → after | Post-GC JS heap MiB before → after | Geometry count before → after | Texture count before → after |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0.00 → 0.00 | 0.00 → 0.00 | 9.00 → 9.23 | 113 → 147 | 27 → 27 |
| 10 | 0.56 → 0.70 | 0.10 → 0.10 | 11.11 → 11.54 | 133 → 167 | 46 → 46 |
| 24 | 0.80 → 1.81 | 0.27 → 0.33 | 13.49 → 13.94 | 133 → 167 | 60 → 60 |
| 25 | 1.41 → 1.04 | 0.22 → 0.21 | 13.70 → 14.22 | 133 → 167 | 61 → 61 |
| 50 | 1.37 → 1.77 | 0.92 → 0.69 | 17.78 → 18.29 | 133 → 167 | 86 → 86 |

The 24-zombie median improved 13.3%. The 25-zombie median regressed despite a lower mean and worst sampled frame. At 50 visible zombies rendering still dominates relative to the measured animation and navigation work. WebGL submission synchronization did not provide separate GPU timing in this setup. CPU and heap values exclude GPU memory. The 50-to-10 recycle sample preserved the texture and geometry high-water counts, with a 3,167 ms worst candidate frame versus 1,333 ms baseline. This short measurement does not establish sustained frame pacing.

Cold local start to round-one readiness was 4,581 ms baseline and 4,552 ms candidate. The baseline's CDN requests were fulfilled with local r187 bytes to avoid confounding network delay. The candidate made zero external requests. The matching test does not measure download over the public internet.

## Graphics presets
| Preset | DPR cap × scale | Shadow map | Minimum simulation time between refreshes | Zombie LOD switches |
| --- | --- | ---: | ---: | --- |
| Low | 1 × 0.75 | 512 | 0.22 s | 8 m, 23 m |
| Medium | 1.25 × 1 | 1024 | 0.15 s | 11 m, 29 m |
| High | 1.75 × 1 | 2048 | 0.10 s | 13 m, 32 m |

Low is the default for coarse pointers. Medium is the desktop default. The selector saves preferences in local storage. The game ships the exact Three.js 0.187.0 core, renderer and four required add-ons with their MIT license. Existing game assets are unchanged. Support for 60 FPS desktop and 30 FPS mobile remains a physical-hardware target.

## Regression and short stability run
- The complete city loaded with 743 buildings, six modules, eight placed landmarks, and all eight original Zombie Prisoner clips. The Prisoner asset, city data, weapon data and machine economy assets are byte-identical to the baseline.
- Chromium exercised a natural spawn and pursuit, desktop locomotion and shoulder switching, three base weapons firing and reloading, and all three upgraded weapons firing. The M4 upgrade used Pack-a-Punch. The other upgrades used its combat upgrade API.
- The assisted progression test accelerated spawns and applied scripted hits through the production scoring API. It completed five waves, purchased from both machines with earned points, exercised lethal damage, and restarted at 500 points. This represents an assisted regression, not a default-speed manual playthrough.
- Simulated touch aim, weapon switching, shoulder switching and jumping passed. An emulated standard gamepad moved, fired and reloaded. The mobile run first caught a selector overlap with the shoulder button. The final layout moves the selector away from the touch controls and passed the repeat.
- Browser regressions and the offline matched benchmark logged zero external runtime requests and zero browser errors. All three presets applied, and the selected preset persisted after reload.

The short soak sampled **123 seconds**, cycling 0, 10, 24 and 50-zombie fixtures across each preset. It used throttled rendering to exercise update and pooling logic on the software executor. It complements the separate assisted gameplay regression. It does not replace a thirty-minute gameplay soak.

| Metric | Observed |
| --- | --- |
| Post-GC JS heap after first 50 | 20.16 MB first high-water sample, 20.31 MB final |
| Geometry and texture resources | 172 geometries after all observed LODs were visited, 85–87 textures during preset changes |
| Zombie mixers and pool | 50 mixers at peak, all 50 returned to the pool at zero active |
| Scene objects | 4,471 at 50, 521 at zero, including detached pooled zombies only while active |
| Zombie audio voices | 0–4 playing at sample times |
| JavaScript event listeners | 68 at every sample |

Baseline tracked public payload is 55,176,282 bytes. Vendoring Three.js adds about 2.3 MB before HTTP compression and browser caching. The benchmark's identical asset paths were served from a local static server. An extended physical GPU and mobile run and a 30-minute production-speed memory soak are outstanding.
