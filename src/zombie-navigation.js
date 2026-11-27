const CELL = 1.7;
const SIDE = 107;
const AREA = SIDE * SIDE;
const DX = [1, 0, -1, 0];
const DZ = [0, 1, 0, -1];

export function pathClear(blocked, x, z, tx, tz) {
  const steps = Math.ceil(Math.hypot(tx - x, tz - z) / 0.28);
  for (let i = 1; i <= steps; i++) {
    if (blocked(x + (tx - x) * i / steps, z + (tz - z) * i / steps)) return false;
  }
  return true;
}

// One reverse breadth-first search serves the entire horde. Cache clearance
// inside the current window and rebuild only when its centre moves.
export function createZombieNavigation(blocked, inside) {
  const cells = new Uint8Array(AREA);
  const edges = new Uint8Array(AREA);
  const distance = new Int16Array(AREA);
  const next = new Int16Array(AREA);
  const queue = new Int16Array(AREA);
  let originX = 0;
  let originZ = 0;
  let initialized = false;
  let targetCell = -1;
  let count = 0;

  function locate(x, z) {
    const col = Math.round((x - originX) / CELL);
    const row = Math.round((z - originZ) / CELL);
    return col >= 0 && col < SIDE && row >= 0 && row < SIDE ? row * SIDE + col : -1;
  }
  const xOf = id => originX + (id % SIDE) * CELL;
  const zOf = id => originZ + Math.floor(id / SIDE) * CELL;

  function build(x, z) {
    originX = (Math.round(x / CELL) - Math.floor(SIDE / 2)) * CELL;
    originZ = (Math.round(z / CELL) - Math.floor(SIDE / 2)) * CELL;
    for (let i = 0; i < AREA; i++) {
      cells[i] = Number(inside(xOf(i), zOf(i)) && !blocked(xOf(i), zOf(i)));
      edges[i] = 0;
    }
    for (let i = 0; i < AREA; i++) {
      if (!cells[i]) continue;
      for (let dir = 0; dir < 2; dir++) {
        const j = locate(xOf(i) + DX[dir] * CELL, zOf(i) + DZ[dir] * CELL);
        if (j < 0 || !cells[j] || !pathClear(blocked, xOf(i), zOf(i), xOf(j), zOf(j))) continue;
        edges[i] |= 1 << dir;
        edges[j] |= 1 << (dir + 2);
      }
    }
    initialized = true;
    targetCell = -1;
  }

  function nearest(x, z, requireRoute) {
    const col = Math.round((x - originX) / CELL);
    const row = Math.round((z - originZ) / CELL);
    let best = -1;
    let cost = Infinity;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const c = col + dx, r = row + dz;
        if (c < 0 || c >= SIDE || r < 0 || r >= SIDE) continue;
        const id = r * SIDE + c;
        if (!cells[id] || (requireRoute && distance[id] < 0)) continue;
        const d = (xOf(id) - x) ** 2 + (zOf(id) - z) ** 2;
        if (d >= cost || !pathClear(blocked, x, z, xOf(id), zOf(id))) continue;
        best = id;
        cost = d;
      }
    }
    return best;
  }

  function update(x, z) {
    const col = (x - originX) / CELL;
    const row = (z - originZ) / CELL;
    if (!initialized || col < 23 || col >= SIDE - 23 || row < 23 || row >= SIDE - 23) build(x, z);
    const root = nearest(x, z, false);
    if (root === targetCell && count) return;
    targetCell = root;
    distance.fill(-1);
    next.fill(-1);
    count = 0;
    if (root < 0) return;
    distance[root] = 0;
    queue[count++] = root;
    for (let i = 0; i < count; i++) {
      const id = queue[i];
      for (let dir = 0; dir < 4; dir++) {
        if (!(edges[id] & (1 << dir))) continue;
        const j = id + DX[dir] + DZ[dir] * SIDE;
        if (distance[j] >= 0) continue;
        distance[j] = distance[id] + 1;
        next[j] = id;
        queue[count++] = j;
      }
    }
  }

  function waypoint(from, out) {
    const id = nearest(from.x, from.z, true);
    if (id < 0) return false;
    const nextId = next[id];
    const target = nextId >= 0 && pathClear(blocked, from.x, from.z, xOf(nextId), zOf(nextId)) ? nextId : id;
    out.x = xOf(target);
    out.z = zOf(target);
    return true;
  }

  function spawn(x, z, accept, out) {
    if (!count) return false;
    const offset = Math.floor(Math.random() * count);
    for (let i = 0; i < Math.min(count, 450); i++) {
      const id = queue[(offset + i * 53) % count];
      const tx = xOf(id), tz = zOf(id);
      if (!accept(tx, tz, Math.hypot(x - tx, z - tz))) continue;
      out.x = tx;
      out.z = tz;
      return true;
    }
    return false;
  }
  return { update, waypoint, spawn };
}
