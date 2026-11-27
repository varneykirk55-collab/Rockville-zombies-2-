// Loaded only by ?audit. This samples intended routes; a blocked sample is
// evidence for review, not permission to remove a visible solid.
import { DoubleSide, Raycaster, Vector3 } from 'three';
import { ROAD_CENTERLINES } from './config.js';
import { lonLatToWorld } from './utils.js';
import { createBuildingCollision } from './camera.js';
import { createZombieNavigation, pathClear } from './zombie-navigation.js';
import { SURVIVAL } from './zombie-config.js';

function contains(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z)) inside = !inside;
  }
  return inside;
}

export async function auditCity({ polygons, terrain, sampleGround, frames, blocked, world }) {
  const response = await fetch(new URL('../public/data/districts/boundaries.geojson', import.meta.url));
  if (!response.ok) throw new Error('District boundaries unavailable');
  const { features } = await response.json();
  const districts = features.map(f => ({
    name: f.properties.districtId ?? f.properties.id ?? f.properties.code ?? f.properties.name,
    rings: (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates])
      .map(p => p[0].map(([lon, lat]) => lonLatToWorld(lon, lat))),
  }));
  const failures = [];
  const counts = {};
  const sampleCounts = {};
  const surfaceAreas = [];
  const colliders = polygons.map(p => {
    const xs = p.outer.map(v => v.x), zs = p.outer.map(v => v.z);
    return { p, x0: Math.min(...xs) - .37, x1: Math.max(...xs) + .37,
      z0: Math.min(...zs) - .37, z1: Math.max(...zs) + .37, query: null };
  });
  function record(kind, x, z, id = null, cause = '') {
    const district = districts.find(d => d.rings.some(r => contains(r, x, z)))?.name ?? 'outside-district';
    if (id == null && blocked(x, z)) {
      const match = colliders.find(c => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 &&
        (c.query ??= createBuildingCollision([c.p]))(x, z));
      id = match?.p.footprintId ?? match?.p.id ?? null;
      cause ||= match?.p.source ?? 'procedural footprint or body clearance';
    }
    counts[kind] = (counts[kind] ?? 0) + 1;
    failures.push({ kind, x: +x.toFixed(3), z: +z.toFixed(3), district, id, cause,
      status: 'observed; compare with baseline and visible geometry' });
  }
  function check(kind, x, z, id) {
    if (!terrain.insidePlayable(x, z)) return;
    sampleCounts[kind] = (sampleCounts[kind] ?? 0) + 1;
    if (blocked(x, z)) record(kind, x, z, id);
  }
  for (const [width, coordinates] of ROAD_CENTERLINES) {
    const points = coordinates.map(([lon, lat]) => lonLatToWorld(lon, lat));
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const steps = Math.ceil(len / 2);
      let previous;
      for (let s = 0; s < steps; s++) {
        const x = a.x + dx * s / steps, z = a.z + dz * s / steps;
        check('road-center', x, z);
        if (width >= 4) for (const sign of [-1, 1])
          check('sidewalk-candidate', x + dz / len * (width + 1) * sign, z - dx / len * (width + 1) * sign);
        if (!terrain.insidePlayable(x, z) || blocked(x, z)) { previous = undefined; continue; }
        const y = sampleGround(x, z);
        if (previous !== undefined && Math.abs(y - previous) > 0.45) record('steep-road-sample', x, z, null, 'surveyed grade or sampler mismatch');
        previous = y;
      }
    }
    for (const { x, z } of [points[0], points.at(-1)]) check('road-node', x, z);
  }
  for (const name of ['Asphalt streets', 'Concrete sidewalks', 'Brick at East Montgomery and Helen Heneghan']) {
    const mesh = world?.getObjectByName(name);
    const position = mesh?.geometry.getAttribute('position');
    if (!position) continue;
    const flagged = new Set();
    let maxError = 0, mismatches = 0;
    for (let i = 0; i < position.count; i += 3) {
      const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
      const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
      const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
      const error = Math.abs(y - sampleGround(x, z));
      maxError = Math.max(maxError, error);
      if (error <= 0.1 || !terrain.insidePlayable(x, z)) continue;
      mismatches++;
      const cell = Math.floor(x / 4) + ',' + Math.floor(z / 4);
      if (flagged.has(cell)) continue;
      flagged.add(cell);
      record('road-surface-mismatch', x, z, name, 'rendered surface differs from the walking height by more than 0.1 m');
    }
    surfaceAreas.push({ name, maxError: +maxError.toFixed(3), mismatches, triangles: position.count / 3 });
  }

  const seen = new Map();
  for (const { p } of colliders) {
    const signature = [p.outer, ...p.holes].map(r => r.map(v => v.x + ',' + v.z).sort().join(';')).join('|');
    const a = p.outer[0];
    if (seen.has(signature)) record('duplicate-proxy', a.x, a.z, p.footprintId, 'equal proxy coordinates');
    seen.set(signature, p.footprintId);
    if (p.source) continue;
    // Offset to the outside of each edge. Nearby adjacent walls are reported too.
    let winding = 0;
    p.outer.forEach((v, i) => { const n = p.outer[(i + 1) % p.outer.length]; winding += v.x * n.z - n.x * v.z; });
    p.outer.forEach((v, i) => {
      const n = p.outer[(i + 1) % p.outer.length], len = Math.hypot(n.x - v.x, n.z - v.z);
      if (len < 0.4) return;
      const offset = Math.sign(winding) * 0.55 / len;
      check('building-perimeter-candidate', (v.x + n.x) / 2 + (n.z - v.z) * offset,
        (v.z + n.z) / 2 - (n.x - v.x) * offset);
    });
  }
  for (const frame of frames) {
    const { minX, maxX, minZ, maxZ, id } = frame;
    for (let i = 0; i <= 12; i++) {
      const x = minX + (maxX - minX) * i / 12, z = minZ + (maxZ - minZ) * i / 12;
      check('landmark-perimeter-candidate', x, minZ - .75, id);
      check('landmark-perimeter-candidate', x, maxZ + .75, id);
      check('landmark-perimeter-candidate', minX - .75, z, id);
      check('landmark-perimeter-candidate', maxX + .75, z, id);
    }
  }
  const ray = new Raycaster();
  const origin = new Vector3(), direction = new Vector3();
  for (const frame of frames) {
    const model = world?.children.find(obj => obj.name === 'Landmark ' + frame.id
      || obj.name === 'UNAPPROVED landmark ' + frame.id);
    if (!model || !frame.hull) continue;
    const materials = new Map();
    model.traverse(obj => {
      if (!obj.isMesh) return;
      for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        if (!materials.has(material)) materials.set(material, material.side);
        material.side = DoubleSide;
      }
    });
    try {
      for (const axis of ['x', 'z']) for (const sign of [-1, 1]) for (let i = 1; i <= 9; i++) {
        const { minX, maxX, minZ, maxZ } = frame;
        const x = axis === 'x' ? (sign > 0 ? minX - 1 : maxX + 1) : minX + (maxX - minX) * i / 10;
        const z = axis === 'z' ? (sign > 0 ? minZ - 1 : maxZ + 1) : minZ + (maxZ - minZ) * i / 10;
        origin.set(x, sampleGround(x, z) + 1.05, z);
        direction.set(axis === 'x' ? sign : 0, 0, axis === 'z' ? sign : 0);
        ray.set(origin, direction);
        const hit = ray.intersectObject(model, true)[0];
        if (!hit) continue;
        sampleCounts['landmark-wall-probe'] = (sampleCounts['landmark-wall-probe'] ?? 0) + 1;
        if (!blocked(hit.point.x, hit.point.z))
          record('landmark-wall-gap', hit.point.x, hit.point.z, frame.id, 'walking-height model ray hit a mesh outside the proxy');
      }
    } finally {
      for (const [material, side] of materials) material.side = side;
    }
  }

  const nav = createZombieNavigation(blocked, terrain.insidePlayable);
  const spawnChecks = [];
  const coverage = [];
  const crossings = [];
  for (const district of districts) {
    const ring = district.rings[0];
    const center = ring.reduce((p, a) => ({ x: p.x + a.x / ring.length, z: p.z + a.z / ring.length }), { x: 0, z: 0 });
    let anchor;
    let anchorScore = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      check('district-edge-candidate', x, z);
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length >= 1) {
        const dx = (b.z - a.z) / length, dz = (a.x - b.x) / length;
        const p = { x: x + dx, z: z + dz }, q = { x: x - dx, z: z - dz };
        if (terrain.insidePlayable(p.x, p.z) && terrain.insidePlayable(q.x, q.z)) {
          const owner = point => districts.find(d => d.rings.some(r => contains(r, point.x, point.z)))?.name;
          const from = owner(p), to = owner(q);
          if (from && to && from !== to) {
            const clear = !blocked(p.x, p.z) && pathClear(blocked, p.x, p.z, q.x, q.z);
            crossings.push({ from, to, p, q, clear });
            if (!clear) record('district-crossing-candidate', x, z, null, 'normal to district boundary crosses a solid or its movement clearance');
          }
        }
      }
      for (const dx of [-24, -12, 0, 12, 24]) for (const dz of [-24, -12, 0, 12, 24]) {
        const tx = x + dx, tz = z + dz;
        const score = (center.x - tx) ** 2 + (center.z - tz) ** 2;
        if (score >= anchorScore || !contains(ring, tx, tz) || !terrain.insidePlayable(tx, tz) || blocked(tx, tz)) continue;
        anchor = { x: tx, z: tz };
        anchorScore = score;
      }
    }
    if (!anchor) continue;
    nav.update(anchor.x, anchor.z);
    const out = {};
    let valid = 0;
    for (let h = 0; h < 4; h++) {
      const theta = h * Math.PI / 2, fx = Math.cos(theta), fz = Math.sin(theta);
      const cx = anchor.x - 3.65 * fx, cz = anchor.z - 3.65 * fz;
      let available = 0;
      // The full predicate also excludes nearby living zombies. This empty
      // fixture tests route reachability and the production view cone.
      for (let i = 0; i < 12; i++) {
        const hasSpawn = nav.spawn(anchor.x, anchor.z, (x, z, d) =>
          d >= SURVIVAL.minSpawnDistance && d <= SURVIVAL.maxSpawnDistance
          && (x - cx) * fx + (z - cz) * fz <= 0.40 * Math.hypot(x - cx, z - cz), out);
        if (hasSpawn && !blocked(out.x, out.z) && terrain.insidePlayable(out.x, out.z)
            && nav.waypoint(out, {})) available++;
        else if (hasSpawn) record('invalid-spawn', out.x, out.z, district.name, 'spawn failed the clearance or route check');
      }
      valid += available;
      if (!available) record('no-reachable-spawn-in-sector', anchor.x, anchor.z, district.name, 'no route inside the off-camera cone at heading ' + h);
    }
    spawnChecks.push({ district: district.name, ...anchor, valid, tested: 48 });
    let tested = 0, routed = 0;
    for (let dx = -55; dx <= 55; dx += 11) for (let dz = -55; dz <= 55; dz += 11) {
      const x = anchor.x + dx, z = anchor.z + dz;
      if (!terrain.insidePlayable(x, z) || !contains(ring, x, z) || blocked(x, z)) continue;
      tested++;
      if (pathClear(blocked, x, z, anchor.x, anchor.z) || nav.waypoint({ x, z }, {}, false)) routed++;
      else record('unreachable-nav-sample', x, z, district.name, 'no clear connection to the sampled district anchor');
    }
    coverage.push({ district: district.name, tested, routed });
  }
  return { counts, sampleCounts, spawnChecks, coverage, crossings, surfaceAreas, colliderCount: polygons.length, failures };
}
