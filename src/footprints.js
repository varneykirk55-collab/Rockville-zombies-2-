import { BOUNDS, FOOTPRINTS_URL, TILE_DIVISIONS } from './config.js';
import { splitBounds } from './utils.js';

const PAGE_SIZE = 1000;

// Building Footprints © Montgomery County Planning Department,
// Maryland-National Capital Park and Planning Commission (M-NCPPC),
// and Montgomery County GIS / Technology & Enterprise Business Solutions.
async function fetchTile(tile) {
  const [west, south, east, north] = tile;
  // A polygon preserves the tile's edges when ArcGIS projects to State Plane.
  // Reprojected envelope queries can include features outside the WGS84 tile.
  const geometry = JSON.stringify({
    rings: [[[west, south], [west, north], [east, north], [east, south], [west, south]]],
  });
  const features = [];
  let offset = 0;

  while (true) {
    const query = new URLSearchParams({
      f: 'geojson',
      where: '1=1',
      geometry,
      geometryType: 'esriGeometryPolygon',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '4326',
      outSR: '4326',
      outFields: '*',
      returnGeometry: 'true',
      orderByFields: 'OBJECTID ASC',
      resultRecordCount: String(PAGE_SIZE),
      resultOffset: String(offset),
    });
    const response = await fetch(`${FOOTPRINTS_URL}?${query}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const page = await response.json();
    if (page.error) {
      const { code, message, details } = page.error;
      throw new Error([`ArcGIS ${code}: ${message}`, ...(details ?? [])].join(' '));
    }
    if (page.type !== 'FeatureCollection' || !Array.isArray(page.features)) {
      throw new Error('ArcGIS did not return a GeoJSON FeatureCollection.');
    }
    if (features.length && page.features.length &&
        Number(objectId(page.features[0])) <= Number(objectId(features.at(-1)))) {
      throw new Error('ArcGIS pagination did not advance to new object IDs.');
    }

    features.push(...page.features);
    const limitReached = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit;
    if (limitReached === false || (!limitReached && page.features.length < PAGE_SIZE)) {
      return features;
    }

    // ArcGIS may return a short page with exceededTransferLimit still set.
    offset += PAGE_SIZE;
  }
}

function objectId(feature) {
  return feature?.properties?.OBJECTID ?? feature?.id;
}

export async function fetchFootprints(onProgress) {
  const tiles = splitBounds(BOUNDS, TILE_DIVISIONS);
  let completed = 0;
  const results = await Promise.allSettled(tiles.map(async (tile, index) => {
    try {
      return await fetchTile(tile);
    } catch (cause) {
      throw new Error(`Tile ${index + 1} [${tile.join(', ')}] failed.`, { cause });
    } finally {
      onProgress(++completed, tiles.length);
    }
  }));

  const features = new Map();
  const errors = [];
  for (const result of results) {
    if (result.status === 'rejected') {
      errors.push(result.reason);
      continue;
    }
    for (const feature of result.value) {
      // An intersecting building can appear in two or more tiles.
      const id = objectId(feature) ?? JSON.stringify(feature.geometry);
      features.set(String(id), feature);
    }
  }

  if (!features.size) {
    throw new AggregateError(errors, 'The county service returned no footprints for this area.');
  }
  return { features: [...features.values()], errors };
}
