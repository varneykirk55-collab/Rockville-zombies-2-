import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createControllerInput, PAD } from '../src/controller-input.js';

let axes = [0, 0, 0, 0];
let buttons = [];
let connected = false;

Object.defineProperty(globalThis.navigator, 'getGamepads', {
  configurable: true,
  value: () => connected ? [{ connected, mapping: 'standard', axes, buttons }] : [],
});

function init(touch = true) {
  connected = false;
  axes = [0, 0, 0, 0];
  buttons = Array.from({ length: 17 }, () => ({ pressed: false }));
  return createControllerInput(() => {}, touch);
}

test('virtual holds, independent axes and a short tap are consumed together', () => {
  const input = init();
  input.setContacts(4);
  input.setStick(0, 0.35, -0.7);
  input.setStick(2, -0.65, 0.15);
  input.setButton(PAD.LT, true);
  input.setButton(PAD.RT, true);
  input.setButton(PAD.X, true);
  input.setButton(PAD.X, false);
  input.update();
  assert.equal(input.axis(0), 0.35);
  assert.equal(input.axis(3), 0.15);
  assert(input.isDown(PAD.LT) && input.isDown(PAD.RT));
  assert(input.justPressed(PAD.X) && !input.isDown(PAD.X));

  input.setStick(0, 0, 0);
  input.cancelButton(PAD.LT);
  input.update();
  assert.equal(input.axis(0), 0);
  assert.equal(input.axis(3), 0.15);
  assert(!input.isDown(PAD.LT) && input.isDown(PAD.RT) && !input.justPressed(PAD.X));
});

test('cancel, pause and focus loss discard all pending virtual actions', () => {
  const input = init();
  input.setButton(PAD.A, true);
  input.cancelButton(PAD.A);
  input.update();
  assert.equal(input.justPressed(PAD.A), false);
  assert.equal(input.justCanceled(PAD.A), true);
  input.setButton(PAD.RT, true);
  input.setStick(2, 0.8, -0.9);
  input.clear();
  input.update();
  assert.equal(input.axis(2), 0);
  assert(!input.isDown(PAD.RT) && !input.justPressed(PAD.RT));
});

test('physical control and virtual control do not consume duplicate button edges', () => {
  const input = init(false);
  connected = true;
  axes[0] = 0.5;
  buttons[PAD.RB].pressed = true;
  input.update();
  assert.equal(input.source, 'physical');
  assert(input.justPressed(PAD.RB));
  assert(Math.abs(input.axis(0) - (0.5 - 0.16) / 0.84) < 1e-8);
  input.update();
  assert.equal(input.justPressed(PAD.RB), false);

  input.showTouch();
  input.setButton(PAD.RB, true);
  input.setButton(PAD.RB, false);
  input.update();
  assert.equal(input.source, 'virtual');
  assert(input.justPressed(PAD.RB));
  input.update();
  assert.equal(input.source, 'virtual');
  assert.equal(input.justPressed(PAD.RB), false);
  buttons[PAD.RB].pressed = false;
  axes[0] = 0;
  input.update();
  buttons[PAD.Y].pressed = true;
  input.update();
  assert.equal(input.source, 'physical');
  assert(input.justPressed(PAD.Y));
});


test('physical Menu can resume while a stick is held after pause', () => {
  const input = init(false);
  connected = true;
  axes[0] = 0.6;
  buttons[PAD.MENU].pressed = true;
  buttons[PAD.RT].pressed = true;
  input.update();
  assert(input.justPressed(PAD.MENU));
  input.clear();
  input.update();
  assert(!input.justPressed(PAD.MENU) && !input.isDown(PAD.RT));
  buttons[PAD.MENU].pressed = false;
  input.update();
  buttons[PAD.MENU].pressed = true;
  input.update();
  assert(input.justPressed(PAD.MENU));
  assert(input.axis(0) > 0);
  assert(!input.isDown(PAD.RT));
});
