import * as THREE from 'three';
import { DOWNTOWN, ROAD_CENTERLINES } from './config.js';
import { lonLatToWorld } from './utils.js';

const junction = lonLatToWorld(DOWNTOWN.longitude, DOWNTOWN.latitude);

function surfaceTextures(renderer) {
  const loader = new THREE.TextureLoader();
  const assets = {
    asphalt: 'clean_asphalt',
    brick: 'brick_pavement',
    concrete: 'rough_concrete',
    roof: 'tarred_gravel',
  };
  return Object.fromEntries(Object.entries(assets).map(([surface, asset]) => {
    const url = new URL(`../public/${asset}.webp`, import.meta.url);
    const map = loader.load(url.href, undefined, undefined, (error) => {
      console.warn(`Rockville surface failed to load: ${asset}`, error);
    });
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return [surface, map];
  }));
}

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

function ribbon(positions, a, b, halfWidth, lift) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.02) return;
  const ox = dz * halfWidth / length;
  const oz = -dx * halfWidth / length;
  const yA = a.y + lift;
  const yB = b.y + lift;
  positions.push(
    a.x + ox, yA, a.z + oz, a.x - ox, yA, a.z - oz, b.x + ox, yB, b.z + oz,
    b.x + ox, yB, b.z + oz, a.x - ox, yA, a.z - oz, b.x - ox, yB, b.z - oz,
  );
}

function roundJoin(positions, point, radius, lift) {
  const y = point.y + lift;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const b = (i + 1) * Math.PI / 4;
    positions.push(point.x, y, point.z,
      point.x + Math.cos(b) * radius, y, point.z + Math.sin(b) * radius,
      point.x + Math.cos(a) * radius, y, point.z + Math.sin(a) * radius);
  }
}

function densify(a, b, sampleGameY) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(length / 8));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    points.push({ x, z, y: sampleGameY(x, z) });
  }
  return points;
}

export function addStreets(world, maps, terrain) {
  const { sampleGameY, distanceOutside } = terrain;
  const roads = [];
  const walks = [];
  for (const [width, coordinates] of ROAD_CENTERLINES) {
    const points = coordinates.map(([lon, lat]) => lonLatToWorld(lon, lat));
    for (let i = 1; i < points.length; i++) {
      const samples = densify(points[i - 1], points[i], sampleGameY);
      const mid = samples[Math.floor(samples.length / 2)];
      if (distanceOutside(mid.x, mid.z) > 32) continue;
      roundJoin(roads, samples[0], width, 0.045);
      if (width >= 4) roundJoin(walks, samples[0], width + 2.0, 0.028);
      for (let s = 1; s < samples.length; s++) {
        ribbon(roads, samples[s - 1], samples[s], width, 0.045);
        if (width >= 4) ribbon(walks, samples[s - 1], samples[s], width + 2.0, 0.028);
      }
    }
  }
  addRoadMesh(world, 'Concrete sidewalks', walks,
    new THREE.MeshStandardMaterial({ color: 0x9ca9ae, map: maps.concrete, roughness: 1 }), 3.5);
  addRoadMesh(world, 'Asphalt streets', roads,
    new THREE.MeshStandardMaterial({
      color: 0xa8b6bc, map: maps.asphalt, roughness: 1,
      emissive: 0x8ea7b9, emissiveMap: maps.asphalt, emissiveIntensity: 0.38,
    }), 5);

  const y = sampleGameY(junction.x, junction.z);
  const point = (dx, dz) => ({ x: junction.x + dx, z: junction.z + dz, y });
  const brick = [];
  ribbon(brick, point(-7, 0.24), point(7, -0.24), 4.1, 0.06);
  ribbon(brick, point(0, -4.05), point(-0.06, -8.3), 4.1, 0.06);
  addRoadMesh(world, 'Brick at East Montgomery and Helen Heneghan', brick,
    new THREE.MeshStandardMaterial({
      color: 0xffb595, map: maps.brick, roughness: 0.9,
      emissive: 0xd88d73, emissiveMap: maps.brick, emissiveIntensity: 0.34,
    }), 2.5);

  const paint = [];
  for (const offset of [-11, 11]) {
    for (let stripe = -3; stripe <= 3; stripe++) {
      ribbon(paint, point(offset - 1.25, stripe * 0.92), point(offset + 1.25, stripe * 0.92), 0.24, 0.07);
    }
  }
  for (let stripe = -3; stripe <= 3; stripe++) {
    ribbon(paint, point(stripe * 0.92, -10), point(stripe * 0.92, -12.5), 0.24, 0.07);
  }
  addRoadMesh(world, 'Junction crosswalk paint', paint,
    new THREE.MeshStandardMaterial({ color: 0xf6e4b8, roughness: 0.82 }), 1);

  const centerPaint = [];
  for (const offset of [-48, -38, -28, -18, 18, 28, 38, 48]) {
    const roadZ = -offset * 0.023;
    ribbon(centerPaint, point(offset - 2.6, roadZ), point(offset + 2.6, roadZ), 0.072, 0.07);
  }
  addRoadMesh(world, 'East Montgomery lane paint', centerPaint,
    new THREE.MeshStandardMaterial({ color: 0xd69a33, roughness: 0.9 }), 1);

  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x293e46, roughness: 0.8 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xf0c48d, emissive: 0x49301a });
  const poleGeometry = new THREE.CylinderGeometry(0.06, 0.10, 5.1, 6);
  const armGeometry = new THREE.BoxGeometry(0.12, 0.13, 0.96);
  const lampGeometry = new THREE.BoxGeometry(0.38, 0.18, 0.52);
  const polePositions = [[-23, -5.6], [17, -5.5], [39, -5.8], [9, 5.5], [-17, 5.6],
    [-42, 6.4], [-5.4, -23], [5.4, -33]];
  for (const [dx, dz] of polePositions) {
    const ground = sampleGameY(junction.x + dx, junction.z + dz);
    const post = new THREE.Mesh(poleGeometry, poleMaterial);
    post.position.set(junction.x + dx, ground + 2.55, junction.z + dz);
    post.castShadow = true;
    const alongSideStreet = Math.abs(dx) < 7;
    const inwardX = alongSideStreet ? -Math.sign(dx) : 0;
    const inwardZ = alongSideStreet ? 0 : -Math.sign(dz);
    const arm = new THREE.Mesh(armGeometry, poleMaterial);
    arm.position.set(junction.x + dx + inwardX * 0.42, ground + 5.04, junction.z + dz + inwardZ * 0.42);
    if (alongSideStreet) arm.rotation.y = Math.PI / 2;
    const luminaire = new THREE.Mesh(lampGeometry, lampMaterial);
    luminaire.position.set(junction.x + dx + inwardX * 0.90, ground + 5.01, junction.z + dz + inwardZ * 0.90);
    luminaire.rotation.y = arm.rotation.y;
    world.add(post, arm, luminaire);
  }
}

