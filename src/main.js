import { Group, BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineLoop } from 'three';
import { createScene, addParking, addBridgeMarkers, alignSun } from './scene.js';
import { createCamera, createBuildingCollision } from './camera.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { createMachines } from './machines.js';
import { createWallet } from './machine-config.js';
import { buildBuildings } from './buildings.js';
import { createTerrain } from './terrain.js';
import { addStreets } from './infrastructure/roads.js';
import { integrateLandmarks } from './landmarks/integrate.js';
import { loadCityModules, loadLandmarkModels, separateBuildingIds } from './runtime/modules.js';
import { startGameLoop } from './game-loop.js';
import { runWalkTest, SHOTS, EXTRA_POSES, shotPose } from './walk-test.js';
import { lonLatToWorld } from './utils.js';

const viewport = document.querySelector('#viewport');
const status = document.querySelector('#loading');
const params = new URLSearchParams(location.search);
const audit = params.has('audit');
const demo = params.has('demo');

const { scene, renderer, world, maps, sun } = createScene(viewport);
const { camera, controls } = createCamera(renderer.domElement);
const player = createPlayer({ scene, renderer });
const combat = audit || params.has('preview') ? null
  : createCombat({ scene, renderer, camera, controls, player, canvas: renderer.domElement });

const wallet = createWallet();
const machines = combat ? createMachines({
  world, camera, renderer, controls, combat, wallet, testing: params.has('machine-test') && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname),
}) : null;

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
    if (demo && !audit && controls.active) controls.drive(demoInput(demoTime += delta));
    controls.update(delta);
    controls.pose.armed = combat?.armed ?? false;
    player.update(delta, controls.pose);
    combat?.update(delta);
    machines?.update(delta);
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

