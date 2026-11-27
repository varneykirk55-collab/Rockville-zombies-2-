import {
  AudioListener, AudioLoader, Box3, Group, MathUtils, PointLight, PositionalAudio, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBuildingCollision } from './camera.js';
import { ROAD_CENTERLINES, DOWNTOWN } from './config.js';
import { lonLatToWorld } from './utils.js';
import { BOX_POOL, ECONOMY } from './machine-config.js';

const ASSETS = new URL('../public/machines/', import.meta.url);
const CYCLE = 3.4;
const OFFER = 9;
const PROCESS = 3.2;
const ROAD_SEGMENTS = ROAD_CENTERLINES.flatMap(([width, coordinates]) => {
  const points = coordinates.map(([lon, lat]) => lonLatToWorld(lon, lat));
  return points.slice(1).map((end, index) => ({ width, start: points[index], end }));
});

function roadClear(x, z, radius) {
  return ROAD_SEGMENTS.every(({ width, start, end }) => {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = dx * dx + dz * dz;
    const t = length ? MathUtils.clamp(((x - start.x) * dx + (z - start.z) * dz) / length, 0, 1) : 0;
    return Math.hypot(x - start.x - t * dx, z - start.z - t * dz) > width + 3.5 + radius;
  });
}

function chooseSite(blocked, sampleGround, insidePlayable, bounds, prior) {
  const spawn = lonLatToWorld(DOWNTOWN.longitude, DOWNTOWN.latitude);
  const clearance = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x),
    Math.abs(bounds.min.z), Math.abs(bounds.max.z)) + 1.45;
  for (let distance = 9; distance <= 45; distance += 2) {
    for (let index = 0; index < 24; index++) {
      const angle = (index + 0.5) * Math.PI / 12;
      const x = spawn.x + 14.5 + distance * Math.cos(angle);
      const z = spawn.z + 2.45 + distance * Math.sin(angle);
      if (!insidePlayable(x, z) || !roadClear(x, z, clearance) || blocked(x, z)
          || (prior && Math.hypot(x - prior.x, z - prior.z) < 6)) continue;
      const y = sampleGround(x, z);
      const pads = Array.from({ length: 12 }, (_, step) => ({
        x: x + Math.cos(step * Math.PI / 6) * clearance,
        z: z + Math.sin(step * Math.PI / 6) * clearance,
      }));
      if (pads.some(p => blocked(p.x, p.z) || !insidePlayable(p.x, p.z)
        || Math.abs(sampleGround(p.x, p.z) - y) > 0.45)) continue;
      return new Vector3(x, y - bounds.min.y, z);
    }
  }
  throw new Error('No unobstructed site found for a training machine.');
}

function weightedReward(random) {
  const eligible = BOX_POOL.filter(entry => entry.weight > 0);
  let ticket = random() * eligible.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of eligible) {
    ticket -= entry.weight;
    if (ticket < 0) return entry.id;
  }
  return eligible.at(-1).id;
}

function backOut(t) {
  return 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
}

function bounceOut(t) {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t - 1.5 / 2.75) ** 2 + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t - 2.25 / 2.75) ** 2 + 0.9375;
  return 7.5625 * (t - 2.625 / 2.75) ** 2 + 0.984375;
}

