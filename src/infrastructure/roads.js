import * as THREE from 'three';
import { DOWNTOWN, ROAD_CENTERLINES } from '../config.js';
import { lonLatToWorld } from '../utils.js';

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

function roundJoin(positions, point, radius, lift, solid) {
  if (solid?.(point.x, point.z)) return;
  const y = point.y + lift;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const b = (i + 1) * Math.PI / 4;
    const ax = point.x + Math.cos(a) * radius;
    const az = point.z + Math.sin(a) * radius;
    const bx = point.x + Math.cos(b) * radius;
    const bz = point.z + Math.sin(b) * radius;
    if (solid?.(ax, az) || solid?.(bx, bz)) continue;
    positions.push(point.x, y, point.z, bx, y, bz, ax, y, az);
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

function insideRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function worldRing(coordinates) {
  const ring = [];
  for (const [lon, lat] of coordinates) {
    const { x, z } = lonLatToWorld(lon, lat);
    const last = ring.at(-1);
    if (!last || last.x !== x || last.z !== z) ring.push({ x, z });
  }
  if (ring.length > 1 && ring[0].x === ring.at(-1).x && ring[0].z === ring.at(-1).z) ring.pop();
  return ring;
}

export function createFootprintSolid(features) {
  const cell = 48;
  const cells = new Map();
  for (const feature of features ?? []) {
    if (feature.properties?.role !== 'playable') continue;
    const raw = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates]
      : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
    for (const polygon of raw) {
      const outer = worldRing(polygon[0] ?? []);
      const holes = polygon.slice(1).map(worldRing).filter(ring => ring.length >= 3);
      if (outer.length < 3) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const point of outer) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
      }
      const body = { outer, holes, minX, maxX, minZ, maxZ, id: Number(feature.properties?.OBJECTID) };
      for (let x = Math.floor(minX / cell); x <= Math.floor(maxX / cell); x++) {
        for (let z = Math.floor(minZ / cell); z <= Math.floor(maxZ / cell); z++) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(body);
        }
      }
    }
  }
  return (x, z) => {
    for (const body of cells.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? []) {
      if (x < body.minX || x > body.maxX || z < body.minZ || z > body.maxZ) continue;
      if (insideRing(x, z, body.outer) && !body.holes.some(ring => insideRing(x, z, ring))) return body.id;
    }
    return 0;
  };
}

function lateralLimit(point, ox, oz, half, solid) {
  if (solid(point.x, point.z)) return 0;
  const steps = Math.max(1, Math.ceil(half / 0.7));
  for (let i = 1; i <= steps; i++) {
    const distance = half * i / steps;
    if (solid(point.x + ox * distance, point.z + oz * distance)) return Math.max(0, distance - 0.35);
  }
  return half;
}

function cutToBuilding(a, b, solid) {
  const aIn = Boolean(solid(a.x, a.z));
  const bIn = Boolean(solid(b.x, b.z));
  if (!aIn && !bIn) return [a, b];
  if (aIn && bIn) return null;
  let insideT = aIn ? 0 : 1;
  let outsideT = aIn ? 1 : 0;
  for (let i = 0; i < 8; i++) {
    const mid = (insideT + outsideT) / 2;
    const x = a.x + (b.x - a.x) * mid;
    const z = a.z + (b.z - a.z) * mid;
    if (solid(x, z)) insideT = mid;
    else outsideT = mid;
  }
  const t = outsideT;
  const edge = {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    y: a.y + (b.y - a.y) * t,
  };
  return aIn ? [edge, b] : [a, edge];
}

function clippedRibbon(positions, a, b, halfWidth, lift, solid, stats) {
  const piece = cutToBuilding(a, b, solid);
  if (!piece) {
    stats.omitted += 1;
    return;
  }
  const [start, end] = piece;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.15) {
    stats.omitted += 1;
    return;
  }
  const ox = dz / length;
  const oz = -dx / length;
  const leftA = lateralLimit(start, ox, oz, halfWidth, solid);
  const rightA = lateralLimit(start, -ox, -oz, halfWidth, solid);
  const leftB = lateralLimit(end, ox, oz, halfWidth, solid);
  const rightB = lateralLimit(end, -ox, -oz, halfWidth, solid);
  if (leftA + rightA < 0.4 && leftB + rightB < 0.4) {
    stats.omitted += 1;
    return;
  }
  if (leftA < halfWidth - 0.3 || rightA < halfWidth - 0.3 || leftB < halfWidth - 0.3 || rightB < halfWidth - 0.3
    || start !== a || end !== b) stats.trimmed += 1;
  const yA = start.y + lift;
  const yB = end.y + lift;
  positions.push(
    start.x + ox * leftA, yA, start.z + oz * leftA,
    start.x - ox * rightA, yA, start.z - oz * rightA,
    end.x + ox * leftB, yB, end.z + oz * leftB,
    end.x + ox * leftB, yB, end.z + oz * leftB,
    start.x - ox * rightA, yA, start.z - oz * rightA,
    end.x - ox * rightB, yB, end.z - oz * rightB,
  );
}

