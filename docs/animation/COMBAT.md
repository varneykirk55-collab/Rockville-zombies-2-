# Third-person combat animation

This branch starts at `61e6ee3`. The existing cowgirl GLB, 69-joint skin, texture images, weapon GLBs, animation data and four Mixamo attachment sockets remain byte-identical. The reload work moves the existing separate magazine and bolt or slide nodes.

## Sources and rights

- Splashdown `astra/full-integration` at `069a2555b6c426cd5fed2877997dd053b7e01050` supplied the model and the seven locomotion clips already included in Rockville. The checked source folder has no matching third-person rifle or pistol reload takes. See the cowgirl manifest for exact FBX paths.
- Arena Mortis 2 main at `4d05984aa14407a6a6ec42238438c9433339a380` supplied the existing retargeted rifle and pistol spine tracks. Its source uses procedural weapon handling. Rockville already carries the rest-space-relative rotation data for three spine bones at 15 Hz.
- The directional overlay, two-bone constraints, ready and aim offsets, transition envelopes and individual magazine paths are original project code. No third-party animation downloads or additional license terms were introduced. The existing asset terms continue to apply.

## Animation inventory

| State | Implementation |
| --- | --- |
| Unarmed and armed idle | Cowgirl idle, with Arena Mortis spine layer and constrained hands while armed |
| Forward walk, run and sprint | Cowgirl gait clips with speed-scaled cadence and normalized phase continuity |
| Backward walk and run | Reverse cadence on the existing walk and run; lower body remains aimed generally forward |
| Left and right strafe and diagonal | Smooth body yaw offset plus redirected ankle trajectories on the corresponding gait |
| Stationary turn | Yaw-rate-driven alternating foot lifts |
| Jump, fall and land | Cowgirl takeoff, airborne and landing clips; upper body remains layered with reduced spine weight in air |
| Ready and aim | Blended aim raise and reach, with distinct receiver/support or pistol grip layouts |
| Shot and recovery | Arena Mortis spine recoil, weapon-specific rearward travel and damping, existing bolt or slide travel |
| Stow, draw and switch | Outgoing weapon lowers, transfers to the existing hip or sling socket, then incoming weapon raises within the existing 0.32 s window |
| Reload | Support hand moves to a cached magazine grip, tracks removal and insertion, then returns to the weapon support point |

Both upgraded and base weapons use the same handling profile for their model. The M4 uses a tucked receiver-side support, the MK35 uses a wider hold with a longer magazine excursion, and the M1911 uses a centered two-handed stance and a compact reload. The original audio starts at the same gameplay events. The display curves are sampled against the real 2.3 s, 2.6 s, and 1.5 s reload clocks, respectively. The existing game commits ammo at timer completion. The displayed magazine represents both removal and replacement.

## Rig and blending

One mixer drives base locomotion. It matches gait phase across speed changes and stops fully faded actions. Lower-limb two-bone constraints guide the original ankle motion; they do not move the player motor. The upper spine applies source-relative aim and recoil layers. For each weapon pose, an analytic two-bone solve guides the elbows and wrists with reusable math objects. The right socket is the exact weapon grip attachment. The solver recalculates barrel orientation from the final socket position after reach clamping and uses the left socket for support or magazine contact. Collider checks, the shot ray and shoulder camera remain in their original gameplay paths.

## Matched software-rendered benchmark

Same High preset, 480 × 270, startup viewpoint, 4 warm-up and 12 sampled frames per tier, 0/10/24 zombie fixtures. The fixture suppressed zombie attacks and used matching placement and approach speed. The CPU columns measure the complete player and combat updates respectively, including animation, IK and combat calculations. They are steady-stance samples. Software frame timing varies across runs.

| Zombies | Mean frame ms before → after | Median frame ms before → after | P95 frame ms before → after | Player CPU ms before → after | Combat CPU ms before → after |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 16.7 → 16.7 | 16.7 → 16.7 | 16.8 → 16.8 | 0.142 → 0.167 | 0.208 → 0.192 |
| 10 | 427.8 → 319.4 | 458.3 → 291.6 | 999.9 → 400.1 | 0.133 → 0.142 | 0.208 → 0.242 |
| 24 | 519.4 → 588.9 | 475.0 → 533.3 | 700.0 → 933.3 | 0.125 → 0.083 | 0.308 → 0.300 |

Draw calls and submitted triangles matched at each tier (170 / 324,901; 329 / 793,551; 469 / 1,088,433). The category-level CPU costs above are sub-millisecond. The 24-zombie whole-frame median and P95 regressed in this sample despite unchanged triangle and call counts and lower measured combined player/combat CPU time. The whole-frame differences are noisy and do not establish hardware performance.

## Validation scope

- Automated Chromium runs used the full city and the actual player, camera and combat controller. They exercised directional aiming movement, sprint, takeoff, fall, landing, shoulder switch, shots during backward movement, reloads for all base weapons, and rapid switching.
- An assisted economy pass teleported to the approved machine sites and used local test credits. It exercised a Mystery Box acquisition, all three Pack-a-Punch upgrades, firing the upgraded variants, unarmed locomotion during retrieval, a staged lethal attack and restart.
- Assisted camera tracking aimed at a naturally spawned Prisoner Zombie, and a shot through the actual M4 firing path applied damage and awarded points.
- In a stationary reach probe the left socket coincided with the ready target for each weapon. At sampled magazine extraction frames, the left socket was approximately 2.6 cm (M4), 1.1 cm (MK35), and under 1 mm (M1911) from its target. These are socket measurements at selected poses, with no per-finger contact validation.
- Simulated touch verified aim, swap, shoulder, and jump. An emulated controller verified lateral/diagonal movement, vertical aiming, firing and reloading. All graphics presets applied. Runtime requests were local and the passing runs logged no browser errors.
- The gameplay recordings use an automated controller in the full city with software frame submission throttled for capture. They are silent and show the three base-weapon reloads in M4, MK35, M1911 order.

Full per-finger contact and closed-chain heel/toe planting are outside this pass. The generated directional poses remain based on the supplied gait clips. Extreme reach at some reload and aim angles can still require IK clamping. Manual play, hardware performance, physical controller and phone testing, and exhaustive contact checks against weapon geometry remain outstanding.
