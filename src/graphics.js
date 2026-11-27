export const GRAPHICS = Object.freeze({
  low: { pixelCap: 1, scale: 0.75, shadowSize: 512, shadowInterval: 0.22, near: 8, mid: 23 },
  medium: { pixelCap: 1.25, scale: 1, shadowSize: 1024, shadowInterval: 0.15, near: 11, mid: 29 },
  high: { pixelCap: 1.75, scale: 1, shadowSize: 2048, shadowInterval: 0.10, near: 13, mid: 32 },
});
const key = 'rockville-graphics';

export function configureGraphics(renderer, sun, resize) {
  const select = document.querySelector('#graphics-preset');
  let stored;
  try { stored = localStorage.getItem(key); } catch { /* private storage may be disabled */ }
  let quality = Object.hasOwn(GRAPHICS, stored) ? stored : matchMedia('(pointer: coarse)').matches ? 'low' : 'medium';
  function apply() {
    const preset = GRAPHICS[quality];
    select.value = quality;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preset.pixelCap) * preset.scale);
    if (sun.shadow.mapSize.x !== preset.shadowSize) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.setScalar(preset.shadowSize);
    }
    renderer.shadowMap.needsUpdate = true;
    resize();
  }
  select.addEventListener('keydown', event => event.stopPropagation());
  select.addEventListener('change', () => {
    if (!Object.hasOwn(GRAPHICS, select.value)) return;
    quality = select.value;
    try { localStorage.setItem(key, quality); } catch { /* apply to the current session */ }
    apply();
  });
  apply();
  return () => GRAPHICS[quality];
}
