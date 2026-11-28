import * as THREE from 'three';
import { DOWNTOWN, METRO_SPAN } from './config.js';
import { addFrontages } from './environment/frontages.js';
import { lonLatToWorld, nextFrame } from './utils.js';

const warm = [0xb48167, 0xcfb797, 0xb98f76, 0xd2bca5];
const cool = [0xb8b8ad, 0xa4aeb0, 0xadaba0, 0xc2b59d];
const focus = lonLatToWorld(DOWNTOWN.longitude, DOWNTOWN.latitude);
const glassColors = [0x35545f, 0x516b74, 0x45616b, 0x5c767d, 0x796851];
const white = new THREE.Color(0xffffff);
const roofTint = new THREE.Color(0xb1aba0);
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
  const samples = outer.slice();
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % outer.length];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / 8));
    for (let step = 1; step < steps; step++) {
      const t = step / steps;
      samples.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  let minY = Infinity;
  let maxY = -Infinity;
  let sx = 0;
  let sz = 0;
  for (const point of samples) {
    const y = sampleGameY(point.x, point.z);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    sx += point.x;
    sz += point.z;
  }
  const cx = sx / samples.length;
  const cz = sz / samples.length;
  const mid = sampleGameY(cx, cz);
  minY = Math.min(minY, mid);
  maxY = Math.max(maxY, mid);
  return { floorY: maxY, skirtY: minY - 0.15, cx, cz };
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

function addRoof(batch, polygon, yOf, color, upward = true) {
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
    if ((ny >= 0) !== upward) {
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
  // Keep courses continuous across eight-metre mesh subdivisions.
  const phase = (a.x * (b.x-a.x) + a.z * (b.z-a.z)) / length;
  const u0 = phase / 1.9, u1 = (phase + length) / 1.9;
  const facing = (a.z - b.z) * nx + (b.x - a.x) * nz;
  const put = (point, u) =>
    pushVertex(batch, point.x, point.y, point.z, nx, ny, nz, u, point.y / 1.9, color);
  put(a, u0);
  if (facing >= 0) {
    put(b, u1);
    put(c, u1);
    put(a, u0);
    put(c, u1);
    put(d, u0);
  } else {
    put(c, u1);
    put(b, u1);
    put(a, u0);
    put(d, u0);
    put(c, u1);
  }
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

function windowMaterials() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const reflection = ctx.createLinearGradient(4, 0, 72, 98);
  reflection.addColorStop(0, '#a1bdd1');
  reflection.addColorStop(0.43, '#758b93');
  reflection.addColorStop(0.58, '#535c5f');
  reflection.addColorStop(1, '#637076');
  ctx.fillStyle = reflection;
  ctx.fillRect(0, 0, 96, 96);
  ctx.fillStyle = 'rgba(213, 226, 232, 0.20)';
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(30, 0);
  ctx.lineTo(82, 96);
  ctx.lineTo(65, 96);
  ctx.fill();
  ctx.fillStyle = '#40454a';
  ctx.fillRect(46, 0, 3, 96);
  ctx.fillRect(0, 32, 96, 3);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return {
    geometry: new THREE.PlaneGeometry(1, 1),
    frame: new THREE.MeshStandardMaterial({ color: 0x54504a, roughness: 0.61, metalness: 0.23 }),
    glass: new THREE.MeshStandardMaterial({
      color: white, map, roughness: 0.4, metalness: 0.10, emissive: 0x344450, emissiveIntensity: 0.3,
    }),
  };
}

function addWindows(group, windows, materials) {
  if (!windows.length) return;
  const frames = new THREE.InstancedMesh(materials.geometry, materials.frame, windows.length);
  const panes = new THREE.InstancedMesh(materials.geometry, materials.glass, windows.length);
  frames.name = 'Window frames';
  panes.name = 'Glass';
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  windows.forEach((item, index) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.y = item.angle;
    dummy.scale.set(item.width + 0.1, item.height + 0.1, 0.08);
    dummy.updateMatrix();
    frames.setMatrixAt(index, dummy.matrix);
    dummy.position.x += Math.sin(item.angle) * 0.012;
    dummy.position.z += Math.cos(item.angle) * 0.012;
    dummy.scale.set(item.width, item.height, 0.035);
    dummy.updateMatrix();
    panes.setMatrixAt(index, dummy.matrix);
    panes.setColorAt(index, color.setHex(item.color));
  });
  frames.receiveShadow = panes.receiveShadow = true;
  group.add(frames, panes);
}

function facade(windows, a, b, baseA, baseB, topA, topB, seed, spacing, nx, nz, sampleGameY, audit, detailed) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const count = Math.floor((length - 0.8) / spacing);
  if (count < 1 || length < 1.2) return;
  const bay = length / (count + 1);
  const width = Math.min(detailed ? 2.4 : 1.75, bay * (detailed ? 0.69 : 0.55));
  for (let col = 1; col <= count; col++) {
    const t = col / (count + 1);
    // Sit the opening in the wall face. A few centimetres of proud glass reads
    // as a frame; the old 11 cm offset left panes floating off party walls.
    const x = a.x + dx * t + nx * 0.025;
    const z = a.z + dz * t + nz * 0.025;
    const ground = sampleGameY(x - nx * 0.025, z - nz * 0.025);
    const base = baseA + (baseB - baseA) * t;
    const top = topA + (topB - topA) * t;
    const sill = Math.max(base + 0.16, ground + 0.45);
    const head = top - 0.2;
    if (head - sill < 1.35) continue;
    const rows = Math.min(detailed ? 20 : 7, Math.max(1, Math.floor((head - sill) / 3.19)));
    for (let row = 0; row < rows; row++) {
      const bandBottom = sill + row * (head - sill) / rows;
      const bandTop = sill + (row + 1) * (head - sill) / rows;
      const height = Math.min(detailed ? 1.95 : 1.48, (bandTop - bandBottom) * 0.68);
      const y = (bandBottom + bandTop) / 2;
      if (y - height / 2 < ground + 0.2 || y + height / 2 > head + 0.02) {
        audit.rejected += 1;
        continue;
      }
      const tint = variation(seed + col * 97 + row * 4021);
      windows.push({
        x, z, y,
        angle: Math.atan2(nx, nz),
        width, height,
        color: glassColors[tint > 0.92 ? 4 : Math.floor(tint * 4)],
      });
      audit.placed += 1;
      if (y - height / 2 < ground + 0.15) audit.buried += 1;
    }
  }
}

