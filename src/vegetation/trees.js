import * as THREE from 'three';
import { lonLatToWorld } from '../utils.js';

function worldRing(coordinates) {
  const ring = coordinates.map(([lon, lat]) => {
    const { x, z } = lonLatToWorld(lon, lat);
    return { x, z };
  });
  if (ring.length > 1 && ring[0].x === ring.at(-1).x && ring[0].z === ring.at(-1).z) ring.pop();
  return ring;
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

export function addTrees(world, terrain, footprints) {
  const blockers = [];
  for (const feature of footprints) {
    const raw = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates]
      : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
    for (const polygon of raw) {
      const outer = worldRing(polygon[0] ?? []);
      if (outer.length >= 3) blockers.push(outer);
    }
  }
  const spots = [];
  for (let x = -400; x <= 820; x += 18) {
    for (let z = -1040; z <= 740; z += 18) {
      const outside = terrain.distanceOutside(x, z);
      if (outside < 8 || outside > 52) continue;
      const jitter = ((Math.imul(x * 13 + z * 29, 0x45d9f3b) >>> 0) / 0x100000000) - 0.5;
      const px = x + jitter * 8;
      const pz = z + (((Math.imul(z * 17 - x, 0x27d4eb2d) >>> 0) / 0x100000000) - 0.5) * 8;
      if (blockers.some(ring => insideRing(px, pz, ring))) continue;
      spots.push(px, pz);
    }
  }
  if (!spots.length) return 0;
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.24, 2.4, 5),
    new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }),
    spots.length / 2,
  );
  const crown = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.3, 6.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x2f6a3c, roughness: 1 }),
    spots.length / 2,
  );
  trunk.name = 'Backdrop tree trunks';
  crown.name = 'Backdrop tree crowns';
  const dummy = new THREE.Object3D();
  for (let i = 0; i < spots.length; i += 2) {
    const y = terrain.sampleGameY(spots[i], spots[i + 1]);
    dummy.position.set(spots[i], y + 1.2, spots[i + 1]);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunk.setMatrixAt(i / 2, dummy.matrix);
    dummy.position.y = y + 4.4;
    dummy.updateMatrix();
    crown.setMatrixAt(i / 2, dummy.matrix);
  }
  trunk.castShadow = crown.castShadow = false;
  world.add(trunk, crown);
  return spots.length / 2;
}
