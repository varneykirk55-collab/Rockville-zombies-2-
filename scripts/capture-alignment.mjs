import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function loadChromium() {
  const loaded = await import('playwright-core').catch(
    () => import('/tmp/pw/node_modules/playwright-core/index.js'));
  return loaded.chromium ?? loaded.default?.chromium ?? loaded.default;
}
const chromium = await loadChromium();
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'docs/city-development-foundation/screenshots/alignment');
const artifactDir = '/opt/cursor/artifacts';
await mkdir(outDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto('http://127.0.0.1:8000/?audit=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__ROCKVILLE__?.ready, null, { timeout: 180000 });

const info = await page.evaluate(() => ({
  summary: window.__ROCKVILLE__.summary,
  walk: window.__ROCKVILLE__.walk,
  passage: window.__ROCKVILLE__.landmarkPassage,
  frames: window.__ROCKVILLE__.frames.map(frame => ({
    id: frame.id,
    x: frame.x, z: frame.z, y: frame.y, height: frame.height,
    minX: frame.minX, maxX: frame.maxX, minZ: frame.minZ, maxZ: frame.maxZ,
  })),
}));

async function shoot(name, pose, guides) {
  await page.evaluate(({ pose: next, guides: show, id }) => {
    const rockville = window.__ROCKVILLE__;
    const frame = rockville.frames.find(item => item.id === id);
    rockville.showGuides(frame, show);
    const { camera, renderer, scene } = rockville;
    rockville.freeze(true);
    camera.up.set(...(next.up || [0, 1, 0]));
    camera.fov = next.fov || 50;
    camera.updateProjectionMatrix();
    camera.position.set(next.x, next.y, next.z);
    camera.lookAt(next.lookX, next.lookY, next.lookZ);
    camera.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  }, { pose, guides: Boolean(guides), id: pose.id });
  await page.waitForTimeout(180);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  await page.screenshot({ path: path.join(artifactDir, `align-${name}.png`) });
}

const posesFor = async (frame) => page.evaluate((frame) => {
  const rockville = window.__ROCKVILLE__;
  const cx = (frame.minX + frame.maxX) / 2;
  const cz = (frame.minZ + frame.maxZ) / 2;
  const hx = (frame.maxX - frame.minX) / 2;
  const hz = (frame.maxZ - frame.minZ) / 2;
  const ground = rockville.sampleGround(cx, cz);
  const reach = Math.hypot(hx, hz);
  const vFov = 50 * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (1280 / 720));
  const fit = (halfWidth, halfHeight) => Math.max(
    halfWidth / Math.tan(hFov / 2),
    halfHeight / Math.tan(vFov / 2),
  ) * 1.28 + 6;
  const outside = (x, z) => {
    const dx = x < frame.minX ? frame.minX - x : x > frame.maxX ? x - frame.maxX : 0;
    const dz = z < frame.minZ ? frame.minZ - z : z > frame.maxZ ? z - frame.maxZ : 0;
    return Math.hypot(dx, dz);
  };
  const preferred = {
    'turret-corner': Math.PI / 2,
    'regal-cinemas': Math.PI,
    'white-columned': Math.PI,
    'circuit-court': -Math.PI / 2,
  }[frame.id] ?? 0;
  function fovFor(dist) {
    const aspect = 1280 / 720;
    const vertical = 2 * Math.atan((frame.height * 0.62) / dist);
    const horizontal = 2 * Math.atan(Math.max(hx, hz) / dist);
    const verticalFromWidth = 2 * Math.atan(Math.tan(horizontal / 2) / aspect);
    return Math.min(68, Math.max(42, (Math.max(vertical, verticalFromWidth) * 180) / Math.PI + 6));
  }
  function crowded(x, z, radius) {
    for (let i = 0; i < 8; i += 1) {
      const angle = i * Math.PI / 4;
      if (rockville.blocked(x + Math.sin(angle) * radius, z + Math.cos(angle) * radius)) return true;
    }
    return false;
  }
  function best(minDist, maxDist) {
    let chosen = null;
    const distances = [];
    for (let dist = minDist; dist <= maxDist; dist += 12) distances.push(dist);
    for (let step = 0; step < 16; step += 1) {
      const angle = preferred + step * (Math.PI / 8);
      for (const dist of distances) {
        const x = cx + Math.sin(angle) * dist;
        const z = cz + Math.cos(angle) * dist;
        if (rockville.blocked(x, z) || outside(x, z) < 10 || crowded(x, z, 10)) continue;
        let blockedAt = 1;
        for (let t = 0.08; t <= 0.92; t += 0.05) {
          const px = x + (cx - x) * t;
          const pz = z + (cz - z) * t;
          if (outside(px, pz) > 6 && rockville.blocked(px, pz)) { blockedAt = t; break; }
        }
        if (blockedAt < 0.85) continue;
        const fov = fovFor(dist);
        if (fov > 66) continue;
        const turn = Math.abs(Math.atan2(Math.sin(angle - preferred), Math.cos(angle - preferred)));
        const score = turn * 4 + Math.abs(fov - 52) * 0.05;
        if (!chosen || score < chosen.score) chosen = { x, z, fov, score };
      }
    }
    if (!chosen) {
      const dist = maxDist;
      chosen = { x: cx + Math.sin(preferred) * dist, z: cz + Math.cos(preferred) * dist, fov: Math.min(64, fovFor(dist)) };
    }
    return chosen;
  }
  const need = Math.max(reach + 18, fit(Math.max(hx, hz), frame.height * 0.58));
  const street = best(reach + 14, need);
  const elevated = best(need * 0.85, need + 20);
  const context = best(need + 20, need + 60);
  return {
    street: { id: frame.id, x: street.x, y: ground + 1.7, z: street.z, lookX: cx, lookY: ground + frame.height * 0.42, lookZ: cz, up: [0, 1, 0], fov: street.fov },
    elevated: { id: frame.id, x: elevated.x, y: ground + Math.min(22, frame.height * 0.4 + 10), z: elevated.z, lookX: cx, lookY: ground + frame.height * 0.35, lookZ: cz, up: [0, 1, 0], fov: Math.min(elevated.fov, 56) },
    context: { id: frame.id, x: context.x, y: ground + Math.max(48, frame.height), z: context.z, lookX: cx, lookY: ground + 6, lookZ: cz, up: [0, 1, 0], fov: 50 },
    overhead: {
      id: frame.id, x: cx, y: ground + frame.height + fit(Math.max(hx, hz) * 1.7, Math.max(hx, hz)), z: cz,
      lookX: cx, lookY: ground + frame.height * 0.5, lookZ: cz, up: [0, 0, -1], fov: 50,
    },
  };
}, frame);

for (const frame of info.frames) {
  const { street, elevated, context, overhead } = await posesFor(frame);
  const probe = process.argv[2] === 'probe';
  if (probe && !['clock-tower', 'turret-corner', 'regal-cinemas', 'district-court'].includes(frame.id)) continue;
  if (!probe || frame.id !== 'clock-tower') await shoot(`${frame.id}-street`, street, false);
  if (!probe || frame.id === 'clock-tower') await shoot(`${frame.id}-elevated`, elevated, false);
  if (!probe) await shoot(`${frame.id}-context`, context, false);
  if (!probe || frame.id === 'district-court') await shoot(`${frame.id}-overhead`, overhead, true);
}

const group = info.frames.reduce((box, frame) => ({
  minX: Math.min(box.minX, frame.minX), maxX: Math.max(box.maxX, frame.maxX),
  minZ: Math.min(box.minZ, frame.minZ), maxZ: Math.max(box.maxZ, frame.maxZ),
}), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
const gx = (group.minX + group.maxX) / 2;
const gz = (group.minZ + group.maxZ) / 2;
const gy = await page.evaluate(({ x, z }) => window.__ROCKVILLE__.sampleGround(x, z), { x: gx, z: gz });
await shoot('all-eight-overview', {
  id: info.frames[0].id,
  x: gx + 40,
  y: gy + 220,
  z: gz + 180,
  lookX: gx,
  lookY: gy + 10,
  lookZ: gz,
}, false);

async function measure(pose) {
  return page.evaluate((next) => new Promise((resolve) => {
    const { renderer, scene, camera } = window.__ROCKVILLE__;
    window.__ROCKVILLE__.showGuides(null, false);
    if (next) {
      camera.up.set(0, 1, 0);
      camera.position.set(next.x, next.y, next.z);
      camera.lookAt(next.lookX, next.lookY, next.lookZ);
      camera.updateMatrixWorld();
    }
    let sceneTriangles = 0;
    scene.traverse(node => {
      if (!node.isMesh) return;
      const index = node.geometry?.index;
      const position = node.geometry?.attributes?.position;
      const count = index ? index.count : (position?.count ?? 0);
      sceneTriangles += count / 3 * (node.isInstancedMesh ? node.count : 1);
    });
    renderer.info.autoReset = false;
    renderer.info.reset();
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    const calls = renderer.info.render.calls;
    const triangles = renderer.info.render.triangles;
    renderer.info.autoReset = true;
    const start = performance.now();
    let frames = 0;
    function tick() {
      frames += 1;
      if (frames < 8) requestAnimationFrame(tick);
      else resolve({
        drawCalls: calls,
        triangles,
        sceneTriangles: Math.round(sceneTriangles),
        frameMs: (performance.now() - start) / frames,
      });
    }
    requestAnimationFrame(tick);
  }), pose);
}
const allEight = await measure(null);
const canonicalGround = await page.evaluate(({ x, z }) => window.__ROCKVILLE__.sampleGround(x, z), { x: 180, z: 80 });
const performanceInfo = {
  allEight,
  canonicalOverview: await measure({ x: 180, y: canonicalGround + 420, z: 80, lookX: 220, lookY: canonicalGround + 8, lookZ: 40 }),
};

if (process.argv[2] !== 'probe') {
  const plain = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await plain.goto('http://127.0.0.1:8000/?audit=1&batch=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await plain.waitForFunction(() => window.__ROCKVILLE__?.ready, null, { timeout: 180000 });
  performanceInfo.unbatchedCanonical = await plain.evaluate(() => new Promise((resolve) => {
    const { renderer, scene, camera } = window.__ROCKVILLE__;
    const ground = window.__ROCKVILLE__.sampleGround(180, 80);
    camera.up.set(0, 1, 0);
    camera.position.set(180, ground + 420, 80);
    camera.lookAt(220, ground + 8, 40);
    camera.updateMatrixWorld();
    renderer.info.autoReset = false;
    renderer.info.reset();
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    resolve({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
  }));
  await plain.close();
}

const report = { info, performance: performanceInfo, errors, gl: await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('webgl2');
  const debug = context?.getExtension('WEBGL_debug_renderer_info');
  return debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
}) };
await writeFile(path.join(outDir, 'capture.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  performance: performanceInfo,
  errors: errors.slice(0, 8),
  passage: info.passage,
  landmarks: info.summary.landmarks.map(item => ({
    id: item.id, placed: item.placed, approval: item.approval, draws: item.drawCalls,
    removed: item.removedPlaceholder, reason: item.reason,
  })),
  walk: { samples: info.walk.roadSamples, blocked: info.walk.roadBlocked, pedestrian: info.walk.pedestrian },
}, null, 2));
await browser.close();
