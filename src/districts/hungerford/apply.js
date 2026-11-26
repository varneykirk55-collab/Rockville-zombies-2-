import * as THREE from 'three';
import { ROAD_CENTERLINES } from '../../config.js';
import { lonLatToWorld } from '../../utils.js';

const SKIN = 0.04;
const FRAME = 0.07;
const PANE = 0.1;
const WHITE = [1, 1, 1];

function batch() {
  return { position: [], normal: [], uv: [], color: [] };
}

function pushTriangle(target, a, b, c, color) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  let nx = aby * acz - abz * acy;
  let ny = abz * acx - abx * acz;
  let nz = abx * acy - aby * acx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length;
  ny /= length;
  nz /= length;
  for (const point of [a, b, c]) {
    target.position.push(point.x, point.y, point.z);
    target.normal.push(nx, ny, nz);
    target.uv.push(point.u ?? 0, point.v ?? 0);
    target.color.push(color[0], color[1], color[2]);
  }
}

function quad(target, corners, color, outward) {
  const abx = corners[1].x - corners[0].x;
  const aby = corners[1].y - corners[0].y;
  const abz = corners[1].z - corners[0].z;
  const acx = corners[2].x - corners[0].x;
  const acy = corners[2].y - corners[0].y;
  const acz = corners[2].z - corners[0].z;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const flip = outward && nx * outward[0] + ny * outward[1] + nz * outward[2] < 0;
  const order = flip ? [0, 3, 2, 1] : [0, 1, 2, 3];
  pushTriangle(target, corners[order[0]], corners[order[1]], corners[order[2]], color);
  pushTriangle(target, corners[order[0]], corners[order[2]], corners[order[3]], color);
}

function pointOn(edge, t, y, proud, u, v) {
  return {
    x: edge.ax + (edge.bx - edge.ax) * t + edge.nx * proud,
    y,
    z: edge.az + (edge.bz - edge.az) * t + edge.nz * proud,
    u,
    v,
  };
}

function wallFace(target, edge, t0, t1, y0, y1, proud, color) {
  if (y1 - y0 < 0.08 || t1 - t0 < 0.002) return;
  const span = edge.length * (t1 - t0);
  quad(target, [
    pointOn(edge, t0, y0, proud, 0, y0 / 2.15),
    pointOn(edge, t1, y0, proud, span / 2.15, y0 / 2.15),
    pointOn(edge, t1, y1, proud, span / 2.15, y1 / 2.15),
    pointOn(edge, t0, y1, proud, 0, y1 / 2.15),
  ], color, [edge.nx, 0, edge.nz]);
}

function runsTowardViewerRight(edge) {
  const rightX = edge.nz;
  const rightZ = -edge.nx;
  return (edge.bx - edge.ax) * rightX + (edge.bz - edge.az) * rightZ > 0;
}

function buildRoads() {
  const roads = [];
  for (const [half, coordinates] of ROAD_CENTERLINES) {
    const points = coordinates.map(([longitude, latitude]) => lonLatToWorld(longitude, latitude));
    for (let index = 1; index < points.length; index += 1) {
      roads.push({
        ax: points[index - 1].x,
        az: points[index - 1].z,
        bx: points[index].x,
        bz: points[index].z,
        half,
      });
    }
  }
  return roads;
}

function closestRoad(x, z, roads) {
  let best = null;
  for (const road of roads) {
    const dx = road.bx - road.ax;
    const dz = road.bz - road.az;
    const lengthSq = dx * dx + dz * dz || 1e-8;
    const t = Math.min(1, Math.max(0, ((x - road.ax) * dx + (z - road.az) * dz) / lengthSq));
    const px = road.ax + dx * t;
    const pz = road.az + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (!best || dist < best.dist) best = { dist, x: px, z: pz, half: road.half };
  }
  return best;
}