export function createMachines({ world, camera, renderer, controls, combat, wallet, testing = false, available = () => true }) {
  const points = document.querySelector('#points-hud');
  const prompt = document.querySelector('#machine-prompt');
  const touch = document.querySelector('#interact');
  const hint = document.querySelector('#machine-hint');
  const loader = new GLTFLoader();
  const audioLoader = new AudioLoader();
  const listener = new AudioListener();
  camera.add(listener);
  const buffers = new Map();
  const sounds = ['box_open', 'box_close', 'box_reveal', 'pap_work', 'pap_done', 'deny'];
  for (const name of sounds) {
    audioLoader.load(new URL(name + '.wav', ASSETS).href,
      buffer => buffers.set(name, buffer), undefined, error => console.error('Machine audio failed:', name, error));
  }
  const scenic = [new Group(), new Group()];
  const states = ['idle', 'idle'];
  let timer = 0;
  let swapTimer = 0;
  let spin = 0.4;
  let flash = 0;
  let returnTime = 0;
  let selected;
  let upgradeId;
  let display;
  let clock = 0;
  let padPressed = false;
  let notice = '';
  let noticeTimer = 0;
  let ready = false;
  const displays = new Map();

  function sound(index, name) {
    const buffer = buffers.get(name);
    if (!buffer) return;
    const node = scenic[index].userData.audio;
    if (node.isPlaying) node.stop();
    node.setBuffer(buffer);
    node.play();
  }

  async function place(polygons, sampleGround, insidePlayable) {
    const [box, pack] = await Promise.all(['mystery_box_new.glb', 'pack_a_punch_new.glb'].map(
      file => loader.loadAsync(new URL(file, ASSETS).href)));
    const blocked = createBuildingCollision(polygons);
    for (const [index, gltf] of [box, pack].entries()) {
      const group = scenic[index];
      group.name = index ? 'Pack-a-Punch' : 'Mystery Box';
      const model = gltf.scene;
      group.add(model);
      model.traverse(node => { if (node.isMesh) node.castShadow = node.receiveShadow = true; });
      const bounds = new Box3().setFromObject(model);
      group.position.copy(chooseSite(blocked, sampleGround, insidePlayable, bounds, index ? scenic[0].position : null));
      const light = new PointLight(index ? 0xff8026 : 0xffb34d, index ? 1.5 : 1.8, index ? 7 : 8);
      light.position.set(0, index ? 1.2 : 1.4, index ? 1.2 : 0.6);
      group.add(light);
      const audio = new PositionalAudio(listener);
      audio.setRefDistance(3);
      audio.position.copy(light.position);
      group.add(audio);
      group.userData = { model, light, audio };
      world.add(group);
      const { x, z } = group.position;
      polygons.push({ outer: [
        { x: x + bounds.min.x, z: z + bounds.min.z }, { x: x + bounds.max.x, z: z + bounds.min.z },
        { x: x + bounds.max.x, z: z + bounds.max.z }, { x: x + bounds.min.x, z: z + bounds.max.z },
      ], holes: [] });
    }
    ready = true;
  }

  function notify(text) {
    notice = text;
    noticeTimer = 2.4;
  }

  function clearDisplay() {
    display?.removeFromParent();
    display = null;
  }

  function showDisplay(id, index) {
    clearDisplay();
    const key = index + ':' + id;
    if (!displays.has(key)) {
      const weapon = combat.weaponDisplay(id);
      if (!weapon) return;
      const pivot = new Group();
      pivot.add(weapon);
      displays.set(key, pivot);
    }
    display = displays.get(key);
    display.scale.setScalar(index ? 0.8 : 2.2);
    display.position.set(0, 0, 0);
    display.rotation.set(0, Math.PI / 2, 0);
    const anchor = scenic[index].userData.model.getObjectByName(index ? 'WeaponSlot' : 'WeaponAnchor');
    anchor.add(display);
  }

  function nearest() {
    if (!available() || !ready || !combat.currentWeapon || !controls.active) return -1;
    const { x, z } = controls.pose;
    const distance = scenic.map(group => Math.hypot(x - group.position.x, z - group.position.z));
    const index = distance[0] <= distance[1] ? 0 : 1;
    return distance[index] <= (index ? 3 : 2.8) ? index : -1;
  }

  function closeBox() {
    states[0] = 'closing';
    timer = 0.5;
    clearDisplay();
    sound(0, 'box_close');
  }

  function interact() {
    const index = nearest();
    if (index < 0) return;
    if (listener.context.state === 'suspended') listener.context.resume().catch(() => {});
    if (index === 0 && states[0] === 'offering') {
      if (combat.awardWeapon(selected)) {
        notify(combat.weaponName(selected) + ' collected');
        closeBox();
      }
      return;
    }
    if (index === 1 && states[1] === 'offering') {
      combat.setMachineBusy(false);
      clearDisplay();
      states[1] = 'idle';
      notify(combat.currentWeapon.name + ' collected');
      return;
    }
    if (states.some(state => state !== 'idle')) return;
    if (index === 0) {
      if (!wallet.spend(ECONOMY.box)) {
        sound(0, 'deny');
        return notify('You need 950 points');
      }
      selected = weightedReward(Math.random);
      timer = CYCLE;
      swapTimer = 0;
      states[0] = 'cycling';
      sound(0, 'box_open');
      return;
    }
    if (combat.currentWeapon.upgraded || wallet.points < ECONOMY.pack) {
      sound(1, 'deny');
      return notify(combat.currentWeapon.upgraded ? 'This weapon is already upgraded' : 'You need 5,000 points');
    }
    upgradeId = combat.currentWeapon.id;
    combat.setMachineBusy(true);
    showDisplay(upgradeId, 1);
    timer = PROCESS;
    states[1] = 'working';
    sound(1, 'pap_work');
  }

  function update(delta) {
    if (!ready || !controls.active) return;
    const index = nearest();
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(gamepad => gamepad?.mapping === 'standard');
    const pressed = Boolean(pad?.buttons[3]?.pressed);
    if (pressed && !padPressed) interact();
    padPressed = pressed;
    clock += delta;
    noticeTimer = Math.max(0, noticeTimer - delta);
    const box = scenic[0].userData;
    const pack = scenic[1].userData;
    const lid = box.model.getObjectByName('Lid');
    if (states[0] === 'cycling') {
      timer -= delta;
      swapTimer -= delta;
      const progress = MathUtils.clamp(1 - timer / CYCLE, 0, 1);
      const opening = Math.min((CYCLE - timer) / 0.6, 1);
      lid.rotation.x = -MathUtils.degToRad(105) * backOut(opening);
      box.light.intensity = MathUtils.lerp(1.8, 4, opening);
      if (swapTimer <= 0) {
        swapTimer = MathUtils.lerp(0.08, 0.38, progress ** 2);
        showDisplay(BOX_POOL[Math.floor(Math.random() * BOX_POOL.length)].id, 0);
      }
      if (display) {
        display.position.y = progress * 0.45;
        display.rotation.y += delta * 2.5;
      }
      if (timer <= 0) {
        showDisplay(selected, 0);
        states[0] = 'offering';
        timer = OFFER;
        sound(0, 'box_reveal');
      }
      renderer.shadowMap.needsUpdate = true;
    } else if (states[0] === 'offering') {
      timer -= delta;
      if (display) {
        display.position.y = 0.45 * MathUtils.clamp(timer / 3, 0, 1);
        display.rotation.y = Math.PI / 2 + Math.sin(clock * 2) * 0.4;
      }
      if (timer <= 0) closeBox();
    } else if (states[0] === 'closing') {
      timer = Math.max(0, timer - delta);
      const progress = 1 - timer / 0.5;
      lid.rotation.x = -MathUtils.degToRad(105) * (1 - bounceOut(progress));
      box.light.intensity = MathUtils.lerp(4, 1.8, progress);
      if (timer === 0) states[0] = 'idle';
      renderer.shadowMap.needsUpdate = true;
    }

    spin = MathUtils.lerp(spin, states[1] === 'working' ? 6 : 0.4, Math.min(delta * 2, 1));
    pack.model.getObjectByName('Disc').rotateZ(-delta * spin);
    pack.model.getObjectByName('GearL').rotateX(delta * spin);
    pack.model.getObjectByName('GearR').rotateX(-delta * spin * 1.3);
    if (states[1] === 'working') {
      timer -= delta;
      pack.light.intensity = 3 + Math.sin(clock * 30) * 1.5;
      if (display) display.position.z = MathUtils.lerp(0.38, -0.24, MathUtils.clamp((PROCESS - timer) / 0.55, 0, 1));
      if (timer <= 0) {
        const paid = wallet.spend(ECONOMY.pack);
        if (paid && combat.upgradeWeapon(upgradeId)) {
          displays.delete('1:' + upgradeId);
          showDisplay(upgradeId, 1);
          states[1] = 'offering';
          returnTime = 0;
          if (display) display.position.z = -0.24;
          flash = 0.68;
          sound(1, 'pap_done');
        } else {
          if (paid) wallet.credit(ECONOMY.pack);
          combat.setMachineBusy(false);
          clearDisplay();
          states[1] = 'idle';
          notify('Upgrade could not be completed');
        }
        pack.light.intensity = 1.5;
      }
      renderer.shadowMap.needsUpdate = true;
    }
    if (states[1] === 'offering' && display) {
      returnTime = Math.min(1, returnTime + delta / 0.45);
      display.position.z = MathUtils.lerp(-0.24, 0.42, MathUtils.smoothstep(returnTime, 0, 1));
    }
    if (flash > 0) {
      flash = Math.max(0, flash - delta);
      pack.light.intensity = flash > 0.60 ? MathUtils.lerp(1.5, 12, (0.68 - flash) / 0.08)
        : MathUtils.lerp(1.5, 12, flash / 0.60);
    }
    points.textContent = wallet.points.toLocaleString('en-US') + ' points';
    if (index < 0) {
      prompt.textContent = noticeTimer ? notice : '';
      touch.hidden = true;
      const { x, z } = controls.pose;
      const meters = group => Math.ceil(Math.hypot(x - group.position.x, z - group.position.z));
      hint.textContent = 'Training machines near spawn · Mystery Box ' + meters(scenic[0]) +
        ' m · Pack-a-Punch ' + meters(scenic[1]) + ' m';
      return;
    }
    hint.textContent = '';
    const status = states[index];
    const label = index ? 'Pack-a-Punch · 5,000 points' : 'Mystery Box · 950 points';
    let action = status === 'offering'
      ? 'Collect ' + (index ? combat.currentWeapon.name : combat.weaponName(selected)) : label;
    if (status === 'idle' && index === 1 && combat.currentWeapon.upgraded) action = 'Weapon already upgraded';
    else if (status === 'idle' && wallet.points < (index ? ECONOMY.pack : ECONOMY.box)) action += ' · Insufficient points';
    if (status !== 'idle' && status !== 'offering') action = index ? 'Upgrading weapon…' : 'Mystery Box in use…';
    if (status === 'idle' && states[1 - index] !== 'idle') action = 'Finish the other machine transaction';
    prompt.textContent = noticeTimer ? notice : action + (status === 'idle' || status === 'offering' ? ' · E / Y' : '');
    touch.hidden = status !== 'idle' && status !== 'offering';
  }

  addEventListener('keydown', event => {
    if (!available() || event.repeat || !controls.active) return;
    if (event.code === 'KeyE') interact();
    if (testing && event.code === 'KeyP') wallet.credit(5000);
  });
  touch.addEventListener('click', interact);
  return {
    place, update,
    get state() {
      return {
        ready, points: wallet.points, box: states[0], pack: states[1], selected,
        sites: scenic.map(group => group.position.toArray()),
      };
    },
  };
}
