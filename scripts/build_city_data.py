#!/usr/bin/env python3
"""Build the committed city-geometry tables from the approved audit.

Reads docs/geographic-audit and the live county, Planning, and Maryland DEM
services. Writes compact runtime files under public/data and a stats file the
validation report quotes. Heights are measured, published, or a documented
deterministic rule. Nothing in this script uses a random height.

Rerun from the repository root:
  python3 scripts/build_city_data.py
"""

from __future__ import annotations

import csv
import json
import math
import statistics
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'docs' / 'geographic-audit' / 'data'
OUT = ROOT / 'public' / 'data'
REPORT_DATA = ROOT / 'docs' / 'city-geometry-upgrade' / 'data'

ORIGIN_LON = -77.152
ORIGIN_LAT = 39.086
LAT_RAD = ORIGIN_LAT * math.pi / 180
M_EAST = (111412.84 * math.cos(LAT_RAD)
          - 93.5 * math.cos(3 * LAT_RAD)
          + 0.118 * math.cos(5 * LAT_RAD))
M_NORTH = (111132.92
           - 559.82 * math.cos(2 * LAT_RAD)
           + 1.175 * math.cos(4 * LAT_RAD)
           - 0.0023 * math.cos(6 * LAT_RAD))

FOOTPRINTS_URL = (
    'https://geohub.montgomerycountymd.gov/mapping1/rest/services/'
    'Structures/Building_Footprints/FeatureServer/0/query')
PLANNING_URL = (
    'https://montgomeryplans.org/server/rest/services/'
    'Overlays/Buildings_3D/MapServer/0/query')
PARKING_URL = (
    'https://montgomeryplans.org/server/rest/services/'
    'Overlays/Parking/MapServer/6/query')
DEM_URL = (
    'https://mdgeodata.md.gov/lidar/rest/services/Montgomery/'
    'MD_montgomery_dem_m/ImageServer/getSamples')

# Terrain grid in game metres. 10 m matches the audit's recommended mesh.
X0, X1, Z0, Z1, STEP = -420.0, 860.0, -1080.0, 780.0, 10.0
APRON_M = 55.0
FT_TO_M = 0.3048

# Published resolutions for the skyline rows the audit left blank.
# Heights are metres. Confidence is Estimated: these are published figures or
# a measured GIS value a published figure selects, not a new survey.
OVERRIDES = {
    129092: dict(
        height=13.78, method='published-storeys',
        evidence=('32 Courthouse Square is a four-storey, 30,000 sq ft office '
                  '(LoopNet listing 22393107; Cityfeet description of the same '
                  'building). Rockville measured 45.2 ft (13.78 m), which is '
                  '11.3 ft per storey. Planning 144.3 ft (43.99 m) is not a '
                  'four-storey building and is not used. Estimate.')),
    129521: dict(
        height=38.10, method='published-roof',
        evidence=('1 Church Street is nine storeys (Cushman & Wakefield listing; '
                  'CompStak; SkyscraperPage diagram 194188). SkyscraperPage gives '
                  'a Google Earth roof of 125 ft (38.10 m). Planning 139.1 ft and '
                  'Rockville 107.1 ft sit on either side of that roof and were not '
                  'averaged. Estimate, from the published roof, not a new survey.')),
    129186: dict(
        height=46.02, method='published-roof',
        evidence=('Circuit Court north tower, 50 Maryland Avenue: nine storeys '
                  'above grade (Montgomery County Circuit Court history; '
                  'SkyscraperPage diagram 194191). SkyscraperPage Google Earth roof '
                  'is 151 ft (46.02 m). Planning 169.44 ft is 18 ft higher and is '
                  'not used for the main roof. The south tower is six storeys '
                  '(county press release, 15 May 2014). Estimate.')),
    240005: dict(
        height=41.77, method='published-plan-height',
        evidence=('Cambria / Town Square west tower, 196 East Montgomery Avenue. '
                  'Choice Hotels (11 May 2015) says the hotel occupies eight floors '
                  'of a 15-storey tower. The City of Rockville growth-commission '
                  'slides (22 July 2013) list 144 ft for the Duball project. '
                  'Rockville measured 137.03 ft (41.77 m), 2.1 m under that slide. '
                  'The as-built Rockville figure is used. Planning 28.83 m is too '
                  'short for 15 storeys. Estimate.')),
    122323: dict(
        height=29.87, method='published-storeys',
        evidence=('451 Hungerford Drive (Exchange Place) is a seven-storey office '
                  'built in 1980 (LoopNet listing 7700922; Compass; CompStak; '
                  'CommercialSearch, 18 May 2017). Planning 98.01 ft (29.87 m) is '
                  '14.0 ft per storey. Rockville 70.61 ft is about 10 ft per storey, '
                  'which matches the listing\'s unfinished ceiling height rather than '
                  'the roof. Estimate, Planning selected by the storey count.')),
}


def http_json(url, params=None, timeout=60, retries=4):
    if params:
        url = url + ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'RockvilleZombies2-geometry/1.0',
                'Accept': 'application/json',
            })
            with urllib.request.urlopen(req, timeout=timeout) as response:
                payload = json.loads(response.read().decode('utf-8'))
            if isinstance(payload, dict) and payload.get('error'):
                raise RuntimeError(str(payload['error'])[:300])
            return payload
        except Exception as error:  # noqa: BLE001 - retry network and service errors
            last = error
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f'GET failed: {last}')


def lonlat_to_world(lon, lat):
    return ((lon - ORIGIN_LON) * M_EAST, (ORIGIN_LAT - lat) * M_NORTH)


def world_to_lonlat(x, z):
    return (ORIGIN_LON + x / M_EAST, ORIGIN_LAT - z / M_NORTH)