function insideRing(x, z, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function hitsBuilding(x, z, polygons) {
  return polygons.some((polygon) => insideRing(x, z, polygon.outer)
    && !polygon.holes.some((hole) => insideRing(x, z, hole)));
}

function roadScore(edge, roads) {
  const x = (edge.ax + edge.bx) / 2;
  const z = (edge.az + edge.bz) / 2;
  const hit = closestRoad(x, z, roads);
  if (!hit || hit.dist > 75) return 0;
  const dx = hit.x - x;
  const dz = hit.z - z;
  const length = Math.hypot(dx, dz) || 1;
  const dot = (dx / length) * edge.nx + (dz / length) * edge.nz;
  if (dot < 0.18) return 0;
  return (dot / (hit.dist + 3)) * Math.min(edge.length, 28);
}

function markFronts(edges, spec, roads) {
  const weighted = edges.map((edge) => {
    let score = roadScore(edge, roads);
    if (spec.front === 'short') score *= 7 / Math.max(edge.length, 2.4);
    if (spec.front === 'long') score *= Math.sqrt(Math.min(edge.length, 70)) / 3;
    return { edge, score };
  });
  const best = Math.max(0, ...weighted.map((item) => item.score));
  if (best <= 0) {
    const pool = [...edges].sort((a, b) => (
      spec.front === 'short' ? a.length - b.length : b.length - a.length
    ));
    if (pool[0]) pool[0].front = true;
    return;
  }
  for (const item of weighted) item.edge.front = item.score > best * 0.58;
}

function clearDepth(edge, wanted, roads, polygons) {
  let depth = 0.35;
  for (let step = 0.7; step <= wanted + 0.01; step += 0.35) {
    const x = (edge.ax + edge.bx) / 2 + edge.nx * step;
    const z = (edge.az + edge.bz) / 2 + edge.nz * step;
    if (hitsBuilding(x, z, polygons)) break;
    const road = closestRoad(x, z, roads);
    if (road && road.dist < road.half + 0.7) break;
    depth = step;
  }
  return Math.min(depth, wanted);
}

function baysOf(edge, target) {
  const count = Math.max(1, Math.round(edge.length / target));
  const width = edge.length / count;
  const inset = Math.min(0.32, width * 0.14);
  const bays = [];
  for (let index = 0; index < count; index += 1) {
    bays.push({
      index,
      count,
      t0: (index * width + inset) / edge.length,
      t1: ((index + 1) * width - inset) / edge.length,
    });
  }
  return bays;
}

function addOpening(glass, metal, edge, t0, t1, y0, y1, glassColor, frameColor) {
  const padT = Math.min(0.012, (t1 - t0) * 0.18);
  wallFace(metal, edge, t0 - padT, t1 + padT, y0 - 0.06, y1 + 0.06, FRAME, frameColor);
  wallFace(glass, edge, t0, t1, y0, y1, PANE, glassColor);
}

function addCanopy(metal, edge, t0, t1, y, depth, color) {
  if (depth < 0.4 || t1 <= t0) return;
  const slab = 0.1;
  const outer = [edge.nx, 0, edge.nz];
  const top = [
    pointOn(edge, t0, y + slab, 0.03, 0, 0),
    pointOn(edge, t1, y + slab, 0.03, 1, 0),
    pointOn(edge, t1, y + slab, depth, 1, 1),
    pointOn(edge, t0, y + slab, depth, 0, 1),
  ];
  const bottom = top.map((point) => ({ ...point, y: point.y - slab }));
  quad(metal, top, color, [0, 1, 0]);
  quad(metal, [bottom[0], bottom[3], bottom[2], bottom[1]], color, [0, -1, 0]);
  quad(metal, [top[3], top[2], bottom[2], bottom[3]], color, outer);
  quad(metal, [top[0], bottom[0], bottom[3], top[3]], color, [-edge.nz, 0, edge.nx]);
  quad(metal, [top[1], top[0], bottom[0], bottom[1]], color, [edge.nz, 0, -edge.nx]);
}

function addAwning(metal, edge, t0, t1, y, depth, color) {
  if (depth < 0.35) return;
  const drop = Math.min(0.38, depth * 0.4);
  quad(metal, [
    pointOn(edge, t0, y, 0.05, 0, 1),
    pointOn(edge, t1, y, 0.05, 1, 1),
    pointOn(edge, t1, y - drop, depth, 1, 0),
    pointOn(edge, t0, y - drop, depth, 0, 0),
  ], color, [edge.nx, 0.35, edge.nz]);
}

function addBox(metal, x, y, z, sx, sy, sz, color) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const faces = [
    [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]],
    [[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]],
    [[0, -1, 0], [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]]],
    [[0, 1, 0], [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]]],
    [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
    [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
  ];
  for (const [normal, corners] of faces) {
    quad(metal, corners.map(([cx, cy, cz]) => ({
      x: x + cx, y: y + cy, z: z + cz, u: 0, v: 0,
    })), color, normal);
  }
}

function addBalcony(metal, edge, t0, t1, y, depth, color) {
  addCanopy(metal, edge, t0, t1, y, depth, color);
  const railY = y + 0.96;
  wallFace(metal, edge, t0, t1, railY, railY + 0.08, depth, color);
  wallFace(metal, edge, t0, t0 + 0.02, y, railY + 0.08, depth * 0.5, color);
  wallFace(metal, edge, t1 - 0.02, t1, y, railY + 0.08, depth * 0.5, color);
}

