import * as THREE from 'three';

const path = new URL('../../public/assets/environment/', import.meta.url);

export function loadCityMaterials(renderer) {
  const loader = new THREE.TextureLoader();
  const pending = [];
  function load(name, color, repeat = true) {
    let resolve, reject;
    pending.push(new Promise((yes, no) => { resolve = yes; reject = no; }));
    const map = loader.load(new URL(name + '.webp', path).href, resolve, undefined, reject);
    if (color) map.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    }
    return map;
  }
  function surface(name, normal = 0) {
    const packed = load(name + '-arm', false);
    return {
      map: load(name + '-diff', true),
      aoMap: packed, aoMapIntensity: 0.55, roughnessMap: packed, roughness: 0.96,
      ...(normal && { normalMap: load(name + '-nor_gl', false), normalScale: new THREE.Vector2(normal, normal) }),
    };
  }

  const asphalt = surface('street', 0.42);
  const concrete = surface('walk', 0.24);
  const brick = surface('pavers', 0.52);
  const masonry = surface('wall', 0.58);
  const roof = surface('roof');
  const grass = load('grass-diff', true);
  const wood = load('wood-diff', true);
  const sky = load('daylight', true, false);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  return { asphalt, concrete, brick, masonry, roof, grass, wood, sky, ready: Promise.all(pending) };
}
