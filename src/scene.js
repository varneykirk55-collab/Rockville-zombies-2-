import * as THREE from 'three';
import { DOWNTOWN } from './config.js';
import { lonLatToWorld } from './utils.js';
import { loadCityMaterials } from './environment/materials.js';

const junction = lonLatToWorld(DOWNTOWN.longitude, DOWNTOWN.latitude);

function addRoadMesh(world, name, positions, material, metersPerRepeat) {
  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  const normals = [];
  const uv = [];
  for (let i = 0; i < positions.length; i += 3) {
    normals.push(0, 1, 0);
    uv.push(positions[i] / metersPerRepeat, positions[i + 2] / metersPerRepeat);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  world.add(mesh);
}

function worldRing(coordinates) {
  const ring = coordinates.map(([lon, lat]) => {
    const { x, z } = lonLatToWorld(lon, lat);
    return { x, z };
  });
  if (ring.length > 1 && ring[0].x === ring.at(-1).x && ring[0].z === ring.at(-1).z) ring.pop();
  return ring;
}

export function addParking(world, parking, terrain, maps) {
  const positions = [];
  for (const feature of parking.features ?? []) {
    const rings = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates[0]] : [];
    for (const ring of rings) {
      const polygon = worldRing(ring);
      if (polygon.length < 3) continue;
      for (let i = 1; i < polygon.length - 1; i++) {
        for (const point of [polygon[0], polygon[i], polygon[i + 1]]) {
          positions.push(point.x, terrain.sampleGameY(point.x, point.z) + 0.02, point.z);
        }
      }
    }
  }
  addRoadMesh(world, 'Parking', positions,
    new THREE.MeshStandardMaterial({ ...maps.asphalt, color: 0x858785 }), 5.4);
}

export function addBridgeMarkers(world, bridge, terrain) {
  const group = new THREE.Group();
  group.name = 'Metro pedestrian bridge connection points';
  const material = new THREE.MeshStandardMaterial({ color: 0xd7e4ea, roughness: 0.7 });
  for (const end of [bridge.west, bridge.east]) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 10), material);
    const y = terrain.sampleGameY(end.x, end.z);
    pad.position.set(end.x, y + 0.08, end.z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), material);
    post.position.set(end.x, y + 0.9, end.z);
    group.add(pad, post);
  }
  world.add(group);
}

export function createScene(viewport) {
  const scene = new THREE.Scene();
  const sky = 0xadc9dc;
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 235, 910);

  const touch = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.35 : 1.75));
  renderer.setClearColor(sky);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.07;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  viewport.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xd5e4ff, 0xc8b6a1, 1.97));
  const sun = new THREE.DirectionalLight(0xffedd3, 2.68);
  sun.position.set(junction.x + 98, 140, junction.z + 85);
  sun.target.position.set(junction.x, 0, junction.z);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(touch ? 1024 : 2048);
  const lightCamera = sun.shadow.camera;
  lightCamera.left = lightCamera.bottom = -160;
  lightCamera.right = lightCamera.top = 160;
  lightCamera.near = 5;
  lightCamera.far = 420;
  lightCamera.updateProjectionMatrix();
  sun.shadow.bias = -0.00022;
  sun.shadow.normalBias = 0.10;
  sun.shadow.radius = 2.2;
  scene.add(sun, sun.target);

  const world = new THREE.Group();
  world.name = 'World';
  scene.add(world);
  const maps = loadCityMaterials(renderer);
  scene.background = maps.sky;
  scene.backgroundIntensity = 0.91;
  scene.backgroundRotation.y = Math.PI * 0.19;

  return { scene, renderer, world, maps, sun };
}

export function alignSun(sun, sampleGameY) {
  const y = sampleGameY(junction.x, junction.z);
  sun.target.position.set(junction.x, y + 8, junction.z);
  sun.position.set(junction.x + 98, y + 150, junction.z + 85);
  sun.shadow.camera.updateProjectionMatrix();
}
