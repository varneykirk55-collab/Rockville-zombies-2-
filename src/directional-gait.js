import { MathUtils, Quaternion, Vector3 } from 'three';
import { solveLimb } from './rig-limb.js';

const UP = new Vector3(0, 1, 0);
const hip = new Vector3(), ankle = new Vector3(), target = new Vector3();
const pole = new Vector3();
const restRotation = new Quaternion(), twist = new Quaternion();

export function createDirectionalGait(model) {
  const legs = ['Left', 'Right'].map(side => ['UpLeg', 'Leg', 'Foot'].map(part =>
    model.getObjectByName('mixamorig' + side + part) ??
    model.getObjectByName('mixamorig:' + side + part)));
  let yawOffset = 0;
  let stepPhase = 0;
  let turnWeight = 0;

  return function apply({ delta, forward, side, facing, turn, ground, reversed }) {
    const direction = Math.atan2(-side, Math.abs(forward));
    const speed = Math.hypot(side, forward);
    const targetOffset = ground && speed > 0.25
      ? MathUtils.clamp(direction * (reversed ? -0.52 : 0.52), -0.78, 0.78) : 0;
    yawOffset = MathUtils.damp(yawOffset, targetOffset, 13, delta);
    turnWeight = MathUtils.damp(turnWeight, ground && speed < 0.28 ? Math.min(1, Math.abs(turn) * 0.5) : 0, 14, delta);
    if (!ground || Math.abs(yawOffset) < 0.009 && turnWeight < 0.02) return;
    stepPhase += delta * 10;
    pole.set(Math.sin(facing), 0, Math.cos(facing));
    for (let i = 0; i < legs.length; i++) {
      const [upper, lower, foot] = legs[i];
      if (!upper || !lower || !foot) continue;
      upper.getWorldPosition(hip);
      foot.getWorldPosition(ankle);
      foot.getWorldQuaternion(restRotation);
      target.copy(ankle).sub(hip).applyAxisAngle(UP, yawOffset).add(hip);
      target.y += Math.max(0, Math.sin(stepPhase + i * Math.PI)) * turnWeight * 0.055;
      twist.setFromAxisAngle(UP, yawOffset * 0.35).multiply(restRotation);
      solveLimb(upper, lower, foot, target, pole, twist);
    }
  };
}
