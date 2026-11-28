const CELL = 1.7;
const SIDE = 107;
const AREA = SIDE * SIDE;
const DX = [1, 0, 1, -1, -1, 0, -1, 1];
const DZ = [0, 1, 1, 1, 0, -1, -1, -1];

export function pathClear(blocked, x, z, tx, tz) {
  const length = Math.hypot(tx - x, tz - z);
  if (!Number.isFinite(length)) return false;
  const steps = Math.ceil(length / 0.28);
  for (let i = 1; i <= steps; i++) {
    if (blocked(x + (tx - x) * i / steps, z + (tz - z) * i / steps)) return false;
  }
  return true;
}

// One reverse breadth-first search serves the entire horde. Cache clearance
// inside the current window and rebuild only when its centre moves.
export function createZombieNavigation(blocked, inside, cellSize = CELL) {
  const cells = new Uint8Array(AREA);
  const edges = new Uint8Array(AREA);
  const priorCells = new Uint8Array(AREA);
  const priorEdges = new Uint8Array(AREA);
  const distance = new Int16Array(AREA);
  const next = new Int16Array(AREA);
  const queue = new Int16Array(AREA);
  let originX = 0;
  let originZ = 0;
  let initialized = false;
  let targetCell = -1;
  let count = 0;
  let targetX, targetZ;

  const xOf = id => originX + (id % SIDE) * cellSize;
  const zOf = id => originZ + Math.floor(id / SIDE) * cellSize;

  function build(x, z) {
    const newX = (Math.round(x / cellSize) - Math.floor(SIDE / 2)) * cellSize;
    const newZ = (Math.round(z / cellSize) - Math.floor(SIDE / 2)) * cellSize;
    const shiftX = initialized ? Math.round((newX - originX) / cellSize) : SIDE;
    const shiftZ = initialized ? Math.round((newZ - originZ) / cellSize) : SIDE;
    originX = newX;
    originZ = newZ;
    const overlap = id => {
      const col = id % SIDE + shiftX, row = Math.floor(id / SIDE) + shiftZ;
      return col >= 0 && col < SIDE && row >= 0 && row < SIDE ? row * SIDE + col : -1;
    };
    for (let i = 0; i < AREA; i++) {
      const old = overlap(i);
      cells[i] = old >= 0 ? priorCells[old] : Number(inside(xOf(i), zOf(i)) && !blocked(xOf(i), zOf(i)));
      edges[i] = 0;
    }
    for (let i = 0; i < AREA; i++) {
      if (!cells[i]) continue;
      const col = i % SIDE, row = Math.floor(i / SIDE);
      const old = overlap(i);
      for (let dir = 0; dir < 4; dir++) {
        if (col + DX[dir] < 0 || col + DX[dir] >= SIDE || row + DZ[dir] >= SIDE) continue;
        const j = i + DX[dir] + DZ[dir] * SIDE;
        if (!cells[j]) continue;
        const clear = old >= 0 && overlap(j) >= 0
          ? priorEdges[old] & (1 << dir)
          : pathClear(blocked, xOf(i), zOf(i), xOf(j), zOf(j));
        if (!clear) continue;
        edges[i] |= 1 << dir;
        edges[j] |= 1 << (dir + 4);
      }
    }
    priorCells.set(cells);
    priorEdges.set(edges);
    initialized = true;
    targetCell = -1;
  }

  function nearest(x, z, requireRoute) {
    const col = Math.round((x - originX) / cellSize);
    const row = Math.round((z - originZ) / cellSize);
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
    targetX = x;
    targetZ = z;
    const col = (x - originX) / cellSize;
    const row = (z - originZ) / cellSize;
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
      for (let dir = 0; dir < DX.length; dir++) {
        if (!(edges[id] & (1 << dir))) continue;
        const j = id + DX[dir] + DZ[dir] * SIDE;
        if (distance[j] >= 0) continue;
        distance[j] = distance[id] + 1;
        next[j] = id;
        queue[count++] = j;
      }
    }
  }

  function waypoint(from, out, allowDirect = true) {
    const id = nearest(from.x, from.z, true);
    if (id < 0) {
      // A zombie outside the cached window can still make safe progress down
      // a long street. Movement validates the same body clearance.
      if (!allowDirect || !pathClear(blocked, from.x, from.z, targetX, targetZ)) return false;
      out.x = targetX;
      out.z = targetZ;
      return true;
    }
    let target = id;
    for (let step = 0, candidate = next[id]; step < 3 && candidate >= 0; step++, candidate = next[candidate]) {
      if (!pathClear(blocked, from.x, from.z, xOf(candidate), zOf(candidate))) break;
      target = candidate;
    }
    out.x = xOf(target);
    out.z = zOf(target);
    return true;
  }

  function spawn(x, z, accept, out) {
    if (!count) return false;
    const offset = Math.floor(Math.random() * count);
    const stride = count % 53 === 0 ? 1 : 53;
    for (let i = 0; i < Math.min(count, 450); i++) {
      const id = queue[(offset + i * stride) % count];
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
