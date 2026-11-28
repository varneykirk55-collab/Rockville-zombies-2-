const STORE = 'rockville-virtual-controller-v1';
const EXTRA = 'rockville-fit-viewport';

const POSITIONS = {
  leftShoulder: [7, 9], rightShoulder: [93, 9],
  leftStick: [10, 71], dpad: [25, 82],
  rightStick: [74, 77], face: [91, 69],
  center: [50, 81],
};

const PORTRAIT = {
  leftShoulder: [12, 54], rightShoulder: [88, 54],
  leftStick: [16, 72], dpad: [31, 88],
  rightStick: [68, 80], face: [85, 72],
  center: [50, 91],
};

const LIMITS = {
  opacity: [0.25, 1], buttonScale: [0.78, 1.25], stickScale: [0.75, 1.3],
  moveDeadZone: [0, 0.45], cameraDeadZone: [0, 0.45],
  horizontal: [0.25, 2.5], vertical: [0.25, 2.5], aimMultiplier: [0.2, 1],
};

const DEFAULTS = {
  opacity: 0.68, buttonScale: 1, stickScale: 1, moveDeadZone: 0.10, cameraDeadZone: 0.14,
  horizontal: 0.82, vertical: 0.68, aimMultiplier: 0.48,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadSettings() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORE)); } catch { /* Private browsing can deny storage. */ }
  const result = { ...DEFAULTS, landscape: {}, portrait: {} };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (Number.isFinite(data?.[key])) result[key] = clamp(data[key], min, max);
  }
  for (const orientation of ['landscape', 'portrait']) {
    for (const key of Object.keys(POSITIONS)) {
      const point = data?.[orientation]?.[key];
      if (Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) {
        result[orientation][key] = point.map(value => clamp(value, 0, 100));
      }
    }
  }
  return result;
}

