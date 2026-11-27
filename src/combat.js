import {
  BoxGeometry, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Quaternion, Ray, Sphere, SphereGeometry, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createArmedAnimation } from './armed-animation.js';

const WEAPON_ASSETS = new URL('../public/weapons/', import.meta.url);
const WEAPONS = [
  { id: 'm4', name: 'M4 Carbine', model: 'm4.glb', magazine: 30, reserve: 210,
    rate: 12.5, damage: 42, reload: 2.3, range: 160, effective: 35, falloff: 0.6,
    auto: true, fire: 'm4_fire', reloadSound: 'reload_rifle',
    right: [0, -0.004, 0.05], left: [0, 0.01, -0.28], muzzle: [0, 0.06, -0.4755] },
  { id: 'mk35', name: 'MK35 ISR', model: 'mk35.glb', magazine: 30, reserve: 180,
    rate: 10, damage: 48, reload: 2.6, range: 160, effective: 35, falloff: 0.6,
    auto: true, fire: 'mk35_fire', reloadSound: 'reload_mk35',
    right: [0, -0.025, 0.05], left: [0, 0.01, -0.28], muzzle: [0, 0.06, -0.615] },
  { id: 'pistol', name: 'M1911', model: 'pistol.glb', magazine: 8, reserve: 96,
    rate: 7, damage: 45, reload: 1.5, range: 110, effective: 25, falloff: 0.5,
    auto: false, fire: 'pistol_fire', reloadSound: 'reload_pistol',
    right: [0, -0.032, 0.045], left: [-0.052, -0.03, 0.03], muzzle: [0, 0.037, -0.14] },
];

const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);
const LOCAL_FORWARD = new Vector3(0, 0, -1);

function arm(socket) {
  const hand = socket.parent;
  return { socket, hand, forearm: hand.parent, upper: hand.parent.parent };
}

const jointOrigin = new Vector3();
const from = new Vector3();
const to = new Vector3();
const parentRotation = new Quaternion();
const jointRotation = new Quaternion();

function reach(arm, goal, wrist, weight) {
  for (let i = 0; i < 4; i++) {
    for (const joint of [arm.forearm, arm.upper]) {
      joint.getWorldPosition(jointOrigin);
      arm.socket.getWorldPosition(from).sub(jointOrigin).normalize();
      to.copy(goal).sub(jointOrigin).normalize();
      joint.parent.getWorldQuaternion(parentRotation).invert();
      from.applyQuaternion(parentRotation);
      to.applyQuaternion(parentRotation);
      jointRotation.setFromUnitVectors(from, to);
      joint.quaternion.slerp(jointRotation.multiply(joint.quaternion), weight);
    }
  }
  arm.hand.parent.getWorldQuaternion(parentRotation).invert();
  arm.hand.quaternion.slerp(parentRotation.multiply(wrist), weight);
}

