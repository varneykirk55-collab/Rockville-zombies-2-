import * as THREE from 'three';
import { DOWNTOWN } from './config.js';
import { lonLatToWorld, nextFrame } from './utils.js';
import { townSquareRole, townSquareWallHex } from './town-square/district.js';
import { dressTownSquare } from './town-square/build.js';

const warm = [0xb46951, 0xd6b77e, 0xb88d70];
const cool = [0x8b9ebe, 0x6eaaa7, 0x9aa7a4];
const focus = lonLatToWorld(DOWNTOWN.longitude, DOWNTOWN.latitude);
const glassColors = [0x24414d, 0x294b59, 0x365f6a, 0x496e76, 0x806449];
const white = new THREE.Color(0xffffff);
const roofTint = new THREE.Color(0xa4a8a5);
const RIDGE_M = 2;

function variation(id) {
  return (Math.imul(id ^ (id >>> 16), 0x45d9f3b) >>> 0) / 0x100000000;
}

function geometryBatch() {
  return { position: [], normal: [], uv: [], color: [] };
}

function pushVertex(batch, x, y, z, nx, ny, nz, u, v, color) {
  batch.position.push(x, y, z);
  batch.normal.push(nx, ny, nz);
  batch.uv.push(u, v);
  batch.color.push(color.r, color.g, color.b);
}

function worldRing(lonLat) {
  const points = [];
  for (const [longitude, latitude] of lonLat) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    const { x, z } = lonLatToWorld(longitude, latitude);
    const last = points.at(-1);
    if (!last || last.x !== x || last.z !== z) points.push({ x, z });
  }
  if (points.length > 1 && points[0].x === points.at(-1).x && points[0].z === points.at(-1).z) points.pop();
  return points;
}

function polygonsOf(feature) {
  const geometry = feature.geometry;
  const raw = geometry?.type === 'Polygon' ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  return raw.map(rings => ({
    outer: worldRing(rings[0] ?? []),
    holes: rings.slice(1).map(worldRing).filter(ring => ring.length >= 3),
  })).filter(polygon => polygon.outer.length >= 3);
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
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

function solidAt(x, z, polygon) {
  return insideRing(x, z, polygon.outer) && !polygon.holes.some(hole => insideRing(x, z, hole));
}

function seatPolygon(outer, sampleGameY) {
  let minY = Infinity;
  let maxY = -Infinity;
  let sx = 0;
  let sz = 0;
  for (const point of outer) {
    const y = sampleGameY(point.x, point.z);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    sx += point.x;
    sz += point.z;
  }
  const mid = sampleGameY(sx / outer.length, sz / outer.length);
  minY = Math.min(minY, mid);
  maxY = Math.max(maxY, mid);
  return { floorY: maxY, skirtY: minY - 0.2, cx: sx / outer.length, cz: sz / outer.length };
}

function wallColor(id, year, garage) {
  if (garage) return new THREE.Color(0x66716e);
  const palette = year && year < 1940 ? warm : year && year >= 1975 ? cool : warm.concat(cool);
  return new THREE.Color(palette[Math.floor(variation(id * 593) * palette.length)]);
}

function longestAxis(ring) {
  let best = 0;
  let dx = 1;
  let dz = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length > best) {
      best = length;
      dx = (b.x - a.x) / length;
      dz = (b.z - a.z) / length;
    }
  }
  return { dx, dz, px: -dz, pz: dx };
}

function halfWidth(ring, axis, cx, cz) {
  let max = 0.5;
  for (const point of ring) {
    max = Math.max(max, Math.abs((point.x - cx) * axis.px + (point.z - cz) * axis.pz));
  }
  return max;
}

function triangulate(polygon) {
  const contour = polygon.outer.map(point => new THREE.Vector2(point.x, -point.z));
  const holes = polygon.holes.map(ring => ring.map(point => new THREE.Vector2(point.x, -point.z)));
  let faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  if (!faces?.length) {
    contour.reverse();
    faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    polygon.outer.reverse();
  }
  const flat = polygon.outer.concat(...polygon.holes);
  return { faces: faces ?? [], flat };
}

