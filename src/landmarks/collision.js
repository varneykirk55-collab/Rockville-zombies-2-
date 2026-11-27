import { Matrix4, Vector3 } from 'three';

const CELL = 1;
const corners = [new Vector3(), new Vector3(), new Vector3()];

function clip(vertices, distance) {
  const result = [];
  let a = vertices.at(-1);
  let da = distance(a);
  for (const b of vertices) {
    const db = distance(b);
    if ((da >= 0) !== (db >= 0)) result.push(a.clone().lerp(b, da / (da - db)));
    if (db >= 0) result.push(b);
    a = b;
    da = db;
  }
  return result;
}

function overlaps(vertices, x, z) {
  // Bounds of the candidate cells already cover the rectangle axes. Polygon
  // edge axes finish the separating-axis test, including vertical walls
  // whose plan view is a line.
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const nx = b.z - a.z, nz = a.x - b.x;
    if (Math.abs(nx) + Math.abs(nz) < 1e-7) continue;
    const center = nx * (x + CELL / 2) + nz * (z + CELL / 2);
    const half = (Math.abs(nx) + Math.abs(nz)) * CELL / 2;
    let min = Infinity, max = -Infinity;
    for (const point of vertices) {
      const projection = nx * point.x + nz * point.z;
      min = Math.min(min, projection);
      max = Math.max(max, projection);
    }
    if (max < center - half - 1e-7 || min > center + half + 1e-7) return false;
  }
  return true;
}

export function modelBoxes(root, baseY, openLocalZAbove) {
  root.updateMatrixWorld(true);
  const m = new Matrix4().copy(root.matrixWorld).invert().elements;
  const limit = v => openLocalZAbove - (m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14]);
  const occupied = new Map();
  const floor = baseY + 0.15, ceiling = baseY + 3.2;

  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const attribute = mesh.geometry.getAttribute('position');
    if (!attribute) return;
    const indices = mesh.geometry.index;
    const count = indices?.count ?? attribute.count;
    for (let i = 0; i + 2 < count; i += 3) {
      for (let j = 0; j < 3; j++)
        corners[j].fromBufferAttribute(attribute, indices ? indices.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld);
      const [a, b, c] = corners;
      const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
      if (hi < floor || lo > ceiling || hi - lo < 1e-4) continue;
      let poly = lo < floor ? clip(corners, v => v.y - floor) : corners;
      if (poly.length && hi > ceiling) poly = clip(poly, v => ceiling - v.y);
      if (poly.length && openLocalZAbove != null) poly = clip(poly, limit);
      if (poly.length < 3) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const v of poly) {
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
        z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
      }
      for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
        for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) {
          if (occupied.get(z)?.has(x) || !overlaps(poly, x * CELL, z * CELL)) continue;
          if (!occupied.has(z)) occupied.set(z, new Set());
          occupied.get(z).add(x);
        }
      }
    }
  });
  if (!occupied.size) return [];
  const allX = [...occupied.values()].flatMap(s => [...s]);
  const x0 = Math.min(...allX) - 1, x1 = Math.max(...allX) + 1;
  const z0 = Math.min(...occupied.keys()) - 1, z1 = Math.max(...occupied.keys()) + 1;
  const width = x1 - x0 + 1, height = z1 - z0 + 1;
  const grid = new Uint8Array(width * height);

  for (const [z, row] of occupied) for (const x of row) grid[(z - z0) * width + x - x0] = 1;
  // Close single-cell gaps along thin facade runs before filling enclosed
  // interiors. Authored opening planes remain outside the occupancy mask.
  const original = grid.slice();
  for (let z = 1; z < height - 1; z++) for (let x = 1; x < width - 1; x++) {
    const i = z * width + x;
    if ((original[i - 1] && original[i + 1]) || (original[i - width] && original[i + width])) grid[i] = 1;
  }
  const queue = [0];
  grid[0] = 2;
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i], x = n % width, z = Math.floor(n / width);
    for (const j of [x ? n - 1 : -1, x < width - 1 ? n + 1 : -1, z ? n - width : -1, z < height - 1 ? n + width : -1]) {
      if (j < 0 || grid[j]) continue;
      grid[j] = 2;
      queue.push(j);
    }
  }

  const rings = [];
  // Collapse equal runs across rows into rectangles rather than indexing
  // individual occupied tiles as colliders.
  const open = new Map();
  function flush(rect) {
    const { a, b, first, last } = rect;
    rings.push([{ x: a * CELL, z: first * CELL }, { x: b * CELL, z: first * CELL },
      { x: b * CELL, z: last * CELL }, { x: a * CELL, z: last * CELL }]);
  }
  for (let z = 0; z < height; z++) {
    const next = new Map();
    for (let x = 0; x < width;) {
      if (grid[z * width + x] === 2) { x++; continue; }
      const a = x++;
      while (x < width && grid[z * width + x] !== 2) x++;
      const key = a * width + x;
      const rect = open.get(key) ?? { a: a + x0, b: x + x0, first: z + z0 };
      rect.last = z + z0 + 1;
      next.set(key, rect);
      open.delete(key);
    }
    for (const rect of open.values()) flush(rect);
    open.clear();
    for (const [key, rect] of next) open.set(key, rect);
  }
  for (const rect of open.values()) flush(rect);
  return rings;
}
