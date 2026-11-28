import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { PAD } from './controller-input.js';
import { DOWNTOWN } from './config.js';
import { lonLatToWorld } from './utils.js';

const BODY_RADIUS = 0.36;
const WALK_SPEED = 1.55;
const RUN_SPEED = 4.3;
const SPRINT_SPEED = 6.9;
const AIM_SPEED = 2.5;
const GRAVITY = 22;
const JUMP_SPEED = Math.sqrt(2 * GRAVITY * 1.15);
const CELL_SIZE = 16;
const junction = lonLatToWorld(DOWNTOWN.longitude, DOWNTOWN.latitude);
const start = { x: junction.x + 14.5, z: junction.z + 2.45 };
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
  'KeyC', 'Space']);

const cellKey = (x, z) => x * 1048576 + z;
const EMPTY = [];
const CAMERA_RADIUS = 0.18;

function insideRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function nearRing(x, z, ring, radiusSquared) {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared < 1e-8) continue;
    const t = MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSquared, 0, 1);
    if ((x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2 < radiusSquared) return true;
  }
  return false;
}

export function createBuildingCollision(polygons) {
  const cells = new Map();
  const indexed = new Set();
  for (const polygon of polygons) {
    if (polygon.outer.length < 3) continue;
    const canonical = ring => {
      if (!ring.length) return '';
      const points = ring.map(p => p.x + ',' + p.z);
      const start = points.indexOf(points.reduce((a, b) => a < b ? a : b));
      const forward = points.slice(start).concat(points.slice(0, start));
      const reverse = [forward[0], ...forward.slice(1).reverse()];
      return [forward.join(';'), reverse.join(';')].sort()[0];
    };
    const signature = [canonical(polygon.outer), ...polygon.holes.map(canonical).sort(), polygon.minY, polygon.maxY].join('|');
    if (indexed.has(signature)) continue;
    indexed.add(signature);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const { x, z } of polygon.outer) {
      minX = Math.min(x, minX);
      maxX = Math.max(x, maxX);
      minZ = Math.min(z, minZ);
      maxZ = Math.max(z, maxZ);
    }
    const body = { ...polygon, minX, maxX, minZ, maxZ };
    for (let x = Math.floor((minX - BODY_RADIUS) / CELL_SIZE);
      x <= Math.floor((maxX + BODY_RADIUS) / CELL_SIZE); x++) {
      for (let z = Math.floor((minZ - BODY_RADIUS) / CELL_SIZE);
        z <= Math.floor((maxZ + BODY_RADIUS) / CELL_SIZE); z++) {
        const key = cellKey(x, z);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(body);
      }
    }
  }

  return (x, z, radius = BODY_RADIUS, y) => {
    const bodies = cells.get(cellKey(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE))) ?? EMPTY;
    const radiusSquared = radius * radius;
    for (const body of bodies) {
      if (body.minY !== undefined && !(y >= body.minY && y <= body.maxY)) continue;
      if (body.minY === undefined && body.maxY !== undefined && y > body.maxY) continue;
      if (x < body.minX - radius || x > body.maxX + radius ||
          z < body.minZ - radius || z > body.maxZ + radius) continue;
      if (body.box) {
        const dx = Math.max(body.minX - x, 0, x - body.maxX);
        const dz = Math.max(body.minZ - z, 0, z - body.maxZ);
        if ((dx === 0 && dz === 0) || dx * dx + dz * dz < radiusSquared) return true;
        continue;
      }
      if (insideRing(x, z, body.outer)) {
        let inHole = false;
        for (const ring of body.holes) {
          if (!insideRing(x, z, ring)) continue;
          inHole = true;
          if (nearRing(x, z, ring, radiusSquared)) return true;
        }
        if (!inHole) return true;
      }
      if (nearRing(x, z, body.outer, radiusSquared)) return true;
    }
    return false;
  };
}

export function moveGrounded(position, dx, dz, blocked) {
  // Substeps keep a frame spike from tunneling through narrow footprint edges.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
  const sx = dx / steps, sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    const { x, z } = position;
    if (!blocked(x + sx, z + sz)) {
      position.x += sx;
      position.z += sz;
    } else {
      if (Math.abs(sx) >= Math.abs(sz)) {
        if (sx && !blocked(x + sx, z)) position.x += sx;
        if (sz && !blocked(position.x, z + sz)) position.z += sz;
      } else {
        if (sz && !blocked(x, z + sz)) position.z += sz;
        if (sx && !blocked(x + sx, position.z)) position.x += sx;
      }
    }
  }
}

