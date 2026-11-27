import { MathUtils } from 'three';

// Position offsets are meters in the player aim frame. Magazine keyframes
// are normalized over each weapon's existing gameplay reload duration.
export const DRAW_SECONDS = 0.32;
export const HOLSTER_SECONDS = 0.105;

export const HANDLING = {
  m4: {
    side: 0.126, height: 1.33, forward: 0.084, aimHeight: 0.052, aimForward: 0.022,
    recoil: 0.041, recovery: 23, lower: 0.19, grip: [-0.032, 0.022, -0.122],
    magazine: [[0.27, 0, 0, 0], [0.48, 0.035, -0.19, -0.015], [0.59, 0.065, -0.20, -0.033],
      [0.75, 0, 0, 0]],
  },
  mk35: {
    side: 0.15, height: 1.30, forward: 0.085, aimHeight: 0.068, aimForward: 0.023,
    recoil: 0.053, recovery: 19, lower: 0.22, grip: [-0.036, 0.036, -0.13],
    magazine: [[0.30, 0, 0, 0], [0.46, 0.04, -0.20, -0.034], [0.62, 0.07, -0.24, -0.06],
      [0.80, 0, 0, 0]],
  },
  pistol: {
    side: 0.073, height: 1.29, forward: 0.26, aimHeight: 0.066, aimForward: 0.035,
    recoil: 0.028, recovery: 26, lower: 0.15, grip: [-0.052, -0.03, 0.03],
    magazine: [[0.25, 0, 0, 0], [0.42, -0.045, -0.16, 0.026], [0.61, -0.06, -0.17, 0.05],
      [0.74, 0, 0, 0]],
  },
};

export function envelope(t, outer, inner, release, end) {
  return MathUtils.smoothstep(t, outer, inner) * (1 - MathUtils.smoothstep(t, release, end));
}

export function magazineOffset(keys, phase, out) {
  out.set(0, 0, 0);
  if (phase <= keys[0][0] || phase >= keys.at(-1)[0]) return;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (phase > b[0]) continue;
    const blend = MathUtils.smoothstep(phase, a[0], b[0]);
    out.set(MathUtils.lerp(a[1], b[1], blend), MathUtils.lerp(a[2], b[2], blend),
      MathUtils.lerp(a[3], b[3], blend));
    return;
  }
}