function storefrontBands(edge) {
  const height = edge.top - edge.y0;
  if (height < 2.05) return null;
  const sign = Math.min(0.82, height * 0.24);
  const parapet = Math.min(0.45, height * 0.14);
  let glass0 = edge.y0 + Math.min(0.48, height * 0.16);
  let glass1 = edge.top - parapet - sign - 0.05;
  if (glass1 - glass0 < 1.15) {
    glass0 = edge.y0 + 0.2;
    glass1 = edge.top - sign - 0.06;
  }
  if (glass1 - glass0 < 0.9 || glass1 > edge.top - 0.2) return null;
  return {
    glass0,
    glass1,
    sign0: Math.min(edge.top - 0.12, glass1 + 0.06),
    sign1: Math.min(edge.top - 0.05, glass1 + 0.06 + sign),
  };
}

function dressStorefront(edge, spec, parts, signJobs, roads, polygons) {
  const bands = storefrontBands(edge);
  if (!bands) return;
  const bays = baysOf(edge, spec.bay || 4.2);
  const frame = spec.metal;
  bays.forEach((bay) => {
    const door = bay.index === Math.floor((bay.count - 1) / 2);
    const color = door ? [0.1, 0.12, 0.13] : spec.glass;
    const top = door ? Math.min(bands.glass1, edge.y0 + 2.35) : bands.glass1;
    addOpening(parts.glass, parts.metal, edge, bay.t0, bay.t1, bands.glass0, top, color, frame);
    if (spec.canopy === 'fabric') {
      const depth = clearDepth(edge, 1.05, roads, polygons);
      addAwning(parts.metal, edge, bay.t0, bay.t1, bands.glass1, depth, spec.canopyColor);
    }
  });
  if (spec.canopy === 'metal') {
    const depth = clearDepth(edge, spec.canopyDepth || 1.15, roads, polygons);
    addCanopy(parts.metal, edge, 0.04, 0.96, bands.glass1, depth, spec.canopyColor);
  }
  if (spec.canopy === 'entry') {
    const depth = clearDepth(edge, spec.canopyDepth || 1.4, roads, polygons);
    const half = Math.min(1.7, edge.length * 0.28) / edge.length;
    addCanopy(parts.metal, edge, 0.5 - half, 0.5 + half, bands.glass1, depth, spec.canopyColor);
  }
  if (edge.longestFront && spec.sign && bands.sign1 - bands.sign0 > 0.35) {
    signJobs.push(signPlacement(edge, spec.sign, spec.signBg, spec.signFg, spec.signScale, bands));
  }
  addParapet(parts.metal, edge, spec.metal);
}

function signPlacement(edge, text, bg, fg, scale, bands) {
  let t0 = 0.16;
  let t1 = 0.84;
  let y0 = bands.sign0;
  let y1 = bands.sign1;
  if (scale === 'plaque') {
    const half = Math.min(2.4, edge.length * 0.22) / edge.length;
    t0 = 0.5 - half;
    t1 = 0.5 + half;
    y1 = Math.min(y1, y0 + 0.7);
  } else if (scale === 'billboard') {
    const half = Math.min(8, edge.length * 0.42) / edge.length;
    t0 = 0.5 - half;
    t1 = 0.5 + half;
    y0 = Math.max(edge.y0 + 3.2, edge.top - 2.4);
    y1 = Math.min(edge.top - 0.35, y0 + 1.35);
  }
  return { edge, text, bg, fg, t0, t1, y0, y1 };
}

function addParapet(metal, edge, color) {
  const y1 = edge.top - 0.02;
  const y0 = y1 - 0.16;
  if (y0 <= edge.y0 + 1) return;
  wallFace(metal, edge, 0.02, 0.98, y0, y1, 0.14, color);
}

