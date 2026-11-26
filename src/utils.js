import { ORIGIN } from './config.js';

// A local WGS84 tangent approximation is sufficient across this ~1.7 km area.
// x increases east, z increases south, and Three.js y is elevation.
const latitudeRadians = ORIGIN.latitude * Math.PI / 180;
const metersPerDegreeEast = 111412.84 * Math.cos(latitudeRadians)
  - 93.5 * Math.cos(3 * latitudeRadians) + 0.118 * Math.cos(5 * latitudeRadians);
const metersPerDegreeNorth = 111132.92 - 559.82 * Math.cos(2 * latitudeRadians)
  + 1.175 * Math.cos(4 * latitudeRadians) - 0.0023 * Math.cos(6 * latitudeRadians);

export function lonLatToWorld(longitude, latitude) {
  return {
    x: (longitude - ORIGIN.longitude) * metersPerDegreeEast,
    z: (ORIGIN.latitude - latitude) * metersPerDegreeNorth,
  };
}

export function worldToLonLat(x, z) {
  return {
    longitude: ORIGIN.longitude + x / metersPerDegreeEast,
    latitude: ORIGIN.latitude - z / metersPerDegreeNorth,
  };
}

export function splitBounds({ west, south, east, north }, divisions) {
  const tiles = [];
  const width = (east - west) / divisions;
  const height = (north - south) / divisions;
  for (let row = 0; row < divisions; row++) {
    for (let col = 0; col < divisions; col++) {
      tiles.push([
        west + col * width,
        south + row * height,
        col === divisions - 1 ? east : west + (col + 1) * width,
        row === divisions - 1 ? north : south + (row + 1) * height,
      ]);
    }
  }
  return tiles;
}

export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}
