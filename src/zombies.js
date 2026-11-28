import {
  AnimationMixer, BufferGeometry, Frustum, LoopOnce, LoopRepeat, MathUtils, Matrix4, Sphere, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { moveGrounded } from './camera.js';
import { createZombieNavigation, pathClear } from './zombie-navigation.js';
import { SURVIVAL as config, healthForRound, zombiesForRound } from './zombie-config.js';

const ASSETS = new URL('../public/zombies/', import.meta.url);
const CLIPS = ['Idle', 'Walk', 'Run', 'Attack', 'Bite', 'Hit', 'Death', 'Scream'];
const LOOPING = new Set(['Idle', 'Walk', 'Run']);
const GROANS = ['zombie_groan_1', 'zombie_groan_2', 'zombie_groan_3', 'zombie_groan_4'];
const ATTACKS = ['zombie_attack_1', 'zombie_attack_2'];
const DEATHS = ['zombie_death_1', 'zombie_death_2'];
const HURTS = ['player_hurt_1', 'player_hurt_2'];
const FAR_MESHES = new Set([0, 4, 5, 6, 7]);
const HIT_REGIONS = [['head', 0, 0.15], ['torso', 1.08, 0.35], ['legs', 0.49, 0.29]];
const pick = list => list[Math.floor(Math.random() * list.length)];
const lerp = (a, b) => MathUtils.lerp(a, b, Math.random());

export function createSurvival({ world, camera, controls, renderer, wallet, graphics, overlay }) {
  const panel = document.querySelector('#survival-hud');
  const banner = document.querySelector('#round-banner');
  const gameOver = document.querySelector('#game-over');
  const restart = document.querySelector('#restart-rounds');
  const loader = new GLTFLoader();
  const pool = [];
  const living = [];
  const corpses = [];
  const frustum = new Frustum();
  const projection = new Matrix4();
  const bounds = new Sphere(new Vector3(), 1.35);
  const hurtSphere = new Sphere(new Vector3(), 0.15);
  const intersect = new Vector3();
  const view = new Vector3();

  const spawnAt = { x: 0, z: 0 };
  const audio = new Map([...GROANS, ...ATTACKS, ...DEATHS, ...HURTS, 'player_death', 'round_start', 'round_end', 'impact_flesh'].map(name =>
    [name, { cursor: 0, voices: Array.from({ length: name.startsWith('zombie_') ? 2 : 1 }, () => {
      const element = new Audio(new URL(name + '.wav', ASSETS).href);
      element.preload = 'none';
      return element;
    }) }]));
  let template;
  let levels;
  let levelMeshes;
  let clips;
  let navigation;
  let longNavigation;
  let needsLongRoute = false;
  let round = 0;
  let pending = 0;
  let phase = 'waiting';
  let spawnIn = 0;
  let breakIn = 0;
  let clock = 0;
  let navIn = 0;
  let shadowIn = 0;
  let hadShadows = false;
  let playerHealth = config.playerHealth;
  let lastDamage = 0;
  let kills = 0;
  let headshots = 0;
  let bannerUntil = 0;
  let padStart = false;
  let hudText = '';
  const metrics = { animation: 0, navigation: 0, frames: 0 };

  function play(name, distance = 0) {
    if (distance > 31) return;
    const entry = audio.get(name);
    const voice = entry.voices[entry.cursor++ % entry.voices.length];
    voice.volume = Math.max(0, 0.44 * (1 - distance / 32));
    voice.currentTime = 0;
    voice.play().catch(() => {});
  }

  async function prepare(inside) {
    const gltf = await loader.loadAsync(ASSETS + 'prisoner.glb');
    template = gltf.scene;
    clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
    for (const name of CLIPS) if (!clips.has(name)) throw new Error('Missing Prisoner clip: ' + name);
    const primitives = gltf.parser.json.meshes[0].primitives;
    const meshes = [];
    template.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
    levels = await Promise.all(meshes.map(async (mesh, index) => {
      const primitive = primitives[gltf.parser.associations.get(mesh)?.primitives ?? index];
      return Promise.all(primitive.extras.rockvilleLods.map(async id => {
        const geometry = new BufferGeometry();
        for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) geometry.setAttribute(name, attribute);
        geometry.setIndex(await gltf.parser.getDependency('accessor', id));
        return geometry;
      }));
    }));
    levelMeshes = meshes.length;
    navigation = createZombieNavigation(controls.blocked, inside);
    longNavigation = createZombieNavigation(controls.blocked, inside, 5.1);
  }

  function makeZombie() {
    const root = clone(template);
    root.name = 'Prisoner Zombie';
    const meshes = [];
    let head;
    root.traverse(object => {
      if (object.isSkinnedMesh) {
        meshes.push(object);
        object.frustumCulled = false;
        object.receiveShadow = true;
      }
      if (object.isBone && object.name.endsWith('Head')) head = object;
    });
    if (meshes.length !== levelMeshes) throw new Error('Prisoner skin clone mismatch');
    // The GLB has one skin across all material primitives. Clone one pose
    // per zombie, then reuse that pose and its bone texture across the draw calls.
    const skeleton = meshes[0].skeleton;
    for (const mesh of meshes) {
      if (mesh.skeleton !== skeleton) mesh.bind(skeleton, mesh.bindMatrix);
    }
    const mixer = new AnimationMixer(root);
    const actions = new Map(CLIPS.map(name => {
      const action = mixer.clipAction(clips.get(name));
      action.setLoop(LOOPING.has(name) ? LoopRepeat : LoopOnce, LOOPING.has(name) ? Infinity : 1);
      action.clampWhenFinished = !LOOPING.has(name);
      return [name, action];
    }));
    root.visible = false;

    return { root, meshes, head, mixer, actions, lod: -1, waypoint: { x: 0, z: 0 } };
  }

  function transition(zombie, clip, fade = 0.15) {
    if (zombie.clip === clip) return;
    const previous = zombie.actions.get(zombie.clip);
    const action = zombie.actions.get(clip);
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (previous) action.crossFadeFrom(previous, fade, false);
    zombie.clip = clip;
  }

  function acquire(x, z) {
    const zombie = pool.pop() ?? makeZombie();
    zombie.mixer.stopAllAction();
    const chance = MathUtils.clamp(config.runnerStep * (round - config.runRound + 1), 0, config.runnerCap);
    const speed = Math.random() < chance ? lerp(config.runMin, config.runMax)
      : round >= config.jogRound && Math.random() < 0.35 ? config.jogSpeed * lerp(0.9, 1.1)
        : lerp(config.walkMin, config.walkMax);
    Object.assign(zombie, {
      health: healthForRound(round), speed, age: 0, clip: '', detected: false, state: 'idle',
      until: 0, attackReady: clock, hitAt: Infinity, corpseUntil: Infinity, stalled: 0,
      animationTime: 0, routeAt: 0, hasRoute: false, nextGroan: clock + lerp(3, 8), motion: 0,
    });
    zombie.root.position.set(x, controls.sampleGround(x, z), z);
    zombie.root.rotation.y = 0;
    transition(zombie, 'Idle');
    world.add(zombie.root);
    living.push(zombie);
    return zombie;
  }

  function release(zombie) {
    zombie.root.visible = false;
    zombie.root.removeFromParent();
    zombie.mixer.stopAllAction();
    pool.push(zombie);
  }

  function showBanner(message, seconds) {
    banner.textContent = message;
    bannerUntil = clock + seconds;
  }

  function startRound() {
    round++;
    phase = 'wave';
    pending = zombiesForRound(round);
    spawnIn = config.firstSpawnDelay;
    showBanner('Round ' + round, 2.5);
    play('round_start');
  }

  function endRound() {
    phase = 'break';
    breakIn = config.intermission;
    wallet.credit(config.roundBonus * round);
    showBanner('Round ' + round + ' cleared', config.intermission);
    play('round_end');
  }

  function spawnZombie() {
    const { x, z } = controls.pose;
    camera.getWorldDirection(view);
    const forward = Math.hypot(view.x, view.z);
    const min = config.minSpawnDistance;
    const max = config.maxSpawnDistance;
    const found = navigation.spawn(x, z, (tx, tz, distance) => {
      if (distance < min || distance > max) return false;
      const front = (tx - camera.position.x) * view.x + (tz - camera.position.z) * view.z;
      const cameraDistance = Math.hypot(tx - camera.position.x, tz - camera.position.z);
      if (front > cameraDistance * forward * 0.40) return false;
      return living.every(zombie => Math.hypot(tx - zombie.root.position.x, tz - zombie.root.position.z) >= 2);
    }, spawnAt);
    if (!found) return false;
    acquire(spawnAt.x, spawnAt.z);
    pending--;
    return true;
  }

  function hurtPlayer() {
    if (phase === 'dead') return;
    playerHealth = Math.max(0, playerHealth - config.attackDamage);
    lastDamage = clock;
    panel.classList.remove('hurt');
    requestAnimationFrame(() => panel.classList.add('hurt'));
    if (playerHealth > 0) {
      play(pick(HURTS));
      return;
    }
    phase = 'dead';
    play('player_death');
    document.exitPointerLock?.();
    controls.freeze(true);
    overlay.hidden = true;
    gameOver.hidden = false;
    document.querySelector('#game-over-summary').textContent =
      'Round ' + round + ' · ' + kills + ' kills · ' + headshots + ' headshot kills';
    restart.focus();
  }

  function updateZombie(zombie, delta) {
    const position = zombie.root.position;
    const { x, y, z } = controls.pose;
    const dx = x - position.x, dz = z - position.z;
    const distance = Math.hypot(dx, dz);
    const clear = () => pathClear(controls.blocked, position.x, position.z, x, z);
    zombie.age += delta;
    if (zombie.nextGroan <= clock && distance < 18) {
      play(pick(GROANS), distance);
      zombie.nextGroan = clock + lerp(6, 12);
    }
    if (!zombie.detected) {
      if ((distance <= config.awareness && clear()) || zombie.age >= 2.25) {
        zombie.detected = true;
        zombie.state = 'scream';
        zombie.until = clock + Math.min(1.15, clips.get('Scream').duration);
        transition(zombie, 'Scream');
        play(pick(GROANS), distance);
      }
      return;
    }
    if (zombie.state === 'attack' && clock >= zombie.hitAt) {
      zombie.hitAt = Infinity;
      if (distance <= config.hitRange && Math.abs(y - position.y) < 1.6 && clear()) hurtPlayer();
    }
    if (clock < zombie.until) return;

    if (distance <= config.attackRange && Math.abs(y - position.y) < 1.6 && clock >= zombie.attackReady && clear()) {
      const clip = Math.random() < config.biteChance ? 'Bite' : 'Attack';
      zombie.root.rotation.y = Math.atan2(dx, dz);
      zombie.state = 'attack';
      zombie.until = clock + config.attackDuration;
      zombie.attackReady = zombie.until + config.attackCooldown;
      zombie.hitAt = clock + config.windup;
      transition(zombie, clip, 0.09);
      zombie.actions.get(clip).setEffectiveTimeScale(clips.get(clip).duration / config.attackDuration);
      play(pick(ATTACKS), distance);
      return;
    }

    const start = performance.now();
    const direct = distance < 13 && clear();
    const waypoint = zombie.waypoint;
    if (!direct && (clock >= zombie.routeAt || (zombie.hasRoute &&
      (position.x - waypoint.x) ** 2 + (position.z - waypoint.z) ** 2 < 0.13))) {
      zombie.hasRoute = navigation.waypoint(position, waypoint, false);
      if (!zombie.hasRoute) {
        needsLongRoute = true;
        zombie.hasRoute = longNavigation.waypoint(position, waypoint);
      }
      zombie.routeAt = clock + 0.1 + (zombie.root.id % 7) * 0.012;
    }
    const route = direct || zombie.hasRoute;
    let tx = direct ? x : waypoint.x, tz = direct ? z : waypoint.z;
    if (route && (!direct || distance > config.attackRange * 0.72)) {
      for (const other of living) {
        if (zombie.stalled > 0.35) break;
        if (other === zombie) continue;
        const sx = position.x - other.root.position.x, sz = position.z - other.root.position.z;
        const squared = sx * sx + sz * sz;
        if (squared < 0.86 * 0.86 && squared > 0.000001) {
          const separation = Math.sqrt(squared);
          const weight = (0.86 - separation) / separation;
          tx += sx * weight;
          tz += sz * weight;
        }
      }
      const mx = tx - position.x, mz = tz - position.z;
      const ratio = Math.min(1, zombie.speed * delta / Math.max(0.001, Math.hypot(mx, mz)));
      const beforeX = position.x, beforeZ = position.z;
      moveGrounded(position, mx * ratio, mz * ratio, controls.blocked);
      if (position.x === beforeX && position.z === beforeZ) zombie.routeAt = Math.min(zombie.routeAt, clock + 0.05);
      position.y = controls.sampleGround(position.x, position.z);
      zombie.motion = Math.hypot(position.x - beforeX, position.z - beforeZ);
      if (zombie.motion > 0.001) {
        const facing = Math.atan2(position.x - beforeX, position.z - beforeZ);
        const offset = Math.atan2(Math.sin(facing - zombie.root.rotation.y), Math.cos(facing - zombie.root.rotation.y));
        zombie.root.rotation.y += offset * Math.min(1, delta * 7);
      }
    } else {
      zombie.motion = 0;
    }
    const clip = zombie.motion < 0.001 ? 'Idle' : zombie.speed >= 2 ? 'Run' : 'Walk';
    zombie.state = 'pursuit';
    transition(zombie, clip);
    if (clip !== 'Idle') zombie.actions.get(clip).setEffectiveTimeScale(
      MathUtils.clamp(zombie.speed / (clip === 'Run' ? 3.75 : 1.35), 0.65, 1.4));
    zombie.stalled = zombie.motion > 0.005 || distance < 2.5 ? 0 : zombie.stalled + delta;
    metrics.navigation += performance.now() - start;
  }

  function renderZombie(zombie, delta, allowShadow) {
    const start = performance.now();
    const position = zombie.root.position;
    const distance = camera.position.distanceTo(position);
    bounds.center.copy(position);
    bounds.center.y += 0.82;
    const visible = distance < 118 && frustum.intersectsSphere(bounds);
    zombie.root.visible = visible;
    zombie.animationTime += delta;
    const interval = !visible ? 0.25 : distance < 18 ? 0 : distance < 36 ? 0.077 : 0.16;
    if (zombie.animationTime >= interval) {
      zombie.mixer.update(zombie.animationTime);
      zombie.animationTime = 0;
    }
    const quality = graphics();
    const lod = distance < quality.near ? 0 : distance < quality.mid ? 1 : 2;
    if (lod !== zombie.lod) {
      zombie.meshes.forEach((mesh, id) => {
        mesh.geometry = levels[id][lod];
        mesh.visible = lod < 2 || FAR_MESHES.has(id);
      });
      zombie.lod = lod;
    }
    const casts = visible && allowShadow && distance < 15;
    zombie.meshes.forEach((mesh, index) => { mesh.castShadow = casts && (index === 0 || index === 5); });
    metrics.animation += performance.now() - start;
    return casts;
  }

  function trace(ray, maxDistance) {
    let best = null;
    let distance = maxDistance;
    for (const zombie of living) {
      const position = zombie.root.position;
      hurtSphere.center.set(position.x, position.y + 0.95, position.z);
      if (ray.distanceSqToPoint(hurtSphere.center) > 1.25) continue;
      if (zombie.head) {
        zombie.head.updateWorldMatrix(true, false);
        hurtSphere.center.set(0, 0.11, 0.02).applyMatrix4(zombie.head.matrixWorld);
      } else hurtSphere.center.set(position.x, position.y + 1.68, position.z);
      for (const [part, height, radius] of HIT_REGIONS) {
        if (part !== 'head') hurtSphere.center.set(position.x, position.y + height, position.z);
        hurtSphere.radius = radius;
        if (!ray.intersectSphere(hurtSphere, intersect)) continue;
        const d = ray.origin.distanceTo(intersect);
        // The broad torso sphere can overlap the neck. Preserve the nearer head hit.
        if (d < distance) {
          best = { zombie, part, distance: d };
          distance = d;
        }
      }
    }
    return best;
  }

  function hit(result, damage, weapon) {
    const { zombie, part } = result;
    if (phase === 'dead' || zombie.health <= 0) return false;
    const head = part === 'head';
    zombie.health -= damage * (head ? config.headshot[weapon] : 1);
    wallet.credit(config.pointsHit);
    play('impact_flesh', camera.position.distanceTo(zombie.root.position));
    zombie.detected = true;
    if (zombie.health <= 0) {
      living.splice(living.indexOf(zombie), 1);
      if (corpses.length >= config.maxCorpses) release(corpses.shift());
      corpses.push(zombie);
      kills++;
      if (head) headshots++;
      wallet.credit(head ? config.pointsHeadKill : config.pointsKill);
      zombie.corpseUntil = clock + Math.max(config.corpseSeconds, clips.get('Death').duration);
      transition(zombie, 'Death', 0.12);
      play(pick(DEATHS), camera.position.distanceTo(zombie.root.position));
    } else if (zombie.state !== 'attack' && (damage >= healthForRound(round) * 0.2 || Math.random() < 0.35)) {
      zombie.state = 'hit';
      zombie.until = clock + Math.min(0.68, clips.get('Hit').duration);
      transition(zombie, 'Hit', 0.07);
    }
    return true;
  }

  function update(delta, armed) {
    if (phase === 'dead') {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find(gamepad => gamepad?.mapping === 'standard');
      const pressed = Boolean(pad?.buttons[0]?.pressed || pad?.buttons[9]?.pressed);
      if (pressed && !padStart) location.reload();
      padStart = pressed;
      return;
    }
    if (!navigation || !controls.active || !armed) return;
    clock += delta;
    metrics.frames++;
    if (phase === 'waiting') startRound();
    if (phase === 'break' && (breakIn -= delta) <= 0) startRound();
    if ((navIn -= delta) <= 0) {
      const start = performance.now();
      navigation.update(controls.pose.x, controls.pose.z);
      if (needsLongRoute) {
        longNavigation.update(controls.pose.x, controls.pose.z);
        needsLongRoute = false;
      }
      metrics.navigation += performance.now() - start;
      navIn = 0.32;
    }
    if (phase === 'wave' && pending > 0 && living.length < config.maxActive && (spawnIn -= delta) <= 0) {
      spawnIn = spawnZombie()
        ? Math.max(config.spawnFloor, config.spawnStart * config.spawnDecay ** (round - 1)) * lerp(0.7, 1.3) : 0.35;
    }
    if (clock - lastDamage >= config.regenDelay) playerHealth = Math.min(config.playerHealth, playerHealth + config.regenRate * delta);
    for (let i = living.length - 1; i >= 0 && phase !== 'dead'; i--) {
      updateZombie(living[i], delta);
    }
    if (phase === 'wave' && pending === 0 && living.length === 0) endRound();
    for (let i = corpses.length - 1; i >= 0; i--) {
      if (corpses[i].corpseUntil <= clock) release(corpses.splice(i, 1)[0]);
    }
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let shadows = 0;
    for (const zombie of living) if (renderZombie(zombie, delta, shadows < 3)) shadows++;
    for (const zombie of corpses) renderZombie(zombie, delta, false);
    shadowIn -= delta;
    if ((shadows || hadShadows) && shadowIn <= 0) {
      renderer.shadowMap.needsUpdate = true;
      shadowIn = 0.1;
      hadShadows = Boolean(shadows);
    }
    if (clock > bannerUntil) banner.textContent = '';
    const text = 'Round ' + round + '  ·  Health ' + Math.ceil(playerHealth) + '  ·  Zombies ' + (pending + living.length);
    if (hudText !== text) panel.textContent = hudText = text;
  }

  restart.addEventListener('click', () => location.reload());
  addEventListener('keydown', event => {
    if (phase === 'dead' && !event.repeat && (event.code === 'Enter' || event.code === 'KeyR')) location.reload();
  });
  return {
    prepare, update, hit, trace,
    get dead() { return phase === 'dead'; },
    get state() {
      return { round, phase, pending, alive: living.length, corpses: corpses.length, pooled: pool.length,
        health: playerHealth, kills, headshots, clips: clips ? [...clips.keys()] : [], ...metrics };
    },
  };
}