function dressGrocery(edges, spec, parts, signJobs, roads, polygons) {
  const front = edges.filter((edge) => edge.front).sort((a, b) => b.length - a.length)[0] || edges[0];
  if (!front) return;
  const base = front.y0 + 0.2;
  const head = Math.min(front.y0 + 4.6, front.top - 1.7);
  const half = Math.min(7, front.length * 0.36) / front.length;
  addOpening(parts.glass, parts.metal, front, 0.5 - half, 0.5 + half, base, head, spec.glass, spec.metal);
  const depth = clearDepth(front, spec.canopyDepth || 2, roads, polygons);
  addCanopy(parts.metal, front, 0.5 - half - 0.02, 0.5 + half + 0.02, head, depth, spec.canopyColor);
  if (spec.sign) {
    signJobs.push(signPlacement(front, spec.sign, spec.signBg, spec.signFg, 'billboard', {
      sign0: head + 0.25,
      sign1: Math.min(front.top - 0.4, head + 1.7),
    }));
  }
  addParapet(parts.metal, front, spec.metal);
  const back = edges.filter((edge) => edge !== front).sort((a, b) => b.length - a.length)[0];
  if (back && back.length > 6) {
    const t0 = 0.5 - Math.min(0.7, back.length * 0.08) / back.length;
    addOpening(parts.glass, parts.metal, back, t0, t0 + 1.2 / back.length, back.y0 + 0.15, back.y0 + 2.3,
      [0.12, 0.13, 0.13], spec.metal);
  }
}

function dressRibbon(edge, spec, parts, floors) {
  const height = edge.top - edge.y0;
  const count = floors || Math.max(2, Math.round(height / 3.55));
  const floor = height / count;
  const bays = baysOf(edge, spec.bay || 3.8);
  for (let level = 0; level < count; level += 1) {
    const y0 = edge.y0 + level * floor + floor * (level === 0 && edge.front ? 0.08 : 0.22);
    const y1 = edge.y0 + (level + 1) * floor - floor * 0.16;
    if (y1 - y0 < 0.7 || y1 > edge.top - 0.08) continue;
    for (const bay of bays) {
      addOpening(parts.glass, parts.metal, edge, bay.t0, bay.t1, y0, y1, spec.glass, spec.metal);
    }
  }
  if (edge.front && spec.canopy === 'entry') {
    const half = Math.min(2.2, edge.length * 0.16) / edge.length;
    addCanopy(parts.metal, edge, 0.5 - half, 0.5 + half, edge.y0 + Math.min(3.6, floor * 0.9),
      Math.min(spec.canopyDepth || 1.4, 1.8), spec.canopyColor);
  }
}

function dressPunched(edge, spec, parts, floors, groundShop) {
  const height = edge.top - edge.y0;
  const count = floors || Math.max(2, Math.round(height / 3.5));
  const floor = height / count;
  const bays = baysOf(edge, spec.bay || 3.6);
  for (let level = 0; level < count; level += 1) {
    const shop = groundShop && edge.front && level === 0;
    const y0 = shop ? edge.y0 + 0.35 : edge.y0 + level * floor + floor * 0.28;
    const y1 = shop ? edge.y0 + Math.min(floor * 0.78, 3.5) : edge.y0 + level * floor + floor * 0.78;
    if (y1 - y0 < 0.7 || y1 > edge.top - 0.1) continue;
    for (const bay of bays) {
      const narrow = shop ? bay : {
        t0: bay.t0 + (bay.t1 - bay.t0) * 0.18,
        t1: bay.t1 - (bay.t1 - bay.t0) * 0.18,
      };
      addOpening(parts.glass, parts.metal, edge, narrow.t0, narrow.t1, y0, y1, spec.glass, spec.metal);
    }
  }
  if (edge.front && spec.canopy === 'entry') {
    const half = Math.min(2, edge.length * 0.18) / edge.length;
    addCanopy(parts.metal, edge, 0.5 - half, 0.5 + half, edge.y0 + Math.min(3.4, floor * 0.8),
      spec.canopyDepth || 1.4, spec.canopyColor);
  }
}

function dressApartment(edge, spec, parts, polygons) {
  const height = edge.top - edge.y0;
  const count = spec.floors || Math.max(3, Math.round(height / 3.15));
  const floor = height / count;
  const bays = baysOf(edge, spec.bay || 3.5);
  const longFace = edge.length > 10;
  for (let level = 0; level < count; level += 1) {
    const y0 = edge.y0 + level * floor + floor * 0.27;
    const y1 = edge.y0 + level * floor + floor * 0.78;
    for (const bay of bays) {
      const narrow = {
        t0: bay.t0 + (bay.t1 - bay.t0) * 0.22,
        t1: bay.t1 - (bay.t1 - bay.t0) * 0.22,
      };
      addOpening(parts.glass, parts.metal, edge, narrow.t0, narrow.t1, y0, y1, spec.glass, spec.metal);
      if (spec.balcony === 'alternate' && longFace && level > 0 && level < count - 1 && bay.index % 2 === 0) {
        const depth = clearDepth(edge, 1.05, [], polygons);
        if (depth > 0.7) {
          addBalcony(parts.metal, edge, bay.t0, bay.t1, edge.y0 + level * floor + 0.08, depth, spec.metal);
        }
      }
    }
  }
  if (edge.front && spec.canopy === 'entry') {
    const half = Math.min(1.8, edge.length * 0.12) / edge.length;
    addCanopy(parts.metal, edge, 0.5 - half, 0.5 + half, edge.y0 + 2.4, 1.3, spec.canopyColor);
  }
}

