import { mkdir, writeFile } from 'node:fs/promises';
async function loadChromium() {
  const loaded = await import('playwright-core').catch(
    () => import('/tmp/pw/node_modules/playwright-core/index.js'));
  return loaded.chromium ?? loaded.default.chromium;
}
const chromium = await loadChromium();
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'docs/city-geometry-upgrade/screenshots');
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
await page.waitForFunction(() => window.__ROCKVILLE__?.ready, null, { timeout: 120000 });

const summary = await page.evaluate(() => window.__ROCKVILLE__.summary);
const walk = await page.evaluate(() => window.__ROCKVILLE__.walk);
const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({
  name: entry.name.split('/').slice(-2).join('/'),
  bytes: entry.transferSize || entry.encodedBodySize || 0,
  ms: Math.round(entry.duration),
})));

const shots = await page.evaluate(() => window.__ROCKVILLE__.shots.map(shot => shot.id));
const files = [];
for (const id of shots) {
  await page.evaluate((shotId) => {
    const pose = window.__ROCKVILLE__.pose(shotId);
    const { camera, renderer, scene } = window.__ROCKVILLE__;
    window.__ROCKVILLE__.freeze(true);
    camera.position.set(pose.x, pose.y, pose.z);
    camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
    camera.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  }, id);
  await page.waitForTimeout(250);
  const file = path.join(outDir, `${id}.png`);
  await page.screenshot({ path: file });
  await page.screenshot({ path: path.join(artifactDir, `rockville-${id}.png`) });
  files.push(file);
}

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
    if (frames < 30) requestAnimationFrame(tick);
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

const report = { summary, walk, resources, performance: performanceInfo, gl, errors, files };
await writeFile(path.join(outDir, 'capture.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  gl,
  performance: performanceInfo,
  errors,
  walk: {
    roadSamples: walk.roadSamples,
    roadBlocked: walk.roadBlocked,
    roadBlockedFraction: walk.roadBlockedFraction,
    heightPops: walk.heightPops,
    boundarySamples: walk.boundarySamples,
    controller: walk.controller,
    approaches: walk.approaches,
  },
  summary,
  files,
}, null, 2));
await browser.close();
