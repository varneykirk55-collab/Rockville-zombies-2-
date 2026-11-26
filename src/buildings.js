import * as THREE from 'three';
import { BUILDING_HEIGHT, DOWNTOWN } from './config.js';
import { lonLatToWorld, nextFrame } from './utils.js';

const palette = [0xb46951, 0xd6b77e, 0x6eaaa7, 0x8b9ebe, 0xb88d70];
const focus = lonLatToWorld(DOWNTOWN.longitude, DOWNTOWN.latitude);
const glassColors = [0x24414d, 0x294b59, 0x365f6a, 0x496e76, 0x806449];
const white = new THREE.Color(0xffffff);
const roofColor = new THREE.Color(0xa4a8a5);

function toRing(coordinates) {
  const points = [];
  for (const [longitude, latitude] of coordinates) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) ||
        Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return [];
    const { x, z } = lonLatToWorld(longitude, latitude);
    // Rotating an extrusion by -90° around x turns its (x, -z) plane into (x, z).
    const point = new THREE.Vector2(x, -z);
    if (!points.length || !point.equals(points.at(-1))) points.push(point);
  }
  if (points.length > 1 && points[0].equals(points.at(-1))) points.pop();
  return points.length >= 3 && Math.abs(THREE.ShapeUtils.area(points)) > 0.001
    ? points : [];
}

function toPolygon([outer, ...inner]) {
  const contour = toRing(outer ?? []);
  if (!contour.length) return null;
  if (!THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const holes = inner.map(toRing).filter(ring => ring.length);
  for (const hole of holes) {
    if (THREE.ShapeUtils.isClockWise(hole)) hole.reverse();
  }
  return {
    contour,
    holes,
    area: Math.abs(THREE.ShapeUtils.area(contour)) -
      holes.reduce((total, hole) => total + Math.abs(THREE.ShapeUtils.area(hole)), 0),
  };
}

function convex(ring) {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const c = ring[(i + 2) % ring.length];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0.001) return false;
  }
  return true;
}

function variation(id) {
  // Stable across reloads and changes in tile arrival order.
  return (Math.imul(id ^ (id >>> 16), 0x45d9f3b) >>> 0) / 0x100000000;
}

function massHeight(area, seed) {
  const lowRise = 5 + 29 * (1 - Math.exp(-Math.max(0, area - 85) / 1200));
  return THREE.MathUtils.clamp(lowRise + (seed - 0.22) * 9, BUILDING_HEIGHT.min, BUILDING_HEIGHT.max);
}

function geometryBatch() {
  return { position: [], normal: [], uv: [], color: [] };
}

function appendMass(batch, polygon, depth, elevation, color) {
  const shape = new THREE.Shape(polygon.contour);
  shape.holes = polygon.holes.map(ring => new THREE.Path(ring));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i) + elevation;
    const z = positions.getZ(i);
    const nx = normals.getX(i);
    const ny = normals.getY(i);
    const nz = normals.getZ(i);
    if (ny < -0.5) continue; // The map is grounded, so the underside is never visible.
    const top = ny > 0.5;
    const target = top ? batch.roofs : batch.walls;
    const tint = top ? roofColor : color;
    target.position.push(x, y, z);
    target.normal.push(nx, ny, nz);
    target.uv.push(top ? x / 4 : (x * nz - z * nx) / 6,
      top ? z / 4 : y / 6);
    target.color.push(tint.r, tint.g, tint.b);
  }
  geometry.dispose();
}

function addFacade(windows, ring, height, elevation, seed) {
  const rows = Math.max(1, Math.floor((height - 0.7) / 3.25));
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = a.y - b.y;
    const length = Math.hypot(dx, dz);
    const count = Math.floor((length - 0.7) / 3.25);
    if (count < 1) continue;
    const spacing = length / (count + 1);
    for (let col = 1; col <= count; col++) {
      for (let row = 0; row < rows; row++) {
        const offset = col * spacing / length;
        const tint = variation(seed + i * 97 + row * 4021 + col * 1213);
        windows.push({
          x: a.x + dx * offset + dz / length * 0.046,
          z: -a.y + dz * offset - dx / length * 0.046,
          y: elevation + (row + 0.57) * height / rows,
          angle: -Math.atan2(dz, dx),
          width: Math.min(2.28, spacing * 0.68),
          height: 1.55 + (row === 0 ? 0.38 : 0),
          color: glassColors[tint > 0.91 ? 4 : Math.floor(tint * 4)],
        });
      }
    }
  }
}