function safeSpawn(blocked) {
  if (!blocked(start.x, start.z)) return start;
  for (let radius = 1; radius <= 35; radius++) {
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const x = start.x + Math.cos(angle) * radius;
      const z = start.z + Math.sin(angle) * radius;
      if (!blocked(x, z)) return { x, z };
    }
  }
  throw new Error('No clear ground near the downtown spawn.');
}

export function createCamera(canvas, { input, onActivity, canTogglePause }) {
  const camera = new PerspectiveCamera(58, 1, 0.07, 920);
  camera.rotation.order = 'YXZ';
  const overlay = document.querySelector('#start-panel');
  const startButton = document.querySelector('#start');
  const hud = document.querySelector('#hud');
  const help = document.querySelector('#control-help');
  const keys = new Set();
  let blocked = () => false;
  let sampleGround = () => 0;
  let frozen = false;
  let ready = false;
  let active = false;
  let locked = false;
  let lockSettlesAt = 0;
  let dragMouse = false;
  let aimHeld = false;
  let yaw = Math.PI / 2 + 0.13;
  let pitch = -0.055;
  let velocityX = 0, velocityZ = 0;
  let verticalVelocity = 0;
  let grounded = true;
  let coyote = 0;
  let jumpHeld = false;
  let shoulder = 1;
  let shoulderOffset = 0.7;
  let followY;
  let boomFraction = 1;
  let zoom = 0;
  let recoilPitch = 0;
  const pivot = new Vector3();
  const offset = new Vector3();
  const probe = new Vector3();
  let scripted = null;
  const body = { x: 0, y: 0, z: 0 };
  const pose = {
    x: 0, y: 0, z: 0, yaw, pitch,
    velocityX: 0, velocityZ: 0, planarSpeed: 0, verticalSpeed: 0,
    grounded: true, sprinting: false, aiming: false, walking: false,
    jumped: false,
  };

  function resetInputs() {
    keys.clear();
    velocityX = velocityZ = 0;
    aimHeld = jumpHeld = false;
    input.clear();
  }

  function setActive(value) {
    active = value;
    overlay.hidden = value;
    hud.hidden = !value;
    if (!value) {
      resetInputs();
      startButton.textContent = 'Resume';
    }
    onActivity(value);
  }

  function look(dx, dy, sensitivity) {
    const scale = aimHeld ? sensitivity * 0.53 : sensitivity;
    yaw -= dx * scale;
    pitch = MathUtils.clamp(pitch - dy * scale, -1.41, 1.41);
  }

  startButton.addEventListener('click', () => {
    if (!blocked) return;
    setActive(true);
    if (input.supportsTouch && input.source !== 'desktop') return;
    function enableDrag() {
      dragMouse = true;
      help.textContent = 'Drag to look · WASD to move · Hold C to walk · Shift to sprint · Space to jump';
    }
    if (typeof canvas.requestPointerLock !== 'function') {
      enableDrag();
      return;
    }
    try {
      const lock = canvas.requestPointerLock();
      lock?.catch(enableDrag);
    } catch {
      enableDrag();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    const wasLocked = locked;
    locked = document.pointerLockElement === canvas;
    if (locked) {
      dragMouse = false;
      // Some browsers emit a mouse delta when they recenter the cursor for lock.
      lockSettlesAt = performance.now() + 110;
    }
    if (wasLocked && !locked) setActive(false);
  });
  document.addEventListener('pointerlockerror', () => { dragMouse = true; });
  document.addEventListener('mousemove', (event) => {
    if (active && ((locked && performance.now() >= lockSettlesAt) ||
        (dragMouse && (event.buttons & 1)))) {
      look(event.movementX, event.movementY, 0.0021);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (!active) return;
    if (event.code === 'Escape' && !locked) setActive(false);
    if (event.code === 'KeyQ' && !event.repeat) {
      event.preventDefault();
      switchShoulder();
      return;
    }
    if (!movementKeys.has(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
  });
  document.addEventListener('keyup', event => keys.delete(event.code));
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (active && event.pointerType === 'mouse' && event.button === 2) aimHeld = true;
  });
  window.addEventListener('pointerup', event => {
    if (event.pointerType === 'mouse' && event.button === 2) aimHeld = false;
  });
  window.addEventListener('pointercancel', event => { if (event.pointerType === 'mouse') aimHeld = false; });
  window.addEventListener('blur', resetInputs);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetInputs(); });

  function prepare(polygons, ground) {
    ready = true;
    blocked = createBuildingCollision(polygons);
    if (ground) sampleGround = ground;
    const spawn = safeSpawn(blocked);
    body.x = spawn.x;
    body.y = 0;
    body.z = spawn.z;
    Object.assign(pose, { x: body.x, y: sampleGround(body.x, body.z), z: body.z, yaw, pitch });
    verticalVelocity = 0;
    grounded = true;
    followY = undefined;
    placeCamera(0);
    overlay.hidden = false;
  }

  function freeze(value = true) {
    frozen = value;
  }

  function nudge(seconds) {
    const step = Math.min(Math.max(seconds, 0), 2);
    moveGrounded(body, -Math.sin(yaw) * RUN_SPEED * step, -Math.cos(yaw) * RUN_SPEED * step, blocked);
    pose.x = body.x;
    pose.y = sampleGround(body.x, body.z) + body.y;
    pose.z = body.z;
    placeCamera(0);
  }

  function engage() {
    if (!blocked) return;
    setActive(true);
  }

  function drive(input) {
    scripted = input;
  }

  function kick(amount) {
    pitch = Math.min(1.41, pitch + amount);
    recoilPitch += amount;
  }

  function switchShoulder() {
    shoulder *= -1;
  }

  function placeCamera(delta, aimed = false) {
    const feetY = sampleGround(body.x, body.z) + body.y;
    followY = delta && followY !== undefined ? MathUtils.damp(followY, feetY, 18, delta) : feetY;
    zoom = MathUtils.damp(zoom, Number(aimed), 12, delta);
    shoulderOffset = MathUtils.damp(shoulderOffset, shoulder * (0.71 + zoom * (input.source === 'virtual' ? 0.11 : -0.11)), 14, delta);
    const virtual = input.source === 'virtual';
    const distance = MathUtils.lerp(3.65, virtual ? 3.02 : 2.85, zoom);
    camera.rotation.set(pitch, yaw, 0);
    pivot.set(body.x, Math.max(feetY - 0.23, followY) + MathUtils.lerp(1.45, 1.2, zoom), body.z);
    offset.set(shoulderOffset, 0.23, distance).applyQuaternion(camera.quaternion);

    // Sweep the whole boom so a clear endpoint cannot jump across a wall.
    const steps = Math.ceil(offset.length() / 0.09);
    let limit = 1;
    for (let i = 1; i <= steps; i++) {
      probe.copy(pivot).addScaledVector(offset, i / steps);
      if (blocked(probe.x, probe.z, CAMERA_RADIUS, probe.y) || probe.y < sampleGround(probe.x, probe.z) + 0.2) {
        limit = (i - 1) / steps;
        break;
      }
    }
    boomFraction = limit < boomFraction || !delta ? limit : MathUtils.damp(boomFraction, limit, 10, delta);
    camera.position.copy(pivot).addScaledVector(offset, boomFraction);
    camera.updateMatrixWorld();
  }

  function update(delta) {
    if (frozen) return;
    const baseFov = camera.aspect < 1 ? 67 : 58;
    if (ready && input.justPressed(PAD.MENU) && canTogglePause()) setActive(!active);
    if (active && input.justPressed(PAD.R3)) switchShoulder();

    const virtual = input.source === 'virtual';
    const aimed = active && Boolean(aimHeld || scripted?.aim || input.isDown(PAD.LT));
    if (active) {
      if (virtual) {
        const { horizontal, vertical, aimMultiplier } = input.settings;
        const rate = delta * 2.2 * (aimed ? aimMultiplier : 1);
        look(input.axis(2) * horizontal, input.axis(3) * vertical, rate);
      } else {
        look(input.axis(2), input.axis(3), delta * (aimed ? 1.05 : 2.2));
      }
    }
    let sprinting = false;
    let walking = false;
    let jumped = false;
    if (active) {
      const pressed = (a, b) => Number(keys.has(a) || keys.has(b));
      const side = scripted ? (scripted.side || 0)
        : input.axis(0) + pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft');
      const forward = scripted ? (scripted.forward || 0)
        : -input.axis(1) + pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown');
      const magnitude = Math.max(1, Math.hypot(side, forward));
      const stick = Math.hypot(input.axis(0), input.axis(1));
      walking = scripted ? !!scripted.walk : keys.has('KeyC');
      const keyboard = !scripted && Math.hypot(
        pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft'),
        pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown'),
      ) > 0;
      sprinting = !aimed && !walking && forward > 0.3 &&
        (scripted?.sprint || input.isDown(PAD.L3) || keys.has('ShiftLeft') || keys.has('ShiftRight'));
      const analogWalk = virtual && !scripted && !keyboard && !aimed && !sprinting && stick > 0 && stick < 0.62;
      let chosen = RUN_SPEED;
      if (aimed) chosen = AIM_SPEED;
      else if (sprinting) chosen = SPRINT_SPEED;
      else if (walking) chosen = WALK_SPEED;
      else if (virtual && !scripted && !keyboard && stick > 0) {
        const pace = stick <= 0.62
          ? WALK_SPEED * stick / 0.62
          : MathUtils.lerp(WALK_SPEED, RUN_SPEED, (stick - 0.62) / 0.38);
        chosen = pace / stick;
      }
      walking ||= analogWalk;
      const speed = chosen / magnitude;
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const targetX = (side * cos - forward * sin) * speed;
      const targetZ = (-side * sin - forward * cos) * speed;
      velocityX = MathUtils.damp(velocityX, targetX, 18, delta);
      velocityZ = MathUtils.damp(velocityZ, targetZ, 18, delta);
      const beforeX = body.x, beforeZ = body.z;
      moveGrounded(body, velocityX * delta, velocityZ * delta, blocked);
      const step = Math.hypot(body.x - beforeX, body.z - beforeZ);
      pose.velocityX = step > 0 ? (body.x - beforeX) / Math.max(delta, 0.001) : 0;
      pose.velocityZ = step > 0 ? (body.z - beforeZ) / Math.max(delta, 0.001) : 0;
      pose.planarSpeed = step / Math.max(delta, 0.001);

      const spaceDown = scripted ? !!scripted.jump : keys.has('Space') || input.isDown(PAD.A) || input.justPressed(PAD.A);
      const jumpEdge = spaceDown && !jumpHeld;
      jumpHeld = spaceDown;
      if (grounded) coyote = 0.12;
      else coyote = Math.max(0, coyote - delta);
      if (jumpEdge && (grounded || coyote > 0)) {
        verticalVelocity = JUMP_SPEED;
        grounded = false;
        coyote = 0;
        jumped = true;
      }
      if (!grounded) {
        if (!jumped) verticalVelocity = Math.max(verticalVelocity - GRAVITY * delta, -28);
        body.y += verticalVelocity * delta;
        if (body.y <= 0) {
          body.y = 0;
          verticalVelocity = 0;
          grounded = true;
        }
      }
    } else {
      velocityX = velocityZ = 0;
      pose.velocityX = pose.velocityZ = pose.planarSpeed = 0;
      jumpHeld = false;
    }
    const recovered = MathUtils.damp(recoilPitch, 0, 8, delta);
    pitch = Math.max(-1.41, pitch - (recoilPitch - recovered));
    recoilPitch = recovered;
    placeCamera(delta, aimed);
    const desiredFov = baseFov + (aimed ? (virtual ? -9 : -12) : sprinting ? 5 : 0);
    if (Math.abs(camera.fov - desiredFov) > 0.02) {
      camera.fov = MathUtils.damp(camera.fov, desiredFov, 15, delta);
      camera.updateProjectionMatrix();
    }
    hud.classList.toggle('aimed', aimed);
    pose.x = body.x;
    pose.y = sampleGround(body.x, body.z) + body.y;
    pose.z = body.z;
    pose.yaw = yaw;
    pose.pitch = pitch;
    pose.verticalSpeed = grounded ? 0 : verticalVelocity;
    pose.grounded = grounded;
    pose.sprinting = sprinting;
    pose.aiming = aimed;
    pose.walking = walking;
    pose.jumped = jumped;
  }

  return {
    camera,
    controls: { prepare, update, engage, pause: () => setActive(false), drive, switchShoulder, kick, freeze, nudge, pose, blocked: (x, z, radius, y) => blocked(x, z, radius, y), sampleGround: (x, z) => sampleGround(x, z), get active() { return active; } },
  };
}
