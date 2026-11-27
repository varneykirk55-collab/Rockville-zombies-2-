import { MathUtils, Quaternion } from 'three';

const ROTATION = new Quaternion();
const NEXT_ROTATION = new Quaternion();
const POSE = new Quaternion();
const IDENTITY = new Quaternion();
const BONES = ['Spine', 'Spine1', 'Spine2'];

function sample(clip, bone, time, loop) {
  const track = clip.tracks[bone];
  const end = track.length / 4 - 1;
  const phase = loop
    ? MathUtils.euclideanModulo(time, clip.duration) / clip.duration
    : MathUtils.clamp(time / clip.duration, 0, 1);
  const frame = phase * end;
  const lower = Math.floor(frame);
  return ROTATION.fromArray(track, lower * 4)
    .slerp(NEXT_ROTATION.fromArray(track, Math.min(end, lower + 1) * 4), frame - lower);
}

export function createArmedAnimation() {
  let clips;
  let weight = 0;
  let last = '';
  let previous = '';
  let time = 0;
  let previousTime = 0;
  let fade = 1;
  let recoilTime = Infinity;
  const bones = [];
  fetch(new URL('../public/combat/armed-spine.json', import.meta.url))
    .then(response => {
      if (!response.ok) throw new Error('Could not load the Arena Mortis upper-body tracks');
      return response.json();
    })
    .then(value => { clips = value; })
    .catch(error => console.warn(error.message));

  function apply(root, motion, pistol, delta, aimWeight = 0) {
    if (!clips) return;
    if (!bones.length) {
      bones.push(...BONES.map(name => root.getObjectByName('mixamorig' + name)
        || root.getObjectByName('mixamorig:' + name)));
    }
    const gait = motion.planarSpeed > 2.2 ? 'Run' : motion.planarSpeed > 0.3 ? 'Walk' : 'Idle';
    const suffix = pistol ? '_Pistol' : '';
    const next = gait + suffix;
    if (next !== last) {
      previous = last;
      previousTime = time;
      last = next;
      time = 0;
      fade = previous ? 0 : 1;
    }
    time += delta;
    previousTime += delta;
    recoilTime += delta;
    fade = Math.min(1, fade + delta * 8);
    weight = MathUtils.damp(weight, motion.grounded ? 0.6 : 0, 12, delta);
    const recoil = clips['FireRecoil' + suffix];
    for (let i = 0; i < BONES.length; i++) {
      if (!bones[i]) continue;
      const name = BONES[i];
      POSE.copy(sample(clips[last], name, time, true));
      if (fade < 1) POSE.slerp(sample(clips[previous], name, previousTime, true), 1 - fade);
      if (aimWeight > 0.01) POSE.slerp(sample(clips['AimIdle' + suffix], name, time, true), aimWeight * 0.85);
      if (recoilTime < recoil.duration) POSE.slerp(sample(recoil, name, recoilTime, false), 0.75);
      POSE.slerp(IDENTITY, 1 - weight);
      bones[i].quaternion.premultiply(POSE);
    }
  }

  return { apply, fire: () => { recoilTime = 0; } };
}
