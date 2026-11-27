import { MathUtils, PerspectiveCamera } from 'three';
import { DOWNTOWN } from './config.js';
import { lonLatToWorld } from './utils.js';
import { CHARACTER_LAYER } from './player.js';

const EYE_HEIGHT = 1.68;
const BODY_RADIUS = 0.36;
const WALK_SPEED = 1.55;
const RUN_SPEED = 4.3;
const SPRINT_SPEED = 6.9;
const AIM_SPEED = 2.5;
const GRAVITY = 22;
const JUMP_SPEED = Math.sqrt(2 * GRAVITY * 1.15);
const CELL_SIZE = 32;
const junction = lonLatToWorld(DOWNTOWN.longitude, DOWNTOWN.latitude);
const start = { x: junction.x + 14.5, z: junction.z + 2.45 };
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
  'KeyC', 'Space']);

const cellKey = (x, z) => `${Math.floor(x / CELL_SIZE)},${Math.floor(z / CELL_SIZE)}`;

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

function nearRing(x, z, ring) {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared < 1e-8) continue;
    const t = MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSquared, 0, 1);
    if ((x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2 < BODY_RADIUS ** 2) return true;
  }
  return false;
}

export function createBuildingCollision(polygons) {
  const cells = new Map();
  for (const polygon of polygons) {
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
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(body);
      }
    }
  }

  return (x, z) => {
    for (const body of cells.get(cellKey(x, z)) ?? []) {
      if (x < body.minX - BODY_RADIUS || x > body.maxX + BODY_RADIUS ||
          z < body.minZ - BODY_RADIUS || z > body.maxZ + BODY_RADIUS) continue;
      if ((insideRing(x, z, body.outer) && !body.holes.some(ring => insideRing(x, z, ring))) ||
          nearRing(x, z, body.outer) || body.holes.some(ring => nearRing(x, z, ring))) return true;
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
      if (!blocked(x + sx, z)) position.x += sx;
      if (!blocked(position.x, z + sz)) position.z += sz;
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

export function createCamera(canvas) {
  const camera = new PerspectiveCamera(58, 1, 0.07, 920);
  camera.rotation.order = 'YXZ';
  const touch = matchMedia('(pointer: coarse)').matches;
  const overlay = document.querySelector('#start-panel');
  const startButton = document.querySelector('#start');
  const hud = document.querySelector('#hud');
  const joystick = document.querySelector('#joystick');
  const stick = document.querySelector('#stick');
  const sprint = document.querySelector('#sprint');
  const aim = document.querySelector('#aim');
  const help = document.querySelector('#control-help');
  const keys = new Set();
  let blocked = () => false;
  let sampleGround = () => 0;
  let frozen = false;
  let active = false;
  let locked = false;
  let lockSettlesAt = 0;
  let dragMouse = false;
  let aimHeld = false;
  let touchAim = false;
  let touchSprint = false;
  let movingPointer = null;
  let lookingPointer = null;
  let padX = 0, padY = 0;
  let lookX = 0, lookY = 0;
  let yaw = Math.PI / 2 + 0.13;
  let pitch = -0.055;
  let velocityX = 0, velocityZ = 0;
  let verticalVelocity = 0;
  let grounded = true;
  let coyote = 0;
  let jumpHeld = false;
  let touchJump = false;
  let thirdPerson = new URLSearchParams(location.search).get('view') === 'third';
  let scripted = null;
  let stride = 0;
  const body = { x: 0, y: 0, z: 0 };
  let bobbed = 0;
  const pose = {
    x: 0, y: 0, z: 0, yaw, pitch,
    velocityX: 0, velocityZ: 0, planarSpeed: 0, verticalSpeed: 0,
    grounded: true, sprinting: false, aiming: false, walking: false,
    thirdPerson, jumped: false,
  };

  document.querySelector('#viewport').classList.toggle('touch-controls', touch);
  help.textContent = touch
    ? 'Left stick to move · Drag to look · Sprint, Jump, or Aim'
    : 'WASD to move · Hold C to walk · Shift to sprint · Space to jump · V toggles the body view · Esc to pause';

  function resetInputs() {
    keys.clear();
    velocityX = velocityZ = padX = padY = 0;
    movingPointer = lookingPointer = null;
    aimHeld = touchAim = touchSprint = touchJump = false;
    jumpHeld = false;
    aim.setAttribute('aria-pressed', 'false');
    sprint.setAttribute('aria-pressed', 'false');
    stick.style.transform = '';
  }

  function setActive(value) {
    active = value;
    overlay.hidden = value;
    hud.hidden = !value;
    if (!value) {
      resetInputs();
      startButton.textContent = 'Resume';
    }
  }

  function look(dx, dy, sensitivity) {
    const scale = (aimHeld || touchAim) ? sensitivity * 0.53 : sensitivity;
    yaw -= dx * scale;
    pitch = MathUtils.clamp(pitch - dy * scale, -1.41, 1.41);
  }

  startButton.addEventListener('click', () => {
    if (!blocked) return;
    setActive(true);
    if (touch) return;
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
    if (event.code === 'KeyV') {
      event.preventDefault();
      thirdPerson = !thirdPerson;
      return;
    }
    if (!movementKeys.has(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
  });
  document.addEventListener('keyup', event => keys.delete(event.code));
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (!active) return;
    if (event.pointerType === 'mouse') {
      if (event.button === 2) aimHeld = true;
      return;
    }
    if (lookingPointer !== null) return;
    lookingPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    lookX = event.clientX;
    lookY = event.clientY;
  });
  window.addEventListener('pointerup', event => {
    if (event.pointerType === 'mouse' && event.button === 2) aimHeld = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!active || event.pointerId !== lookingPointer) return;
    look(event.clientX - lookX, event.clientY - lookY, 0.005);
    lookX = event.clientX;
    lookY = event.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (event) => {
      if (event.pointerId === lookingPointer) lookingPointer = null;
    });
    joystick.addEventListener(type, (event) => {
      if (event.pointerId !== movingPointer) return;
      movingPointer = null;
      padX = padY = 0;
      stick.style.transform = '';
    });
  }

  function movePad(event) {
    const box = joystick.getBoundingClientRect();
    const radius = box.width * 0.32;
    const x = event.clientX - box.left - box.width / 2;
    const y = event.clientY - box.top - box.height / 2;
    const scale = Math.max(radius, Math.hypot(x, y));
    padX = x / scale;
    padY = -y / scale;
    stick.style.transform = `translate(${padX * radius}px, ${-padY * radius}px)`;
  }
  joystick.addEventListener('pointerdown', (event) => {
    if (!active || movingPointer !== null) return;
    movingPointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    movePad(event);
  });
  joystick.addEventListener('pointermove', event => {
    if (event.pointerId === movingPointer) movePad(event);
  });
  sprint.addEventListener('click', () => {
    touchSprint = !touchSprint;
    if (touchSprint) touchAim = false;
    sprint.setAttribute('aria-pressed', String(touchSprint));
    aim.setAttribute('aria-pressed', String(touchAim));
  });
  const jumpButton = document.querySelector('#jump');
  jumpButton.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    event.preventDefault();
    touchJump = true;
  });
  aim.addEventListener('click', () => {
    touchAim = !touchAim;
    if (touchAim) touchSprint = false;
    aim.setAttribute('aria-pressed', String(touchAim));
    sprint.setAttribute('aria-pressed', String(touchSprint));
  });
  window.addEventListener('blur', resetInputs);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetInputs(); });

  function prepare(polygons, ground) {
    blocked = createBuildingCollision(polygons);
    if (ground) sampleGround = ground;
    const spawn = safeSpawn(blocked);
    body.x = spawn.x;
    body.y = 0;
    body.z = spawn.z;
    Object.assign(pose, { x: body.x, y: sampleGround(body.x, body.z), z: body.z, yaw, pitch });
    verticalVelocity = 0;
    grounded = true;
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

  function setThirdPerson(value) {
    thirdPerson = value;
  }

  function placeCamera(bob) {
    const feetY = sampleGround(body.x, body.z) + body.y;
    if (thirdPerson) {
      camera.layers.enable(CHARACTER_LAYER);
      const lookY = feetY + 1.15;
      const camY = feetY + 1.5 - Math.sin(pitch) * 0.85;
      let horiz = Math.max(2.2, 3.55 * Math.cos(Math.min(pitch, 1.1)));
      for (let i = 0; i < 6 && blocked; i++) {
        const cx = body.x + Math.sin(yaw) * horiz;
        const cz = body.z + Math.cos(yaw) * horiz;
        if (!blocked(cx, cz)) break;
        horiz *= 0.72;
      }
      camera.position.set(body.x + Math.sin(yaw) * horiz, camY, body.z + Math.cos(yaw) * horiz);
      camera.position.y = Math.max(camera.position.y, sampleGround(camera.position.x, camera.position.z) + 0.25);
      camera.lookAt(body.x, lookY, body.z);
    } else {
      camera.layers.disable(CHARACTER_LAYER);
      camera.position.set(body.x, feetY + EYE_HEIGHT + bob, body.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, yaw, 0);
    }
  }

  function update(delta) {
    if (frozen) return;
    const baseFov = camera.aspect < 1 ? 67 : 58;
    const aimed = active && (aimHeld || touchAim || scripted?.aim);
    let sprinting = false;
    let walking = false;
    let gait = 0;
    let jumped = false;
    if (active) {
      const pressed = (a, b) => Number(keys.has(a) || keys.has(b));
      const side = scripted ? (scripted.side || 0)
        : padX + pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft');
      const forward = scripted ? (scripted.forward || 0)
        : padY + pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown');
      const magnitude = Math.max(1, Math.hypot(side, forward));
      const stick = Math.hypot(padX, padY);
      walking = scripted ? !!scripted.walk : keys.has('KeyC');
      const keyboard = !scripted && Math.hypot(
        pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft'),
        pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown'),
      ) > 0;
      sprinting = !aimed && !walking && forward > 0.3 &&
        (scripted?.sprint || touchSprint || keys.has('ShiftLeft') || keys.has('ShiftRight'));
      const partialStick = !scripted && !keyboard && !aimed && !sprinting && stick > 0.05 && stick < 0.62;
      let chosen = RUN_SPEED;
      if (aimed) chosen = AIM_SPEED;
      else if (sprinting) chosen = SPRINT_SPEED;
      else if (walking || partialStick) chosen = partialStick ? WALK_SPEED * (stick / 0.62) : WALK_SPEED;
      const speed = chosen / magnitude;
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const targetX = (side * cos - forward * sin) * speed;
      const targetZ = (-side * sin - forward * cos) * speed;
      velocityX = MathUtils.damp(velocityX, targetX, 18, delta);
      velocityZ = MathUtils.damp(velocityZ, targetZ, 18, delta);
      const beforeX = body.x, beforeZ = body.z;
      moveGrounded(body, velocityX * delta, velocityZ * delta, blocked);
      const step = Math.hypot(body.x - beforeX, body.z - beforeZ);
      gait = Math.min(1, step / Math.max(delta * RUN_SPEED, 0.001));
      stride += delta * (sprinting ? 15 : 11);
      pose.velocityX = step > 0 ? (body.x - beforeX) / Math.max(delta, 0.001) : 0;
      pose.velocityZ = step > 0 ? (body.z - beforeZ) / Math.max(delta, 0.001) : 0;
      pose.planarSpeed = step / Math.max(delta, 0.001);

      const spaceDown = scripted ? !!scripted.jump : keys.has('Space') || touchJump;
      const jumpEdge = spaceDown && !jumpHeld;
      jumpHeld = spaceDown;
      touchJump = false;
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
    const bob = Math.sin(stride) * gait * (aimed ? 0.018 : 0.042);
    bobbed = MathUtils.damp(bobbed, thirdPerson ? 0 : bob, 20, delta);
    placeCamera(bobbed);
    if (!thirdPerson) {
      camera.rotation.z = Math.sin(stride * 0.5) * gait * 0.007;
    }
    const desiredFov = baseFov + (aimed ? -18 : sprinting ? 5 : 0);
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
    pose.thirdPerson = thirdPerson;
    pose.jumped = jumped;
  }

  return {
    camera,
    controls: { prepare, update, engage, drive, setThirdPerson, freeze, nudge, pose, get active() { return active; } },
  };
}
