import * as THREE from 'three';
import { PLAZA, townSquareRole } from './district.js';

const white = new THREE.Color(0xffffff);
let texturesReady = 0;

function loadMap(file) {
  const map = new THREE.TextureLoader().load(
    new URL(`../../public/town-square/${file}`, import.meta.url).href,
    () => { texturesReady += 1; },
    undefined,
    () => { texturesReady += 1; },
  );
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return map;
}

const brickMap = loadMap('brick_wall_001.webp');
const plasterMap = loadMap('clay_plaster.webp');

export function townSquareTexturesReady() {
  return texturesReady >= 2;
}

const TINT = {
  red: 0xffffff,
  brown: 0xc9a090,
  cream: 0xf4ecdf,
  stone: 0xb7b1a6,
  trim: 0xe7dcc8,
  dark: 0x2c2826,
  gable: 0x4a453f,
  clock: 0xf3efe4,
  hand: 0x1a1a1a,
};

const AWNING = {
  'brick-street': 0x6e2430,
  'brick-cream': 0x1e4034,
  'clock-block': 0x242424,
  'low-retail': 0x6e2430,
  gallery: 0x242424,
  library: 0x1e4034,
  liner: 0x242424,
  hotel: 0x1e4034,
  'garage-front': 0x6e2430,
  'glass-tower': 0x1c2428,
  midrise: 0x1e4034,
};

function batch() {
  return { position: [], normal: [], uv: [], color: [] };
}

function pushVertex(target, x, y, z, nx, ny, nz, u, v, color) {
  target.position.push(x, y, z);
  target.normal.push(nx, ny, nz);
  target.uv.push(u, v);
  target.color.push(color.r, color.g, color.b);
}

function pointOn(edge, t, y, out) {
  const length = edge.length || 1;
  const dx = (edge.b.x - edge.a.x) / length;
  const dz = (edge.b.z - edge.a.z) / length;
  return {
    x: edge.a.x + dx * t + edge.nx * out,
    y,
    z: edge.a.z + dz * t + edge.nz * out,
  };
}

function wallQuad(target, edge, t0, t1, y0, y1, out, color, tile = 2.5) {
  const tint = new THREE.Color(color);
  const a = pointOn(edge, t0, y0, out);
  const b = pointOn(edge, t1, y0, out);
  const c = pointOn(edge, t1, y1, out);
  const d = pointOn(edge, t0, y1, out);
  const u0 = t0 / tile;
  const u1 = t1 / tile;
  const v0 = y0 / tile;
  const v1 = y1 / tile;
  const { nx, nz } = edge;
  pushVertex(target, a.x, a.y, a.z, nx, 0, nz, u0, v0, tint);
  pushVertex(target, b.x, b.y, b.z, nx, 0, nz, u1, v0, tint);
  pushVertex(target, c.x, c.y, c.z, nx, 0, nz, u1, v1, tint);
  pushVertex(target, a.x, a.y, a.z, nx, 0, nz, u0, v0, tint);
  pushVertex(target, c.x, c.y, c.z, nx, 0, nz, u1, v1, tint);
  pushVertex(target, d.x, d.y, d.z, nx, 0, nz, u0, v1, tint);
}

function triangle(target, p, q, r, color) {
  const tint = new THREE.Color(color);
  const abx = q.x - p.x;
  const aby = q.y - p.y;
  const abz = q.z - p.z;
  const acx = r.x - p.x;
  const acy = r.y - p.y;
  const acz = r.z - p.z;
  let nx = aby * acz - abz * acy;
  let ny = abz * acx - abx * acz;
  let nz = abx * acy - aby * acx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length; ny /= length; nz /= length;
  for (const item of [p, q, r]) {
    pushVertex(target, item.x, item.y, item.z, nx, ny, nz, item.x / 3, item.y / 3, tint);
  }
}

function segmentDistance(x, z, edge) {
  const dx = edge.b.x - edge.a.x;
  const dz = edge.b.z - edge.a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1e-6) return Math.hypot(x - edge.a.x, z - edge.a.z);
  const t = Math.min(1, Math.max(0, ((x - edge.a.x) * dx + (z - edge.a.z) * dz) / lengthSq));
  return Math.hypot(x - (edge.a.x + dx * t), z - (edge.a.z + dz * t));
}

