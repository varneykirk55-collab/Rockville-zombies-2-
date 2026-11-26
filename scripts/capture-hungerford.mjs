import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function loadChromium() {
  const loaded = await import('playwright-core').catch(
    () => import('/tmp/pw/node_modules/playwright-core/index.js'));
  return loaded.chromium ?? loaded.default.chromium;
}

const chromium = await loadChromium();
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'docs/hungerford-corridor/screenshots');
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
const hungerfordWalk = await page.evaluate(() => window.__ROCKVILLE__.hungerfordWalk());
const shots = await page.evaluate(() => window.__ROCKVILLE__.hungerfordShots);

const files = [];
for (const shot of shots) {
  await page.evaluate((item) => {
    const pose = window.__ROCKVILLE__.pose(item.id);
    const { camera, renderer, scene } = window.__ROCKVILLE__;
    if (!window.__ROCKVILLE__._fogFar && scene.fog) window.__ROCKVILLE__._fogFar = scene.fog.far;
    if (scene.fog) scene.fog.far = item.eye > 40 ? 1600 : window.__ROCKVILLE__._fogFar;
    window.__ROCKVILLE__.freeze(true);
    camera.position.set(pose.x, pose.y, pose.z);
    camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
    camera.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  }, shot);
  await page.waitForTimeout(280);
  const file = path.join(outDir, `${shot.id}.png`);
  await page.screenshot({ path: file });
  await page.screenshot({ path: path.join(artifactDir, `hungerford-${shot.id}.png`) });
  files.push(file);
}

const performanceInfo = await page.evaluate(() => new Promise((resolve) => {
  const { renderer, scene, camera } = window.__ROCKVILLE__;
  function measure(id, done) {
    const pose = window.__ROCKVILLE__.pose(id);
    camera.position.set(pose.x, pose.y, pose.z);
    camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
    camera.updateMatrixWorld();
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
      renderer.render(scene, camera);
      if (frames < 12) requestAnimationFrame(tick);
      else done({ drawCalls: calls, triangles, frameMs: (performance.now() - start) / frames });
    }
    requestAnimationFrame(tick);
  }
  measure('street-north', (hungerfordView) => {
    measure('metro', (metroView) => resolve({ hungerfordView, metroView }));
  });
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

const report = { summary, walk, hungerfordWalk, performance: performanceInfo, gl, errors, files };
await writeFile(path.join(outDir, 'capture.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  gl,
  performance: performanceInfo,
  hungerford: summary.hungerford,
  hungerfordWalk,
  walk: {
    roadSamples: walk.roadSamples,
    roadBlocked: walk.roadBlocked,
    roadBlockedFraction: walk.roadBlockedFraction,
  },
  errors,
  files,
}, null, 2));
await browser.close();
