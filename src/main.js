import { Group } from 'three';
import { createScene } from './scene.js';
import { createCamera } from './camera.js';
import { createPlayer } from './player.js';
import { fetchFootprints } from './footprints.js';
import { buildBuildings } from './buildings.js';
import { startGameLoop } from './game-loop.js';

const viewport = document.querySelector('#viewport');
const status = document.querySelector('#loading');

const { scene, renderer, world, maps, sun } = createScene(viewport);
const { camera, controls } = createCamera(renderer.domElement);
const player = createPlayer({ scene, renderer, sun });
const params = new URLSearchParams(location.search);
const demo = params.has('demo');

function resize() {
  const { clientWidth: width, clientHeight: height } = viewport;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

const observer = new ResizeObserver(resize);
observer.observe(viewport);
resize();

let demoTime = 0;
startGameLoop({
  renderer,
  scene,
  camera,
  update: (delta) => {
    if (demo) controls.drive(demoInput(demoTime += delta));
    controls.update(delta);
    player.update(delta, controls.pose);
  },
});

function demoInput(time) {
  if (time < 1) return { forward: 0 };
  if (time < 3.2) return { forward: 1, walk: true };
  if (time < 5.4) return { forward: 1 };
  if (time < 7.3) return { forward: 1, sprint: true };
  if (time < 7.55) return { forward: 1, sprint: true, jump: true };
  if (time < 9.4) return { forward: 1, sprint: true };
  if (time < 10.3) return { forward: 0 };
  return { forward: 1, walk: true };
}

const buildings = new Group();
buildings.name = 'County building footprints';
world.add(buildings);

if (params.has('debug') || demo) document.querySelector('#gait').hidden = false;
if (params.has('preview')) {
  controls.prepare([]);
  if (demo || params.get('view') === 'third') controls.setThirdPerson(true);
  if (demo || params.has('autostart')) controls.engage();
  status.hidden = true;
} else try {
  status.textContent = 'Fetching county building footprints…';
  const { features, errors } = await fetchFootprints((done, total) => {
    status.textContent = `Fetching county building footprints (${done}/${total} tiles)…`;
  });
  for (const error of errors) console.warn('Rockville GIS tile failed:', error);

  status.textContent = `Building 3D geometry (0/${features.length})…`;
  const { rendered, skipped, collisionPolygons, minHeight, maxHeight } = await buildBuildings(features, buildings, (done, total) => {
    status.textContent = `Building 3D geometry (${done}/${total})…`;
  }, maps);
  if (!rendered) throw new Error('No valid building polygons could be extruded.');

  controls.prepare(collisionPolygons);
  renderer.shadowMap.needsUpdate = true;
  console.info(`Rockville: ${rendered} buildings, ${skipped} skipped, ${errors.length} failed tiles.`,
    { minHeight, maxHeight });
  if (errors.length) {
    status.textContent = `Partial map. ${errors.length} county tile(s) failed. Refresh to retry.`;
  } else {
    status.hidden = true;
  }
} catch (error) {
  console.error('Rockville building load failed:', error);
  status.textContent = 'Could not load the county footprints. Check your connection and refresh.';
}