export function createCombat({ scene, renderer, camera, controls, player, canvas }) {
  const hud = document.querySelector('#weapon-hud');
  const reticle = document.querySelector('#reticle');
  const arms = [];
  const loader = new GLTFLoader();
  const animation = createArmedAnimation();
  const gear = WEAPONS.map(config => ({
    config, ammo: config.magazine, reserve: config.reserve, group: new Group(),
    muzzleOffset: new Vector3(...config.muzzle).sub(new Vector3(...config.right)),
  }));
  const audio = new Map();
  for (const name of [...WEAPONS.flatMap(w => [w.fire, w.reloadSound]), 'dry_fire', 'weapon_switch', 'impact_stone']) {
    const voices = Array.from({ length: name.endsWith('_fire') ? 4 : 1 }, () => {
      const node = new Audio(new URL(name + '.wav', WEAPON_ASSETS).href);
      node.preload = 'none';
      node.volume = name.endsWith('_fire') ? 0.25 : 0.32;
      return node;
    });
    audio.set(name, { voices, next: 0 });
  }
  function play(name) {
    const { voices, next } = audio.get(name);
    const voice = voices[next % voices.length];
    audio.get(name).next++;
    voice.currentTime = 0;
    voice.play().catch(() => {});
  }
  const effectsGeometry = new SphereGeometry(1, 7, 5);
  const flash = new Mesh(effectsGeometry, new MeshBasicMaterial({ color: 0xffd29b }));
  flash.scale.set(0.032, 0.035, 0.11);
  flash.visible = false;
  scene.add(flash);
  const impactMaterial = new MeshBasicMaterial({ color: 0xf5aa73 });
  const sparks = Array.from({ length: 18 }, () => {
    const mesh = new Mesh(effectsGeometry, impactMaterial);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, life: 0 };
  });
  const targets = [];
  const targetGeometry = new BoxGeometry(0.58, 0.67, 0.12);
  const targetMaterial = new MeshStandardMaterial({ color: 0xcf653c, roughness: 0.8 });
  const traceRay = new Ray();
  const targetSphere = new Sphere(new Vector3(), 0.39);
  const temp = new Vector3();
  const probe = new Vector3();
  const view = new Vector3();
  const aimPoint = new Vector3();
  const muzzle = new Vector3();
  const origin = new Vector3();
  const rightGoal = new Vector3();
  const leftGoal = new Vector3();
  const orientation = new Quaternion();
  const wrist = new Quaternion();
  const localWrist = new Quaternion().setFromAxisAngle(LOCAL_FORWARD, Math.PI / 2);
  const worldRotation = new Quaternion();
  const lookMatrix = new Matrix4();
  let active = 0;
  let trigger = false;
  let pressed = false;
  let previousPad = [];
  let reload = 0;
  let draw = 0;
  let cooldown = 0;
  let recoil = 0;
  let flashTime = 0;
  let worldReady = false;
  let rigsReady = false;
  let modelsReady = false;
  let blockedShot = false;
  let impactCursor = 0;
  let shots = 0;
  let hits = 0;
  let sightOnTarget = false;
  let lastImpact = null;
  let hudText;
  let priorYaw;
  let priorPitch;

  async function load() {
    const loaded = await Promise.all(gear.map(async item => {
      const result = await loader.loadAsync(new URL(item.config.model, WEAPON_ASSETS).href);
      if (item.config.auto) result.scene.rotation.y = Math.PI / 2;
      result.scene.traverse(node => { if (node.isMesh) node.castShadow = true; });
      item.model = result.scene;
      item.group.add(item.model);
      item.mag = item.model.getObjectByName(item.config.auto ? 'magazine' : 'Magazine');
      item.slide = item.model.getObjectByName(item.config.auto ? 'bolt_carrier' : 'Slide');
      item.magRest = item.mag.position.clone();
      item.slideRest = item.slide.position.clone();
      return item;
    }));
    modelsReady = loaded.length === gear.length;
  }
  load().catch(error => {
    console.error('Weapon assets failed to load:', error);
    hud.textContent = 'Weapon assets unavailable';
  });

  function attach() {
    const { socket_weapon_r: right, socket_weapon_l: left, socket_holster_r: hip, socket_sling: sling } = player.sockets;
    if (!right || !left || !hip || !sling) return;
    arms.push(arm(right), arm(left));
    for (const item of gear) {
      item.holster = item.config.auto ? sling : hip;
      holster(item);
      item.group.visible = false;
    }
    rigsReady = true;
    equip(0, false);
  }

  function holster(item) {
    if (!item) return;
    item.mag.position.copy(item.magRest);
    item.slide.position.copy(item.slideRest);
    item.holster.add(item.group);
    item.group.position.set(item.config.id === 'mk35' ? -0.10 : 0.04, 0, -0.05);
    item.group.rotation.set(item.config.auto ? 1.05 : 0, item.config.auto ? Math.PI / 2 : 0, 0);
  }

  function equip(index, sound = true) {
    if (!rigsReady || (sound && active === index)) return;
    holster(gear[active]);
    active = index;
    renderer.shadowMap.needsUpdate = true;
    const item = gear[active];
    arms[0].socket.add(item.group);
    for (const entry of gear) {
      entry.group.visible = entry === item || (entry.config.auto ? !gear.some(other =>
        other !== entry && other !== item && other.config.auto && gear.indexOf(other) < gear.indexOf(entry)) : true);
    }
    draw = sound ? 0.32 : 0;
    reload = 0;
    recoil = 0;
    if (sound) play('weapon_switch');
  }

  function startReload() {
    const item = gear[active];
    if (!rigsReady || reload || draw || item.ammo === item.config.magazine || !item.reserve) return;
    reload = item.config.reload;
    play(item.config.reloadSound);
  }

  function solidsAt(point) {
    return controls.blocked(point.x, point.z) || point.y <= controls.sampleGround(point.x, point.z);
  }

  function trace(start, direction, range, testTargets) {
    traceRay.set(start, direction);
    let distance = range;
    let target;
    if (testTargets) {
      for (const entry of targets) {
        if (!entry.mesh.visible) continue;
        targetSphere.center.copy(entry.mesh.position);
        const point = traceRay.intersectSphere(targetSphere, temp);
        if (!point) continue;
        const hit = point.distanceTo(start);
        if (hit < distance) {
          distance = hit;
          target = entry;
        }
      }
    }
    const steps = Math.ceil(distance / 0.19);
    for (let i = 1; i <= steps; i++) {
      const along = Math.min(distance, i * 0.19);
      probe.copy(start).addScaledVector(direction, along);
      if (solidsAt(probe)) return { distance: along, wall: true };
    }
    return { distance, target };
  }

  function prepareTargets() {
    const { x, z, yaw } = controls.pose;
    const center = new Vector3(x, controls.pose.y + 1.36, z);
    const direction = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const lateral = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const candidate = new Vector3();
    const ray = new Vector3();
    const muzzleStart = center.clone().addScaledVector(lateral, 0.25).addScaledVector(direction, 0.68);
    function clearFrom(start) {
      ray.copy(candidate).sub(start);
      const length = ray.length();
      return !trace(start, ray.normalize(), length, false).wall;
    }
    for (const distance of [7.5, 12, 17]) {
      for (const side of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
        candidate.copy(center).addScaledVector(direction, distance).addScaledVector(lateral, side);
        candidate.y = controls.sampleGround(candidate.x, candidate.z) + 1.67;
        if (solidsAt(candidate) || !clearFrom(camera.position) || !clearFrom(muzzleStart)) continue;
        const mesh = new Mesh(targetGeometry, targetMaterial);
        mesh.name = 'Training target';
        mesh.position.copy(candidate);
        mesh.rotation.y = yaw;
        scene.add(mesh);
        targets.push({ mesh, health: 100, reset: 0 });
        break;
      }
    }
    worldReady = true;
  }

  function poseWeapon(item, motion, delta) {
    const { config, group } = item;
    camera.getWorldDirection(view);
    const sight = trace(camera.position, view, config.range, true);
    sightOnTarget = Boolean(sight.target);
    aimPoint.copy(camera.position).addScaledVector(view, sight.distance);
    if (sight.target) aimPoint.addScaledVector(view, 0.025);
    origin.set(motion.x, motion.y + 1.24, motion.z);
    const cos = Math.cos(motion.yaw);
    const sin = Math.sin(motion.yaw);
    const low = motion.sprinting ? 0.19 : 0;
    const lower = low + draw * 0.4 + (reload ? 0.11 : 0);
    rightGoal.set(motion.x + cos * 0.2 - sin * 0.23, motion.y + 1.28 - lower,
      motion.z - sin * 0.2 - cos * 0.23);
    // Account for the muzzle offset so its axis intersects the crosshair ray.
    temp.copy(aimPoint);
    for (let i = 0; i < 2; i++) {
      lookMatrix.lookAt(rightGoal, temp, UP);
      orientation.setFromRotationMatrix(lookMatrix);
      temp.copy(item.muzzleOffset).applyQuaternion(orientation).add(rightGoal);
    }
    lookMatrix.lookAt(temp, aimPoint, UP);
    orientation.setFromRotationMatrix(lookMatrix);
    if (motion.sprinting || reload || draw) {
      wrist.setFromAxisAngle(RIGHT, -lower);
      orientation.multiply(wrist);
    }
    wrist.copy(orientation).multiply(localWrist);
    reach(arms[0], rightGoal, wrist, 0.8);
    arms[0].socket.getWorldQuaternion(worldRotation).invert();
    group.quaternion.copy(worldRotation).multiply(orientation);
    group.position.set(...config.right).negate().applyQuaternion(group.quaternion);
    temp.set(...config.left);
    group.localToWorld(leftGoal.copy(temp));
    if (reload) leftGoal.y -= 0.22 * Math.sin(Math.PI * reload / config.reload);
    wrist.copy(orientation).multiply(localWrist);
    reach(arms[1], leftGoal, wrist, 0.8);
    muzzle.set(...config.muzzle);
    group.localToWorld(muzzle);
    blockedShot = solidsAt(muzzle);
    view.copy(muzzle).sub(origin);
    const reachDistance = view.length();
    if (!blockedShot && reachDistance > 0.01) {
      blockedShot = Boolean(trace(origin, view.normalize(), reachDistance, false).wall);
    }
    item.slide.position.copy(item.slideRest);
    if (config.auto) item.slide.position.x -= recoil * 0.04;
    else item.slide.position.z += recoil * 0.04;
    item.mag.position.copy(item.magRest);
    if (reload) item.mag.position.y -= 0.16 * Math.sin(Math.PI * reload / config.reload);
    // The two arms, attached gear and any moving parts share the world shadow.
    if (delta && (motion.planarSpeed || recoil || reload || draw || motion.yaw !== priorYaw || motion.pitch !== priorPitch)) {
      renderer.shadowMap.needsUpdate = true;
    }
    priorYaw = motion.yaw;
    priorPitch = motion.pitch;
  }

  function fire(item) {
    const { config } = item;
    if (!item.ammo || blockedShot) {
      if (pressed) play('dry_fire');
      return;
    }
    item.ammo--;
    shots++;
    cooldown = 1 / config.rate;
    recoil = 1;
    animation.fire();
    controls.kick(config.auto ? 0.012 : 0.021);
    play(config.fire);
    flash.position.copy(muzzle);
    flash.quaternion.copy(orientation);
    flash.visible = true;
    flashTime = 0.055;
    view.copy(aimPoint).sub(muzzle).normalize();
    const hit = trace(muzzle, view, config.range, true);
    lastImpact = hit.target ? 'target' : hit.wall ? 'wall' : 'none';
    if (hit.target) {
      const falloff = MathUtils.clamp((hit.distance - config.effective) / (config.range - config.effective), 0, 1);
      hit.target.health -= config.damage * MathUtils.lerp(1, config.falloff, falloff);
      hits++;
      if (hit.target.health <= 0) {
        hit.target.mesh.visible = false;
        hit.target.reset = 2.5;
      }
    }
    if (hit.wall || hit.target) {
      const effect = sparks[impactCursor++ % sparks.length];
      effect.life = 0.24;
      effect.mesh.position.copy(muzzle).addScaledVector(view, hit.distance);
      effect.mesh.scale.setScalar(0.07);
      effect.mesh.visible = true;
      if (hit.wall) play('impact_stone');
    }
  }

  function update(delta) {
    if (!worldReady) return;
    if (modelsReady && !rigsReady) attach();
    if (!rigsReady || !controls.active) {
      trigger = pressed = false;
      return;
    }
    const motion = controls.pose;
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.mapping === 'standard');
    const buttons = pad?.buttons.map(button => button.pressed) ?? [];
    const edge = index => buttons[index] && !previousPad[index];
    if (edge(14)) equip((active + gear.length - 1) % gear.length);
    if (edge(15) || edge(5)) equip((active + 1) % gear.length);
    if (edge(2)) startReload();
    if (edge(7)) pressed = true;
    previousPad = buttons;
    const item = gear[active];
    if (reload) {
      reload = Math.max(0, reload - delta);
      if (!reload) {
        const count = Math.min(item.reserve, item.config.magazine - item.ammo);
        item.ammo += count;
        item.reserve -= count;
      }
    }
    draw = Math.max(0, draw - delta);
    cooldown = Math.max(0, cooldown - delta);
    recoil = recoil > 0.005 ? MathUtils.damp(recoil, 0, 23, delta) : 0;
    flashTime = Math.max(0, flashTime - delta);
    flash.visible = flashTime > 0;
    for (const effect of sparks) {
      if (!effect.life) continue;
      effect.life = Math.max(0, effect.life - delta);
      effect.mesh.scale.setScalar(effect.life * 0.31);
      effect.mesh.visible = effect.life > 0;
    }
    for (const target of targets) {
      if (!target.reset) continue;
      target.reset = Math.max(0, target.reset - delta);
      if (!target.reset) {
        target.health = 100;
        target.mesh.visible = true;
      }
    }
    animation.apply(player.root, motion, !item.config.auto, delta);
    poseWeapon(item, motion, delta);
    const firing = pressed || (item.config.auto && (trigger || buttons[7]));
    if (reload || motion.sprinting) pressed = false;
    else if (firing && !cooldown && !draw) {
      fire(item);
      pressed = false;
    }
    reticle.classList.toggle('obstructed', blockedShot);
    reticle.classList.toggle('on-target', sightOnTarget && !blockedShot);
    const label = item.config.name + '  ' + item.ammo + ' / ' + item.reserve + (reload ? ' · Reloading' : '');
    if (hudText !== label) hud.textContent = hudText = label;
  }

  function fireDown(event) {
    if (!controls.active || event.button !== 0) return;
    trigger = pressed = true;
  }
  function fireUp() {
    trigger = false;
  }
  canvas.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse') fireDown(event); });
  const touchFire = document.querySelector('#fire');
  touchFire.addEventListener('pointerdown', event => {
    touchFire.setPointerCapture(event.pointerId);
    fireDown(event);
  });
  touchFire.addEventListener('lostpointercapture', fireUp);
  window.addEventListener('pointerup', event => { if (event.button === 0) fireUp(); });
  window.addEventListener('pointercancel', fireUp);
  window.addEventListener('blur', fireUp);
  document.querySelector('#reload').addEventListener('click', startReload);
  document.querySelector('#swap').addEventListener('click', () => equip((active + 1) % gear.length));
  document.addEventListener('keydown', event => {
    if (!controls.active || event.repeat) return;
    if (event.code === 'KeyR') startReload();
    const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
    if (index >= 0) equip(index);
  });

  return {
    update, prepareTargets,
    get armed() { return rigsReady; },
    get state() {
      return {
        ready: rigsReady, active, shots, hits, blockedShot, sightOnTarget, lastImpact,
        ammo: gear.map(item => [item.ammo, item.reserve]),
        targets: targets.map(item => item.health),
      };
    },
  };
}