function dressTownhouse(edge, spec, parts) {
  const height = edge.top - edge.y0;
  const count = spec.floors || (height >= 9.2 ? 3 : 2);
  const floor = height / count;
  if (edge.front && edge.length < 14) {
    const doorHalf = 0.48 / edge.length;
    addOpening(parts.glass, parts.metal, edge, 0.5 - doorHalf, 0.5 + doorHalf,
      edge.y0 + 0.08, edge.y0 + Math.min(2.2, floor * 0.86), [0.14, 0.11, 0.09], spec.metal);
    if (edge.length > 3.3) {
      addOpening(parts.glass, parts.metal, edge, 0.12, 0.34,
        edge.y0 + floor * 0.32, edge.y0 + floor * 0.78, spec.glass, spec.metal);
    }
    for (let level = 1; level < count; level += 1) {
      addOpening(parts.glass, parts.metal, edge, 0.22, 0.78,
        edge.y0 + level * floor + floor * 0.28,
        edge.y0 + level * floor + floor * 0.76, spec.glass, spec.metal);
    }
    if (spec.canopy === 'entry') {
      addCanopy(parts.metal, edge, 0.18, 0.82, edge.y0 + Math.min(2.25, floor * 0.9),
        spec.canopyDepth || 0.6, spec.canopyColor);
    }
    return;
  }
  if (edge.length < 2.6) return;
  const bays = baysOf(edge, Math.max(edge.length, 3));
  for (let level = 0; level < count; level += 1) {
    for (const bay of bays) {
      addOpening(parts.glass, parts.metal, edge,
        bay.t0 + 0.08, bay.t1 - 0.08,
        edge.y0 + level * floor + floor * 0.3,
        edge.y0 + level * floor + floor * 0.74, spec.glass, spec.metal);
    }
  }
}

function dressGarage(edge, spec, parts) {
  const height = edge.top - edge.y0;
  const count = spec.floors || Math.max(3, Math.round(height / 3.2));
  const floor = height / count;
  const bays = baysOf(edge, spec.bay || 8);
  for (let level = 0; level < count; level += 1) {
    const y0 = edge.y0 + level * floor + floor * 0.4;
    const y1 = edge.y0 + level * floor + floor * 0.86;
    for (const bay of bays) {
      addOpening(parts.glass, parts.metal, edge, bay.t0, bay.t1, y0, y1, spec.glass, spec.metal);
    }
  }
}

function dressBank(edge, spec, parts, signJobs, roads, polygons) {
  const top = edge.top;
  const y0 = edge.y0;
  const bays = baysOf(edge, spec.bay || 5.5);
  bays.forEach((bay) => {
    const door = bay.index === Math.floor((bay.count - 1) / 2) && edge.front;
    if (door) {
      const half = 0.55 / edge.length;
      const mid = (bay.t0 + bay.t1) / 2;
      addOpening(parts.glass, parts.metal, edge, mid - half, mid + half, y0 + 0.1, y0 + 2.4,
        [0.12, 0.14, 0.15], spec.metal);
    } else if (edge.front || edge.length > 8) {
      addOpening(parts.glass, parts.metal, edge,
        bay.t0 + 0.06, bay.t1 - 0.06, y0 + 1.05, Math.min(top - 1.35, y0 + 2.7), spec.glass, spec.metal);
    }
  });
  if (edge.front && spec.canopy === 'entry') {
    const depth = clearDepth(edge, spec.canopyDepth || 1.5, roads, polygons);
    const half = Math.min(1.8, edge.length * 0.2) / edge.length;
    addCanopy(parts.metal, edge, 0.5 - half, 0.5 + half, y0 + 2.45, depth, spec.canopyColor);
  }
  if (edge.longestFront && spec.sign) {
    signJobs.push(signPlacement(edge, spec.sign, spec.signBg, spec.signFg, spec.signScale || 'band', {
      sign0: Math.min(top - 1.15, y0 + 3.15),
      sign1: Math.min(top - 0.28, y0 + 4.05),
    }));
  }
  addParapet(parts.metal, edge, spec.metal);
}