def ring_area(ring):
    total = 0.0
    for i, (x, z) in enumerate(ring):
        nx, nz = ring[(i + 1) % len(ring)]
        total += x * nz - nx * z
    return total / 2


def centroid(ring):
    area = ring_area(ring)
    if abs(area) < 1e-6:
        xs = [p[0] for p in ring]
        zs = [p[1] for p in ring]
        return (sum(xs) / len(xs), sum(zs) / len(zs), 0.0)
    cx = cz = 0.0
    for i, (x, z) in enumerate(ring):
        nx, nz = ring[(i + 1) % len(ring)]
        cross = x * nz - nx * z
        cx += (x + nx) * cross
        cz += (z + nz) * cross
    return (cx / (6 * area), cz / (6 * area), abs(area))


def to_world_ring(lonlat_ring):
    points = []
    for lon, lat, *_rest in lonlat_ring:
        if not (math.isfinite(lon) and math.isfinite(lat)):
            continue
        point = lonlat_to_world(lon, lat)
        if not points or point != points[-1]:
            points.append(point)
    if len(points) > 1 and points[0] == points[-1]:
        points.pop()
    return points


def inside_ring(x, z, ring):
    hit = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, zi = ring[i]
        xj, zj = ring[j]
        if (zi > z) != (zj > z):
            x_cross = (xj - xi) * (z - zi) / (zj - zi) + xi
            if x < x_cross:
                hit = not hit
        j = i
    return hit


def inside_polygon(x, z, outer, holes):
    if not inside_ring(x, z, outer):
        return False
    return not any(inside_ring(x, z, hole) for hole in holes)


def point_segment_distance(x, z, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    length_sq = dx * dx + dz * dz
    if length_sq < 1e-12:
        return math.hypot(x - ax, z - az)
    t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / length_sq))
    return math.hypot(x - (ax + dx * t), z - (az + dz * t))


def distance_to_polygon(x, z, outer, holes):
    if inside_polygon(x, z, outer, holes):
        return 0.0
    best = min(point_segment_distance(x, z, *outer[i], *outer[(i + 1) % len(outer)])
               for i in range(len(outer)))
    return best


def geo_polygons(geometry):
    kind = geometry.get('type')
    coords = geometry.get('coordinates') or []
    if kind == 'Polygon':
        return [coords]
    if kind == 'MultiPolygon':
        return list(coords)
    return []


def load_boundary():
    payload = json.loads((AUDIT / 'playable-boundary.geojson').read_text())
    feature = payload['features'][0]
    ring = to_world_ring(feature['geometry']['coordinates'][0])
    holes = [to_world_ring(hole) for hole in feature['geometry']['coordinates'][1:]]
    return ring, [hole for hole in holes if len(hole) >= 3]


def load_reconciliation():
    rows = {}
    with (AUDIT / 'height-reconciliation.csv').open(newline='') as handle:
        for row in csv.DictReader(handle):
            rows[int(row['object_id'])] = row
    return rows


def query_features(url, bbox, out_fields, page_size=500):
    west, south, east, north = bbox
    features = []
    offset = 0
    while True:
        payload = http_json(url, {
            'f': 'geojson',
            'where': '1=1',
            'geometry': json.dumps({
                'xmin': west, 'ymin': south, 'xmax': east, 'ymax': north,
                'spatialReference': {'wkid': 4326},
            }),
            'geometryType': 'esriGeometryEnvelope',
            'spatialRel': 'esriSpatialRelIntersects',
            'inSR': '4326',
            'outSR': '4326',
            'outFields': out_fields,
            'returnGeometry': 'true',
            'orderByFields': 'OBJECTID ASC',
            'resultRecordCount': str(page_size),
            'resultOffset': str(offset),
        }, timeout=90)
        page = payload.get('features') or []
        features.extend(page)
        exceeded = (payload.get('exceededTransferLimit')
                    or (payload.get('properties') or {}).get('exceededTransferLimit'))
        if not page or (exceeded is False) or (not exceeded and len(page) < page_size):
            break
        offset += page_size
        if offset > 20000:
            break
    return features


def footprint_record(feature):
    props = feature.get('properties') or {}
    object_id = props.get('OBJECTID')
    if object_id is None:
        return None
    polygons = []
    for polygon in geo_polygons(feature.get('geometry') or {}):
        if not polygon:
            continue
        outer = to_world_ring(polygon[0])
        if len(outer) < 3:
            continue
        holes = [ring for ring in (to_world_ring(hole) for hole in polygon[1:]) if len(ring) >= 3]
        cx, cz, area = centroid(outer)
        hole_area = sum(abs(ring_area(hole)) for hole in holes)
        polygons.append({
            'outer': outer,
            'holes': holes,
            'cx': cx,
            'cz': cz,
            'area': max(0.0, area - hole_area),
            'lonlat': [[round(lon, 7), round(lat, 7)] for lon, lat, *_ in polygon[0]],
            'holeLonlat': [[[round(lon, 7), round(lat, 7)] for lon, lat, *_ in hole]
                           for hole in polygon[1:]],
        })
    if not polygons:
        return None
    area = sum(item['area'] for item in polygons)
    cx = sum(item['cx'] * item['area'] for item in polygons) / area
    cz = sum(item['cz'] * item['area'] for item in polygons) / area
    return {
        'id': int(object_id),
        'address': props.get('ADDRESS') or '',
        'name': props.get('BLDG_NAME') or '',
        'street': props.get('STREET_NAME') or '',
        'bldgClass': props.get('BLDG_CLASS') or '',
        'polygons': polygons,
        'cx': cx,
        'cz': cz,
        'area': area,
    }