export async function buildBuildings({
  features, heights, sections, sampleGameY, maps, onProgress, separateIds, group,
}) {
  const wallMaterial = new THREE.MeshStandardMaterial({
    ...maps.masonry, vertexColors: true,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    ...maps.roof, vertexColors: true,
  });
  const districts = new Map();
  const windowTiles = new Map();
  const glazing = windowMaterials();
  const collisionPolygons = [];
  const windows = [];
  const windowAudit = { placed: 0, buried: 0, rejected: 0 };
  const edges = [];
  const flashing = [];
  const mounting = new Map();
  const floors = new Map();
  const separateGroups = new Map();
  let rendered = 0;
  let skipped = 0;
  let minHeight = Infinity;
  let maxHeight = 0;
  let sharedMetres = 0;

  function targetFor(point, role) {
    const layer = role === 'backdrop' ? 'backdrop' : Math.hypot(point.x - focus.x, point.z - focus.z) < 235 ? 'near' : 'far';
    const key = layer + ':' + Math.floor(point.x / 224) + ':' + Math.floor(point.z / 224);
    if (!districts.has(key)) districts.set(key, { walls: geometryBatch(), roofs: geometryBatch(), layer });
    return districts.get(key);
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
      a, b, skirtY, topOf, nx, nz, length, ...record,
    });
  }

  function addMass(polygon, spec) {
    const seat = spec.seat ?? seatPolygon(polygon.outer, sampleGameY);
    const roofOf = spec.roofOf
      ?? ((x, z) => seat.floorY + spec.height + (spec.ridge ? spec.ridge(x, z) : 0));
    const batch = spec.batch ?? targetFor(polygon.outer[0], spec.role);
    addRoof(batch.roofs, polygon, roofOf, roofTint);
    const skirtY = spec.skirtY ?? seat.skirtY;
    if (spec.overhead) addRoof(batch.roofs, polygon, () => skirtY, roofTint, false);
    for (const ring of [polygon.outer, ...polygon.holes]) {
      for (let i = 0; i < ring.length; i++) {
        rememberEdge(polygon, ring[i], ring[(i + 1) % ring.length], skirtY, roofOf, spec);
      }
    }
    if (spec.collide || spec.overhead) {
      collisionPolygons.push({
        outer: polygon.outer, holes: polygon.holes, footprintId: spec.id,
        ...(spec.overhead && { minY: skirtY, maxY: roofOf(seat.cx, seat.cz), source: 'elevated-span' }),
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
      const entry = { group, walls: geometryBatch(), roofs: geometryBatch(), windows: [] };
      separateGroups.set(id, entry);
      batch = entry;
    }
    const height = role === 'backdrop' ? 7 : record.heightM;
    const ridgeM = role === 'backdrop' ? 0 : (record.ridgeM || 0);
    minHeight = Math.min(minHeight, height);
    maxHeight = Math.max(maxHeight, height);
    const color = wallColor(id, record?.year, record?.garage);
    const replaced = Boolean(record?.replacedBySections);
    for (const polygon of polygons) {
      const seat = seatPolygon(polygon.outer, sampleGameY);
      floors.set(id, seat);
      if (replaced) continue;
      if (id === METRO_SPAN.footprintId) {
        const underside = Math.max(...polygon.outer.map(v => sampleGameY(v.x, v.z))) + METRO_SPAN.clearance;
        addMass(polygon, {
          id, color, role, batch, seat, overhead: true, upper: true,
          skirtY: underside, roofOf: () => underside + METRO_SPAN.thickness,
        });
        continue;
      }
      const axis = longestAxis(polygon.outer);
      const half = halfWidth(polygon.outer, axis, seat.cx, seat.cz);
      const ridge = ridgeM > 0 ? (x, z) => {
        const distance = Math.abs((x - seat.cx) * axis.px + (z - seat.cz) * axis.pz);
        return ridgeM * (1 - Math.min(1, distance / half));
      } : null;
      addMass(polygon, {
        id, height, ridge, color, role, batch, seat, address: record?.address,
        windowList: batch?.windows ?? null,
        windows: role === 'playable' && !record?.garage && height >= 4 && Math.abs(ringArea(polygon.outer)) > 80,
        spacing: 5.6,
        seed: id,
        collide: true,
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
        // Overlap the parent roof by 8 cm so the upper mass is not a floating slab.
        const base = parent.floorY + (props.baseHeightM ?? 0) - 0.08;
        const top = parent.floorY + props.heightM;
        addMass(polygon, {
          id: props.parentId, height: props.heightM, color, role: 'playable',
          skirtY: base, roofOf: () => top, upper: true, collide: false,
          windows: top - base > 3, spacing: 4, seed: props.parentId + 29,
        });
      }
    }
  }

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
    const raised = edge.overhead ? edge.skirtY : sharedFraction > 0.6 && Number.isFinite(neighborTop) ? y0 : null;
    const segments = Math.max(1, Math.ceil(edge.length / 8));
    for (let segment = 0; segment < segments; segment++) {
      const t0 = segment / segments;
      const t1 = (segment + 1) / segments;
      const ax = edge.a.x + (edge.b.x - edge.a.x) * t0;
      const az = edge.a.z + (edge.b.z - edge.a.z) * t0;
      const bx = edge.a.x + (edge.b.x - edge.a.x) * t1;
      const bz = edge.a.z + (edge.b.z - edge.a.z) * t1;
      const segTopA = edge.topOf(ax, az);
      const segTopB = edge.topOf(bx, bz);
      let baseA = sampleGameY(ax, az) - 0.12;
      let baseB = sampleGameY(bx, bz) - 0.12;
      if (raised !== null) {
        baseA = Math.max(baseA, raised);
        baseB = Math.max(baseB, raised);
      }
      if (Math.max(segTopA, segTopB) - Math.min(baseA, baseB) < 0.35) continue;
      const batch = edge.batch ?? targetFor(edge.a, edge.role);
      emitQuad(batch.walls,
        { x: ax, y: baseA, z: az },
        { x: bx, y: baseB, z: bz },
        { x: bx, y: segTopB, z: bz },
        { x: ax, y: segTopA, z: az },
        edge.nx, 0, edge.nz, edge.color);
      const detailed = batch.layer === 'near';
      if (!edge.batch && !edge.upper && edge.windows) {
        if (!mounting.has(edge)) mounting.set(edge, []);
        mounting.get(edge).push({ start: t0 * edge.length, end: t1 * edge.length,
          bottom: Math.max(baseA, baseB), top: Math.min(segTopA, segTopB) });
      }
      if (detailed && !edge.batch && !edge.upper && !edge.ridge &&
          Math.abs(segTopA-segTopB) < 0.02 && Math.min(segTopA-baseA,segTopB-baseB) > 3) {
        flashing.push({ ...edge, a:{x:ax,z:az}, b:{x:bx,z:bz}, length:edge.length/segments, top:segTopA });
      }
      if (edge.windows && Math.min(segTopA, segTopB) - Math.max(baseA, baseB) > 2.2) {
        const list = edge.windowList ?? windows;
        facade(list, { x: ax, z: az }, { x: bx, z: bz }, baseA, baseB, segTopA, segTopB,
          edge.seed + segment, detailed ? Math.min(edge.spacing, 3.35) : edge.spacing,
          edge.nx, edge.nz, sampleGameY, windowAudit, detailed);
      }
    }
  }

  let triangles = 0;
  for (const { walls, roofs, layer } of districts.values()) {
    triangles += buildMesh(group, walls, wallMaterial, 'Walls ' + layer, layer === 'near') / 3;
    triangles += buildMesh(group, roofs, roofMaterial, 'Roofs ' + layer, layer === 'near') / 3;
  }
  for (const { group: landmarkGroup, walls, roofs, windows: landmarkWindows } of separateGroups.values()) {
    buildMesh(landmarkGroup, walls, wallMaterial, 'Landmark walls', true);
    buildMesh(landmarkGroup, roofs, roofMaterial, 'Landmark roofs', true);
    addWindows(landmarkGroup, landmarkWindows ?? [], glazing);
    group.add(landmarkGroup);
  }
  for (const window of windows) {
    const key = Math.floor(window.x / 144) + ':' + Math.floor(window.z / 144);
    if (!windowTiles.has(key)) windowTiles.set(key, []);
    windowTiles.get(key).push(window);
  }
  for (const tile of windowTiles.values()) addWindows(group, tile, glazing);
  const frontages = addFrontages(group, edges, flashing, mounting, sampleGameY);
  onProgress?.(features.length, features.length);

  return {
    rendered, skipped, collisionPolygons, separateGroups, windows: windowAudit.placed,
    windowAudit, frontages, sharedMetres: Math.round(sharedMetres), minHeight, maxHeight, triangles: Math.round(triangles),
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

