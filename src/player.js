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

// The cowgirl is drawn on this layer. The first-person camera leaves it off so
// the mesh cannot sit inside the lens. The third-person debug view turns it on.
export const CHARACTER_LAYER = 1;

const MODEL_URL = new URL('../public/models/cowgirl.glb', import.meta.url);
const CLIP_NAMES = ['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'land'];
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

export function createPlayer({ scene, renderer, sun }) {
  const root = new Group();
  root.name = 'Player';
  scene.add(root);

  const sockets = {};
  const pose = { clip: 'idle' };
  let mixer;
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
      object.layers.set(CHARACTER_LAYER);
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
    if (sun) sun.shadow.camera.layers.enable(CHARACTER_LAYER);
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
    next.enabled = true;
    next.reset().setEffectiveWeight(1).play();
    if (fade > 0) {
      next.fadeIn(fade);
      if (current && actions[current]) actions[current].fadeOut(fade);
    } else if (current && actions[current]) {
      actions[current].stop();
    }
    current = name;
    pose.clip = name;
  }

  function update(delta, motion) {
    const label = document.querySelector('#gait');
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
    const targetFacing = (motion.aiming || !moving ? motion.yaw : travelFacing) + Math.PI;
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
    if (native && motion.planarSpeed > 0.2) {
      actions[desired].setEffectiveTimeScale(MathUtils.clamp(motion.planarSpeed / native, 0.75, 1.7));
    } else if (actions[desired]) {
      actions[desired].setEffectiveTimeScale(1);
    }
    mixer.update(delta);

    const movingNow = motion.planarSpeed > 0.05 || !motion.grounded;
    if (movingNow || wasMoving) renderer.shadowMap.needsUpdate = true;
    wasMoving = movingNow;
    if (label && !label.hidden) {
      label.textContent = `${pose.clip}  ${motion.planarSpeed.toFixed(1)} m/s`;
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