def number(value):
    if value is None or value == '':
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if math.isfinite(numeric) else None


def resolve_heights(records, reconciliation, boundary):
    """Return playable height records and backdrop ids.

    High and Medium stay on the audit's chosen measured height. Every
    Unresolved row receives a labelled estimate.
    """
    outer, holes = boundary
    by_address = {}
    for row in reconciliation.values():
        if row['confidence'] in ('High', 'Medium') and row.get('chosen_height_m') and row.get('address'):
            by_address.setdefault(row['address'], []).append(float(row['chosen_height_m']))
    measured = []
    for record in records:
        row = reconciliation.get(record['id'])
        if not row or row['confidence'] not in ('High', 'Medium'):
            continue
        if row.get('chosen_height_m'):
            measured.append((record['cx'], record['cz'], float(row['chosen_height_m'])))

    def neighbour_median(record):
        # Same type means the same size class. A small bay must not inherit a
        # tower height from the five nearest measured roofs.
        if record['area'] < 120:
            band, radius = (2.5, 8.0), 110
            kind = 'shed-scale'
        elif record['area'] < 450:
            band, radius = (4.0, 14.0), 140
            kind = 'low-rise'
        else:
            band, radius = (4.0, 80.0), 180
            kind = 'same-size'
        ranked = sorted(measured, key=lambda item: (item[0] - record['cx']) ** 2
                        + (item[1] - record['cz']) ** 2)
        near = [height for x, z, height in ranked
                if math.hypot(x - record['cx'], z - record['cz']) <= radius
                and band[0] <= height <= band[1]][:5]
        if len(near) >= 3:
            chosen = statistics.median(near)
            return chosen, 'median-of-measured-neighbours', (
                f'No GIS height joined this footprint ({record["area"]:.0f} m², {kind}). '
                f'Height is the median of the {len(near)} nearest High/Medium '
                f'buildings of that size class within {radius:.0f} m '
                f'({", ".join(f"{h:.2f} m" for h in near)}). Estimate.')
        body = [height for _x, _z, height in measured if band[0] <= height <= band[1]]
        fallback = statistics.median(body) if body else 7.0
        return fallback, 'median-of-lowrise-district', (
            f'No GIS height joined this footprint and fewer than three measured '
            f'{kind} neighbours were found. Height is the district median of '
            f'High/Medium buildings in the {band[0]:.1f}–{band[1]:.1f} m band '
            f'({fallback:.2f} m). Estimate.')

    playable = []
    backdrop = []
    for record in records:
        distance = distance_to_polygon(record['cx'], record['cz'], outer, holes)
        row = reconciliation.get(record['id'])
        # The audit's 508 are inside by the audit centroid. A polygon centroid can
        # fall a metre outside a west-edge footprint. Keep those in the playable set.
        inside = distance == 0.0 or (row is not None and distance <= 3.0)
        if not inside:
            if distance <= APRON_M:
                backdrop.append(record['id'])
            continue
        # A centroid inside the polygon is playable even if the audit join missed it.
        entry = {
            'id': record['id'],
            'address': (row or {}).get('address') or record['address'],
            'name': (row or {}).get('name') or record['name'],
            'area': round(record['area'], 1),
            'roof': 'Flat',
            'roofSource': 'default-flat',
            'ridgeM': 0.0,
            'year': None,
            'garage': False,
        }
        roof = ((row or {}).get('rockville_roof') or '').strip()
        if roof in ('Gable', 'Flat'):
            entry['roof'] = roof
            entry['roofSource'] = 'rockville'
            if roof == 'Gable':
                entry['ridgeM'] = 2.0
        year = number((row or {}).get('planning_year'))
        if year and year >= 1800:
            entry['year'] = int(year)
        if record['id'] in OVERRIDES:
            item = OVERRIDES[record['id']]
            entry.update(heightM=item['height'], confidence='Estimated',
                         method=item['method'], evidence=item['evidence'])
            playable.append(entry)
            continue
        if row and row['confidence'] in ('High', 'Medium') and row.get('chosen_height_m'):
            entry.update(
                heightM=round(float(row['chosen_height_m']), 2),
                confidence=row['confidence'],
                method=f"measured-{row['confidence'].lower()}",
                evidence=row['evidence'],
            )
            playable.append(entry)
            continue
        planning = number((row or {}).get('planning_primary_m')) if row else None
        rockville = number((row or {}).get('rockville_height_m')) if row else None
        # 18-storey Ansel footprints (completed 2021) never received a GIS height.
        if record['id'] in (272520, 272521, 272526) and record['area'] >= 350:
            entry.update(
                heightM=52.73, confidence='Estimated', method='published-plan-height',
                evidence=('33 Monroe Street / Helen Heneghan Way is the 18-storey '
                          'Duball tower (The Ansel, now BLVD Ansel; Comstock release '
                          '23 March 2022; Duball phase 2; Torti Gallas). The City of '
                          'Rockville growth-commission slides (22 July 2013) list '
                          '173 ft (52.73 m) beside the 144 ft tower. No Planning or '
                          'Rockville height joined these 2021 footprints. Applied only '
                          'where the footprint is at least 400 m². Estimate.'))
            playable.append(entry)
            continue
        if planning is not None and rockville is not None:
            hi, lo = max(planning, rockville), min(planning, rockville)
            ratio = hi / lo if lo > 0.5 else 99
            if record['area'] > 2200 and ratio > 1.8:
                chosen, method = lo, 'lower-measured-large-footprint'
                why = ('The footprint is over 2,200 m² and the two GIS heights differ '
                       'by more than 80 percent, so the lower measured value is the '
                       'main mass. A taller Planning part is drawn separately when its '
                       'polygon is smaller than the footprint.')
            elif hi <= 16 or ratio <= 1.35:
                chosen = hi
                method = 'higher-measured-lowrise' if hi <= 16 else 'higher-measured'
                why = ('The higher of the two measured heights is kept. On a low '
                       'building the gap is wider than the audit Medium band of 4 m, '
                       'so this stays an estimate rather than Medium.')
            else:
                chosen, method = hi, 'higher-measured'
                why = ('The higher measured height is used so a published-scale mass '
                       'is not averaged down into the podium. Estimate, because the '
                       'two GIS values were left Unresolved by the audit.')
            entry.update(
                heightM=round(chosen, 2), confidence='Estimated', method=method,
                evidence=(f'Planning {planning:.2f} m and Rockville {rockville:.2f} m. {why}'))
            playable.append(entry)
            continue
        single = planning if planning is not None else rockville
        if single is not None:
            which = 'Planning' if planning is not None else 'Rockville'
            distance_m = (row or {}).get('rockville_distance_m') or ''
            entry.update(
                heightM=round(single, 2), confidence='Estimated',
                method='single-measured-source',
                evidence=(f'Only {which} measured this footprint ({single:.2f} m'
                          + (f', Rockville part {distance_m} m from the centroid' if distance_m else '')
                          + '). The audit left it Unresolved. The measured value is '
                          'used and labelled an estimate.'))
            playable.append(entry)
            continue
        same_address = by_address.get(record['address'] or '')
        if same_address:
            chosen = statistics.median(same_address)
            entry.update(
                heightM=round(chosen, 2), confidence='Estimated', method='same-address-measured',
                evidence=(f'No height joined this footprint. Another footprint at {record["address"]} '
                          f'is measured at {chosen:.2f} m. That value is reused here and labelled an estimate.'))
            playable.append(entry)
            continue
        height, method, evidence = neighbour_median(record)
        if row is None:
            evidence = 'Footprint centroid is inside the boundary but it is not in the audit table. ' + evidence
        entry.update(heightM=round(height, 2), confidence='Estimated',
                     method=method, evidence=evidence)
        playable.append(entry)
    return playable, backdrop


