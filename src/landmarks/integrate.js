import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { modelBoxes } from './collision.js';
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

const flatMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
  metalness: 1,
});
flatMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 surfaceFactors;\nvarying vec2 vSurface;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface = surfaceFactors;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vSurface;')
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurface.x;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurface.y;');
};
flatMaterial.customProgramCacheKey = () => 'rockville-flat-batch';

function prepareGeometry(geometry) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  }
  for (const key of Object.keys(geo.attributes)) {
    if (!['position', 'normal', 'uv', 'color', 'surfaceFactors'].includes(key)) geo.deleteAttribute(key);
  }
  return geo;
}

function consolidate(root) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const flat = [];
  const textured = new Map();
  const meshes = [];
  root.traverse(node => { if (node.isMesh) meshes.push(node); });
  let draws = 0;
  for (const mesh of meshes) {
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const local = new THREE.Matrix4().copy(inverse).multiply(mesh.matrixWorld);
    const mapped = source.map || source.normalMap || source.roughnessMap || source.metalnessMap || source.emissiveMap;
    const emissive = source.emissive && (source.emissive.r + source.emissive.g + source.emissive.b) > 0.02;
    if (mapped) {
      const geo = prepareGeometry(mesh.geometry.clone());
      geo.deleteAttribute('color');
      geo.deleteAttribute('surfaceFactors');
      geo.applyMatrix4(local);
      if (!textured.has(source.uuid)) textured.set(source.uuid, { material: source, geos: [] });
      textured.get(source.uuid).geos.push(geo);
    } else if (emissive) {
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(local);
      const kept = new THREE.Mesh(geo, source);
      kept.castShadow = kept.receiveShadow = true;
      kept.name = source.name || 'Emissive';
      root.add(kept);
      draws += 1;
    } else {
      const geo = prepareGeometry(mesh.geometry.clone());
      geo.applyMatrix4(local);
      const color = source.color || new THREE.Color(0xffffff);
      const count = geo.attributes.position.count;
      const colors = new Float32Array(count * 3);
      const surface = new Float32Array(count * 2);
      const rough = Number.isFinite(source.roughness) ? source.roughness : 0.8;
      const metal = Number.isFinite(source.metalness) ? source.metalness : 0;
      for (let i = 0; i < count; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        surface[i * 2] = rough;
        surface[i * 2 + 1] = metal;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('surfaceFactors', new THREE.BufferAttribute(surface, 2));
      flat.push(geo);
    }
    mesh.removeFromParent();
  }
  if (flat.length) {
    const merged = mergeGeometries(flat, false);
    const mesh = new THREE.Mesh(merged, flatMaterial);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = 'Batched flat materials';
    root.add(mesh);
    draws += 1;
  }
  for (const { material, geos } of textured.values()) {
    const merged = mergeGeometries(geos.map(prepareGeometry), false);
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = material.name || 'Batched textured';
    root.add(mesh);
    draws += 1;
  }
  return draws;
}

function dropFootprint(collisionPolygons, id, kept) {
  const rings = [];
  if (kept.has(id)) return rings;
  for (let i = collisionPolygons.length - 1; i >= 0; i--) {
    const polygon = collisionPolygons[i];
    if (polygon.footprintId === id && polygon.source !== 'landmark') {
      rings.push(polygon.outer);
      collisionPolygons.splice(i, 1);
    }
  }
  kept.add(id);
  return rings;
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

const LAMP_LOCAL = [[-11.54, 15.0], [11.59, 15.7], [-11.59, -15.66], [11.82, -15.72]];

export async function integrateLandmarks({ world, models, terrain, separateGroups, collisionPolygons, batch = true }) {
  const claimed = new Set();
  const removedFootprints = new Set();
  const placed = [];
  const markers = [];
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
    const shares = Boolean(model.shareFootprint);
    if (model.buildingId && claimed.has(model.buildingId) && !shares) {
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
    const placeable = model.place !== false && (replace || !model.buildingId);
    if (!placeable) {
      record.reason = 'held';
      record.fallback = model.buildingId ? 'procedural' : null;
      placed.push(record);
      continue;
    }
    const { x, z } = worldPosition(model);
    const y = terrain.sampleGameY(x, z) + (model.elevationOffsetM || 0);
    const object = loaded.scene;
    object.position.set(x, y, z);
    object.rotation.y = Number.isFinite(model.rotationY) ? model.rotationY : 0;
    const scale = Number.isFinite(model.scale) ? model.scale : 1;
    object.scale.setScalar(scale);
    object.updateMatrixWorld(true);
    const unapproved = model.approval !== 'approved';
    object.name = unapproved ? `UNAPPROVED landmark ${model.id}` : `Landmark ${model.id}`;
    object.userData = {
      approval: model.approval ?? 'unapproved',
      buildingId: model.buildingId,
      district: model.district,
      replaceable: true,
    };
    world.add(object);
    let drawCalls = 0;
    if (batch) drawCalls = consolidate(object);
    else object.traverse(node => { if (node.isMesh) drawCalls += 1; });
    const box = new THREE.Box3().setFromObject(object);
    if (unapproved) markers.push(new THREE.Vector3(box.max.x + 2.2, y + 4.5, z));
    let footprintRing = null;
    if (replace) {
      separateGroups.get(model.buildingId)?.group.removeFromParent();
      const rings = dropFootprint(collisionPolygons, model.buildingId, removedFootprints);
      footprintRing = rings[0] ?? null;
    }
    let hull = null;
    if (model.collision?.mode !== 'none' && model.id !== 'courthouse-roundabout') {
      hull = modelBoxes(object, terrain.sampleGameY);
      for (const ring of hull) {
        collisionPolygons.push({
          outer: ring, holes: [], box: true, footprintId: model.buildingId ?? model.id, source: 'landmark',
        });
      }
    }
    if (model.id === 'courthouse-roundabout') {
      const point = new THREE.Vector3();
      for (const [lx, lz] of LAMP_LOCAL) {
        point.set(lx, 0, lz).applyMatrix4(object.matrixWorld);
        collisionPolygons.push({
          outer: orientedFootprint(point.x, point.z, 0, 0.7, 0.7),
          holes: [],
          footprintId: model.id,
          source: 'landmark-lamp',
        });
      }
    }
    record.placed = true;
    record.drawCalls = drawCalls;
    record.removedPlaceholder = replace ? model.buildingId : null;
    record.reason = replace ? 'replaced-procedural' : 'placed';
    record.frame = {
      id: model.id,
      x, z, y,
      height: box.max.y - y,
      minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z,
      footprint: footprintRing,
      hull,
    };
    placed.push(record);
  }
  if (markers.length) {
    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.22, 0.22, 9, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7a18 }),
      markers.length,
    );
    poles.name = 'Unapproved landmark markers';
    const dummy = new THREE.Object3D();
    markers.forEach((position, index) => {
      dummy.position.copy(position);
      dummy.updateMatrix();
      poles.setMatrixAt(index, dummy.matrix);
    });
    world.add(poles);
  }
  return placed;
}