export function addStreets(world, maps, terrain, features) {
  const { sampleGameY, distanceOutside } = terrain;
  const solid = createFootprintSolid(features);
  const stats = { trimmed: 0, omitted: 0 };
  const roads = [];
  const walks = [];
  for (const [width, coordinates] of ROAD_CENTERLINES) {
    const points = coordinates.map(([lon, lat]) => lonLatToWorld(lon, lat));
    for (let i = 1; i < points.length; i++) {
      const samples = densify(points[i - 1], points[i], sampleGameY);
      const mid = samples[Math.floor(samples.length / 2)];
      if (distanceOutside(mid.x, mid.z) > 32) continue;
      roundJoin(roads, samples[0], width, 0.045, solid);
      if (width >= 4) roundJoin(walks, samples[0], width + 2.0, 0.028, solid);
      for (let s = 1; s < samples.length; s++) {
        clippedRibbon(roads, samples[s - 1], samples[s], width, 0.045, solid, stats);
        if (width >= 4) clippedRibbon(walks, samples[s - 1], samples[s], width + 2.0, 0.028, solid, stats);
      }
    }
  }
  addRoadMesh(world, 'Concrete sidewalks', terrain.drapeTriangles(walks, 0.028),
    new THREE.MeshStandardMaterial({ color: 0x9ca9ae, map: maps.concrete, roughness: 1 }), 3.5);
  addRoadMesh(world, 'Asphalt streets', terrain.drapeTriangles(roads, 0.045),
    new THREE.MeshStandardMaterial({
      color: 0xa8b6bc, map: maps.asphalt, roughness: 1,
      emissive: 0x8ea7b9, emissiveMap: maps.asphalt, emissiveIntensity: 0.38,
    }), 5);

  const y = sampleGameY(junction.x, junction.z);
  const point = (dx, dz) => ({ x: junction.x + dx, z: junction.z + dz, y });
  const brick = [];
  clippedRibbon(brick, point(-7, 0.24), point(7, -0.24), 4.1, 0.06, solid, stats);
  clippedRibbon(brick, point(0, -4.05), point(-0.06, -8.3), 4.1, 0.06, solid, stats);
  addRoadMesh(world, 'Brick at East Montgomery and Helen Heneghan', terrain.drapeTriangles(brick, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0xffb595, map: maps.brick, roughness: 0.9,
      emissive: 0xd88d73, emissiveMap: maps.brick, emissiveIntensity: 0.34,
    }), 2.5);

  const paint = [];
  for (const offset of [-11, 11]) {
    for (let stripe = -3; stripe <= 3; stripe++) {
      clippedRibbon(paint, point(offset - 1.25, stripe * 0.92), point(offset + 1.25, stripe * 0.92), 0.24, 0.07, solid, stats);
    }
  }
  for (let stripe = -3; stripe <= 3; stripe++) {
    clippedRibbon(paint, point(stripe * 0.92, -10), point(stripe * 0.92, -12.5), 0.24, 0.07, solid, stats);
  }
  addRoadMesh(world, 'Junction crosswalk paint', terrain.drapeTriangles(paint, 0.07),
    new THREE.MeshStandardMaterial({ color: 0xf6e4b8, roughness: 0.82 }), 1);

  const centerPaint = [];
  for (const offset of [-48, -38, -28, -18, 18, 28, 38, 48]) {
    const roadZ = -offset * 0.023;
    clippedRibbon(centerPaint, point(offset - 2.6, roadZ), point(offset + 2.6, roadZ), 0.072, 0.07, solid, stats);
  }
  addRoadMesh(world, 'East Montgomery lane paint', terrain.drapeTriangles(centerPaint, 0.07),
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
  return stats;
}
