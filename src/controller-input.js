export const PAD = Object.freeze({
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9,
  L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
});

const bit = button => 1 << button;
const zero = Object.freeze([0, 0, 0, 0]);
const DEAD_ZONE = 0.16;
const physicalAxis = value => Math.abs(value) > DEAD_ZONE
  ? Math.sign(value) * (Math.abs(value) - DEAD_ZONE) / (1 - DEAD_ZONE) : 0;

export function createControllerInput(onSource, touch = matchMedia('(pointer: coarse)').matches) {
  let source = touch ? 'virtual' : 'desktop';
  let axes = zero;
  const virtualAxes = [0, 0, 0, 0];
  let virtualButtons = 0;
  let virtualEdges = 0;
  let virtualCancels = 0;
  let lastPhysical = 0;
  let blockedPhysicalButtons = 0;
  let ignorePhysical = false;
  let held = 0;
  let pressed = 0;
  let canceled = 0;
  let physicalAxes = zero;
  let virtualContacts = 0;
  let settings = { horizontal: 1, vertical: 1, aimMultiplier: 0.48 };

  function choose(next) {
    if (source === next) return;
    source = next;
    onSource(source);
  }

  function update() {
    let connected;
    try {
      const list = navigator.getGamepads?.();
      connected = list && Array.prototype.find.call(list, pad => pad?.connected !== false && pad?.mapping === 'standard');
    } catch {
      // Embedded browser policies can deny gamepad access.
    }
    let mask = 0;
    if (connected) {
      physicalAxes = connected.axes;
      for (let i = 0; i < connected.buttons.length && i < 16; i++) {
        if (connected.buttons[i].pressed) mask |= bit(i);
      }
    } else {
      physicalAxes = zero;
    }
    blockedPhysicalButtons &= mask;
    const physicalMoved = physicalAxes.some(value => Math.abs(value) > DEAD_ZONE);
    if (!mask && !physicalMoved) ignorePhysical = false;
    if (!ignorePhysical && (mask || physicalMoved) && !virtualContacts && !virtualEdges) choose('physical');
    if (source === 'physical' && !connected) choose(touch ? 'virtual' : 'desktop');

    canceled = source === 'virtual' ? virtualCancels : 0;
    if (source === 'virtual') {
      axes = virtualAxes;
      held = virtualButtons;
      pressed = virtualEdges;
    } else if (source === 'physical' && !ignorePhysical) {
      axes = physicalAxes;
      held = mask & ~blockedPhysicalButtons;
      pressed = held & ~lastPhysical;
    } else {
      axes = zero;
      held = pressed = 0;
    }
    lastPhysical = mask;
    virtualEdges = virtualCancels = 0;
  }

  function clearVirtual() {
    virtualAxes.fill(0);
    virtualButtons = virtualEdges = virtualCancels = virtualContacts = 0;
    if (source === 'virtual') held = pressed = canceled = 0;
  }

  return {
    update, clearVirtual,
    clear() {
      clearVirtual();
      axes = zero;
      held = pressed = canceled = 0;
      blockedPhysicalButtons |= lastPhysical;
    },
    showTouch() {
      if (source === 'physical') ignorePhysical = true;
      touch = true;
      choose('virtual');
    },
    useDesktop() { if (source === 'virtual' && !virtualContacts) choose('desktop'); },
    setContacts(count) { virtualContacts = count; },
    setStick(index, x, y) {
      virtualAxes[index] = x;
      virtualAxes[index + 1] = y;
    },
    setButton(index, down) {
      const flag = bit(index);
      if (down) {
        if (!(virtualButtons & flag)) virtualEdges |= flag;
        virtualButtons |= flag;
        virtualCancels &= ~flag;
      } else {
        virtualButtons &= ~flag;
      }
    },
    cancelButton(index) {
      const flag = bit(index);
      virtualCancels |= flag;
      virtualEdges &= ~flag;
      virtualButtons &= ~flag;
    },
    setSettings(next) { settings = next; },
    axis(index) {
      const value = axes[index] ?? 0;
      return source === 'physical' ? physicalAxis(value) : value;
    },
    isDown(index) { return Boolean(held & bit(index)); },
    justPressed(index) { return Boolean(pressed & bit(index)); },
    justCanceled(index) { return Boolean(canceled & bit(index)); },
    get source() { return source; },
    get settings() { return settings; },
    get supportsTouch() { return touch; },
  };
}
