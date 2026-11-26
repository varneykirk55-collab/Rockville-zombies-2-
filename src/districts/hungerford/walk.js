import { ROAD_CENTERLINES } from '../../config.js';
import { lonLatToWorld, worldToLonLat } from '../../utils.js';
import { HUNGERFORD_RING } from './boundary.js';

function insideRing(longitude, latitude, ring = HUNGERFORD_RING) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    if ((yi > latitude) !== (yj > latitude)
      && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const STEP = 2;

export function runHungerfordWalk({ blocked }) {
  let samples = 0;
  let blockedCount = 0;
  for (const [, coordinates] of ROAD_CENTERLINES) {
    const points = coordinates.map(([longitude, latitude]) => ({
      ...lonLatToWorld(longitude, latitude),
      longitude,
      latitude,
    }));
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      if (!insideRing((start.longitude + end.longitude) / 2, (start.latitude + end.latitude) / 2)) continue;
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      const steps = Math.max(1, Math.ceil(length / STEP));
      for (let step = 0; step < steps; step += 1) {
        const t = step / steps;
        const x = start.x + (end.x - start.x) * t;
        const z = start.z + (end.z - start.z) * t;
        const geographic = worldToLonLat(x, z);
        if (!insideRing(geographic.longitude, geographic.latitude)) continue;
        samples += 1;
        if (blocked(x, z)) blockedCount += 1;
      }
    }
  }
  return {
    samples,
    blocked: blockedCount,
    blockedFraction: samples ? Number((blockedCount / samples).toFixed(4)) : null,
  };
}
