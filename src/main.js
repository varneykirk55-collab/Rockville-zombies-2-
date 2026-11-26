import { Color, Group } from 'three';
import { createScene, addStreets, addParking, addTrees, addBridgeMarkers, alignSun } from './scene.js';
import { createCamera, createBuildingCollision } from './camera.js';
import { buildBuildings } from './buildings.js';
import { createTerrain } from './terrain.js';
import { placeLandmarks } from './landmarks.js';
import { startGameLoop } from './game-loop.js';
import { runWalkTest, SHOTS, shotPose } from './walk-test.js';
import { dressHungerford, loadDistrictTextures } from './districts/hungerford/apply.js';
import { HUNGERFORD_SHOTS } from './districts/hungerford/shots.js';
import { runHungerfordWalk } from './districts/hungerford/walk.js';

const viewport = document.querySelector('#viewport');
const status = document.querySelector('#loading');
const params = new URLSearchParams(location.search);
const audit = params.has('audit');

const { scene, renderer, world, maps, sun } = createScene(viewport);
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

const dataUrl = (file) => new URL(`../public/data/${file}`, import.meta.url);
const boundaryUrl = new URL('../docs/geographic-audit/data/playable-boundary.geojson', import.meta.url);

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url.pathname || url}`);
  return response.json();
}

const buildings = new Group();
buildings.name = 'Buildings';
world.add(buildings);

try {
  status.textContent = 'Loading surveyed heights and terrain…';
  const [terrainJson, boundaryJson, heights, footprintCollection, sections, parking, landmarks, hungerfordStyles, hungerfordTextures] = await Promise.all([
    loadJson(dataUrl('terrain.json')),
    loadJson(boundaryUrl),
    loadJson(dataUrl('building-heights.json')),
    loadJson(dataUrl('footprints.geojson')),
    loadJson(dataUrl('building-sections.geojson')),
    loadJson(dataUrl('parking.geojson')),
    loadJson(dataUrl('landmarks.json')),
    loadJson(new URL('../public/districts/hungerford/styles.json', import.meta.url)),
    loadDistrictTextures(),
  ]);
  const terrain = createTerrain(terrainJson, boundaryJson);
  const ground = terrain.buildMesh();
  world.add(ground);
  alignSun(sun, terrain.sampleGameY);
  addStreets(world, maps, terrain);
  addParking(world, parking, terrain);
  const treeCount = addTrees(world, terrain, footprintCollection.features);
  addBridgeMarkers(world, landmarks.bridge, terrain);

  const separateIds = new Set(
    (landmarks.landmarks ?? []).filter(item => item.hideProcedural).map(item => item.footprintId),
  );
  status.textContent = `Building ${footprintCollection.features.length} footprints…`;
  const hungerfordIds = new Set(Object.keys(hungerfordStyles.buildings).map(Number));
  const built = await buildBuildings({
    features: footprintCollection.features,
    heights,
    sections,
    sampleGameY: terrain.sampleGameY,
    maps,
    group: buildings,
    separateIds,
    districtIds: hungerfordIds,
    districtColor: (id) => {
      const item = hungerfordStyles.buildings[String(id)];
      return item ? new Color(item.wall[0], item.wall[1], item.wall[2]) : null;
    },
    onProgress: (done, total) => {
      status.textContent = `Building geometry (${done}/${total})…`;
    },
  });
  const hungerford = dressHungerford({
    parent: buildings,
    edges: built.facadeEdges,
    styles: hungerfordStyles,
    maps,
    textures: hungerfordTextures,
    collisionPolygons: built.collisionPolygons,
  });
  const placed = await placeLandmarks({
    world, manifest: landmarks, terrain,
    separateGroups: built.separateGroups,
    collisionPolygons: built.collisionPolygons,
  });
  const sampleGround = (x, z) => terrain.sampleGameY(x, z) + 0.04;
  controls.prepare(built.collisionPolygons, sampleGround);
  if (audit) {
    document.querySelector('#start-panel').hidden = true;
    document.querySelector('#hud').hidden = true;
  }
  renderer.shadowMap.needsUpdate = true;

  const summary = {
    rendered: built.rendered,
    skipped: built.skipped,
    playable: Object.keys(heights.buildings).length,
    confidence: heights.counts,
    methods: heights.methods,
    windows: built.windows,
    sharedWallMetres: built.sharedMetres,
    triangles: built.triangles,
    trees: treeCount,
    parking: parking.features.length,
    landmarks: placed,
    hungerford,
    bridge: {
      deckElevationM: landmarks.bridge.deckElevationM,
      clearanceOverPikeM: landmarks.bridge.clearanceOverPikeM,
    },
    heightRange: { min: built.minHeight, max: built.maxHeight },
  };
  console.info('Rockville geometry', summary);
  window.__ROCKVILLE__ = {
    summary,
    camera,
    renderer,
    scene,
    freeze: controls.freeze,
    sampleGround,
    shots: SHOTS,
    hungerfordShots: HUNGERFORD_SHOTS,
  };
  if (audit) {
    const blocked = createBuildingCollision(built.collisionPolygons);
    window.__ROCKVILLE__.blocked = blocked;
    const findShot = (id) => SHOTS.find(item => item.id === id)
      || HUNGERFORD_SHOTS.find(item => item.id === id);
    window.__ROCKVILLE__.pose = (id) => shotPose(findShot(id), sampleGround, blocked);
    window.__ROCKVILLE__.hungerfordWalk = () => runHungerfordWalk({
      blocked,
      sampleGameY: sampleGround,
    });
    window.__ROCKVILLE__.walk = runWalkTest({
      blocked,
      sampleGameY: sampleGround,
      insidePlayable: terrain.insidePlayable,
      distanceOutside: terrain.distanceOutside,
    });
    window.__ROCKVILLE__.ready = true;
    controls.freeze(true);
  }
  status.hidden = true;
} catch (error) {
  console.error('Rockville building load failed:', error);
  status.hidden = false;
  status.textContent = 'Could not load the city geometry. Check the browser console for details.';
}