function addRoof(batch, polygon, yOf, color) {
  const { faces, flat } = triangulate(polygon);
  for (const face of faces) {
    const tri = face.map(index => {
      const point = flat[index];
      return { x: point.x, y: yOf(point.x, point.z), z: point.z };
    });
    const abx = tri[1].x - tri[0].x;
    const aby = tri[1].y - tri[0].y;
    const abz = tri[1].z - tri[0].z;
    const acx = tri[2].x - tri[0].x;
    const acy = tri[2].y - tri[0].y;
    const acz = tri[2].z - tri[0].z;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    if (ny < 0) {
      tri.reverse();
      nx = -nx; ny = -ny; nz = -nz;
    }
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    for (const point of tri) {
      pushVertex(batch, point.x, point.y, point.z, nx, ny, nz, point.x / 4, point.z / 4, color);
    }
  }
}

function emitQuad(batch, a, b, c, d, nx, ny, nz, color) {
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  pushVertex(batch, a.x, a.y, a.z, nx, ny, nz, 0, a.y / 6, color);
  pushVertex(batch, b.x, b.y, b.z, nx, ny, nz, length / 6, b.y / 6, color);
  pushVertex(batch, c.x, c.y, c.z, nx, ny, nz, length / 6, c.y / 6, color);
  pushVertex(batch, a.x, a.y, a.z, nx, ny, nz, 0, a.y / 6, color);
  pushVertex(batch, c.x, c.y, c.z, nx, ny, nz, length / 6, c.y / 6, color);
  pushVertex(batch, d.x, d.y, d.z, nx, ny, nz, 0, d.y / 6, color);
}

function buildMesh(group, batch, material, name, castShadow) {
  if (!batch.position.length) return 0;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.color, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  group.add(mesh);
  return batch.position.length / 3;
}

function addWindows(group, windows) {
  if (!windows.length) return;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const glass = new THREE.MeshStandardMaterial({
    color: white, roughness: 0.56, metalness: 0.12, emissive: 0x091921, emissiveIntensity: 0.42,
  });
  const frames = new THREE.InstancedMesh(geometry,
    new THREE.MeshStandardMaterial({ color: 0x373743, roughness: 0.92 }), windows.length);
  const panes = new THREE.InstancedMesh(geometry, glass, windows.length);
  frames.name = 'Window frames';
  panes.name = 'Glass';
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  windows.forEach((item, index) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.y = item.angle;
    dummy.scale.set(item.width + 0.18, item.height + 0.18, 0.12);
    dummy.updateMatrix();
    frames.setMatrixAt(index, dummy.matrix);
    dummy.position.x += Math.sin(item.angle) * 0.04;
    dummy.position.z += Math.cos(item.angle) * 0.04;
    dummy.scale.set(item.width, item.height, 0.05);
    dummy.updateMatrix();
    panes.setMatrixAt(index, dummy.matrix);
    panes.setColorAt(index, color.setHex(item.color));
  });
  frames.receiveShadow = panes.receiveShadow = true;
  group.add(frames, panes);
}

function facade(windows, a, b, y0, y1, seed, spacing, nx, nz) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const count = Math.floor((length - 0.8) / spacing);
  const rows = Math.min(5, Math.max(1, Math.floor((y1 - y0 - 0.8) / 3.4)));
  if (count < 1 || rows < 1 || y1 - y0 < 2.4) return;
  for (let col = 1; col <= count; col++) {
    const t = col / (count + 1);
    const x = a.x + dx * t + nx * 0.07;
    const z = a.z + dz * t + nz * 0.07;
    for (let row = 0; row < rows; row++) {
      const tint = variation(seed + col * 97 + row * 4021);
      windows.push({
        x, z,
        y: y0 + (row + 0.55) * (y1 - y0) / rows,
        angle: Math.atan2(nx, nz),
        width: Math.min(2.1, (length / (count + 1)) * 0.62),
        height: row === 0 ? 1.85 : 1.45,
        color: glassColors[tint > 0.92 ? 4 : Math.floor(tint * 4)],
      });
    }
  }
}

