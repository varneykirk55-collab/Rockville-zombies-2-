import * as THREE from 'three';
import { lonLatToWorld } from './utils.js';

function insideRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function segmentDistance(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1e-8) return Math.hypot(x - a.x, z - a.z);
  const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

function clipPlan(points, distance) {
  const result = [];
  let a = points.at(-1);
  let da = distance(a);
  for (const b of points) {
    const db = distance(b);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
    if (db >= 0) result.push(b);
    a = b;
    da = db;
  }
  return result;
}

export function createTerrain(terrain, boundaryGeoJson) {
  const ringLonLat = boundaryGeoJson.features[0].geometry.coordinates[0];
  const ring = ringLonLat.map(([longitude, latitude]) => lonLatToWorld(longitude, latitude));
  if (ring.length > 1 && ring[0].x === ring.at(-1).x && ring[0].z === ring.at(-1).z) ring.pop();
  const { x0, z0, step, cols, rows, elevDm } = terrain;

  function heightAt(col, row) {
    const c = Math.min(cols - 1, Math.max(0, col));
    const r = Math.min(rows - 1, Math.max(0, row));
    return elevDm[r * cols + c] / 10;
  }

  function sampleGameY(x, z) {
    const col = Math.min(cols - 1, Math.max(0, (x - x0) / step));
    const row = Math.min(rows - 1, Math.max(0, (z - z0) / step));
    const c0 = Math.min(cols - 2, Math.floor(col));
    const r0 = Math.min(rows - 2, Math.floor(row));
    const tx = col - c0;
    const tz = row - r0;
    const y00 = heightAt(c0, r0);
    const y10 = heightAt(c0 + 1, r0);
    const y01 = heightAt(c0, r0 + 1);
    const y11 = heightAt(c0 + 1, r0 + 1);
    // Follow the same diagonal as buildMesh's two triangles per DEM cell.
    return tx + tz <= 1
      ? y00 + (y10 - y00) * tx + (y01 - y00) * tz
      : y11 + (y01 - y11) * (1 - tx) + (y10 - y11) * (1 - tz);
  }

  function drapeTriangles(positions, lift) {
    const result = [];
    function emit(polygon) {
      const a = polygon[0];
      for (let i = 2; i < polygon.length; i++) {
        const b = polygon[i - 1], c = polygon[i];
        if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) < 1e-8) continue;
        for (const { x, z } of [a, b, c]) result.push(x, sampleGameY(x, z) + lift, z);
      }
    }
    for (let i = 0; i < positions.length; i += 9) {
      const triangle = [0, 3, 6].map(offset => ({ x: positions[i + offset], z: positions[i + offset + 2] }));
      const [a, b, c] = triangle;
      const divisor = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
      if (Math.abs(divisor) < 1e-8) continue;
      const start = result.length;
      const aY = sampleGameY(a.x, a.z) + lift;
      const dyB = sampleGameY(b.x, b.z) + lift - aY;
      const dyC = sampleGameY(c.x, c.z) + lift - aY;
      const xs = triangle.map(p => p.x), zs = triangle.map(p => p.z);
      const c0 = Math.floor((Math.min(...xs) - x0) / step), c1 = Math.floor((Math.max(...xs) - x0) / step);
      const r0 = Math.floor((Math.min(...zs) - z0) / step), r1 = Math.floor((Math.max(...zs) - z0) / step);
      for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
        const left = x0 + col * step, top = z0 + row * step;
        let tile = clipPlan(triangle, p => p.x - left);
        if (tile.length) tile = clipPlan(tile, p => left + step - p.x);
        if (tile.length) tile = clipPlan(tile, p => p.z - top);
        if (tile.length) tile = clipPlan(tile, p => top + step - p.z);
        if (tile.length < 3) continue;
        const diagonal = left + top + step;
        emit(clipPlan(tile, p => diagonal - p.x - p.z));
        emit(clipPlan(tile, p => p.x + p.z - diagonal));
      }
      // Keep the original triangle if its plane already follows the terrain.
      // Both surfaces are piecewise linear, so only split vertices need testing.
      let needsSplit = false;
      for (let j = start; j < result.length; j += 3) {
        const x = result[j] - a.x, z = result[j + 2] - a.z;
        const u = (x * (c.z - a.z) - z * (c.x - a.x)) / divisor;
        const v = ((b.x - a.x) * z - (b.z - a.z) * x) / divisor;
        if (Math.abs(aY + dyB * u + dyC * v - result[j + 1]) <= 0.025) continue;
        needsSplit = true;
        break;
      }
      if (!needsSplit) {
        result.length = start;
        result.push(a.x, aY, a.z, b.x, aY + dyB, b.z, c.x, aY + dyC, c.z);
      }
    }
    return result;
  }

  function insidePlayable(x, z) {
    return insideRing(x, z, ring);
  }

  function distanceOutside(x, z) {
    if (insideRing(x, z, ring)) return 0;
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) best = Math.min(best, segmentDistance(x, z, ring[i], ring[(i + 1) % ring.length]));
    return best;
  }

  function buildMesh(map = null) {
    const positions = new Float32Array(cols * rows * 3);
    const normals = new Float32Array(cols * rows * 3);
    const colors = new Float32Array(cols * rows * 3);
    const uv = new Float32Array(cols * rows * 2);
    const urban = new THREE.Color(0xc2b9a5);
    const grass = new THREE.Color(0x99a47d);
    const tint = new THREE.Color();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        const x = x0 + col * step;
        const z = z0 + row * step;
        const y = heightAt(col, row);
        positions[index * 3] = x;
        positions[index * 3 + 1] = y;
        positions[index * 3 + 2] = z;
        const dx = (heightAt(col + 1, row) - heightAt(col - 1, row)) / (2 * step);
        const dz = (heightAt(col, row + 1) - heightAt(col, row - 1)) / (2 * step);
        const length = Math.hypot(dx, 1, dz);
        normals[index * 3] = -dx / length;
        normals[index * 3 + 1] = 1 / length;
        normals[index * 3 + 2] = -dz / length;
        const outside = distanceOutside(x, z);
        tint.copy(urban).lerp(grass, Math.min(1, outside / 18));
        uv[index * 2] = x / 5.4;
        uv[index * 2 + 1] = z / 5.4;
        colors[index * 3] = tint.r;
        colors[index * 3 + 1] = tint.g;
        colors[index * 3 + 2] = tint.b;
      }
    }
    const indices = [];
    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < cols - 1; col++) {
        const a = row * cols + col;
        indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map }));
    mesh.name = 'Maryland DEM terrain';
    mesh.receiveShadow = true;
    return mesh;
  }

  return {
    sampleGameY, drapeTriangles, insidePlayable, distanceOutside, buildMesh, ring,
    demOriginM: terrain.demOriginM,
  };
}
