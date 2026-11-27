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

function ribbon(positions, a, b, halfWidth, y) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.02) return;
  const ox = dz * halfWidth / length;
  const oz = -dx * halfWidth / length;
  const al = [a.x + ox, y, a.z + oz];
  const ar = [a.x - ox, y, a.z - oz];
  const bl = [b.x + ox, y, b.z + oz];
  const br = [b.x - ox, y, b.z - oz];
  positions.push(...al, ...ar, ...bl, ...bl, ...ar, ...br);
}

function roundJoin(positions, point, radius, y) {
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5;
    const b = (i + 1) * Math.PI / 5;
    positions.push(point.x, y, point.z,
      point.x + Math.cos(b) * radius, y, point.z + Math.sin(b) * radius,
      point.x + Math.cos(a) * radius, y, point.z + Math.sin(a) * radius);
  }
}

function addStreets(world, maps) {
  const roads = [];
  const walks = [];
  for (const [width, coordinates] of ROAD_CENTERLINES) {
    const points = coordinates.map(([lon, lat]) => lonLatToWorld(lon, lat));
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      roundJoin(roads, point, width, 0.018);
      if (width >= 4) roundJoin(walks, point, width + 2.0, 0.009);
      if (i === 0) continue;
      ribbon(roads, points[i - 1], point, width, 0.018);
      if (width >= 4) ribbon(walks, points[i - 1], point, width + 2.0, 0.009);
    }
  }
  addRoadMesh(world, 'Concrete sidewalks', walks,
    new THREE.MeshStandardMaterial({ color: 0x9ca9ae, map: maps.concrete, roughness: 1 }), 3.5);
  addRoadMesh(world, 'Asphalt streets', roads,
    new THREE.MeshStandardMaterial({
      color: 0xa8b6bc, map: maps.asphalt, roughness: 1,
      emissive: 0x8ea7b9, emissiveMap: maps.asphalt, emissiveIntensity: 0.38,
    }), 5);

  const { x, z } = junction;
  const point = (dx, dz) => ({ x: x + dx, z: z + dz });
  // East Montgomery runs east/west; Helen Heneghan meets it from the north.
  // The brick is a shallow T, limited to the carriageway at the junction.
  const brick = [];
  ribbon(brick, point(-7, 0.24), point(7, -0.24), 4.1, 0.028);
  ribbon(brick, point(0, -4.05), point(-0.06, -8.3), 4.1, 0.028);
  addRoadMesh(world, 'Brick at East Montgomery and Helen Heneghan', brick,
    new THREE.MeshStandardMaterial({
      color: 0xffb595, map: maps.brick, roughness: 0.9,
      emissive: 0xd88d73, emissiveMap: maps.brick, emissiveIntensity: 0.34,
    }), 2.5);

  const paint = [];
  for (const offset of [-11, 11]) {
    for (let stripe = -3; stripe <= 3; stripe++) {
      ribbon(paint, point(offset - 1.25, stripe * 0.92),
        point(offset + 1.25, stripe * 0.92), 0.24, 0.038);
    }
  }
  for (let stripe = -3; stripe <= 3; stripe++) {
    ribbon(paint, point(stripe * 0.92, -10), point(stripe * 0.92, -12.5), 0.24, 0.038);
  }
  addRoadMesh(world, 'Junction crosswalk paint', paint,
    new THREE.MeshStandardMaterial({ color: 0xf6e4b8, roughness: 0.82 }), 1);

  const centerPaint = [];
  for (const offset of [-48, -38, -28, -18, 18, 28, 38, 48]) {
    const roadZ = -offset * 0.023;
    ribbon(centerPaint, point(offset - 2.6, roadZ), point(offset + 2.6, roadZ), 0.072, 0.038);
  }
  addRoadMesh(world, 'East Montgomery lane paint', centerPaint,
    new THREE.MeshStandardMaterial({ color: 0xd69a33, roughness: 0.9 }), 1);

  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x293e46, roughness: 0.8 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xf0c48d, emissive: 0x49301a });
  const poleGeometry = new THREE.CylinderGeometry(0.06, 0.10, 5.1, 8);
  const armGeometry = new THREE.BoxGeometry(0.12, 0.13, 0.96);
  const lampGeometry = new THREE.BoxGeometry(0.38, 0.18, 0.52);
  const polePositions = [[-23, -5.6], [17, -5.5], [39, -5.8], [9, 5.5], [-17, 5.6],
    [-42, 6.4], [-5.4, -23], [5.4, -33]];
  for (const [dx, dz] of polePositions) {
    const post = new THREE.Mesh(poleGeometry, poleMaterial);
    post.position.set(x + dx, 2.55, z + dz);
    post.castShadow = true;
    const alongSideStreet = Math.abs(dx) < 7;
    const inwardX = alongSideStreet ? -Math.sign(dx) : 0;
    const inwardZ = alongSideStreet ? 0 : -Math.sign(dz);
    const arm = new THREE.Mesh(armGeometry, poleMaterial);
    arm.position.set(x + dx + inwardX * 0.42, 5.04, z + dz + inwardZ * 0.42);
    if (alongSideStreet) arm.rotation.y = Math.PI / 2;
    const luminaire = new THREE.Mesh(lampGeometry, lampMaterial);
    luminaire.position.set(x + dx + inwardX * 0.90, 5.01, z + dz + inwardZ * 0.90);
    luminaire.rotation.y = arm.rotation.y;
    world.add(post, arm, luminaire);
  }
}

export function createScene(viewport) {
  const scene = new THREE.Scene();
  const sky = 0x91bcca;
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 140, 670);

  const touch = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: !touch });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.35 : 1.75));
  renderer.setClearColor(sky);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  viewport.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xb5d2ff, 0x96806c, 1.42));
  const sun = new THREE.DirectionalLight(0xffd29b, 3.15);
  sun.position.set(junction.x - 86, 118, junction.z - 94);
  sun.target.position.set(junction.x, 0, junction.z);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(touch ? 1024 : 2048);
  const lightCamera = sun.shadow.camera;
  lightCamera.left = lightCamera.bottom = -125;
  lightCamera.right = lightCamera.top = 125;
  lightCamera.near = 5;
  lightCamera.far = 340;
  lightCamera.updateProjectionMatrix();
  sun.shadow.bias = -0.00022;
  sun.shadow.normalBias = 0.18;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3600, 3600),
    new THREE.MeshStandardMaterial({ color: 0x626e61, roughness: 1 }),
  );
  ground.name = 'Ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const world = new THREE.Group();
  world.name = 'World';
  scene.add(world);
  const maps = surfaceTextures(renderer);
  addStreets(world, maps);
  renderer.shadowMap.needsUpdate = true;

  return { scene, renderer, world, maps, sun };
}
