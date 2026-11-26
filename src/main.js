import { Group } from 'three';
import { createScene } from './scene.js';
import { createCamera } from './camera.js';
import { fetchFootprints } from './footprints.js';
import { buildBuildings } from './buildings.js';
import { startGameLoop } from './game-loop.js';

const viewport = document.querySelector('#viewport');
const status = document.querySelector('#loading');

const { scene, renderer, world, maps } = createScene(viewport);
const { camera, controls } = createCamera(renderer.domElement);

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

startGameLoop({
  renderer,
  scene,
  camera,
  update: (delta) => controls.update(delta),
});

const buildings = new Group();
buildings.name = 'County building footprints';
world.add(buildings);

try {
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
