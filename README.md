# Rockville Town Center

A no-build Three.js third-person shooter foundation set in Rockville, Maryland. The browser loads the bundled Three.js r187 runtime and uses the committed Montgomery County building footprint snapshot.

## Run locally

From the repository root, run `python3 -m http.server 8000` on macOS or Linux, or `py -m http.server 8000` on Windows.

Open [http://localhost:8000](http://localhost:8000) in a modern browser with WebGL 2 and select **Enter downtown**. Keep the server running. Three.js and all gameplay assets are served from this repository. Use the Graphics selector to choose Low, Medium, or High. Your selection is saved in this browser.

| Action | Desktop | Phone | Standard gamepad |
| --- | --- | --- | --- |
| Enter or pause | Enter downtown / Esc | Enter downtown / leave the page | Start |
| Move | WASD or arrows | Left thumbstick | Left stick |
| Walk slowly | Hold C | Ease the thumbstick | Ease the left stick |
| Look | Mouse | Drag the scene | Right stick |
| Sprint forward | Hold Shift | Tap Sprint | Click left stick |
| Jump | Space | Tap Jump | A / Cross |
| Aim | Hold right mouse button | Tap Aim | LT / L2 |
| Fire | Left mouse button | Fire | RT / R2 |
| Reload | R | Reload | X / Square |
| Switch weapon | 1 M4, 2 MK35, 3 M1911 | Swap | D-pad left/right or RB / R1 |
| Switch shoulder | Q | Shoulder | Click right stick |

## Zombie survival

Enter downtown to start round one. Defeat the remaining Prisoner Zombies to advance, with a short break between rounds. Aim for headshots to earn additional points, then spend the points at the machines near spawn. Health regenerates after four seconds without damage. Use **Restart** on the game-over screen to begin a fresh run.

The Prisoner Zombie is by [Vinish.Dev](https://vinish.dev/free-3d-models/zombies) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [asset and configuration notes](docs/zombies/SOURCES.md).

## Training machines

Two temporary machines sit near the downtown spawn, clear of the surveyed roads and sidewalks. The HUD shows their distances. Use **E**, gamepad **Y / Triangle**, or the mobile **Interact** button when in reach.

The shared wallet starts at 500 points. The Mystery Box costs 950 points and Pack-a-Punch costs 5,000. Use the interact control again to collect a reward or retrieve an upgraded weapon. In a loopback-hosted development build, add `?machine-test=1` and press **P** to credit 5,000 test points.

## Downtown pass

The player starts just east of East Montgomery Avenue and Helen Heneghan Way, facing toward the junction. Brick is applied to the two carriageways within the small junction patch. The other road surfaces are asphalt. Roads follow county centerlines with estimated widths and sidewalk offsets on the surveyed terrain. Downtown adds crosswalks, lane paint, streetlights, façade windows, hard sun shadows, and a limited warm/cool color palette.

Building heights inside the playable boundary come from `public/data/building-heights.json`, not from area and a seed. High and Medium values are the measured heights in the geographic audit. Estimated values are labelled in that file. The ground is a 10 m Maryland DEM grid, and roads, sidewalks, and parking sit on it. There is no invisible wall at the old rectangle.

The cowgirl stays visible in the over-the-shoulder camera. Aiming eases the camera in and narrows its field of view. The default pace is still 4.3 m/s, sprint is 6.9 m/s, and aiming slows movement to 2.5 m/s. Holding C (or easing the stick) walks at 1.55 m/s. Space jumps about 1.15 m and lands at the local terrain elevation. Collision uses a 0.36 m radius against building footprints and fitted landmark hulls, so the player slides along walls and courtyards retain their interior space.

The Splashdown cowgirl uses her original locomotion clips. Retargeted Arena Mortis 2 spine animation and procedural hand placement layer over those clips during combat. Three orange training targets spawn near the starting block. A red crosshair indicates that nearby geometry blocks the weapon. Targets reset after being destroyed.

Open `?preview=1&demo=1` to watch the original locomotion in the lightweight street preview. The full city and combat use the standard launch URL.

## Source layout

`main.js` loads the committed footprint snapshot, height table, terrain grid, and the playable boundary in `public/data/playable-boundary.geojson`, then connects the scene and the existing update loop. `buildings.js` extrudes those footprints, drops shared wall faces, and applies roof codes. `terrain.js` samples the height grid. `camera.js` handles movement input, building collision, and the terrain-aware shoulder camera. `scene.js` configures the renderer and parking. Roads live in `src/infrastructure/`. Backdrop trees live in `src/vegetation/`. District slots live in `src/districts/<id>/`. `src/runtime/modules.js` loads those owners from `public/data/modules.json`, and `src/landmarks/integrate.js` places GLB landmarks from each district manifest. `config.js` holds the map origin and the road centerlines. `utils.js` converts longitude and latitude to local meters (+X east, +Y up, −Z north). `scripts/build_city_data.py` rebuilds the city files. `scripts/build_districts.py` rebuilds district ownership.

Ownership, the landmark inventory, and how the six parallel agents add work without editing `src/main.js` are in `docs/city-development-foundation/CONTRIBUTING.md`.

## Materials and data

Assignment 008 uses local [Poly Haven CC0](https://polyhaven.com/license) surfaces, packed material maps, a shared facade treatment and a partly cloudy daylight panorama. See the [environment inventory, references and benchmark report](docs/environmental-realism/README.md).

| Asset | Use |
| --- | --- |
| [Clean Asphalt](https://polyhaven.com/a/clean_asphalt) | Roadway grain with low visual noise |
| [Brick Pavement](https://polyhaven.com/a/brick_pavement) | Red interlocking pavers at the junction |
| [Rough Concrete](https://polyhaven.com/a/rough_concrete) | Matte sidewalks and tinted wall faces |
| [Tarred Gravel](https://polyhaven.com/a/tarred_gravel) | Dark aggregate for flat roof caps and terraces |

Building footprint data comes from the Montgomery County Planning Department, Maryland-National Capital Park and Planning Commission (M-NCPPC), and Montgomery County GIS / Technology & Enterprise Business Solutions. Road centerlines come from Montgomery County GIS / TEBS. [Building Footprints](https://geohub.montgomerycountymd.gov/mapping1/rest/services/Structures/Building_Footprints/FeatureServer/0) · [Street Centerline](https://geohub.montgomerycountymd.gov/mapping1/rest/services/Transportation/Street_Centerline/FeatureServer)
