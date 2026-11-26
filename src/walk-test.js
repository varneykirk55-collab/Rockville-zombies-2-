import { ROAD_CENTERLINES, DOWNTOWN } from './config.js';
import { lonLatToWorld } from './utils.js';
import { moveGrounded } from './camera.js';

const STEP = 2;

function march(points, blocked, sampleGameY) {
  const samples = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / STEP));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      samples.push({ x, z, blocked: blocked(x, z), y: sampleGameY(x, z) });
    }
  }
  return samples;
}

function pops(samples) {
  let worst = 0;
  let count = 0;
  for (let i = 1; i < samples.length; i++) {
    const rise = Math.abs(samples[i].y - samples[i - 1].y);
    const run = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
    if (run < 0.5) continue;
    const slope = rise / run;
    if (rise > worst) worst = rise;
    if (rise > 0.45) count++;
  }
  return { worstRiseM: Number(worst.toFixed(3)), stepsOver045m: count };
}

export const SHOTS = [
  {
    id: 'hungerford',
    title: 'Hungerford Drive commercial corridor',
    at: [-77.15355, 39.0924],
    look: [-77.1531, 39.0942],
  },
  {
    id: 'town-square',
    title: 'Town Square',
    at: [-77.1499, 39.08415],
    look: [-77.1507, 39.08405],
  },
  {
    id: 'maryland-regal',
    title: 'Maryland Avenue and Regal',
    at: [-77.15028, 39.08345],
    look: [-77.15005, 39.08435],
  },
  {
    id: 'courthouse-square',
    title: 'Courthouse Square',
    at: [-77.15135, 39.08445],
    look: [-77.15055, 39.08355],
  },
  {
    id: 'rockville-pike',
    title: 'Rockville Pike',
    at: [-77.1467, 39.08115],
    look: [-77.14685, 39.0831],
  },
  {
    id: 'metro',
    title: 'Metro station',
    at: [-77.14735, 39.08455],
    look: [-77.1457, 39.08485],
  },
];

export function runWalkTest({ blocked, sampleGameY, insidePlayable, distanceOutside }) {
  let roadBlocked = 0;
  let roadCount = 0;
  let worstRiseM = 0;
  let stepsOver045m = 0;
  for (const [, coordinates] of ROAD_CENTERLINES) {
    const points = coordinates.map(([lon, lat]) => lonLatToWorld(lon, lat));
    for (let i = 1; i < points.length; i++) {
      const midX = (points[i - 1].x + points[i].x) / 2;
      const midZ = (points[i - 1].z + points[i].z) / 2;
      if (!insidePlayable(midX, midZ)) continue;
      const samples = march([points[i - 1], points[i]], blocked, sampleGameY);
      roadCount += samples.length;
      roadBlocked += samples.filter(sample => sample.blocked).length;
      const rise = pops(samples.filter(sample => !sample.blocked));
      worstRiseM = Math.max(worstRiseM, rise.worstRiseM);
      stepsOver045m += rise.stepsOver045m;
    }
  }

  const boundarySamples = [];
  const downtown = lonLatToWorld(DOWNTOWN.longitude, DOWNTOWN.latitude);
  for (const [lon, lat] of [
    [-77.1412, 39.09],
    [-77.152, 39.0954],
    [-77.1554, 39.086],
    [-77.148, 39.0794],
  ]) {
    const { x, z } = lonLatToWorld(lon, lat);
    boundarySamples.push({
      lon, lat, x, z,
      outsideM: Number(distanceOutside(x, z).toFixed(1)),
      blocked: blocked(x, z),
      buildingFree: !blocked(x, z),
    });
  }

  // Step from open ground toward the nearest solid cell and record how far
  // the stop is from the last clear point. A stop of about one body radius
  // means the collider is the wall, not an invisible barrier in front of it.
  const approaches = [];
  const probes = [
    lonLatToWorld(-77.1519, 39.0846),
    lonLatToWorld(-77.1504, 39.0836),
    downtown,
  ];
  for (const origin of probes) {
    if (blocked(origin.x, origin.z)) continue;
    let hit = null;
    for (let distance = 0.4; distance < 28; distance += 0.4) {
      for (let turn = 0; turn < 16; turn++) {
        const angle = turn * Math.PI / 8;
        const x = origin.x + Math.cos(angle) * distance;
        const z = origin.z + Math.sin(angle) * distance;
        if (blocked(x, z)) {
          hit = { distanceM: Number(distance.toFixed(2)), clearBeforeM: Number((distance - 0.4).toFixed(2)) };
          break;
        }
      }
      if (hit) break;
    }
    if (hit) approaches.push(hit);
  }

  const controller = { x: downtown.x + 14.5, z: downtown.z + 2.45 };
  let controllerBlockedSteps = 0;
  const before = { ...controller };
  for (let i = 0; i < 40; i++) {
    const x = controller.x;
    const z = controller.z;
    moveGrounded(controller, -0.8, 0.05, blocked);
    if (controller.x === x && controller.z === z) controllerBlockedSteps++;
  }

  return {
    roadSamples: roadCount,
    roadBlocked,
    roadBlockedFraction: roadCount ? Number((roadBlocked / roadCount).toFixed(4)) : null,
    heightPops: { worstRiseM: Number(worstRiseM.toFixed(3)), stepsOver045m },
    boundarySamples,
    approaches,
    controller: {
      start: before,
      end: { x: Number(controller.x.toFixed(2)), z: Number(controller.z.toFixed(2)) },
      blockedSteps: controllerBlockedSteps,
      movedM: Number(Math.hypot(controller.x - before.x, controller.z - before.z).toFixed(2)),
    },
  };
}

function clearance(x, z, blocked) {
  if (blocked(x, z)) return 0;
  for (let radius = 1; radius <= 10; radius++) {
    for (let turn = 0; turn < 8; turn++) {
      const angle = turn * Math.PI / 4;
      if (blocked(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius)) return radius;
    }
  }
  return 11;
}

export function shotPose(shot, sampleGameY, blocked) {
  const origin = lonLatToWorld(shot.at[0], shot.at[1]);
  const look = lonLatToWorld(shot.look[0], shot.look[1]);
  let at = origin;
  if (shot.locked && blocked(origin.x, origin.z)) {
    const dx = origin.x - look.x;
    const dz = origin.z - look.z;
    const length = Math.hypot(dx, dz) || 1;
    let x = origin.x;
    let z = origin.z;
    for (let step = 0; step < 14 && blocked(x, z); step += 1) {
      x += (dx / length) * 2;
      z += (dz / length) * 2;
    }
    at = { x, z };
  }
  if (!shot.locked) {
    let best = clearance(origin.x, origin.z, blocked);
    for (let radius = 2; radius <= 22; radius += 2) {
      for (let turn = 0; turn < 12; turn++) {
        const angle = turn * Math.PI / 6;
        const x = origin.x + Math.cos(angle) * radius;
        const z = origin.z + Math.sin(angle) * radius;
        const open = clearance(x, z, blocked);
        if (open > best) {
          best = open;
          at = { x, z };
        }
      }
      if (best >= 6) break;
    }
  }
  return {
    x: at.x,
    y: sampleGameY(at.x, at.z) + (shot.eye ?? 1.68),
    z: at.z,
    lookX: look.x,
    lookY: sampleGameY(look.x, look.z) + (shot.lookEye ?? 2.2),
    lookZ: look.z,
  };
}
