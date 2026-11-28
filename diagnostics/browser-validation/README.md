# Assignment 009 browser diagnostics

These scripts run against a local HTTP server using checked-out game trees. Keep the game source at the fixed approved commit `ac5d129630cbf9a62078869154f0790554922860` and its comparator at `baac2666ca8df7795448ac3c7125b8e3f4301bcb`.

## Workspace

Place the approved checkout in `game/`, the comparator in `baseline/` and a copy of this directory in `qa/`, all with the same parent. Create an `out/` sibling directory. The browser launcher expects Google's Chrome for Testing headless shell 131.0.6778.33 in its standard extracted directory `chrome-headless-shell-linux64/`. The optional Edge binary uses the layout of the extracted Debian package in `edge/`. Install the pinned Playwright dependency in `qa/`. Firefox and WebKit engine checks require the corresponding Playwright browser installations and host libraries.

```sh
npm install --prefix qa
mkdir -p out
bash qa/run.sh audit.mjs
bash qa/run.sh compat.mjs chrome
bash qa/run.sh bench.mjs workload
bash qa/run.sh bench.mjs readback-matrix
bash qa/run.sh costs.mjs
bash qa/start.sh --isolated
python3 qa/aggregate.py out
```

The workload mode keeps scene submission and renderer counters intact while suppressing WebGL draw commands. Use its results for object, draw and triangle counts. Its CPU timings cannot establish rendered FPS. The readback mode records two measured frames per cell after one warm-up frame. It samples the software renderer at a fixed camera and reports the cost of a completed render including a one-pixel readback. The optional `bench-raf.mjs` captures real animation-frame intervals under staging.

The staged benchmarks fix the camera and population and run the production zombie visibility, animation and LOD paths. Natural spawning, pursuit and gameplay interactions are exercised independently in the input-only session. The 50-zombie fixture is isolated in the benchmark browser. The production service and its active-zombie cap use their approved settings.

`capture.mjs` and `stage-stills.mjs` generate city views and staged combat stills. `record.mjs` captures a fixed-camera preset comparison, visual defects and an assisted route with production collision. `session.mjs --combat-only` attempts to capture a longer input-only combat session. The screencast encoder uses the original frame timestamps so dropped and delayed frames remain visible.
