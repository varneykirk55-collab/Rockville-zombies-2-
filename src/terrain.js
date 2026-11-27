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
    const col = Math.min(cols - 1.001, Math.max(0, (x - x0) / step));
    const row = Math.min(rows - 1.001, Math.max(0, (z - z0) / step));
    const c0 = Math.floor(col);
    const r0 = Math.floor(row);
    const tx = col - c0;
    const tz = row - r0;
    const y00 = heightAt(c0, r0);
    const y10 = heightAt(c0 + 1, r0);
    const y01 = heightAt(c0, r0 + 1);
    const y11 = heightAt(c0 + 1, r0 + 1);
    return (y00 * (1 - tx) + y10 * tx) * (1 - tz) + (y01 * (1 - tx) + y11 * tx) * tz;
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

  function buildMesh() {
    const positions = new Float32Array(cols * rows * 3);
    const normals = new Float32Array(cols * rows * 3);
    const colors = new Float32Array(cols * rows * 3);
    const urban = new THREE.Color(0x626e61);
    const grass = new THREE.Color(0x3d5a3e);
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
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.name = 'Maryland DEM terrain';
    mesh.receiveShadow = true;
    return mesh;
  }

  return {
    sampleGameY, insidePlayable, distanceOutside, buildMesh, ring,
    demOriginM: terrain.demOriginM,
  };
}
