// Add future simulation updates here, before the single render call.
export function startGameLoop({ renderer, scene, camera, update }) {
  let previousTime;
  let frameId;

  function frame(time) {
    const delta = previousTime === undefined ? 0 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    update(delta);
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(frame);
  }

  frameId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(frameId);
}
