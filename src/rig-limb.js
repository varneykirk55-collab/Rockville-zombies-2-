import { MathUtils, Quaternion, Vector3 } from 'three';

// World-space two-bone solve. One persistent work area is enough because the
// driver evaluates limbs sequentially. Preserve the existing skeleton scales.
const origin = new Vector3(), knee = new Vector3(), end = new Vector3();
const axis = new Vector3(), bend = new Vector3(), joint = new Vector3();
const reachable = new Vector3(), from = new Vector3(), to = new Vector3();
const parent = new Quaternion(), rotation = new Quaternion();

function rotateToward(bone, oldDirection, newDirection) {
  bone.parent.getWorldQuaternion(parent).invert();
  from.copy(oldDirection).normalize().applyQuaternion(parent);
  to.copy(newDirection).normalize().applyQuaternion(parent);
  bone.quaternion.premultiply(rotation.setFromUnitVectors(from, to));
}

export function solveLimb(upper, lower, tip, target, pole, worldRotation) {
  upper.getWorldPosition(origin);
  lower.getWorldPosition(knee);
  tip.getWorldPosition(end);
  const a = origin.distanceTo(knee), b = knee.distanceTo(end);
  axis.copy(target).sub(origin);
  const distance = axis.length();
  if (Math.min(a, b, distance) < 0.0001) return;
  axis.multiplyScalar(1 / distance);
  const reach = MathUtils.clamp(distance, Math.abs(a - b) + 0.0001, a + b - 0.0001);
  reachable.copy(origin).addScaledVector(axis, reach);
  bend.copy(pole).addScaledVector(axis, -pole.dot(axis));
  if (bend.lengthSq() < 0.00001) {
    bend.copy(knee).sub(origin);
    bend.addScaledVector(axis, -bend.dot(axis));
  }
  if (bend.lengthSq() < 0.00001) return;
  bend.normalize();
  const depth = (a * a - b * b + reach * reach) / (2 * reach);
  joint.copy(origin).addScaledVector(axis, depth)
    .addScaledVector(bend, Math.sqrt(Math.max(0, a * a - depth * depth)));

  rotateToward(upper, knee.sub(origin), to.copy(joint).sub(origin));
  lower.getWorldPosition(knee);
  tip.getWorldPosition(end);
  rotateToward(lower, end.sub(knee), to.copy(reachable).sub(knee));
  if (worldRotation) tip.quaternion.copy(tip.parent.getWorldQuaternion(parent).invert().multiply(worldRotation));
}