const dataUrl = (file) => new URL(`../public/data/${file}`, import.meta.url);

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url.pathname || url}`);
  return response.json();
}

const buildings = new Group();
buildings.name = 'Buildings';
world.add(buildings);

if (params.has('debug') || demo) document.querySelector('#gait').hidden = false;
try {
  if (params.has('preview')) {
    const [terrainJson, boundaryJson] = await Promise.all([
      loadJson(dataUrl('terrain.json')),
      loadJson(dataUrl('playable-boundary.geojson')),
    ]);
    const terrain = createTerrain(terrainJson, boundaryJson);
    world.add(terrain.buildMesh());
    alignSun(sun, terrain.sampleGameY);
    addStreets(world, maps, terrain, []);
    controls.prepare([], (x, z) => terrain.sampleGameY(x, z) + 0.04);
    if (demo || params.has('autostart')) controls.engage();
    status.hidden = true;
  } else {
    await loadCity();
  }
} catch (error) {
  console.error('Rockville building load failed:', error);
  status.hidden = false;
  status.textContent = 'Could not load the city geometry. Check the browser console for details.';
}

async function loadCity() {
  status.textContent = 'Loading surveyed heights and terrain…';
  const [terrainJson, boundaryJson, heights, footprintCollection, sections, parking, bridgeManifest, landmarkModels] = await Promise.all([
    loadJson(dataUrl('terrain.json')),
    loadJson(dataUrl('playable-boundary.geojson')),
    loadJson(dataUrl('building-heights.json')),
    loadJson(dataUrl('footprints.geojson')),
    loadJson(dataUrl('building-sections.geojson')),
    loadJson(dataUrl('parking.geojson')),
    loadJson(dataUrl('landmarks.json')),
    loadLandmarkModels(),
  ]);
  const terrain = createTerrain(terrainJson, boundaryJson);
  const ground = terrain.buildMesh();
  world.add(ground);
  alignSun(sun, terrain.sampleGameY);
  addParking(world, parking, terrain);
  addBridgeMarkers(world, bridgeManifest.bridge, terrain);

  const separateIds = separateBuildingIds(landmarkModels);
  status.textContent = `Building ${footprintCollection.features.length} footprints…`;
  const built = await buildBuildings({
    features: footprintCollection.features,
    heights,
    sections,
    sampleGameY: terrain.sampleGameY,
    maps,
    group: buildings,
    separateIds,
    onProgress: (done, total) => {
      status.textContent = `Building geometry (${done}/${total})…`;
    },
  });
  const shared = {};
  const moduleContext = {
    scene, world, terrain, maps, features: footprintCollection.features,
    heights, boundary: boundaryJson, buildings: built, shared,
  };
  const modules = await loadCityModules(moduleContext);
  const placed = await integrateLandmarks({
    world, models: landmarkModels, terrain,
    separateGroups: built.separateGroups,
    collisionPolygons: built.collisionPolygons,
    batch: params.get('batch') !== '0',
  });
  const sampleGround = (x, z) => terrain.sampleGameY(x, z) + 0.04;
  await machines?.place(built.collisionPolygons, sampleGround, terrain.insidePlayable);
  controls.prepare(built.collisionPolygons, sampleGround);
  combat?.prepareTargets();
  if (!audit && (demo || params.has('autostart'))) controls.engage();
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
    windowAudit: built.windowAudit,
    sharedWallMetres: built.sharedMetres,
    triangles: built.triangles,
    trees: shared.trees,
    roads: shared.roads,
    modules: modules.map(item => item.id),
    parking: parking.features.length,
    landmarks: placed,
    bridge: {
      deckElevationM: bridgeManifest.bridge.deckElevationM,
      clearanceOverPikeM: bridgeManifest.bridge.clearanceOverPikeM,
    },
    heightRange: { min: built.minHeight, max: built.maxHeight },
  };
  console.info('Rockville geometry', summary);
  const guides = new Group();
  guides.name = 'Footprint guides';
  world.add(guides);
  const frames = placed.filter(item => item.frame).map(item => item.frame);
  window.__ROCKVILLE__ = {
    summary,
    combat,
    machines,
    camera,
    renderer,
    scene,
    world,
    frames,
    freeze: controls.freeze,
    drive: controls.nudge,
    sampleGround,
    showGuides(frame, on) {
      while (guides.children.length) guides.remove(guides.children[0]);
      if (!on || !frame) return;
      const add = (ring, color, y) => {
        if (!ring?.length) return;
        const positions = [];
        for (const point of ring) positions.push(point.x, y, point.z);
        positions.push(ring[0].x, y, ring[0].z);
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
        guides.add(new LineLoop(geometry, new LineBasicMaterial({ color })));
      };
      const ground = sampleGround(frame.x, frame.z);
      add(frame.footprint, 0xffcc33, ground + 1.2);
      const hulls = Array.isArray(frame.hull?.[0]) ? frame.hull : [frame.hull];
      for (const ring of hulls) add(ring, 0x3ec6ff, ground + 1.6);
    },
    shots: SHOTS,
    extraPoses: EXTRA_POSES.map(pose => {
      const at = lonLatToWorld(pose.at[0], pose.at[1]);
      const look = lonLatToWorld(pose.look[0], pose.look[1]);
      return {
        id: pose.id, x: at.x, z: at.z, lookX: look.x, lookZ: look.z,
        eye: pose.eye, lookEye: pose.lookEye,
      };
    }),
  };
  if (audit) {
    const blocked = createBuildingCollision(built.collisionPolygons);
    window.__ROCKVILLE__.blocked = blocked;
    window.__ROCKVILLE__.pose = (id) => shotPose(SHOTS.find(item => item.id === id), sampleGround, blocked);
    window.__ROCKVILLE__.walk = runWalkTest({
      blocked,
      sampleGameY: sampleGround,
      insidePlayable: terrain.insidePlayable,
      distanceOutside: terrain.distanceOutside,
    });
    window.__ROCKVILLE__.landmarkPassage = frames.map(frame => {
      const reach = Math.hypot((frame.maxX - frame.minX) / 2, (frame.maxZ - frame.minZ) / 2) + 2.4;
      let blockedCount = 0;
      const samples = 16;
      for (let i = 0; i < samples; i++) {
        const angle = i / samples * Math.PI * 2;
        const x = frame.x + Math.cos(angle) * reach;
        const z = frame.z + Math.sin(angle) * reach;
        if (blocked(x, z)) blockedCount += 1;
      }
      const south = blocked(frame.x, frame.maxZ + 2.2);
      return { id: frame.id, ringBlocked: blockedCount, samples, southBlocked: south };
    });
    window.__ROCKVILLE__.ready = true;
    controls.freeze(true);
  }
  status.hidden = true;
}
