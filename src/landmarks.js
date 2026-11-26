import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CLOCK_WIDTH = 42.8;
const CLOCK_DEPTH = 20.2;

function boxPolygon(position, rotationY) {
  const hx = CLOCK_WIDTH / 2;
  const hz = CLOCK_DEPTH / 2;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => ({
    x: position.x + x * cos + z * sin,
    z: position.z - x * sin + z * cos,
  }));
}

async function fileExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

export async function placeLandmarks({ world, manifest, terrain, separateGroups, collisionPolygons }) {
  const placed = [];
  const loader = new GLTFLoader();
  for (const landmark of manifest.landmarks ?? []) {
    if (!landmark.hideProcedural || !landmark.footprintId) continue;
    const url = new URL(`../public/${landmark.glb}`, import.meta.url);
    if (!await fileExists(url)) {
      placed.push({ id: landmark.id, loaded: false, footprintId: landmark.footprintId });
      continue;
    }
    const gltf = await loader.loadAsync(url.href);
    const model = gltf.scene;
    const y = terrain.sampleGameY(landmark.position.x, landmark.position.z);
    model.position.set(landmark.position.x, y, landmark.position.z);
    model.rotation.y = landmark.rotationY;
    model.name = `Landmark ${landmark.id}`;
    model.traverse(node => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    world.add(model);
    const placeholder = separateGroups.get(landmark.footprintId);
    placeholder?.group.removeFromParent();
    for (let i = collisionPolygons.length - 1; i >= 0; i--) {
      if (collisionPolygons[i].footprintId === landmark.footprintId) collisionPolygons.splice(i, 1);
    }
    collisionPolygons.push({
      outer: boxPolygon(landmark.position, landmark.rotationY),
      holes: [],
      footprintId: landmark.footprintId,
    });
    placed.push({ id: landmark.id, loaded: true, footprintId: landmark.footprintId });
  }
  return placed;
}