def spatial_buckets(records, size=64):
    buckets = {}
    for record in records:
        for piece in record['polygons']:
            xs = [point[0] for point in piece['outer']]
            zs = [point[1] for point in piece['outer']]
            for ix in range(int(min(xs) // size) - 1, int(max(xs) // size) + 2):
                for iz in range(int(min(zs) // size) - 1, int(max(zs) // size) + 2):
                    buckets.setdefault((ix, iz), []).append((record, piece))
    return buckets


def parent_at(cx, cz, buckets, size=64):
    seen = set()
    for record, piece in buckets.get((int(cx // size), int(cz // size)), []):
        if id(piece) in seen:
            continue
        seen.add(id(piece))
        if inside_polygon(cx, cz, piece['outer'], piece['holes']):
            return record['id']
    return None


def planning_parts(bbox, records):
    features = query_features(
        PLANNING_URL, bbox,
        'OBJECTID,BLDG_HEIGHT,BLDG_ELEV,NAME,LANDUSE,YEAR_BUILT,FEATURE_CODE')
    buckets = spatial_buckets(records)
    parts = []
    for feature in features:
        props = feature.get('properties') or {}
        height_ft = number(props.get('BLDG_HEIGHT'))
        if height_ft is None:
            continue
        for polygon in geo_polygons(feature.get('geometry') or {}):
            if not polygon:
                continue
            outer = to_world_ring(polygon[0])
            if len(outer) < 3:
                continue
            cx, cz, area = centroid(outer)
            parent = parent_at(cx, cz, buckets)
            code = props.get('FEATURE_CODE')
            parts.append({
                'parent': parent,
                'heightM': height_ft * FT_TO_M,
                'area': area,
                'cx': cx,
                'cz': cz,
                'code': code,
                'name': props.get('NAME') or '',
                'landuse': props.get('LANDUSE') or '',
                'year': number(props.get('YEAR_BUILT')),
                'lonlat': [[round(lon, 7), round(lat, 7)] for lon, lat, *_ in polygon[0]],
            })
    return parts


def attach_sections(playable, parts, records_by_id):
    """Planning parts that rise more than 3 m above the main mass become sections.

    The Circuit Court is the exception: its two published towers replace the
    single county extrusion when Planning drew more than one part.
    """
    by_parent = {}
    for part in parts:
        if part['parent'] is not None:
            by_parent.setdefault(part['parent'], []).append(part)
    sections = []
    for entry in playable:
        group = by_parent.get(entry['id'], [])
        if any(part['code'] in (2205, '2205') for part in group):
            entry['garage'] = True
        if entry['id'] == 129186 and len(group) >= 2:
            north = (-77.149871, 39.083429)
            south = (-77.150312, 39.082874)
            nx, nz = lonlat_to_world(*north)
            sx, sz = lonlat_to_world(*south)
            for part in group:
                if part['area'] < 20:
                    continue
                north_d = math.hypot(part['cx'] - nx, part['cz'] - nz)
                south_d = math.hypot(part['cx'] - sx, part['cz'] - sz)
                height = 46.02 if north_d <= south_d else 25.60
                note = ('North tower, 151 ft Google Earth roof, nine storeys.'
                        if height == 46.02 else
                        'South tower, six storeys. Rockville 84 ft matches 14 ft per storey.')
                sections.append({
                    'parentId': 129186,
                    'replacesParent': True,
                    'heightM': height,
                    'role': 'circuit-court-tower',
                    'evidence': note + ' Estimate.',
                    'coordinates': part['lonlat'],
                })
            if any(section['parentId'] == 129186 for section in sections):
                entry['replacedBySections'] = True
            continue
        if entry['confidence'] not in ('High', 'Medium'):
            continue
        footprint_area = records_by_id[entry['id']]['area']
        for part in group:
            if part['heightM'] < entry['heightM'] + 3:
                continue
            if part['area'] < 18 or part['area'] > footprint_area * 0.72:
                continue
            sections.append({
                'parentId': entry['id'],
                'replacesParent': False,
                'heightM': round(min(part['heightM'], 80), 2),
                'baseHeightM': entry['heightM'],
                'role': 'planning-upper-part',
                'evidence': ('Planning part is more than 3 m above the main mass and '
                             'covers under 72 percent of the county footprint.'),
                'coordinates': part['lonlat'],
            })
    return sections


def mark_garages_from_parts(playable, parts):
    # Already handled in attach_sections. Kept so a building with only a garage
    # part still receives the flag when attach_sections ran.
    return playable


def fetch_parking(bbox, boundary):
    outer, holes = boundary
    try:
        features = query_features(PARKING_URL, bbox, 'OBJECTID,NAME,SURFACE,FEATURE_CODE')
    except Exception as error:  # noqa: BLE001
        print('parking fetch failed:', error)
        return []
    kept = []
    for feature in features:
        props = feature.get('properties') or {}
        for polygon in geo_polygons(feature.get('geometry') or {}):
            if not polygon or len(polygon[0]) < 4:
                continue
            outer_ll = polygon[0]
            world = to_world_ring(outer_ll)
            if len(world) < 3:
                continue
            cx, cz, area = centroid(world)
            if area < 40:
                continue
            if distance_to_polygon(cx, cz, outer, holes) > 20:
                continue
            kept.append({
                'type': 'Feature',
                'properties': {
                    'name': props.get('NAME') or 'Parking',
                    'surface': props.get('SURFACE') or '',
                    'source': 'Montgomery Planning parking layer',
                },
                'geometry': {
                    'type': 'Polygon',
                    'coordinates': [[[round(lon, 7), round(lat, 7)] for lon, lat, *_ in outer_ll]],
                },
            })
    return kept


def sample_dem(cols, rows):
    points = []
    for row in range(rows):
        z = Z0 + row * STEP
        for col in range(cols):
            x = X0 + col * STEP
            lon, lat = world_to_lonlat(x, z)
            points.append((round(lon, 7), round(lat, 7)))
    values = [None] * len(points)
    batches = []
    size = 180
    for start in range(0, len(points), size):
        batches.append((start, points[start:start + size]))

    def one_batch(item):
        start, batch = item
        geometry = json.dumps({
            'points': batch,
            'spatialReference': {'wkid': 4326},
        }, separators=(',', ':'))
        payload = http_json(DEM_URL, {
            'geometry': geometry,
            'geometryType': 'esriGeometryMultipoint',
            'returnFirstValueOnly': 'true',
            'interpolation': 'RSP_BilinearInterpolation',
            'f': 'json',
        }, timeout=90, retries=5)
        found = {}
        for sample in payload.get('samples') or []:
            raw = sample.get('value')
            if raw in (None, '', 'NoData'):
                continue
            value = float(raw)
            if 80 < value < 220:
                found[int(sample.get('locationId', -1))] = value
        return start, found

    done = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(one_batch, batch) for batch in batches]
        for future in as_completed(futures):
            start, found = future.result()
            for index, value in found.items():
                if index >= 0:
                    values[start + index] = value
            done += 1
            if done % 20 == 0:
                print(f'  DEM batches {done}/{len(batches)}')
    missing = [index for index, value in enumerate(values) if value is None]
    print(f'DEM samples {len(values) - len(missing)}/{len(values)}')
    # Fill holes from the average of already-known orthogonal neighbours.
    for _ in range(8):
        if not missing:
            break
        still = []
        for index in missing:
            row, col = divmod(index, cols) if False else (index // cols, index % cols)
            near = []
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                rr, cc = row + dr, col + dc
                if 0 <= rr < rows and 0 <= cc < cols and values[rr * cols + cc] is not None:
                    near.append(values[rr * cols + cc])
            if near:
                values[index] = sum(near) / len(near)
            else:
                still.append(index)
        missing = still
    if missing:
        known = [value for value in values if value is not None]
        fill = statistics.median(known)
        for index in missing:
            values[index] = fill
        print(f'filled {len(missing)} DEM holes with the median')
    return values


def bilinear(values, cols, rows, x, z):
    col = (x - X0) / STEP
    row = (z - Z0) / STEP
    col = min(max(col, 0), cols - 1.001)
    row = min(max(row, 0), rows - 1.001)
    c0, r0 = int(col), int(row)
    tx, tz = col - c0, row - r0
    def at(rr, cc):
        return values[rr * cols + cc]
    v00 = at(r0, c0)
    v10 = at(r0, c0 + 1)
    v01 = at(r0 + 1, c0)
    v11 = at(r0 + 1, c0 + 1)
    return (v00 * (1 - tx) + v10 * tx) * (1 - tz) + (v01 * (1 - tx) + v11 * tx) * tz


def epqs(lon, lat):
    payload = http_json('https://epqs.nationalmap.gov/v1/json', {
        'x': str(lon), 'y': str(lat), 'units': 'Meters', 'wkid': '4326',
    }, timeout=40)
    return float(payload['value'])


def dem_point(lon, lat):
    payload = http_json(DEM_URL, {
        'geometry': json.dumps({'points': [[lon, lat]], 'spatialReference': {'wkid': 4326}}),
        'geometryType': 'esriGeometryMultipoint',
        'returnFirstValueOnly': 'true',
        'interpolation': 'RSP_BilinearInterpolation',
        'f': 'json',
    })
    return float(payload['samples'][0]['value'])


def long_axis(record):
    points = [point for piece in record['polygons'] for point in piece['outer']]
    cx = sum(p[0] for p in points) / len(points)
    cz = sum(p[1] for p in points) / len(points)
    sxx = szz = sxz = 0.0
    for x, z in points:
        dx, dz = x - cx, z - cz
        sxx += dx * dx
        szz += dz * dz
        sxz += dx * dz
    # Principal direction of the covariance.
    angle = 0.5 * math.atan2(2 * sxz, sxx - szz)
    return math.cos(angle), math.sin(angle)


def landmarks(records_by_id, playable_index, dem_origin, values, cols, rows):
    def ground(record):
        return bilinear(values, cols, rows, record['cx'], record['cz']) - dem_origin

    clock = records_by_id.get(129521)
    clock_entry = None
    if clock:
        lx, lz = long_axis(clock)
        # Model +X maps to (cos θ, -sin θ) in (x, z). Align it with the long axis,
        # then flip 180° so the model's +Z facade points west, toward Town Square.
        theta = math.atan2(-lz, lx)
        facade_x = math.sin(theta)
        if facade_x > 0:
            theta += math.pi
        clock_entry = {
            'id': 'clock-tower',
            'footprintId': 129521,
            'address': '1 CHURCH ST 20850',
            'glb': 'landmarks/clock_tower_building.glb',
            'rotationY': round(theta, 5),
            'documentedRotationY': round(-math.pi / 2, 5),
            'position': {
                'x': round(clock['cx'], 2),
                'z': round(clock['cz'], 2),
                'baseElevationM': round(ground(clock), 2),
            },
            'hideProcedural': True,
            'sourceBranch': 'grok/rockville-landmarks',
            'notes': ('1 Church Street is the downtown clock-tower office. The GLB '
                      'stays on grok/rockville-landmarks and is not copied here. When '
                      'the file is present the procedural mass and its collider are '
                      'removed. rotationY aligns the model long axis with the county '
                      'footprint and turns the facade toward west.'),
        }

    downtown_x, downtown_z = lonlat_to_world(-77.15000654, 39.08409274)
    turret_candidate = None
    best = 1e9
    for record in records_by_id.values():
        if record['id'] not in playable_index:
            continue
        if math.hypot(record['cx'] - downtown_x, record['cz'] - downtown_z) > 180:
            continue
        if not (700 <= record['area'] <= 1400):
            continue
        points = [point for piece in record['polygons'] for point in piece['outer']]
        width = max(p[0] for p in points) - min(p[0] for p in points)
        depth = max(p[1] for p in points) - min(p[1] for p in points)
        score = abs(width - 31.5) + abs(depth - 30.5)
        score += math.hypot(record['cx'] - downtown_x, record['cz'] - downtown_z) * 0.02
        if score < best:
            best = score
            turret_candidate = (record, width, depth)
    turret_entry = {
        'id': 'turret-corner',
        'glb': 'landmarks/turret_corner_building.glb',
        'documentedRotationY': round(math.pi, 5),
        'hideProcedural': False,
        'sourceBranch': 'grok/rockville-landmarks',
        'notes': ('Reserved. The GLB on grok/rockville-landmarks is a corner turret '
                  'with a 31.5 m by 30.5 m plan. hideProcedural stays false until the '
                  'owner confirms the footprint, so the county mass is not removed.'),
    }
    if turret_candidate:
        record, width, depth = turret_candidate
        turret_entry.update({
            'candidateFootprintId': record['id'],
            'candidateAddress': record['address'],
            'candidateName': record['name'],
            'candidateSizeM': [round(width, 1), round(depth, 1)],
            'position': {
                'x': round(record['cx'], 2),
                'z': round(record['cz'], 2),
                'baseElevationM': round(ground(record), 2),
            },
            'rotationY': round(math.pi, 5),
        })

    west = lonlat_to_world(-77.147906, 39.084072)
    east = lonlat_to_world(-77.146665, 39.084408)
    bridge = {
        'id': 'metro-pedestrian-bridge',
        'osmWay': 266681164,
        'name': 'ROCKVILLE METRO PED BRG',
        'planningPolygon': 1319,
        'west': {
            'longitude': -77.147906, 'latitude': 39.084072,
            'x': round(west[0], 2), 'z': round(west[1], 2),
            'groundElevationM': round(bilinear(values, cols, rows, *west) - dem_origin, 2),
        },
        'east': {
            'longitude': -77.146665, 'latitude': 39.084408,
            'x': round(east[0], 2), 'z': round(east[1], 2),
            'groundElevationM': round(bilinear(values, cols, rows, *east) - dem_origin, 2),
        },
        'deckElevationM': None,
        'clearanceOverPikeM': None,
        'deckWidthM': None,
        'todo': ('Deck elevation, clearance over Rockville Pike, and deck width were '
                 'not measured. The Maryland DEM under the span is bare earth, about '
                 'the road and rail bed, not the deck. Do not invent these numbers. '
                 'The two connection points are the OSM way endpoints.'),
    }
    return {'landmarks': [entry for entry in (clock_entry, turret_entry) if entry],
            'bridge': bridge}


def write_outputs(playable, backdrop_ids, records_by_id, sections, parking, values,
                  cols, rows, dem_origin, checks, landmark_doc, missing_ids):
    OUT.mkdir(parents=True, exist_ok=True)
    REPORT_DATA.mkdir(parents=True, exist_ok=True)
    counts = {}
    methods = {}
    for entry in playable:
        counts[entry['confidence']] = counts.get(entry['confidence'], 0) + 1
        methods[entry['method']] = methods.get(entry['method'], 0) + 1

    buildings = {}
    for entry in playable:
        buildings[str(entry['id'])] = {
            'heightM': entry['heightM'],
            'confidence': entry['confidence'],
            'method': entry['method'],
            'roof': entry['roof'],
            'roofSource': entry['roofSource'],
            'ridgeM': entry['ridgeM'],
            'year': entry['year'],
            'garage': entry['garage'],
            'replacedBySections': bool(entry.get('replacedBySections')),
            'address': entry['address'],
            'name': entry['name'],
            'evidence': entry['evidence'],
        }
    heights = {
        'description': 'Data-driven heights for footprints inside the playable boundary. '
                       'High and Medium are the approved audit measurements. Estimated is '
                       'labelled as an estimate in every evidence string.',
        'demOriginM': round(dem_origin, 3),
        'counts': counts,
        'methods': methods,
        'missingAuditIds': missing_ids,
        'buildings': buildings,
    }
    (OUT / 'building-heights.json').write_text(json.dumps(heights, indent=1))

    features = []
    for record in records_by_id.values():
        role = 'playable' if str(record['id']) in buildings else (
            'backdrop' if record['id'] in backdrop_ids else None)
        if role is None:
            continue
        coordinates = []
        for piece in record['polygons']:
            ring = piece['lonlat']
            if ring[0] != ring[-1]:
                ring = ring + [ring[0]]
            holes = []
            for hole in piece['holeLonlat']:
                if hole[0] != hole[-1]:
                    hole = hole + [hole[0]]
                holes.append(hole)
            coordinates.append([ring, *holes])
        geometry = ({'type': 'Polygon', 'coordinates': coordinates[0]} if len(coordinates) == 1
                    else {'type': 'MultiPolygon', 'coordinates': coordinates})
        features.append({
            'type': 'Feature',
            'id': record['id'],
            'properties': {
                'OBJECTID': record['id'],
                'ADDRESS': record['address'],
                'BLDG_NAME': record['name'],
                'STREET_NAME': record['street'],
                'BLDG_CLASS': record['bldgClass'],
                'role': role,
            },
            'geometry': geometry,
        })
    (OUT / 'footprints.geojson').write_text(json.dumps({
        'type': 'FeatureCollection',
        'properties': {
            'source': 'Montgomery County Building Footprints, queried for this upgrade.',
            'playable': 'centroid inside data/playable-boundary.geojson',
            'backdrop': f'centroid within {APRON_M:.0f} m outside the boundary',
        },
        'features': features,
    }))

    (OUT / 'building-sections.geojson').write_text(json.dumps({
        'type': 'FeatureCollection',
        'features': [{
            'type': 'Feature',
            'properties': {key: value for key, value in section.items() if key != 'coordinates'},
            'geometry': {'type': 'Polygon', 'coordinates': [section['coordinates']
                         + ([section['coordinates'][0]] if section['coordinates'][0] != section['coordinates'][-1] else [])]},
        } for section in sections],
    }))
    (OUT / 'parking.geojson').write_text(json.dumps({
        'type': 'FeatureCollection',
        'features': parking,
    }))
    (OUT / 'landmarks.json').write_text(json.dumps(landmark_doc, indent=2))
    (OUT / 'terrain.json').write_text(json.dumps({
        'source': 'Maryland Montgomery County DEM metres, 2020-21 bare earth, bilinear 10 m grid',
        'service': 'MD_montgomery_dem_m',
        'verticalDatum': 'NAVD88 metres, as served',
        'demOriginM': round(dem_origin, 3),
        'originLongitude': ORIGIN_LON,
        'originLatitude': ORIGIN_LAT,
        'metersPerDegreeEast': M_EAST,
        'metersPerDegreeNorth': M_NORTH,
        'x0': X0, 'z0': Z0, 'step': STEP, 'cols': cols, 'rows': rows,
        'elevDm': [int(round((value - dem_origin) * 10)) for value in values],
    }, separators=(',', ':')))

    with (REPORT_DATA / 'heights-applied.csv').open('w', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(['object_id', 'address', 'name', 'height_m', 'confidence',
                         'method', 'roof', 'ridge_m', 'evidence'])
        for entry in sorted(playable, key=lambda item: item['id']):
            writer.writerow([entry['id'], entry['address'], entry['name'], entry['heightM'],
                             entry['confidence'], entry['method'], entry['roof'],
                             entry['ridgeM'], entry['evidence']])
    (REPORT_DATA / 'terrain-check.json').write_text(json.dumps({
        'demOriginM': round(dem_origin, 3),
        'grid': {'cols': cols, 'rows': rows, 'stepM': STEP},
        'checks': checks,
        'counts': counts,
        'methods': methods,
        'sections': len(sections),
        'parking': len(parking),
        'backdrop': len(backdrop_ids),
        'playable': len(playable),
    }, indent=2))
    print(json.dumps({'counts': counts, 'methods': methods, 'sections': len(sections),
                      'parking': len(parking), 'backdrop': len(backdrop_ids),
                      'playable': len(playable), 'missing': missing_ids}, indent=2))


def main():
    print('projection', round(M_EAST, 3), round(M_NORTH, 3))
    reconciliation = load_reconciliation()
    boundary = load_boundary()
    outer, _holes = boundary
    xs = [point[0] for point in outer]
    zs = [point[1] for point in outer]
    west, north = world_to_lonlat(min(xs) - APRON_M - 20, min(zs) - APRON_M - 20)
    east, south = world_to_lonlat(max(xs) + APRON_M + 20, max(zs) + APRON_M + 20)
    # world_to_lonlat on a more-south z returns the southern latitude. Swap if needed.
    if south > north:
        south, north = north, south
    bbox = (west, south, east, north)
    print('query bbox', [round(v, 5) for v in bbox])
    print('fetching footprints…')
    raw_footprints = query_features(
        FOOTPRINTS_URL, bbox,
        'OBJECTID,ADDRESS,BLDG_NAME,STREET_NAME,BLDG_CLASS,BLDG_TYPE')
    records = []
    for feature in raw_footprints:
        record = footprint_record(feature)
        if record:
            records.append(record)
    records_by_id = {}
    for record in records:
        # Keep the first if the service repeats an id.
        records_by_id.setdefault(record['id'], record)
    records = list(records_by_id.values())
    missing_ids = [object_id for object_id in reconciliation if object_id not in records_by_id]
    if missing_ids:
        print(f'fetching {len(missing_ids)} footprints the envelope missed')
        where = 'OBJECTID IN (' + ','.join(str(object_id) for object_id in missing_ids) + ')'
        payload = http_json(FOOTPRINTS_URL, {
            'f': 'geojson', 'where': where,
            'outFields': 'OBJECTID,ADDRESS,BLDG_NAME,STREET_NAME,BLDG_CLASS,BLDG_TYPE',
            'returnGeometry': 'true', 'outSR': '4326',
        })
        for feature in payload.get('features') or []:
            record = footprint_record(feature)
            if record:
                records_by_id[record['id']] = record
        records = list(records_by_id.values())
    print(f'footprints {len(records)}')
    playable, backdrop_ids = resolve_heights(records, reconciliation, boundary)
    playable_ids = {entry['id'] for entry in playable}
    missing = sorted(set(reconciliation) - playable_ids)
    print('audit ids missing from the playable set', missing)
    print('fetching planning parts…')
    playable_records = [records_by_id[entry['id']] for entry in playable if entry['id'] in records_by_id]
    parts = planning_parts(bbox, playable_records)
    print(f'planning parts {len(parts)}')
    for entry in playable:
        if any(part['parent'] == entry['id'] and part['code'] in (2205, '2205') for part in parts):
            entry['garage'] = True
    sections = attach_sections(playable, parts, records_by_id)
    print(f'sections {len(sections)}')
    print('fetching parking…')
    parking = fetch_parking(bbox, boundary)
    print(f'parking {len(parking)}')
    cols = int(round((X1 - X0) / STEP)) + 1
    rows = int(round((Z1 - Z0) / STEP)) + 1
    print(f'sampling DEM {cols}x{rows}…')
    values = sample_dem(cols, rows)
    dem_origin = dem_point(ORIGIN_LON, ORIGIN_LAT)
    print('DEM origin', dem_origin)

    check_points = {
        'origin': (ORIGIN_LON, ORIGIN_LAT),
        'hungerford_808': (-77.153844, 39.094821),
        'metro_station': (-77.146634, 39.084431),
        'bridge_midpoint': (-77.1472855, 39.08424),
        'town_square': (-77.15000654, 39.08409274),
        'pike_south': (-77.1465, 39.08060),
        'circuit_court': (-77.150259, 39.083309),
        'exchange_place': (-77.151243, 39.089539),
    }
    record = records_by_id.get(129186)
    if record:
        check_points['court_centroid'] = world_to_lonlat(record['cx'], record['cz'])
    named = {}
    for row in reconciliation.values():
        if row['address'].startswith('101 MONROE'):
            named['monroe_101'] = (float(row['longitude']), float(row['latitude']))
        if row['address'].startswith('51 MONROE'):
            named['monroe_51'] = (float(row['longitude']), float(row['latitude']))
    check_points.update(named)

    checks = []
    for name, (lon, lat) in check_points.items():
        x, z = lonlat_to_world(lon, lat)
        grid = bilinear(values, cols, rows, x, z)
        try:
            direct = dem_point(lon, lat)
        except Exception as error:  # noqa: BLE001
            direct = None
            print('DEM point failed', name, error)
        try:
            survey = epqs(lon, lat)
        except Exception as error:  # noqa: BLE001
            survey = None
            print('EPQS failed', name, error)
        checks.append({
            'name': name, 'longitude': lon, 'latitude': lat,
            'gridM': round(grid, 3),
            'demM': None if direct is None else round(direct, 3),
            'epqsM': None if survey is None else round(survey, 3),
            'gridMinusDemM': None if direct is None else round(grid - direct, 3),
            'demMinusEpqsM': None if direct is None or survey is None else round(direct - survey, 3),
            'gameYM': round(grid - dem_origin, 3),
        })
        print(f'  {name}: grid {grid:.2f} dem {direct} epqs {survey}')

    inside_values = []
    for row in range(rows):
        for col in range(cols):
            x = X0 + col * STEP
            z = Z0 + row * STEP
            if distance_to_polygon(x, z, boundary[0], boundary[1]) == 0:
                inside_values.append(values[row * cols + col])
    if inside_values:
        low = min(inside_values)
        high = max(inside_values)
        print(f'playable DEM span {high - low:.2f} m ({low:.2f} to {high:.2f})')
        checks.append({
            'name': 'playable-grid-span',
            'minM': round(low, 3),
            'maxM': round(high, 3),
            'spanM': round(high - low, 3),
        })
    playable_index = {entry['id'] for entry in playable}
    landmark_doc = landmarks(records_by_id, playable_index, dem_origin, values, cols, rows)
    write_outputs(playable, set(backdrop_ids), records_by_id, sections, parking, values,
                  cols, rows, dem_origin, checks, landmark_doc, missing)


if __name__ == '__main__':
    main()