function dressCivic(edge, spec, parts, signJobs) {
  const height = edge.top - edge.y0;
  const rows = height > 6.2 ? 2 : 1;
  const bays = baysOf(edge, spec.bay || 4.2);
  for (let level = 0; level < rows; level += 1) {
    const y0 = edge.y0 + 0.7 + level * (height * 0.42);
    const y1 = y0 + Math.min(1.45, height * 0.28);
    if (y1 > edge.top - 0.35) continue;
    for (const bay of bays) {
      addOpening(parts.glass, parts.metal, edge, bay.t0 + 0.04, bay.t1 - 0.04, y0, y1, spec.glass, spec.metal);
    }
  }
  if (edge.front) {
    const half = 0.55 / edge.length;
    addOpening(parts.glass, parts.metal, edge, 0.5 - half, 0.5 + half, edge.y0 + 0.08, edge.y0 + 2.3,
      [0.12, 0.13, 0.14], spec.metal);
    addCanopy(parts.metal, edge, 0.5 - 1.4 / edge.length, 0.5 + 1.4 / edge.length, edge.y0 + 2.4,
      spec.canopyDepth || 1.5, spec.canopyColor);
  }
  if (edge.longestFront && spec.sign) {
    signJobs.push(signPlacement(edge, spec.sign, spec.signBg, spec.signFg, 'band', {
      sign0: edge.top - 1.35,
      sign1: edge.top - 0.4,
    }));
  }
}

function dressCottage(edge, spec, parts, signJobs) {
  if (!edge.front) {
    if (edge.length > 4) {
      addOpening(parts.glass, parts.metal, edge, 0.35, 0.65, edge.y0 + 1.1,
        Math.min(edge.top - 0.45, edge.y0 + 2.3), spec.glass, spec.metal);
    }
    return;
  }
  const door = 0.46 / edge.length;
  addOpening(parts.glass, parts.metal, edge, 0.5 - door, 0.5 + door, edge.y0 + 0.06,
    Math.min(edge.top - 0.7, edge.y0 + 2.15), [0.16, 0.12, 0.1], spec.metal);
  if (edge.length > 3.2) {
    addOpening(parts.glass, parts.metal, edge, 0.14, 0.36, edge.y0 + 0.95,
      Math.min(edge.top - 0.55, edge.y0 + 2.15), spec.glass, spec.metal);
  }
  if (spec.canopy === 'fabric') {
    addAwning(parts.metal, edge, 0.12, 0.88, Math.min(edge.top - 0.45, edge.y0 + 2.2),
      0.9, spec.canopyColor);
  }
  if (spec.sign) {
    signJobs.push(signPlacement(edge, spec.sign, spec.signBg, spec.signFg, 'plaque', {
      sign0: Math.min(edge.top - 0.7, edge.y0 + 2.35),
      sign1: Math.min(edge.top - 0.12, edge.y0 + 3.0),
    }));
  }
}

function dressGas(edges, spec, parts, signJobs, roads, polygons) {
  const front = edges.filter((edge) => edge.front).sort((a, b) => b.length - a.length)[0];
  if (front) dressStorefront(front, { ...spec, canopy: 'entry' }, parts, signJobs, roads, polygons);
  if (!front || !spec.fuelCanopy) return;
  const depth = clearDepth(front, 9.5, roads, polygons);
  if (depth < 3.2) return;
  const y = Math.min(front.y0 + 4.15, front.top + 0.15);
  const t0 = 0.12;
  const t1 = 0.88;
  addCanopy(parts.metal, front, t0, t1, y, depth, [0.82, 0.8, 0.74]);
  for (const t of [t0, t1]) {
    const foot = pointOn(front, t, front.floorY, depth, 0, 0);
    addBox(parts.metal, foot.x, (front.floorY + y) / 2, foot.z, 0.28, y - front.floorY, 0.28, spec.metal);
  }
  if (spec.sign) {
    signJobs.push({
      edge: front,
      text: spec.sign,
      bg: spec.signBg,
      fg: spec.signFg,
      t0: 0.3,
      t1: 0.7,
      y0: y + 0.12,
      y1: y + 0.62,
      proud: depth,
    });
  }
}

function addRoofUnits(metal, edges, spec) {
  if (!spec.rtu) return;
  const host = edges.slice().sort((a, b) => b.length - a.length)[0];
  if (!host || host.length < 8) return;
  const y = host.top + 0.45;
  for (const t of [0.32, 0.62]) {
    const spot = pointOn(host, t, y, -3.2, 0, 0);
    if (spot.y - host.top > 1.2) return;
    addBox(metal, spot.x, y, spot.z, 2.1, 0.85, 1.35, [0.62, 0.64, 0.63]);
  }
}

function skinBatchFor(spec, parts) {
  if (spec.material === 'brick') return parts.brick;
  if (spec.material === 'concrete') return parts.concrete;
  return parts.stucco;
}