function clearance(edge, edges) {
  const probe = pointOn(edge, edge.length * 0.5, 0, 2.4);
  let best = 80;
  for (const other of edges) {
    if (other === edge || other.id === edge.id) continue;
    best = Math.min(best, segmentDistance(probe.x, probe.z, other));
  }
  return best;
}

function facesPlaza(edge) {
  const mid = pointOn(edge, edge.length * 0.5, 0, 0);
  const dx = PLAZA.x - mid.x;
  const dz = PLAZA.z - mid.z;
  const length = Math.hypot(dx, dz) || 1;
  return (edge.nx * dx + edge.nz * dz) / length;
}

function pushBox(list, edge, t, y, out, sx, sy, sz, color) {
  const p = pointOn(edge, t, y, out);
  list.push({
    x: p.x, y: p.y, z: p.z,
    angle: Math.atan2(edge.nx, edge.nz),
    sx, sy, sz, color,
  });
}

function shellMaterial(role) {
  if (role === 'library') return 'masonry';
  if (role === 'garage' || role === 'garage-front' || role === 'podium') return 'masonry';
  if (role === 'glass-tower') return 'masonry';
  return 'brick';
}

function shellTint(role) {
  if (role === 'brick-cream' || role === 'hotel' || role === 'midrise') return TINT.brown;
  if (role === 'library') return TINT.cream;
  if (role === 'garage' || role === 'garage-front' || role === 'podium' || role === 'glass-tower') return TINT.stone;
  return TINT.red;
}

function reachesGround(edge) {
  return edge.y0 - edge.skirtY < 1.35;
}

function disk(target, edge, t, y, radius, out, color, segments = 20) {
  const center = pointOn(edge, t, y, out);
  const length = edge.length || 1;
  const dx = (edge.b.x - edge.a.x) / length;
  const dz = (edge.b.z - edge.a.z) / length;
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0 = {
      x: center.x + dx * Math.cos(a0) * radius,
      y: center.y + Math.sin(a0) * radius,
      z: center.z + dz * Math.cos(a0) * radius,
    };
    const p1 = {
      x: center.x + dx * Math.cos(a1) * radius,
      y: center.y + Math.sin(a1) * radius,
      z: center.z + dz * Math.cos(a1) * radius,
    };
    triangle(target, center, p0, p1, color);
  }
}

function archFan(target, edge, t, y, radius, out, color) {
  const center = pointOn(edge, t, y, out);
  const length = edge.length || 1;
  const dx = (edge.b.x - edge.a.x) / length;
  const dz = (edge.b.z - edge.a.z) / length;
  const steps = 7;
  for (let i = 0; i < steps; i += 1) {
    const a0 = Math.PI * i / steps;
    const a1 = Math.PI * (i + 1) / steps;
    const p0 = {
      x: center.x + dx * Math.cos(a0) * radius,
      y: center.y + Math.sin(a0) * radius,
      z: center.z + dz * Math.cos(a0) * radius,
    };
    const p1 = {
      x: center.x + dx * Math.cos(a1) * radius,
      y: center.y + Math.sin(a1) * radius,
      z: center.z + dz * Math.cos(a1) * radius,
    };
    triangle(target, center, p1, p0, color);
  }
}

function clockHand(accent, edge, t, y, out, length, clockwise, width) {
  const center = pointOn(edge, t, y, out);
  const span = edge.length || 1;
  const tx = (edge.b.x - edge.a.x) / span;
  const tz = (edge.b.z - edge.a.z) / span;
  const dx = tx * Math.sin(clockwise);
  const dy = Math.cos(clockwise);
  const dz = tz * Math.sin(clockwise);
  const sx = tx * Math.cos(clockwise);
  const sy = -Math.sin(clockwise);
  const sz = tz * Math.cos(clockwise);
  const side = width / 2;
  const a = {
    x: center.x + sx * side, y: center.y + sy * side, z: center.z + sz * side,
  };
  const b = {
    x: center.x - sx * side, y: center.y - sy * side, z: center.z - sz * side,
  };
  const c = {
    x: center.x + dx * length - sx * side * 0.35,
    y: center.y + dy * length - sy * side * 0.35,
    z: center.z + dz * length - sz * side * 0.35,
  };
  const d = {
    x: center.x + dx * length + sx * side * 0.35,
    y: center.y + dy * length + sy * side * 0.35,
    z: center.z + dz * length + sz * side * 0.35,
  };
  triangle(accent, a, d, c, TINT.hand);
  triangle(accent, a, c, b, TINT.hand);
}

