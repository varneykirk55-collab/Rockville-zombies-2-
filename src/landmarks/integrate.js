import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { lonLatToWorld } from '../utils.js';

const loader = new GLTFLoader();

function triangleCount(root) {
  let total = 0;
  root.traverse(node => {
    if (!node.isMesh) return;
    const index = node.geometry?.index;
    const positions = node.geometry?.attributes?.position;
    total += index ? index.count / 3 : (positions?.count ?? 0) / 3;
  });
  return Math.round(total);
}

function orientedFootprint(x, z, rotationY, width, depth) {
  const hx = width / 2;
  const hz = depth / 2;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([px, pz]) => ({
    x: x + px * cos + pz * sin,
    z: z - px * sin + pz * cos,
  }));
}

function worldPosition(model) {
  if (Number.isFinite(model.longitude) && Number.isFinite(model.latitude)) {
    return lonLatToWorld(model.longitude, model.latitude);
  }
  return { x: model.position?.x ?? 0, z: model.position?.z ?? 0 };
}

async function readModel(glb) {
  if (!glb) return { ok: false, reason: 'no-file' };
  const url = new URL(`../../public/${glb}`, import.meta.url);
  try {
    const gltf = await loader.loadAsync(url.href);
    return { ok: true, scene: gltf.scene, triangles: triangleCount(gltf.scene) };
  } catch (error) {
    return { ok: false, reason: error?.message || 'load-failed' };
  }
}

export async function integrateLandmarks({ world, models, terrain, separateGroups, collisionPolygons }) {
  const claimed = new Set();
  const placed = [];
  for (const model of models) {
    const record = {
      id: model.id,
      district: model.district,
      approval: model.approval ?? 'unapproved',
      buildingId: model.buildingId ?? null,
      active: model.active !== false,
      loaded: false,
      placed: false,
      fallback: null,
      reason: null,
    };
    if (model.active === false) {
      record.reason = 'inactive';
      placed.push(record);
      continue;
    }
    if (model.buildingId && claimed.has(model.buildingId)) {
      record.reason = 'duplicate-building';
      record.fallback = 'procedural';
      placed.push(record);
      continue;
    }
    if (model.buildingId) claimed.add(model.buildingId);
    const loaded = await readModel(model.glb);
    if (!loaded.ok) {
      record.reason = loaded.reason;
      record.fallback = 'procedural';
      placed.push(record);
      continue;
    }
    record.loaded = true;
    record.triangles = loaded.triangles;
    const replace = Boolean(model.replaceProcedural && model.buildingId);
    if (!replace) {
      record.reason = model.buildingId ? 'duplicate-prevented' : 'unplaced';
      record.fallback = model.buildingId ? 'procedural' : null;
      placed.push(record);
      continue;
    }
    const { x, z } = worldPosition(model);
    const y = terrain.sampleGameY(x, z) + (model.elevationOffsetM || 0);
    const object = loaded.scene;
    object.position.set(x, y, z);
    object.rotation.y = model.rotationY || 0;
    const scale = Number.isFinite(model.scale) ? model.scale : 1;
    object.scale.setScalar(scale);
    const unapproved = model.approval !== 'approved';
    object.name = unapproved ? `UNAPPROVED landmark ${model.id}` : `Landmark ${model.id}`;
    object.userData = {
      approval: model.approval ?? 'unapproved',
      buildingId: model.buildingId,
      district: model.district,
      replaceable: true,
    };
    object.traverse(node => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    world.add(object);
    if (unapproved) {
      const reach = Array.isArray(model.collision?.size) ? model.collision.size[0] / 2 + 1.4 : 8;
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 9, 8),
        new THREE.MeshBasicMaterial({ color: 0xff7a18 }),
      );
      marker.position.set(x + reach, y + 4.5, z);
      marker.name = `Unapproved marker ${model.id}`;
      world.add(marker);
    }
    const placeholder = separateGroups.get(model.buildingId);
    placeholder?.group.removeFromParent();
    const size = model.collision?.size;
    if (Array.isArray(size) && size.length === 2) {
      collisionPolygons.push({
        outer: orientedFootprint(x, z, object.rotation.y, size[0] * scale, size[1] * scale),
        holes: [],
        footprintId: model.buildingId,
        source: 'landmark',
      });
    }
    record.placed = true;
    record.reason = 'replaced-procedural';
    placed.push(record);
  }
  return placed;
}