function worldRing(coordinates) {
  const ring = coordinates.map(([lon, lat]) => {
    const { x, z } = lonLatToWorld(lon, lat);
    return { x, z };
  });
  if (ring.length > 1 && ring[0].x === ring.at(-1).x && ring[0].z === ring.at(-1).z) ring.pop();
  return ring;
}

export function addParking(world, parking, terrain) {
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
    new THREE.MeshStandardMaterial({ color: 0x6e7874, roughness: 1 }), 6);
}

export function addTrees(world, terrain, footprints) {
  const blockers = [];
  for (const feature of footprints) {
    const raw = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates]
      : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
    for (const polygon of raw) {
      const outer = worldRing(polygon[0] ?? []);
      if (outer.length >= 3) blockers.push(outer);
    }
  }
  const spots = [];
  for (let x = -400; x <= 820; x += 18) {
    for (let z = -1040; z <= 740; z += 18) {
      const outside = terrain.distanceOutside(x, z);
      if (outside < 8 || outside > 52) continue;
      const jitter = ((Math.imul(x * 13 + z * 29, 0x45d9f3b) >>> 0) / 0x100000000) - 0.5;
      const px = x + jitter * 8;
      const pz = z + (((Math.imul(z * 17 - x, 0x27d4eb2d) >>> 0) / 0x100000000) - 0.5) * 8;
      if (blockers.some(ring => insideRing(px, pz, ring))) continue;
      spots.push(px, pz);
    }
  }
  if (!spots.length) return 0;
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.24, 2.4, 5),
    new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }),
    spots.length / 2,
  );
  const crown = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.3, 6.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x2f6a3c, roughness: 1 }),
    spots.length / 2,
  );
  trunk.name = 'Backdrop tree trunks';
  crown.name = 'Backdrop tree crowns';
  const dummy = new THREE.Object3D();
  for (let i = 0; i < spots.length; i += 2) {
    const y = terrain.sampleGameY(spots[i], spots[i + 1]);
    dummy.position.set(spots[i], y + 1.2, spots[i + 1]);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunk.setMatrixAt(i / 2, dummy.matrix);
    dummy.position.y = y + 4.4;
    dummy.updateMatrix();
    crown.setMatrixAt(i / 2, dummy.matrix);
  }
  trunk.castShadow = crown.castShadow = false;
  world.add(trunk, crown);
  return spots.length / 2;
}

function insideRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
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
  const sky = 0x91bcca;
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 140, 670);

  const touch = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.35 : 1.75));
  renderer.setClearColor(sky);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  viewport.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xb5d2ff, 0x96806c, 1.42));
  const sun = new THREE.DirectionalLight(0xffd29b, 3.15);
  sun.position.set(junction.x - 86, 140, junction.z - 94);
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
  sun.shadow.normalBias = 0.18;
  scene.add(sun, sun.target);

  const world = new THREE.Group();
  world.name = 'World';
  scene.add(world);
  const maps = surfaceTextures(renderer);

  return { scene, renderer, world, maps, sun };
}

export function alignSun(sun, sampleGameY) {
  const y = sampleGameY(junction.x, junction.z);
  sun.target.position.set(junction.x, y + 8, junction.z);
  sun.position.set(junction.x - 86, y + 150, junction.z - 94);
  sun.shadow.camera.updateProjectionMatrix();
}
