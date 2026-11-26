import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function loadChromium() {
  const loaded = await import('playwright-core').catch(
    () => import('/tmp/pw/node_modules/playwright-core/index.js'));
  return loaded.chromium ?? loaded.default.chromium;
}

const chromium = await loadChromium();
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'docs/town-square/screenshots');
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

async function measure(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => {
    const { renderer, camera } = window.__ROCKVILLE__;
    const viewport = document.querySelector('#viewport');
    const rect = viewport.getBoundingClientRect();
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  });
  return page.evaluate(() => new Promise((resolve) => {
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
      renderer.render(scene, camera);
      frames += 1;
      if (frames < 20) requestAnimationFrame(tick);
      else resolve({
        drawCalls: calls,
        triangles,
        frameMs: (performance.now() - start) / frames,
        fps: frames / ((performance.now() - start) / 1000),
      });
    }
    requestAnimationFrame(tick);
  }));
}

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto('http://127.0.0.1:8000/?audit=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__ROCKVILLE__?.ready, null, { timeout: 120000 });
await page.waitForFunction(() => window.__ROCKVILLE__.texturesReady(), null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(400);

const summary = await page.evaluate(() => window.__ROCKVILLE__.summary);
const walk = await page.evaluate(() => window.__ROCKVILLE__.walk);
const townWalk = await page.evaluate(() => window.__ROCKVILLE__.townWalk);
const shots = await page.evaluate(() => window.__ROCKVILLE__.townShots.map(shot => shot.id));
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
  await page.waitForTimeout(200);
  const file = path.join(outDir, `${id}.png`);
  await page.screenshot({ path: file });
  await page.screenshot({ path: path.join(artifactDir, `town-square-${id}.png`) });
  files.push(file);
}

await page.setViewportSize({ width: 1280, height: 720 });
await page.evaluate(() => {
  const pose = window.__ROCKVILLE__.pose('ts-overview');
  const { camera, renderer, scene } = window.__ROCKVILLE__;
  camera.position.set(pose.x, pose.y, pose.z);
  camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
  camera.updateMatrixWorld();
  renderer.render(scene, camera);
});
const desktop = await measure(page, 1280, 720);
const mobile = await measure(page, 390, 844);
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

const report = { summary, walk, townWalk, desktop, mobile, gl, errors, files };
await writeFile(path.join(outDir, 'capture.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  gl, desktop, mobile, errors, townWalk, townSquare: summary.townSquare, landmarks: summary.landmarks,
}, null, 2));
await browser.close();
