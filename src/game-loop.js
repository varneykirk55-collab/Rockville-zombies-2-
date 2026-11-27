// Add future simulation updates here, before the single render call.
export function startGameLoop({ renderer, scene, camera, update, ready = () => true, shadowInterval = () => 0 }) {
  let previousTime;
  let frameId;
  let shadowClock = 0;
  let shadowPending = false;

  function frame(time) {
    const delta = previousTime === undefined ? 0 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    if (!ready()) {
      frameId = requestAnimationFrame(frame);
      return;
    }
    update(delta);
    shadowClock -= delta;
    shadowPending ||= renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = shadowPending && shadowClock <= 0;
    if (renderer.shadowMap.needsUpdate) {
      shadowPending = false;
      shadowClock = shadowInterval();
    }
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(frame);
  }

  frameId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(frameId);
}