export async function buildBuildings({
  features, heights, sections, sampleGameY, maps, onProgress, separateIds, group,
}) {
  const wallMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, map: maps.concrete ?? null, roughness: 0.95,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, map: maps.roof ?? null, roughness: 1,
  });
  const near = { walls: geometryBatch(), roofs: geometryBatch() };
  const far = { walls: geometryBatch(), roofs: geometryBatch() };
  const backdrop = { walls: geometryBatch(), roofs: geometryBatch() };
  const collisionPolygons = [];
  const windows = [];
  const edges = [];
  const floors = new Map();
  const separateGroups = new Map();
  let rendered = 0;
  let skipped = 0;
  let minHeight = Infinity;
  let maxHeight = 0;
  let sharedMetres = 0;

  function targetFor(point, role) {
    if (role === 'backdrop') return backdrop;
    const distance = Math.hypot(point.x - focus.x, point.z - focus.z);
    return distance < 235 ? near : far;
  }

  function rememberEdge(polygon, a, b, skirtY, topOf, record) {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.2) return;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    let nx = (b.z - a.z) / length;
    let nz = -(b.x - a.x) / length;
    if (solidAt(mx + nx * 0.35, mz + nz * 0.35, polygon)) {
      nx = -nx;
      nz = -nz;
    }
    edges.push({
      a, b, skirtY, topOf, nx, nz, length, townSquare: Boolean(record.townSquare), ...record,
    });
  }

  function addMass(polygon, spec) {
    const seat = spec.seat ?? seatPolygon(polygon.outer, sampleGameY);
    const roofOf = spec.roofOf
      ?? ((x, z) => seat.floorY + spec.height + (spec.ridge ? spec.ridge(x, z) : 0));
    const batch = spec.batch ?? targetFor(polygon.outer[0], spec.role);
    addRoof(batch.roofs, polygon, roofOf, roofTint);
    const skirtY = spec.skirtY ?? seat.skirtY;
    for (const ring of [polygon.outer, ...polygon.holes]) {
      for (let i = 0; i < ring.length; i++) {
        rememberEdge(polygon, ring[i], ring[(i + 1) % ring.length], skirtY, roofOf, spec);
      }
    }
    if (spec.collide) {
      collisionPolygons.push({
        outer: polygon.outer, holes: polygon.holes, footprintId: spec.id,
      });
    }
    return seat;
  }

  for (let index = 0; index < features.length; index++) {
    const feature = features[index];
    const id = Number(feature.properties?.OBJECTID ?? feature.id);
    const role = feature.properties?.role;
    const record = heights.buildings[String(id)];
    const polygons = polygonsOf(feature);
    if (!polygons.length || (role === 'playable' && !record)) {
      skipped++;
      continue;
    }
    const separate = separateIds?.has(id);
    let batch = null;
    if (separate) {
      const group = new THREE.Group();
      group.name = `Landmark placeholder ${id}`;
      separateGroups.set(id, { group, walls: geometryBatch(), roofs: geometryBatch() });
      batch = separateGroups.get(id);
    }
    const height = role === 'backdrop' ? 7 : record.heightM;
    const ridgeM = role === 'backdrop' ? 0 : (record.ridgeM || 0);
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
    const townHex = townSquareWallHex(id);
    const color = townHex == null ? wallColor(id, record?.year, record?.garage) : new THREE.Color(townHex);
    const town = townSquareRole(id);
    const replaced = Boolean(record?.replacedBySections);
    for (const polygon of polygons) {
      const seat = seatPolygon(polygon.outer, sampleGameY);
      floors.set(id, seat);
      if (replaced) continue;
      const axis = longestAxis(polygon.outer);
      const half = halfWidth(polygon.outer, axis, seat.cx, seat.cz);
      const ridge = ridgeM > 0 ? (x, z) => {
        const distance = Math.abs((x - seat.cx) * axis.px + (z - seat.cz) * axis.pz);
        return ridgeM * (1 - Math.min(1, distance / half));
      } : null;
      addMass(polygon, {
        id, height, ridge, color, role, batch, seat,
        windows: !town && role === 'playable' && !record?.garage && height >= 4 && Math.abs(ringArea(polygon.outer)) > 80,
        spacing: 5.6,
        seed: id,
        collide: true,
        townSquare: Boolean(town),
      });
    }
    rendered++;
    if ((index + 1) % 50 === 0) {
      onProgress?.(index + 1, features.length);
      await nextFrame();
    }
  }

  for (const feature of sections?.features ?? []) {
    const props = feature.properties ?? {};
    const parent = floors.get(props.parentId);
    const polygons = polygonsOf(feature);
    const record = heights.buildings[String(props.parentId)];
    const color = wallColor(props.parentId || 1, record?.year, false);
    for (const polygon of polygons) {
      if (props.replacesParent) {
        addMass(polygon, {
          id: props.parentId, height: props.heightM, color, role: 'playable',
          collide: true, windows: true, spacing: 4, seed: props.parentId + 17,
        });
      } else if (parent) {
        const base = parent.floorY + (props.baseHeightM ?? 0) + 0.05;
        const top = parent.floorY + props.heightM;
        addMass(polygon, {
          id: props.parentId, height: props.heightM, color, role: 'playable',
          skirtY: base, roofOf: () => top, upper: true, collide: false,
          windows: top - base > 3, spacing: 4, seed: props.parentId + 29,
        });
      }
    }
  }

  const townEdges = [];
  const occupied = new Map();
  for (const edge of edges) {
    if (edge.upper) continue;
    const steps = Math.max(1, Math.ceil(edge.length / 1.4));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = edge.a.x + (edge.b.x - edge.a.x) * t;
      const z = edge.a.z + (edge.b.z - edge.a.z) * t;
      const key = `${Math.round(x)},${Math.round(z)}`;
      if (!occupied.has(key)) occupied.set(key, []);
      occupied.get(key).push(edge);
    }
  }

  for (const edge of edges) {
    const steps = Math.max(1, Math.ceil(edge.length / 1.4));
    let shared = 0;
    let neighborTop = -Infinity;
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = edge.a.x + (edge.b.x - edge.a.x) * t;
      const z = edge.a.z + (edge.b.z - edge.a.z) * t;
      const key = `${Math.round(x)},${Math.round(z)}`;
      const others = (occupied.get(key) ?? []).filter(other => other !== edge && other.id !== edge.id);
      const hit = others.some(other => {
        const distance = pointSegmentDistance(x, z, other.a, other.b);
        if (distance < 0.55) {
          neighborTop = Math.max(neighborTop, other.topOf(other.a.x, other.a.z));
          return true;
        }
        return false;
      });
      if (hit) shared++;
    }
    const topA = edge.topOf(edge.a.x, edge.a.z);
    const topB = edge.topOf(edge.b.x, edge.b.z);
    let y0 = edge.skirtY;
    const sharedFraction = shared / (steps + 1);
    if (sharedFraction > 0.6 && Number.isFinite(neighborTop)) {
      const hiddenTo = Math.min(Math.max(topA, topB), neighborTop);
      if (hiddenTo > y0) {
        sharedMetres += edge.length * Math.min(1, (hiddenTo - y0) / Math.max(0.5, ((topA + topB) / 2 - y0)));
        y0 = hiddenTo;
      }
    }
    if (Math.max(topA, topB) - y0 < 0.35) continue;
    if (edge.townSquare) {
      townEdges.push({
        id: edge.id,
        a: edge.a,
        b: edge.b,
        nx: edge.nx,
        nz: edge.nz,
        y0,
        topA,
        topB,
        skirtY: edge.skirtY,
        length: edge.length,
      });
      continue;
    }
    const batch = edge.batch ?? targetFor(edge.a, edge.role);
    emitQuad(batch.walls,
      { x: edge.a.x, y: y0, z: edge.a.z },
      { x: edge.b.x, y: y0, z: edge.b.z },
      { x: edge.b.x, y: topB, z: edge.b.z },
      { x: edge.a.x, y: topA, z: edge.a.z },
      edge.nx, 0, edge.nz, edge.color);
    if (edge.windows && topA - y0 > 2.4) {
      facade(windows, edge.a, edge.b, y0, Math.min(topA, topB), edge.seed, edge.spacing, edge.nx, edge.nz);
    }
  }

  let triangles = 0;
  triangles += buildMesh(group, near.walls, wallMaterial, 'Walls near', true) / 3;
  triangles += buildMesh(group, near.roofs, roofMaterial, 'Roofs near', true) / 3;
  triangles += buildMesh(group, far.walls, wallMaterial, 'Walls far', false) / 3;
  triangles += buildMesh(group, far.roofs, roofMaterial, 'Roofs far', false) / 3;
  triangles += buildMesh(group, backdrop.walls, wallMaterial, 'Backdrop walls', false) / 3;
  triangles += buildMesh(group, backdrop.roofs, roofMaterial, 'Backdrop roofs', false) / 3;
  for (const { group: landmarkGroup, walls, roofs } of separateGroups.values()) {
    buildMesh(landmarkGroup, walls, wallMaterial, 'Landmark walls', true);
    buildMesh(landmarkGroup, roofs, roofMaterial, 'Landmark roofs', true);
    group.add(landmarkGroup);
  }
  addWindows(group, windows);
  const townSquare = dressTownSquare(group, townEdges);
  onProgress?.(features.length, features.length);

  return {
    rendered, skipped, collisionPolygons, separateGroups, windows: windows.length,
    sharedMetres: Math.round(sharedMetres), minHeight, maxHeight, triangles: Math.round(triangles),
    townSquare,
  };
}

function pointSegmentDistance(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1e-8) return Math.hypot(x - a.x, z - a.z);
  const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

