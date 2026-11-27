// Port of Arena Mortis 2 resources/shaders/upgrade_camo.gdshader.
export function withUpgradeCamo(material, tint, clock) {
  const upgraded = material.clone();
  if (!upgraded.emissive) return upgraded;
  upgraded.onBeforeCompile = shader => {
    shader.uniforms.upgradeTint = { value: tint };
    shader.uniforms.upgradeClock = clock;
    shader.vertexShader = 'varying vec3 upgradeObjectPosition;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nupgradeObjectPosition = position;');
    shader.fragmentShader = `
      varying vec3 upgradeObjectPosition;
      uniform vec3 upgradeTint;
      uniform float upgradeClock;
      float upgradeHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float upgradeNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(upgradeHash(i), upgradeHash(i + vec2(1, 0)), u.x),
          mix(upgradeHash(i + vec2(0, 1)), upgradeHash(i + vec2(1, 1)), u.x), u.y);
      }
    ` + shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      vec2 upgradeP = upgradeObjectPosition.zy * 28.0 + upgradeObjectPosition.x * 9.0;
      float upgradeT = upgradeClock * 0.9;
      float upgradeN = upgradeNoise(upgradeP + vec2(upgradeT, -upgradeT * 0.7)) * 0.6
        + upgradeNoise(upgradeP * 2.3 - vec2(upgradeT * 1.3, upgradeT)) * 0.4;
      float upgradeBands = smoothstep(0.55, 0.85, upgradeN);
      float upgradeFresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
      totalEmissiveRadiance += upgradeTint * (upgradeBands * 0.55 + upgradeFresnel * 0.35);
    `);
  };
  return upgraded;
}