function tintFor(spec) {
  return spec.material === 'brick' ? (spec.tint || WHITE) : (spec.tint || spec.wall);
}

function dressBuilding(edges, spec, parts, signJobs, roads, polygons) {
  const style = edges[0].upper && spec.upperStyle ? spec.upperStyle : spec.style;
  const skin = skinBatchFor(spec, parts);
  const tint = tintFor(spec);
  for (const edge of edges) {
    if (edge.top - edge.y0 < 0.45 || edge.length < 0.8) continue;
    wallFace(skin, edge, 0, 1, edge.y0, edge.top, SKIN, tint);
  }
  const open = edges.filter((edge) => edge.top - edge.y0 > 2 && edge.length > 1.6);
  if (!open.length || style === 'shed') return;
  markFronts(open, spec, roads);
  const longest = open.filter((edge) => edge.front).sort((a, b) => b.length - a.length)[0];
  if (longest) longest.longestFront = true;
  const aboveNeighbor = (edge) => edge.y0 > (edge.floorY ?? edge.y0) + 1.4;
  if (style === 'grocery') {
    dressGrocery(open, spec, parts, signJobs, roads, polygons);
  } else if (style === 'gas') {
    dressGas(open, spec, parts, signJobs, roads, polygons);
  } else if (style === 'garage') {
    for (const edge of open) dressGarage(edge, spec, parts);
    if (longest && spec.sign) {
      signJobs.push(signPlacement(longest, spec.sign, spec.signBg, spec.signFg, 'plaque', {
        sign0: longest.y0 + 2.6,
        sign1: longest.y0 + 3.3,
      }));
    }
  } else if (style === 'office-ribbon') {
    for (const edge of open) dressRibbon(edge, spec, parts, spec.floors);
    if (longest && (edges[0].upper ? spec.upperSign : spec.sign)) {
      const text = edges[0].upper ? spec.upperSign : spec.sign;
      signJobs.push(signPlacement(longest, text, spec.signBg || '#2e3a44', spec.signFg || '#eef2f4', 'plaque', {
        sign0: longest.y0 + 3.4,
        sign1: longest.y0 + 4.15,
      }));
    }
  } else if (style === 'office-punched') {
    for (const edge of open) dressPunched(edge, spec, parts, spec.floors, true);
  } else if (style === 'apartment') {
    for (const edge of open) dressApartment(edge, spec, parts, polygons);
    if (longest && spec.sign) {
      signJobs.push(signPlacement(longest, spec.sign, spec.signBg, spec.signFg, 'plaque', {
        sign0: longest.y0 + 2.5,
        sign1: longest.y0 + 3.25,
      }));
    }
  } else if (style === 'townhouse') {
    for (const edge of open) dressTownhouse(edge, spec, parts);
  } else if (style === 'bank') {
    for (const edge of open) if (!aboveNeighbor(edge)) dressBank(edge, spec, parts, signJobs, roads, polygons);
  } else if (style === 'civic') {
    for (const edge of open) if (!aboveNeighbor(edge)) dressCivic(edge, spec, parts, signJobs);
  } else if (style === 'cottage') {
    for (const edge of open) if (!aboveNeighbor(edge)) dressCottage(edge, spec, parts, signJobs);
  } else {
    for (const edge of open) {
      if (!edge.front || aboveNeighbor(edge)) {
        if (edge.length > 8 && edge.top - edge.y0 > 6.5 && spec.side !== 'blank') {
          dressPunched(edge, spec, parts, null, false);
        }
        continue;
      }
      dressStorefront(edge, spec, parts, signJobs, roads, polygons);
      if (edge.top - edge.y0 > 7.3) {
        const bays = baysOf(edge, spec.bay || 4);
        const y0 = edge.y0 + 4.3;
        const y1 = Math.min(edge.top - 0.45, y0 + 1.5);
        for (const bay of bays) {
          addOpening(parts.glass, parts.metal, edge, bay.t0 + 0.05, bay.t1 - 0.05, y0, y1, spec.glass, spec.metal);
        }
      }
    }
  }
  if (!edges[0].upper) addRoofUnits(parts.metal, open, spec);
}

