import {
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  PMREMGenerator,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createDirectionalGait } from './directional-gait.js';

const MODEL_URL = new URL('../public/models/cowgirl.glb', import.meta.url);
const CLIP_NAMES = ['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'land'];
const CYCLES = new Set(['walk', 'run', 'sprint']);
const LOOPING = new Set(['idle', 'walk', 'run', 'sprint', 'fall']);
// Ground speeds of the retargeted Mixamo takes, in m/s. Playback rate matches
// the real pace so the feet stay near the distance she actually covers.
const NATIVE_SPEED = { walk: 1.138, run: 2.798, sprint: 5.899 };
const SOCKET_NAMES = ['socket_weapon_r', 'socket_weapon_l', 'socket_holster_r', 'socket_sling'];

const clipForSpeed = (speed, previous) => {
  const sprintAt = previous === 'sprint' ? 4.85 : 5.2;
  const runAt = previous === 'run' || previous === 'sprint' ? 1.7 : 1.95;
  if (speed >= sprintAt) return 'sprint';
  if (speed >= runAt) return 'run';
  if (speed >= 0.28) return 'walk';
  return 'idle';
};

const dampAngle = (current, target, lambda, delta) => {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-lambda * delta));
};

export function createPlayer({ scene, renderer }) {
  const root = new Group();
  root.name = 'Player';
  scene.add(root);

  const sockets = {};
  const pose = { clip: 'idle' };
  let mixer;
  let directionalGait;
  const fading = new Set();
  const gaitFrame = {};
  const label = document.querySelector('#gait');
  let actions;
  let current = '';
  let landTimer = 0;
  let wasGrounded = true;
  let wasMoving = false;
  let facing = 0;
  let ready = false;

  const loader = new GLTFLoader();
  loader.load(MODEL_URL.href, (gltf) => {
    const model = gltf.scene;
    model.name = 'Cowgirl';
    const environment = characterEnvironment(renderer);
    model.traverse((object) => {
      object.frustumCulled = false;
      if (!object.isMesh) return;
      object.castShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.envMap = environment;
        material.envMapIntensity = 0.72;
        material.needsUpdate = true;
      }
    });
    for (const name of SOCKET_NAMES) {
      const bone = model.getObjectByName(name);
      if (bone) sockets[name] = bone;
    }
    root.add(model);

    mixer = new AnimationMixer(model);
    directionalGait = createDirectionalGait(model);
    actions = {};
    for (const name of CLIP_NAMES) {
      const clip = gltf.animations.find((entry) => entry.name === name);
      if (!clip) {
        console.warn(`Cowgirl clip missing: ${name}`);
        continue;
      }
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.clampWhenFinished = true;
      action.setLoop(LOOPING.has(name) ? LoopRepeat : LoopOnce, LOOPING.has(name) ? Infinity : 1);
      actions[name] = action;
    }
    ready = true;
    play('idle', 0);
    renderer.shadowMap.needsUpdate = true;
    const found = Object.keys(sockets);
    console.info(`Cowgirl ready. Sockets: ${found.join(', ') || 'none'}.`);
    if (found.length !== SOCKET_NAMES.length) {
      console.warn('Cowgirl weapon sockets missing:', SOCKET_NAMES.filter((name) => !sockets[name]));
    }
  }, undefined, (error) => {
    console.error('Cowgirl model failed to load:', error);
  });

  function play(name, fade) {
    const next = actions?.[name];
    if (!next || current === name) return;
    const previous = actions[current];
    const phase = CYCLES.has(name) && CYCLES.has(current)
      ? MathUtils.euclideanModulo(previous.time / previous.getClip().duration, 1) : 0;
    fading.delete(next);
    next.reset().setEffectiveWeight(1).play();
    next.time = phase * next.getClip().duration;
    if (fade > 0) {
      next.fadeIn(fade);
      if (previous) {
        previous.setEffectiveWeight(previous.getEffectiveWeight()).fadeOut(fade);
        fading.add(previous);
      }
    } else if (previous) {
      previous.stop();
      fading.delete(previous);
    }
    current = name;
    pose.clip = name;
  }

  function update(delta, motion) {
    if (!ready || !motion) {
      if (label && !label.hidden) label.textContent = 'Cowgirl loading…';
      return;
    }
    // The motor includes the local terrain elevation in the feet position.
    root.position.set(motion.x, motion.y + 0.03, motion.z);
    const moving = Math.hypot(motion.velocityX, motion.velocityZ) > 0.25;
    // Chase camera sits behind the look direction. Her bind faces the camera
    // at yaw 0, so the mesh is turned 180 degrees to run the way she looks.
    const travelFacing = Math.atan2(-motion.velocityX, -motion.velocityZ);
    const forwardSpeed = -motion.velocityX * Math.sin(motion.yaw) - motion.velocityZ * Math.cos(motion.yaw);
    const sideSpeed = motion.velocityX * Math.cos(motion.yaw) - motion.velocityZ * Math.sin(motion.yaw);
    const sideTurn = motion.armed ? MathUtils.clamp(sideSpeed * 0.16, -0.54, 0.54) : 0;
    const targetFacing = (motion.armed || motion.aiming || !moving ? motion.yaw - sideTurn : travelFacing) + Math.PI;
    const priorFacing = facing;
    facing = dampAngle(facing, targetFacing, 12, delta);
    root.rotation.y = facing;

    if (motion.grounded && !wasGrounded) landTimer = 0.24;
    wasGrounded = motion.grounded;
    let desired;
    if (!motion.grounded) {
      desired = motion.verticalSpeed > 0.2 ? 'jump' : 'fall';
    } else if (landTimer > 0) {
      landTimer = Math.max(0, landTimer - delta);
      desired = 'land';
    } else {
      desired = clipForSpeed(motion.planarSpeed, current);
    }
    play(desired, desired === 'jump' || desired === 'land' ? 0.07 : 0.16);
    const native = NATIVE_SPEED[desired];
    const reversed = motion.armed && forwardSpeed < -Math.abs(sideSpeed) * 0.65;
    if (native && motion.planarSpeed > 0.2) {
      const rate = MathUtils.clamp(motion.planarSpeed / native, 0.62, 1.75);
      actions[desired].setEffectiveTimeScale(reversed ? -rate : rate);
    } else if (actions[desired]) {
      actions[desired].setEffectiveTimeScale(1);
    }
    mixer.update(delta);
    for (const action of fading) {
      if (action.getEffectiveWeight() >= 0.003) continue;
      action.stop();
      fading.delete(action);
    }
    Object.assign(gaitFrame, { delta, facing, reversed, ground: motion.grounded && !landTimer,
      forward: motion.armed ? forwardSpeed : motion.planarSpeed, side: motion.armed ? sideSpeed : 0,
      turn: delta > 0 ? (facing - priorFacing) / delta : 0 });
    directionalGait(gaitFrame);

    const movingNow = motion.planarSpeed > 0.05 || !motion.grounded;
    if (movingNow || wasMoving) renderer.shadowMap.needsUpdate = true;
    wasMoving = movingNow;
    if (label && !label.hidden) {
      const text = `${pose.clip}  ${motion.planarSpeed.toFixed(1)} m/s`;
      if (label.textContent !== text) label.textContent = text;
    }
  }

  return { root, sockets, pose, update };
}

function characterEnvironment(renderer) {
  const generator = new PMREMGenerator(renderer);
  const texture = generator.fromScene(new RoomEnvironment(), 0.04).texture;
  generator.dispose();
  return texture;
}