function gable(accent, edge, t, width, baseY, rise) {
  const half = width / 2;
  const left = pointOn(edge, t - half, baseY, 0.12);
  const right = pointOn(edge, t + half, baseY, 0.12);
  const peak = pointOn(edge, t, baseY + rise, 0.12);
  const back = pointOn(edge, t, baseY + 0.15, -2.4);
  triangle(accent, left, right, peak, 0x8d4338);
  triangle(accent, left, peak, back, TINT.gable);
  triangle(accent, right, back, peak, TINT.gable);
  triangle(accent, left, back, right, TINT.gable);
}

function clockTower(brick, accent, edge, open) {
  if (!open || edge.length < 8) return false;
  const width = Math.min(7.2, edge.length - 1.4);
  const northAtStart = edge.a.z <= edge.b.z;
  const t0 = northAtStart ? 0.7 : edge.length - 0.7 - width;
  const t1 = t0 + width;
  const mid = (t0 + t1) / 2;
  const eave = Math.max(edge.topA, edge.topB) + 11.2;
  const base = edge.y0;
  wallQuad(brick, edge, t0, t1, base, eave, 0.16, TINT.red);
  wallQuad(brick, edge, t0, t0 + 0.28, base, eave, 0.34, TINT.trim);
  wallQuad(brick, edge, t1 - 0.28, t1, base, eave, 0.34, TINT.trim);
  const faceY = eave - 4.6;
  disk(accent, edge, mid, faceY, 1.72, 0.2, TINT.dark);
  disk(accent, edge, mid, faceY, 1.42, 0.28, TINT.clock);
  // 10:07, the same reading as the approved clock-tower model.
  const minute = (7 / 60) * Math.PI * 2;
  const hour = ((10 + 7 / 60) / 12) * Math.PI * 2;
  clockHand(accent, edge, mid, faceY, 0.48, 1.05, minute, 0.12);
  clockHand(accent, edge, mid, faceY, 0.48, 0.7, hour, 0.14);
  const peak = pointOn(edge, mid, eave + 6.4, -1.6);
  const frontL = pointOn(edge, t0, eave, 0.2);
  const frontR = pointOn(edge, t1, eave, 0.2);
  const backL = pointOn(edge, t0, eave, -3.2);
  const backR = pointOn(edge, t1, eave, -3.2);
  triangle(accent, frontL, frontR, peak, TINT.gable);
  triangle(accent, backR, backL, peak, TINT.gable);
  triangle(accent, frontR, backR, peak, TINT.gable);
  triangle(accent, backL, frontL, peak, TINT.gable);
  return true;
}

function cornerTowers(masonry, accent, edge) {
  const width = Math.min(3.3, edge.length * 0.18);
  if (width < 1.6) return;
  const top = Math.max(edge.topA, edge.topB);
  for (const t0 of [0.35, edge.length - 0.35 - width]) {
    const t1 = t0 + width;
    wallQuad(masonry, edge, t0, t1, edge.y0, top + 3.6, 0.28, TINT.cream);
    const mid = (t0 + t1) / 2;
    const peak = pointOn(edge, mid, top + 5.1, -0.4);
    triangle(accent,
      pointOn(edge, t0, top + 3.6, 0.32),
      pointOn(edge, t1, top + 3.6, 0.32),
      peak, TINT.gable);
  }
}

