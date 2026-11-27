import {
  Box3, BoxGeometry, Color, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Quaternion, Ray, Sphere, SphereGeometry, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createArmedAnimation } from './armed-animation.js';
import { UPGRADES } from './machine-config.js';
import { withUpgradeCamo } from './upgrade-camo.js';
import { solveLimb } from './rig-limb.js';
import { DRAW_SECONDS, HOLSTER_SECONDS, HANDLING, envelope, magazineOffset } from './weapon-motion.js';

const WEAPON_ASSETS = new URL('../public/weapons/', import.meta.url);
const MACHINE_ASSETS = new URL('../public/machines/', import.meta.url);
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

const handTarget = new Vector3(), elbow = new Vector3();
const LEFT_WRIST = new Quaternion().setFromAxisAngle(LOCAL_FORWARD, -Math.PI / 2);

function reach(arm, goal, wrist, yaw, side) {
  handTarget.copy(arm.socket.position).applyQuaternion(wrist).negate().add(goal);
  elbow.set(Math.cos(yaw) * side * 0.68, -1, -Math.sin(yaw) * side * 0.68);
  solveLimb(arm.upper, arm.forearm, arm.hand, handTarget, elbow, wrist);
}

export function createCombat({ scene, renderer, camera, controls, player, canvas, survival }) {
  const hud = document.querySelector('#weapon-hud');
  const reticle = document.querySelector('#reticle');
  const arms = [];
  const loader = new GLTFLoader();
  const animation = createArmedAnimation();
  const gear = WEAPONS.map(config => ({
    config, handling: HANDLING[config.id], ammo: config.magazine, reserve: config.reserve, group: new Group(), upgraded: false,
    muzzleOffset: new Vector3(...config.muzzle).sub(new Vector3(...config.right)),
    supportOffset: new Vector3(...HANDLING[config.id].grip).sub(new Vector3(...config.right)),
  }));
  const audio = new Map();
  for (const name of [...WEAPONS.flatMap(w => [w.fire, w.reloadSound, w.fire + '_upgraded']), 'dry_fire', 'weapon_switch', 'impact_stone']) {
    const voices = Array.from({ length: name.includes('_fire') ? 4 : 1 }, () => {
      const node = new Audio(new URL(name + '.wav', name.endsWith('_upgraded') ? MACHINE_ASSETS : WEAPON_ASSETS).href);
      node.preload = 'none';
      node.volume = name.includes('_fire') ? 0.25 : 0.32;
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
      item.magGrab = new Box3().setFromObject(item.mag).getCenter(new Vector3());
      item.mag.worldToLocal(item.magGrab);
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

  let machineBusy = false;
  let outgoing = null;
  let aimWeight = 0;
  let sprintWeight = 0;
  const magOffset = new Vector3();
  const magGrip = new Vector3();
  const gripWorld = new Vector3();
  const aimForward = new Vector3();
  const supportReach = new Vector3();
  const shoulderWorld = new Vector3();
  const reloadSupport = new Vector3();

  const upgradeClock = { value: 0 };

  function stat(item, key) {
    return item.config[key] * (item.upgraded ? UPGRADES[item.config.id][key] : 1);
  }

  function displayName(item) {
    return item.upgraded ? UPGRADES[item.config.id].name : item.config.name;
  }

  function refill(item) {
    item.ammo = Math.round(stat(item, 'magazine'));
    item.reserve = Math.round(stat(item, 'reserve'));
  }

  function present(item) {
    arms[0].socket.add(item.group);
    for (const entry of gear) {
      entry.group.visible = entry === item || (entry.config.auto ? !gear.some(other =>
        other !== entry && other !== item && other.config.auto && gear.indexOf(other) < gear.indexOf(entry)) : true);
    }
  }

  function finishHolster() {
    if (!outgoing) return;
    holster(outgoing);
    outgoing = null;
    present(gear[active]);
  }

  function equip(index, sound = true) {
    if (survival?.dead || machineBusy || !rigsReady || (sound && active === index)) return;
    const previous = outgoing ?? gear[active];
    if (gear[active] !== previous) holster(gear[active]);
    outgoing = sound && previous !== gear[index] ? previous : null;
    active = index;
    renderer.shadowMap.needsUpdate = true;
    present(outgoing ?? gear[active]);
    draw = sound ? DRAW_SECONDS : 0;
    reload = 0;
    recoil = 0;
    if (sound) play('weapon_switch');
  }

  function startReload() {
    const item = gear[active];
    if (survival?.dead || machineBusy || !rigsReady || reload || draw || item.ammo === Math.round(stat(item, 'magazine')) || !item.reserve) return;
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
    const enemy = testTargets ? survival?.trace(traceRay, distance) : null;
    if (enemy) distance = enemy.distance;
    const steps = Math.ceil(distance / 0.19);
    for (let i = 1; i <= steps; i++) {
      const along = Math.min(distance, i * 0.19);
      probe.copy(start).addScaledVector(direction, along);
      if (solidsAt(probe)) return { distance: along, wall: true };
    }
    return { distance, target: enemy ? undefined : target, enemy };
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

  function alignFrom(item, grip, tilt) {
    temp.copy(aimForward);
    for (let i = 0; i < 2; i++) {
      lookMatrix.lookAt(grip, temp, UP);
      orientation.setFromRotationMatrix(lookMatrix);
      temp.copy(item.muzzleOffset).applyQuaternion(orientation).add(grip);
    }
    lookMatrix.lookAt(temp, aimForward, UP);
    orientation.setFromRotationMatrix(lookMatrix);
    if (tilt) orientation.multiply(wrist.setFromAxisAngle(RIGHT, tilt));
  }

  function poseWeapon(item, motion, delta) {
    const { config, group, handling } = item;
    camera.getWorldDirection(view);
    const sight = trace(camera.position, view, config.range, true);
    sightOnTarget = Boolean(sight.target || sight.enemy);
    aimPoint.copy(camera.position).addScaledVector(view, sight.distance);
    if (sight.target || sight.enemy) aimPoint.addScaledVector(view, 0.025);
    origin.set(motion.x, motion.y + 1.24, motion.z);
    const cos = Math.cos(motion.yaw);
    const sin = Math.sin(motion.yaw);
    aimWeight = MathUtils.damp(aimWeight, Number(motion.aiming), 15, delta);
    sprintWeight = MathUtils.damp(sprintWeight, Number(motion.sprinting), 18, delta);
    const progress = draw ? DRAW_SECONDS - draw : DRAW_SECONDS;
    const stow = outgoing ? MathUtils.smoothstep(progress, 0, HOLSTER_SECONDS)
      : 1 - MathUtils.smoothstep(progress, HOLSTER_SECONDS, DRAW_SECONDS);
    const phase = reload ? 1 - reload / config.reload : 0;
    const reloadHold = envelope(phase, 0, 0.17, 0.78, 1);
    const lower = sprintWeight * handling.lower + stow * 0.27 - reloadHold * (config.auto ? 0.115 : 0.022);
    const retreat = recoil * handling.recoil + stow * 0.10;
    const reachForward = handling.forward + aimWeight * handling.aimForward - retreat;
    const side = handling.side + stow * (config.auto ? 0.09 : 0.12) - reloadHold * (config.auto ? 0.035 : 0);
    rightGoal.set(motion.x + cos * side - sin * reachForward,
      motion.y + handling.height + aimWeight * handling.aimHeight - lower,
      motion.z - sin * side - cos * reachForward);
    aimForward.copy(aimPoint);

    const tilt = motion.sprinting || reload || draw
      ? -(stow * 0.65 + reloadHold * 0.10 + sprintWeight * 0.28) : 0;
    magazineOffset(handling.magazine, phase, magOffset);
    item.mag.position.copy(item.magRest).add(magOffset);
    const leftRelease = reload ? envelope(phase, 0.04, handling.magazine[0][0],
      handling.magazine.at(-1)[0], 0.98) : 0;
    alignFrom(item, rightGoal, tilt);
    if (!draw) {
      wrist.copy(orientation).multiply(LEFT_WRIST);
      supportReach.copy(item.supportOffset);
      if (leftRelease > 0) {
        reloadSupport.copy(item.magGrab);
        item.mag.localToWorld(reloadSupport);
        group.worldToLocal(reloadSupport);
        reloadSupport.sub(temp.set(...config.right));
        supportReach.lerp(reloadSupport, leftRelease);
      }
      supportReach.applyQuaternion(orientation).add(rightGoal);
      supportReach.sub(handTarget.copy(arms[1].socket.position).applyQuaternion(wrist));
      arms[1].upper.getWorldPosition(shoulderWorld);
      supportReach.sub(shoulderWorld);
      const extension = supportReach.length();
      if (extension > 0.258) {
        rightGoal.addScaledVector(supportReach, -Math.min(0.13, extension - 0.258) / extension);
        alignFrom(item, rightGoal, tilt);
      }
    }
    wrist.copy(orientation).multiply(localWrist);
    reach(arms[0], rightGoal, wrist, motion.yaw, 1);
    arms[0].socket.getWorldPosition(gripWorld);
    // Aim from the actual socket after the reach clamp, so barrel alignment
    // remains consistent even when the right arm reaches its limit.
    alignFrom(item, gripWorld, tilt);
    arms[0].socket.getWorldQuaternion(worldRotation).invert();
    group.quaternion.copy(worldRotation).multiply(orientation);
    group.position.set(...config.right).negate().applyQuaternion(group.quaternion);
    leftGoal.fromArray(handling.grip);
    group.localToWorld(leftGoal);
    if (leftRelease > 0) {
      magGrip.copy(item.magGrab);
      item.mag.localToWorld(magGrip);
      leftGoal.lerp(magGrip, leftRelease);
    }
    wrist.copy(orientation).multiply(LEFT_WRIST);
    reach(arms[1], leftGoal, wrist, motion.yaw, -1);
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
    cooldown = 1 / stat(item, 'rate');
    recoil = 1;
    animation.fire();
    controls.kick(config.auto ? 0.012 : 0.021);
    play(config.fire + (item.upgraded ? '_upgraded' : ''));
    flash.position.copy(muzzle);
    flash.quaternion.copy(orientation);
    flash.visible = true;
    flashTime = 0.055;
    view.copy(aimPoint).sub(muzzle).normalize();
    const hit = trace(muzzle, view, config.range, true);
    lastImpact = hit.enemy ? hit.enemy.part : hit.target ? 'target' : hit.wall ? 'wall' : 'none';
    if (hit.target || hit.enemy) {
      const falloff = MathUtils.clamp((hit.distance - config.effective) / (config.range - config.effective), 0, 1);
      const damage = stat(item, 'damage') * MathUtils.lerp(1, config.falloff, falloff);
      if (hit.enemy) survival.hit(hit.enemy, damage, config.id);
      else {
        hit.target.health -= damage;
        if (hit.target.health <= 0) {
          hit.target.mesh.visible = false;
          hit.target.reset = 2.5;
        }
      }
      hits++;
    }
    if (hit.wall || hit.target || hit.enemy) {
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
    if (survival?.dead || !rigsReady || !controls.active) {
      trigger = pressed = false;
      return;
    }
    upgradeClock.value += delta;
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
        const count = Math.min(item.reserve, Math.round(stat(item, 'magazine')) - item.ammo);
        item.ammo += count;
        item.reserve -= count;
      }
    }
    draw = Math.max(0, draw - delta);
    if (outgoing && DRAW_SECONDS - draw >= HOLSTER_SECONDS) finishHolster();
    cooldown = Math.max(0, cooldown - delta);
    recoil = recoil > 0.005 ? MathUtils.damp(recoil, 0, item.handling.recovery, delta) : 0;
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
    if (!machineBusy) {
      const visible = outgoing ?? item;
      animation.apply(player.root, motion, !visible.config.auto, delta, aimWeight);
      poseWeapon(visible, motion, delta);
    }
    const firing = pressed || (item.config.auto && (trigger || buttons[7]));
    if (machineBusy || reload || motion.sprinting) pressed = false;
    else if (firing && !cooldown && !draw) {
      fire(item);
      pressed = false;
    }
    reticle.classList.toggle('obstructed', blockedShot);
    reticle.classList.toggle('on-target', sightOnTarget && !blockedShot);
    const label = displayName(item) + '  ' + item.ammo + ' / ' + item.reserve + (reload ? ' · Reloading' : '');
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
    get ready() { return rigsReady; },
    get armed() { return rigsReady && !machineBusy; },
    get currentWeapon() {
      const item = gear[active];
      return rigsReady ? { id: item.config.id, name: displayName(item), upgraded: item.upgraded } : null;
    },
    weaponDisplay(id) {
      return gear.find(item => item.config.id === id)?.model?.clone(true);
    },
    weaponName(id) {
      return gear.find(item => item.config.id === id)?.config.name ?? id;
    },
    awardWeapon(id) {
      const index = gear.findIndex(item => item.config.id === id);
      if (index < 0 || !rigsReady || machineBusy) return false;
      refill(gear[index]);
      equip(index);
      return true;
    },
    setMachineBusy(busy) {
      finishHolster();
      machineBusy = busy;
      trigger = pressed = false;
      reload = 0;
      gear[active].group.visible = !busy;
      renderer.shadowMap.needsUpdate = true;
    },
    upgradeWeapon(id) {
      const item = gear[active];
      if (!rigsReady || !machineBusy || item.config.id !== id || item.upgraded) return false;
      item.upgraded = true;
      refill(item);
      const tint = new Color().setRGB(...UPGRADES[id].tint);
      item.model.traverse(node => {
        if (!node.isMesh) return;
        const tintMaterial = material => withUpgradeCamo(material, tint, upgradeClock);
        node.material = Array.isArray(node.material) ? node.material.map(tintMaterial) : tintMaterial(node.material);
      });
      return true;
    },
    get state() {
      return {
        ready: rigsReady, active, shots, hits, blockedShot, sightOnTarget, lastImpact,
        animation: { drawing: draw > 0, reloading: reload > 0, displayed: (outgoing ?? gear[active]).config.id },
        upgrades: gear.map(item => item.upgraded),
        ammo: gear.map(item => [item.ammo, item.reserve]),
        targets: targets.map(item => item.health),
      };
    },
  };
}