export function mountVirtualController({ viewport, input, controls }) {
  const overlay = viewport.querySelector('#virtual-controller');
  const panel = viewport.querySelector('#controller-settings');
  const open = viewport.querySelector('#open-controller-settings');
  const fit = viewport.querySelector('#fit-game-view');
  const settingsFit = panel.querySelector('#settings-fit-view');
  const positions = panel.querySelector('#control-position-group');
  const xPosition = panel.querySelector('#control-position-x');
  const yPosition = panel.querySelector('#control-position-y');
  const localViewport = window.visualViewport;
  const elements = Array.from(overlay.querySelectorAll('[data-group]'));
  const sliders = Array.from(panel.querySelectorAll('[data-setting]'));
  const contacts = new Map();
  let settings = loadSettings();
  let previousTap;
  let frame = 0;
  let lastOrientation = orientation();

  function orientation() {
    return viewport.clientWidth >= viewport.clientHeight ? 'landscape' : 'portrait';
  }

  function pointFor(group) {
    const dir = orientation();
    return settings[dir][group] ?? (dir === 'landscape' ? POSITIONS : PORTRAIT)[group];
  }

  function apply() {
    input.setSettings(settings);
    overlay.style.setProperty('--pad-opacity', settings.opacity);
    overlay.style.setProperty('--pad-button-scale', settings.buttonScale);
    overlay.style.setProperty('--pad-stick-scale', settings.stickScale);
    for (const node of elements) {
      const [x, y] = pointFor(node.dataset.group);
      node.style.setProperty('--pad-x', x + '%');
      node.style.setProperty('--pad-y', y + '%');
    }
    for (const slider of sliders) {
      slider.value = settings[slider.dataset.setting];
      slider.nextElementSibling.value = slider.value;
    }
    [xPosition.value, yPosition.value] = pointFor(positions.value);
  }

  function store() {
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* Settings still work for this page. */ }
  }

  function updateStick(contact, x, y) {
    const dx = (x - contact.centerX) / contact.radius;
    const dy = (y - contact.centerY) / contact.radius;
    const distance = Math.hypot(dx, dy);
    const scale = Math.max(1, distance);
    const dead = contact.stick === 0 ? settings.moveDeadZone : settings.cameraDeadZone;
    const gain = distance <= dead ? 0 : (Math.min(1, distance) - dead) / ((1 - dead) * distance);
    contact.thumb.style.transform = 'translate(' + (dx / scale * contact.radius) + 'px,' +
      (dy / scale * contact.radius) + 'px)';
    input.setStick(contact.stick, dx * gain, dy * gain);
  }

  function release(pointerId, canceled = false) {
    const contact = contacts.get(pointerId);
    if (!contact) return;
    contacts.delete(pointerId);
    input.setContacts(contacts.size);
    contact.target.classList.remove('is-held');
    if (contact.thumb) {
      input.setStick(contact.stick, 0, 0);
      contact.thumb.style.transform = '';
    } else if (canceled) {
      input.cancelButton(contact.button);
    } else {
      input.setButton(contact.button, false);
    }
    if (contact.target.hasPointerCapture?.(pointerId)) contact.target.releasePointerCapture(pointerId);
  }

  function reset() {
    for (const id of contacts.keys()) release(id);
    input.clearVirtual();
    previousTap = undefined;
  }

  overlay.addEventListener('pointerdown', event => {
    const target = event.target.closest('[data-pad-button],[data-stick]');
    if (!target || panel.open || event.button !== 0 ||
        (!controls.active && !target.hasAttribute('data-pause-control'))) return;
    for (const contact of contacts.values()) if (contact.target === target) return;
    event.preventDefault();
    const thumb = target.querySelector('.stick-thumb');
    const contact = thumb ? { target, thumb, stick: Number(target.dataset.stick) }
      : { target, button: Number(target.dataset.padButton) };
    if (thumb) {
      const bounds = target.getBoundingClientRect();
      contact.centerX = bounds.left + bounds.width / 2;
      contact.centerY = bounds.top + bounds.height / 2;
      contact.radius = bounds.width * 0.31;
    }
    if (target.setPointerCapture) {
      try { target.setPointerCapture(event.pointerId); } catch { return; }
    }
    contacts.set(event.pointerId, contact);
    input.setContacts(contacts.size);
    input.showTouch();
    target.classList.add('is-held');
    if (thumb) updateStick(contact, event.clientX, event.clientY);
    else input.setButton(contact.button, true);
  });

  overlay.addEventListener('pointermove', event => {
    const contact = contacts.get(event.pointerId);
    if (contact?.thumb) updateStick(contact, event.clientX, event.clientY);
  });
  overlay.addEventListener('pointerup', event => release(event.pointerId));
  overlay.addEventListener('pointercancel', event => release(event.pointerId, true));
  overlay.addEventListener('lostpointercapture', event => release(event.pointerId, true));

  // Keyboard and assistive activation can operate buttons without a pointer.
  overlay.addEventListener('click', event => {
    const target = event.target.closest('[data-pad-button]');
    if (!target || event.detail || panel.open ||
        (!controls.active && !target.hasAttribute('data-pause-control'))) return;
    input.showTouch();
    const button = Number(target.dataset.padButton);
    input.setButton(button, true);
    input.setButton(button, false);
  });

  function gameplaySurface(event) {
    if (!(event.target instanceof Element)) return false;
    return !panel.open && (event.target.closest('#virtual-controller') ||
      (controls.active && event.target.closest('canvas,#hud')));
  }

  for (const name of ['contextmenu','selectstart','dragstart','dblclick','gesturestart','gesturechange','gestureend']) {
    viewport.addEventListener(name, event => {
      if (gameplaySurface(event) && event.cancelable) event.preventDefault();
    }, { passive: false });
  }
  viewport.addEventListener('touchmove', event => {
    if (gameplaySurface(event) && event.cancelable) event.preventDefault();
  }, { passive: false });
  viewport.addEventListener('touchend', event => {
    if (!gameplaySurface(event) || event.touches.length || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const current = { time: event.timeStamp, x: touch.clientX, y: touch.clientY };
    if (previousTap && current.time - previousTap.time < 325 &&
        Math.hypot(current.x - previousTap.x, current.y - previousTap.y) < 28 && event.cancelable) {
      event.preventDefault();
    }
    previousTap = current;
  }, { passive: false });

  function fitViewport() {
    if (!localViewport || !input.supportsTouch) return;
    const zoomed = Math.abs(localViewport.scale - 1) > 0.02 ||
      Math.abs(localViewport.offsetLeft) > 1 || Math.abs(localViewport.offsetTop) > 1;
    viewport.classList.toggle(EXTRA, zoomed);
    fit.hidden = !zoomed;
    if (zoomed) {
      viewport.style.setProperty('--visual-width', localViewport.width + 'px');
      viewport.style.setProperty('--visual-height', localViewport.height + 'px');
      viewport.style.setProperty('--visual-left', localViewport.offsetLeft + 'px');
      viewport.style.setProperty('--visual-top', localViewport.offsetTop + 'px');
      viewport.style.setProperty('--visual-scale', localViewport.scale);
    }
  }

  function refreshViewport() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const next = orientation();
      if (next !== lastOrientation) reset();
      lastOrientation = next;
      fitViewport();
      applyPositions();
    });
  }

  function applyPositions() {
    for (const node of elements) {
      const [x, y] = pointFor(node.dataset.group);
      node.style.setProperty('--pad-x', x + '%');
      node.style.setProperty('--pad-y', y + '%');
    }
    if (panel.open) [xPosition.value, yPosition.value] = pointFor(positions.value);
  }

  function recover() {
    reset();
    window.scrollTo(0, 0);
    fitViewport();
    applyPositions();
    panel.querySelector('#viewport-status').textContent = viewport.classList.contains(EXTRA)
      ? 'The game is fitted to the visible screen. Pinch inward outside gameplay to reset Safari zoom.'
      : 'The game view is fitted to the screen.';
  }

  let resume = false;
  open.addEventListener('click', () => {
    resume = controls.active;
    if (resume) controls.pause();
    reset();
    panel.showModal();
    apply();
  });
  panel.addEventListener('close', () => {
    reset();
    if (resume && !viewport.classList.contains('game-ended')) controls.engage();
    resume = false;
  });
  panel.querySelector('#close-controller-settings').addEventListener('click', () => panel.close());
  panel.querySelector('#use-touch-controller').addEventListener('click', () => input.showTouch());
  panel.querySelector('#restore-controller-defaults').addEventListener('click', () => {
    settings = { ...DEFAULTS, landscape: {}, portrait: {} };
    reset();
    apply();
    store();
  });
  panel.addEventListener('input', event => {
    const key = event.target.dataset.setting;
    if (key) {
      settings[key] = Number(event.target.value);
      apply();
    } else if (event.target === xPosition || event.target === yPosition) {
      settings[orientation()][positions.value] = [Number(xPosition.value), Number(yPosition.value)];
      applyPositions();
    }
  });
  panel.addEventListener('change', event => {
    if (event.target === positions) applyPositions();
    store();
  });
  fit.addEventListener('click', recover);
  settingsFit.addEventListener('click', recover);
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && !panel.open) input.showTouch();
    else if (event.pointerType === 'mouse' && event.target.matches('canvas')) input.useDesktop();
  }, { capture: true });
  window.addEventListener('blur', reset);
  window.addEventListener('pagehide', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  window.addEventListener('resize', refreshViewport);
  window.addEventListener('orientationchange', () => { reset(); refreshViewport(); });
  localViewport?.addEventListener('resize', refreshViewport);
  localViewport?.addEventListener('scroll', refreshViewport);
  apply();
  fitViewport();
  return { reset, get settingsOpen() { return panel.open; } };
}