function addWindows(group, windows) {
  if (!windows.length) return;
  // Tinted opaque glass reads clearly under sun and shadow with no transparency pass.
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const glass = new THREE.MeshStandardMaterial({
    color: white, roughness: 0.56, metalness: 0.12, emissive: 0x091921, emissiveIntensity: 0.42,
  });
  const frames = new THREE.InstancedMesh(geometry,
    new THREE.MeshStandardMaterial({ color: 0x373743, roughness: 0.92 }), windows.length);
  const panes = new THREE.InstancedMesh(geometry, glass, windows.length);
  frames.name = 'Downtown window frames';
  panes.name = 'Downtown glass';
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  windows.forEach((window, i) => {
    const { x, y, z, width, height, angle } = window;
    dummy.position.set(x, y, z);
    dummy.rotation.y = angle;
    dummy.scale.set(width + 0.20, height + 0.20, 0.14);
    dummy.updateMatrix();
    frames.setMatrixAt(i, dummy.matrix);
    dummy.position.x -= Math.sin(angle) * 0.056;
    dummy.position.z -= Math.cos(angle) * 0.056;
    dummy.scale.set(width, height, 0.052);
    dummy.updateMatrix();
    panes.setMatrixAt(i, dummy.matrix);
    panes.setColorAt(i, color.setHex(window.color));
  });
  frames.receiveShadow = panes.receiveShadow = true;
  group.add(frames, panes);
}

function meshBatch(group, data, material, name, downtown) {
  if (!data.position.length) return;
  const geometry = new THREE.BufferGeometry();
  for (const [key, values] of Object.entries(data)) {
    geometry.setAttribute(key, new THREE.Float32BufferAttribute(values, key === 'uv' ? 2 : 3));
  }
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = downtown;
  mesh.receiveShadow = true;
  group.add(mesh);
}

export async function buildBuildings(features, group, onProgress, maps = {}) {
  const wallMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, map: maps.concrete ?? null, roughness: 0.95,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, map: maps.roof ?? null, roughness: 1,
  });
  const chunks = new Map();
  const collisionPolygons = [];
  const windows = [];
  let rendered = 0;
  let skipped = 0;
  let minHeight = Infinity;
  let maxHeight = 0;
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const { geometry, properties } = feature;
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
    const valid = polygons.map(toPolygon).filter(Boolean);
    const rawId = Number(properties?.OBJECTID ?? feature.id);
    const id = Number.isSafeInteger(rawId) ? rawId : i + 1;
    const seed = variation(id);
    const color = new THREE.Color(palette[Math.floor(variation(id * 593) * palette.length)]);
    for (const polygon of valid) {
      const first = polygon.contour[0];
      const distance = Math.hypot(first.x - focus.x, -first.y - focus.z);
      const key = `${Math.floor(first.x / 96)},${Math.floor(-first.y / 96)}`;
      if (!chunks.has(key)) {
        chunks.set(key, { walls: geometryBatch(), roofs: geometryBatch(), downtown: false });
      }
      const batch = chunks.get(key);
      batch.downtown ||= distance < 235;
      const height = massHeight(polygon.area, seed);
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
      const detailed = distance < 152;
      const setback = height > 17 && seed > 0.24 && !polygon.holes.length && convex(polygon.contour);
      const baseHeight = setback ? height * (0.63 + seed * 0.12) : height;

      appendMass(batch, polygon, baseHeight, 0, color);
      if (detailed) addFacade(windows, polygon.contour, baseHeight, 0, id);
      if (setback) {
        const center = polygon.contour.reduce((sum, point) => sum.add(point), new THREE.Vector2())
          .multiplyScalar(1 / polygon.contour.length);
        const upper = {
          contour: polygon.contour.map(point => center.clone().lerp(point, 0.73)),
          holes: [],
        };
        appendMass(batch, upper, height - baseHeight, baseHeight, color.clone().multiplyScalar(1.12));
        if (detailed) addFacade(windows, upper.contour, height - baseHeight, baseHeight, id + 11);
      }

      // The physics outline follows the original ground footprint, including courtyard holes.
      const toWorld = (ring) => ring.map(point => ({ x: point.x, z: -point.y }));
      collisionPolygons.push({
        outer: toWorld(polygon.contour), holes: polygon.holes.map(toWorld), footprintId: id,
      });
    }
    if (valid.length) rendered++;
    else skipped++;
    if ((i + 1) % 40 === 0 || i + 1 === features.length) {
      onProgress(i + 1, features.length);
      await nextFrame();
    }
  }

  for (const [key, batch] of chunks) {
    meshBatch(group, batch.walls, wallMaterial, `Walls (${key})`, batch.downtown);
    meshBatch(group, batch.roofs, roofMaterial, `Roofs (${key})`, batch.downtown);
  }
  addWindows(group, windows);
  return { rendered, skipped, collisionPolygons, minHeight, maxHeight };
}
