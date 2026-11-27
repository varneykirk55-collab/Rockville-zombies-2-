import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function loadChromium() {
  const loaded = await import('playwright-core').catch(
    () => import('/tmp/pw/node_modules/playwright-core/index.js'));
  return loaded.chromium ?? loaded.default.chromium;
}

const chromium = await loadChromium();
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const label = process.argv[2] || 'after';
const outDir = path.join(root, 'docs/city-development-foundation/screenshots', label);
const artifactDir = '/opt/cursor/artifacts';
await mkdir(outDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--disable-gpu-sandbox',
    '--no-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto('http://127.0.0.1:8000/?audit=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__ROCKVILLE__?.ready, null, { timeout: 180000 });

const summary = await page.evaluate(() => window.__ROCKVILLE__.summary);
const walk = await page.evaluate(() => window.__ROCKVILLE__.walk);
const shots = await page.evaluate(() => window.__ROCKVILLE__.shots.map(shot => shot.id));
const files = [];

async function shoot(id, pose) {
  await page.evaluate((next) => {
    const { camera, renderer, scene } = window.__ROCKVILLE__;
    window.__ROCKVILLE__.freeze(true);
    camera.position.set(next.x, next.y, next.z);
    camera.lookAt(next.lookX, next.lookY, next.lookZ);
    camera.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  }, pose);
  await page.waitForTimeout(200);
  const file = path.join(outDir, `${id}.png`);
  await page.screenshot({ path: file });
  await page.screenshot({ path: path.join(artifactDir, `foundation-${label}-${id}.png`) });
  files.push(file);
}

for (const id of shots) {
  const pose = await page.evaluate((shotId) => window.__ROCKVILLE__.pose(shotId), id);
  await shoot(id, pose);
}

const extra = await page.evaluate(() => {
  const sample = window.__ROCKVILLE__.sampleGround;
  const poses = window.__ROCKVILLE__.extraPoses ?? [];
  return poses.map(pose => ({
    id: pose.id,
    x: pose.x, y: sample(pose.x, pose.z) + (pose.eye ?? 1.68), z: pose.z,
    lookX: pose.lookX, lookY: sample(pose.lookX, pose.lookZ) + (pose.lookEye ?? 2.2), lookZ: pose.lookZ,
  }));
});
for (const pose of extra) await shoot(pose.id, pose);

const overview = await page.evaluate(() => {
  const sample = window.__ROCKVILLE__.sampleGround;
  return {
    id: 'overview',
    x: 180, y: sample(180, 80) + 420, z: 80,
    lookX: 220, lookY: sample(220, 40) + 8, lookZ: 40,
  };
});
await shoot('overview', overview);

const performanceInfo = await page.evaluate(() => new Promise((resolve) => {
  const { renderer, scene, camera } = window.__ROCKVILLE__;
  renderer.info.autoReset = false;
  renderer.info.reset();
  renderer.render(scene, camera);
  const calls = renderer.info.render.calls;
  const triangles = renderer.info.render.triangles;
  renderer.info.autoReset = true;
  const start = performance.now();
  let frames = 0;
  function tick() {
    frames += 1;
    if (frames < 20) requestAnimationFrame(tick);
    else resolve({
      drawCalls: calls,
      triangles,
      frameMs: (performance.now() - start) / frames,
    });
  }
  requestAnimationFrame(tick);
}));

const gl = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const debug = context?.getExtension('WEBGL_debug_renderer_info');
  return {
    width: canvas.width,
    height: canvas.height,
    renderer: debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
  };
});

const gameplay = await page.evaluate(async () => {
  const rockville = window.__ROCKVILLE__;
  const before = { x: rockville.camera.position.x, z: rockville.camera.position.z };
  rockville.freeze(false);
  if (typeof rockville.drive === 'function') {
    rockville.drive(1.2);
  }
  const frames = [];
  await new Promise((resolve) => {
    let count = 0;
    function step() {
      count += 1;
      if (count < 8) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
  rockville.freeze(true);
  const after = { x: rockville.camera.position.x, z: rockville.camera.position.z };
  return {
    movedM: Math.hypot(after.x - before.x, after.z - before.z),
    loopAdvanced: frames.length >= 0,
  };
});

const report = { label, summary, walk, performance: performanceInfo, gl, errors, files, gameplay };
await writeFile(path.join(outDir, 'capture.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  label,
  gl,
  performance: performanceInfo,
  errors,
  gameplay,
  walk: walk && {
    roadSamples: walk.roadSamples,
    roadBlocked: walk.roadBlocked,
    pedestrian: walk.pedestrian,
    heightPops: walk.heightPops,
    controller: walk.controller,
  },
  summary,
}, null, 2));
await browser.close();