function paintAtlas(jobs) {
  const columns = 8;
  const cellW = 256;
  const cellH = 64;
  const rows = Math.max(1, Math.ceil(jobs.length / columns));
  const canvas = document.createElement('canvas');
  canvas.width = columns * cellW;
  canvas.height = rows * cellH;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  jobs.forEach((job, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellW;
    const y = row * cellH;
    context.fillStyle = job.bg || '#2c2824';
    context.fillRect(x, y, cellW, cellH);
    context.fillStyle = job.fg || '#f4f0e8';
    context.font = '600 34px Arial, Helvetica, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    let size = 34;
    while (context.measureText(job.text).width > cellW - 24 && size > 16) {
      size -= 2;
      context.font = `600 ${size}px Arial, Helvetica, sans-serif`;
    }
    context.fillText(job.text, x + cellW / 2, y + cellH / 2);
    job.uv = {
      u0: x / canvas.width,
      u1: (x + cellW) / canvas.width,
      v0: 1 - (y + cellH) / canvas.height,
      v1: 1 - y / canvas.height,
    };
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function emitSigns(target, jobs) {
  for (const job of jobs) {
    if (!(job.y1 > job.y0) || !(job.t1 > job.t0)) continue;
    const flip = !runsTowardViewerRight(job.edge);
    const u0 = flip ? job.uv.u1 : job.uv.u0;
    const u1 = flip ? job.uv.u0 : job.uv.u1;
    const proud = job.proud ?? 0.14;
    quad(target, [
      pointOn(job.edge, job.t0, job.y0, proud, u0, job.uv.v0),
      pointOn(job.edge, job.t1, job.y0, proud, u1, job.uv.v0),
      pointOn(job.edge, job.t1, job.y1, proud, u1, job.uv.v1),
      pointOn(job.edge, job.t0, job.y1, proud, u0, job.uv.v1),
    ], WHITE, [job.edge.nx, 0, job.edge.nz]);
  }
}

function meshFrom(target, material, name) {
  if (!target.position.length) return 0;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(target.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(target.uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(target.color, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = name.startsWith('Hungerford metal');
  mesh.receiveShadow = true;
  return mesh;
}

export function loadDistrictTextures() {
  const loader = new THREE.TextureLoader();
  const load = (file) => new Promise((resolve) => {
    const url = new URL(`../../../public/districts/hungerford/${file}`, import.meta.url);
    loader.load(url.href, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      resolve(texture);
    }, undefined, () => resolve(null));
  });
  return Promise.all([load('brick.webp'), load('concrete.webp')])
    .then(([brick, concrete]) => ({ brick, concrete }));
}

export function dressHungerford({
  parent, edges, styles, maps, textures, collisionPolygons,
}) {
  const parts = {
    brick: batch(),
    stucco: batch(),
    concrete: batch(),
    glass: batch(),
    metal: batch(),
    signs: batch(),
  };
  const signJobs = [];
  const roads = buildRoads();
  const polygons = collisionPolygons ?? [];
  const groups = new Map();
  for (const edge of edges) {
    const spec = styles.buildings[String(edge.id)];
    if (!spec) continue;
    const key = `${edge.id}:${edge.upper ? 'u' : 'b'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }
  for (const list of groups.values()) {
    const spec = styles.buildings[String(list[0].id)];
    dressBuilding(list, spec, parts, signJobs, roads, polygons);
  }
  const atlas = signJobs.length ? paintAtlas(signJobs) : null;
  if (atlas) emitSigns(parts.signs, signJobs);

  const group = new THREE.Group();
  group.name = 'Hungerford facades';
  const stuccoMap = maps?.concrete ?? null;
  const materials = [
    ['Hungerford brick', parts.brick, textures?.brick ?? stuccoMap, 0.92, 0],
    ['Hungerford stucco', parts.stucco, textures?.concrete ?? stuccoMap, 0.9, 0.04],
    ['Hungerford concrete', parts.concrete, textures?.concrete ?? stuccoMap, 0.9, 0.02],
    ['Hungerford glass', parts.glass, null, 0.22, 0.18],
    ['Hungerford metal', parts.metal, null, 0.48, 0.28],
    ['Hungerford signs', parts.signs, atlas, 0.62, 0],
  ];
  let triangles = 0;
  for (const [name, data, map, roughness, metalness] of materials) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: map || null,
      vertexColors: true,
      roughness,
      metalness,
      side: name.includes('glass') || name.includes('metal') || name.includes('sign')
        ? THREE.DoubleSide
        : THREE.FrontSide,
    });
    if (name.includes('glass')) {
      material.emissive = new THREE.Color(0x102028);
      material.emissiveIntensity = 0.35;
    }
    const mesh = meshFrom(data, material, name);
    if (mesh) {
      group.add(mesh);
      triangles += data.position.length / 9;
    }
  }
  parent.add(group);
  return {
    buildings: groups.size,
    signs: signJobs.length,
    triangles: Math.round(triangles),
    meshes: group.children.length,
  };
}