function finishMesh(group, target, material, name, cast) {
  if (!target.position.length) return 0;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(target.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(target.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(target.color, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  group.add(mesh);
  return target.position.length / 9;
}

function finishInstances(group, items, material, name) {
  if (!items.length) return 0;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, items.length);
  mesh.name = name;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  items.forEach((item, index) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(0, item.angle, 0);
    dummy.scale.set(item.sx, item.sy, item.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, color.setHex(item.color));
  });
  mesh.receiveShadow = true;
  group.add(mesh);
  return items.length * 12;
}

export function dressTownSquare(group, edges) {
  const brick = batch();
  const masonry = batch();
  const accent = batch();
  const glass = [];
  const metal = [];
  const awnings = [];
  const slabs = [];
  const stats = {
    edges: 0, storefronts: 0, windows: 0, balconies: 0, awnings: 0, gables: 0, clocks: 0,
  };
  const longest = new Map();
  for (const edge of edges) {
    const current = longest.get(edge.id);
    if (!current || edge.length > current.length) longest.set(edge.id, edge);
  }
  let clockEdge = null;
  let clockScore = 0;
  for (const edge of edges) {
    if (townSquareRole(edge.id) !== 'clock-block') continue;
    const score = facesPlaza(edge) * edge.length;
    if (score > clockScore && clearance(edge, edges) > 3 && edge.length > 8) {
      clockScore = score;
      clockEdge = edge;
    }
  }
  const clockSpan = clockEdge ? { t0: 0, t1: 0 } : null;
  if (clockEdge) {
    const width = Math.min(7.2, clockEdge.length - 1.4);
    const northAtStart = clockEdge.a.z <= clockEdge.b.z;
    clockSpan.t0 = northAtStart ? 0.7 : clockEdge.length - 0.7 - width;
    clockSpan.t1 = clockSpan.t0 + width;
  }

  for (const edge of edges) {
    const role = townSquareRole(edge.id);
    if (!role || edge.length < 1.1) continue;
    const top = Math.min(edge.topA, edge.topB);
    const height = top - edge.y0;
    if (height < 1.3) continue;
    stats.edges += 1;
    const open = clearance(edge, edges);
    const plaza = facesPlaza(edge);
    const ground = reachesGround(edge);
    const material = shellMaterial(role);
    const target = material === 'brick' ? brick : masonry;
    const tint = shellTint(role);
    const out = 0.05;
    const awningColor = AWNING[role] ?? 0x242424;
    const curtainEdge = role === 'library' && longest.get(edge.id) === edge;
    const glassEdge = role === 'glass-tower' || role === 'hotel' || curtainEdge;

    if (!glassEdge) wallQuad(target, edge, 0, edge.length, edge.y0, top, out, tint);

    const retail = ground && height > 4.2 && edge.length > 5
      && role !== 'garage' && role !== 'podium' && role !== 'hotel'
      && !(role === 'garage-front' && plaza < 0.35)
      && role !== 'glass-tower';
    let storyBase = edge.y0;
    if (retail && (role !== 'library' || plaza > 0.2)) {
      const bays = Math.max(1, Math.round((edge.length - 0.6) / 3.7));
      const bay = edge.length / bays;
      for (let i = 0; i < bays; i += 1) {
        const t0 = i * bay + 0.28;
        const t1 = (i + 1) * bay - 0.28;
        const mid = (t0 + t1) / 2;
        const head = Math.min(edge.y0 + 3.45, top - 0.8);
        if (head - edge.y0 < 2.2) continue;
        pushBox(glass, edge, mid, edge.y0 + (head - edge.y0) * 0.5, 0.12, t1 - t0, head - edge.y0 - 0.2, 0.05, 0x3d6e78);
        pushBox(metal, edge, mid, edge.y0 + (head - edge.y0) * 0.5, 0.09, t1 - t0 + 0.16, head - edge.y0, 0.06, TINT.dark);
        pushBox(slabs, edge, mid, head + 0.16, 0.1, (t1 - t0) * 0.72, 0.28, 0.06, TINT.trim);
        if (open > 1.5 && head + 0.4 < top) {
          pushBox(awnings, edge, mid, head - 0.05, 0.62, Math.max(0.8, t1 - t0), 0.07, 1.15, awningColor);
          stats.awnings += 1;
        }
        stats.storefronts += 1;
      }
      storyBase = Math.min(edge.y0 + 4.05, top - 1.2);
    }

    if (curtainEdge) {
      wallQuad(masonry, edge, 0, edge.length, edge.y0, edge.y0 + 0.9, 0.06, TINT.cream);
      wallQuad(masonry, edge, 0, edge.length, top - 0.7, top, 0.06, TINT.cream);
      const cols = Math.max(1, Math.round(edge.length / 2.4));
      const col = edge.length / cols;
      for (let i = 0; i < cols; i += 1) {
        pushBox(glass, edge, col * (i + 0.5), (edge.y0 + 0.9 + top - 0.7) / 2, 0.1,
          col * 0.82, top - edge.y0 - 1.8, 0.05, 0x245060);
        pushBox(metal, edge, col * (i + 0.5), (edge.y0 + 0.9 + top - 0.7) / 2, 0.08,
          0.08, top - edge.y0 - 1.6, 0.05, TINT.dark);
      }
      cornerTowers(masonry, accent, edge);
    } else if (role === 'glass-tower' || role === 'hotel') {
      const floors = Math.max(1, Math.round(height / 3.3));
      const floorH = height / floors;
      const cols = Math.max(1, Math.round(edge.length / (role === 'hotel' ? 3.4 : 2.3)));
      const col = edge.length / cols;
      const pier = role === 'hotel' ? 0.42 : 0.08;
      for (let row = 0; row < floors; row += 1) {
        const y0 = edge.y0 + row * floorH;
        const band = row === 0 && ground && edge.length > 10 ? 3.6 : 0.55;
        if (row === 0 && ground && edge.length > 10) {
          pushBox(glass, edge, edge.length / 2, y0 + 1.7, 0.12, edge.length * 0.86, 3.1, 0.05, 0x163038);
          pushBox(metal, edge, edge.length / 2, y0 + 1.7, 0.09, edge.length * 0.9, 3.25, 0.05, TINT.dark);
          stats.storefronts += 1;
        }
        pushBox(slabs, edge, edge.length / 2, y0 + floorH - 0.18, 0.12, edge.length, 0.28, 0.22,
          role === 'hotel' ? TINT.brown : TINT.stone);
        for (let colIndex = 0; colIndex < cols; colIndex += 1) {
          const mid = col * (colIndex + 0.5);
          const glassH = floorH - band - 0.35;
          if (glassH < 0.8) continue;
          if (!(row === 0 && ground && edge.length > 10)) {
            pushBox(glass, edge, mid, y0 + band * 0.15 + glassH / 2, 0.11, Math.max(0.4, col - pier), glassH, 0.05,
              role === 'hotel' ? 0x1d3a44 : 0x8eb4c4);
            if (pier > 0.2) {
              pushBox(metal, edge, mid, y0 + floorH * 0.5, 0.1, pier, floorH * 0.92, 0.08, TINT.brown);
            }
          }
        }
      }
    } else if (role === 'garage' || role === 'podium' || (role === 'garage-front' && !(plaza > 0.35 && ground))) {
      const rows = Math.max(1, Math.floor((height - 1.2) / 2.8));
      for (let row = 0; row < rows; row += 1) {
        const y = edge.y0 + 1.15 + row * ((height - 1.6) / rows);
        const slots = Math.max(1, Math.floor(edge.length / 4.8));
        const step = edge.length / slots;
        for (let i = 0; i < slots; i += 1) {
          pushBox(glass, edge, step * (i + 0.5), y, 0.1, Math.min(3.4, step * 0.72), 0.55, 0.04, 0x1a2428);
          pushBox(metal, edge, step * (i + 0.5), y, 0.08, Math.min(3.6, step * 0.78), 0.68, 0.04, TINT.dark);
          stats.windows += 1;
        }
      }
    } else if (storyBase < top - 1.5 && role !== 'low-retail' && role !== 'kiosk') {
      const upper = top - storyBase - 0.45;
      const floors = Math.max(1, Math.round(upper / (role === 'gallery' ? 3.6 : 3.15)));
      const floorH = upper / floors;
      const windowW = role === 'gallery' ? 1.55 : role === 'library' ? 1.35 : 1.12;
      const windowH = role === 'gallery' ? 2.15 : 1.62;
      const spacing = role === 'gallery' ? 3.5 : 3.15;
      const count = Math.max(1, Math.floor((edge.length - 1.2) / spacing));
      const step = edge.length / (count + 1);
      const arch = (role === 'brick-street' || role === 'brick-cream' || role === 'clock-block');
      const balcony = (role === 'brick-street' || role === 'brick-cream' || role === 'clock-block' || role === 'midrise')
        && edge.length > 12 && open > 2.1;
      for (let col = 1; col <= count; col += 1) {
        const t = step * col;
        if (edge === clockEdge && t > clockSpan.t0 - 0.4 && t < clockSpan.t1 + 0.4) continue;
        for (let row = 0; row < floors; row += 1) {
          const y = storyBase + floorH * (row + 0.42);
          if (y + windowH / 2 > top - 0.25) continue;
          const topFloor = row === floors - 1 && arch && floors > 1;
          const h = topFloor ? windowH + 0.35 : windowH;
          pushBox(glass, edge, t, y, 0.12, windowW, h, 0.045, col === Math.ceil(count / 2) ? 0x4d7a84 : 0x355e6c);
          pushBox(metal, edge, t, y, 0.09, windowW + 0.16, h + 0.16, 0.05, TINT.dark);
          if (topFloor) archFan(accent, edge, t, y + h * 0.42, windowW * 0.48, 0.13, 0x243f49);
          stats.windows += 1;
          if (balcony && row > 0 && row < floors - 1 && col % 2 === 0) {
            pushBox(slabs, edge, t, y - h * 0.55, 0.5, windowW + 0.45, 0.12, 0.9, TINT.stone);
            pushBox(metal, edge, t, y - h * 0.55 + 0.52, 0.9, windowW + 0.4, 0.06, 0.05, TINT.dark);
            pushBox(metal, edge, t - windowW * 0.45, y - h * 0.55 + 0.48, 0.88, 0.06, 0.9, 0.06, TINT.dark);
            pushBox(metal, edge, t + windowW * 0.45, y - h * 0.55 + 0.48, 0.88, 0.06, 0.9, 0.06, TINT.dark);
            stats.balconies += 1;
          }
        }
      }
    }

    if (height > 4) {
      pushBox(slabs, edge, edge.length / 2, top - 0.12, 0.2, edge.length, 0.22, 0.32, TINT.trim);
    }
    if ((role === 'brick-street' || role === 'brick-cream' || role === 'clock-block') && edge.length > 14 && open > 1.2) {
      gable(accent, edge, edge.length * 0.5, Math.min(6.2, edge.length * 0.28), top - 0.05, 2.35);
      stats.gables += 1;
    }
    if (edge === clockEdge && clockTower(brick, accent, edge, true)) stats.clocks += 1;
  }

  const brickMaterial = new THREE.MeshStandardMaterial({
    map: brickMap, vertexColors: true, roughness: 0.92,
  });
  const masonryMaterial = new THREE.MeshStandardMaterial({
    map: plasterMap, vertexColors: true, roughness: 0.96,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.84, side: THREE.DoubleSide,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: white, roughness: 0.22, metalness: 0.18, emissive: 0x0b1c22, emissiveIntensity: 0.4,
  });
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: white, roughness: 0.48, metalness: 0.28,
  });
  const awningMaterial = new THREE.MeshStandardMaterial({
    color: white, roughness: 0.86,
  });
  const slabMaterial = new THREE.MeshStandardMaterial({
    color: white, roughness: 0.9,
  });

  let triangles = 0;
  triangles += finishMesh(group, brick, brickMaterial, 'Town Square brick', true);
  triangles += finishMesh(group, masonry, masonryMaterial, 'Town Square masonry', true);
  triangles += finishMesh(group, accent, accentMaterial, 'Town Square accents', true);
  triangles += finishInstances(group, glass, glassMaterial, 'Town Square glass');
  triangles += finishInstances(group, metal, metalMaterial, 'Town Square frames');
  triangles += finishInstances(group, awnings, awningMaterial, 'Town Square awnings');
  triangles += finishInstances(group, slabs, slabMaterial, 'Town Square trim');
  stats.triangles = Math.round(triangles);
  stats.buildings = new Set(edges.map(edge => edge.id)).size;
  return stats;
}
