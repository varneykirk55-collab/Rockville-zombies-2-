#!/usr/bin/env python3
"""Join county footprints to Planning 3D heights and replay the game height formula.

Writes data/height-comparison.csv. Does not modify the game.
The geohub footprint service can return a short page while exceededTransferLimit
is still true, so this paginates by 1000 the same way src/footprints.js does.
"""

import csv
import json
import math
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "height-comparison.csv"
UA = {"User-Agent": "RockvilleGeographicAudit/1.0 (research; height comparison)"}
FP = ("https://geohub.montgomerycountymd.gov/mapping1/rest/services/"
      "Structures/Building_Footprints/FeatureServer/0/query")
B3 = ("https://montgomeryplans.org/server/rest/services/"
      "Overlays/Buildings_3D/MapServer/0/query")
GEOM = json.dumps({"rings": [[
    [-77.155, 39.080], [-77.155, 39.095], [-77.140, 39.095],
    [-77.140, 39.080], [-77.155, 39.080],
]]})

ORIGIN_LON, ORIGIN_LAT = -77.152, 39.086
LAT_R = ORIGIN_LAT * math.pi / 180
METERS_EAST = (111412.84 * math.cos(LAT_R) - 93.5 * math.cos(3 * LAT_R)
               + 0.118 * math.cos(5 * LAT_R))
METERS_NORTH = (111132.92 - 559.82 * math.cos(2 * LAT_R)
                + 1.175 * math.cos(4 * LAT_R) - 0.0023 * math.cos(6 * LAT_R))


def get(url):
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.loads(response.read())


def query(base, params):
    return get(base + "?" + urllib.parse.urlencode(params))


def to_world(lon, lat):
    return (lon - ORIGIN_LON) * METERS_EAST, (ORIGIN_LAT - lat) * METERS_NORTH


def variation(object_id):
    """src/buildings.js variation(), including Math.imul."""
    value = int(object_id) & 0xFFFFFFFF
    mixed = (value ^ ((value >> 16) & 0xFFFFFFFF)) & 0xFFFFFFFF
    signed = mixed - 0x100000000 if mixed >= 0x80000000 else mixed
    return ((signed * 0x45d9f3b) & 0xFFFFFFFF) / 4294967296


def mass_height(area, seed):
    low = 5 + 29 * (1 - math.exp(-max(0.0, area - 85) / 1200))
    return min(40.0, max(5.0, low + (seed - 0.22) * 9))


def ring_metrics(ring):
    if len(ring) >= 2 and ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 3:
        return 0.0, None
    points = [to_world(lon, lat) for lon, lat in ring]
    area = cx = cz = 0.0
    for index, (x1, z1) in enumerate(points):
        x2, z2 = points[(index + 1) % len(points)]
        cross = x1 * z2 - x2 * z1
        area += cross
        cx += (x1 + x2) * cross
        cz += (z1 + z2) * cross
    if abs(area) < 1e-8:
        return 0.0, (sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points))
    return abs(area) * 0.5, (cx / (3 * area), cz / (3 * area))


def contains(x, z, ring):
    inside = False
    previous = len(ring) - 1
    for index, (xi, zi) in enumerate(ring):
        xj, zj = ring[previous]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        previous = index
    return inside


def fetch_footprints():
    features = {}
    offset = 0
    while offset <= 3000:
        page = query(FP, {
            "f": "json", "where": "1=1", "geometry": GEOM,
            "geometryType": "esriGeometryPolygon", "spatialRel": "esriSpatialRelIntersects",
            "inSR": "4326", "outSR": "4326",
            "outFields": "OBJECTID,BLDG_ID,BLDG_NAME,BLDG_CLASS,ADDRESS",
            "returnGeometry": "true", "orderByFields": "OBJECTID ASC",
            "resultRecordCount": "1000", "resultOffset": str(offset),
        })
        if page.get("error"):
            raise SystemExit(page["error"])
        batch = page.get("features") or []
        for feature in batch:
            features[feature["attributes"]["OBJECTID"]] = feature
        if not batch or page.get("exceededTransferLimit") is False:
            break
        offset += 1000
    return list(features.values())


def fetch_parts():
    page = query(B3, {
        "f": "json", "where": "1=1",
        "geometry": "-77.155,39.080,-77.140,39.095",
        "geometryType": "esriGeometryEnvelope", "inSR": "4326", "outSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "BLDG_ID,NAME,FEATURE_CODE,SOURCE_CODE,BLDG_HEIGHT,BLDG_ELEV,YEAR_BUILT,LANDUSE",
        "returnGeometry": "true", "resultRecordCount": "2000",
    })
    if page.get("error"):
        raise SystemExit(page["error"])
    return page.get("features") or []


def main():
    footprints = fetch_footprints()
    parts = fetch_parts()
    prepared = []
    grid = defaultdict(list)
    cell = 40
    for feature in footprints:
        rings = feature["geometry"]["rings"]
        outer_area, centroid = ring_metrics(rings[0])
        hole_area = 0.0
        holes = []
        for hole in rings[1:]:
            area, _ = ring_metrics(hole)
            hole_area += area
            pts = hole[:-1] if hole[0] == hole[-1] else hole
            holes.append([to_world(lon, lat) for lon, lat in pts])
        outer = rings[0][:-1] if rings[0][0] == rings[0][-1] else rings[0]
        xz = [to_world(lon, lat) for lon, lat in outer]
        xs = [p[0] for p in xz]
        zs = [p[1] for p in xz]
        record = {
            "feature": feature,
            "area": max(0.0, outer_area - hole_area),
            "xz": xz,
            "holes": holes,
            "minx": min(xs), "maxx": max(xs), "minz": min(zs), "maxz": max(zs),
            "centroid": centroid,
        }
        index = len(prepared)
        prepared.append(record)
        for ix in range(math.floor(record["minx"] / cell), math.floor(record["maxx"] / cell) + 1):
            for iz in range(math.floor(record["minz"] / cell), math.floor(record["maxz"] / cell) + 1):
                grid[(ix, iz)].append(index)

    def find(x, z):
        for index in grid.get((math.floor(x / cell), math.floor(z / cell)), []):
            record = prepared[index]
            if not (record["minx"] <= x <= record["maxx"] and record["minz"] <= z <= record["maxz"]):
                continue
            if contains(x, z, record["xz"]) and not any(contains(x, z, hole) for hole in record["holes"]):
                return index
        return None

    grouped = defaultdict(list)
    for feature in parts:
        area, centroid = ring_metrics(feature["geometry"]["rings"][0])
        if not centroid:
            continue
        index = find(*centroid)
        if index is None:
            continue
        attributes = feature["attributes"]
        grouped[index].append({
            "height_ft": attributes.get("BLDG_HEIGHT") or 0,
            "elev_ft": attributes.get("BLDG_ELEV"),
            "area": area,
            "name": (attributes.get("NAME") or "").strip(),
            "year": attributes.get("YEAR_BUILT"),
            "source": attributes.get("SOURCE_CODE"),
            "landuse": attributes.get("LANDUSE") or "",
            "code": attributes.get("FEATURE_CODE"),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "object_id", "address", "name", "bldg_class", "area_m2", "game_height_m",
        "planning_primary_height_m", "planning_max_height_m", "planning_primary_height_ft",
        "base_elevation_ft", "part_count", "year_built", "source_code", "landuse",
        "feature_code", "error_game_minus_primary_m", "longitude", "latitude", "game_x_m", "game_z_m",
    ]
    with OUT.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for index, pieces in grouped.items():
            record = prepared[index]
            attributes = record["feature"]["attributes"]
            primary = max(pieces, key=lambda piece: piece["area"])
            tallest = max(pieces, key=lambda piece: piece["height_ft"])
            object_id = int(attributes["OBJECTID"])
            game = mass_height(record["area"], variation(object_id))
            primary_m = primary["height_ft"] * 0.3048
            lon = ORIGIN_LON + record["centroid"][0] / METERS_EAST
            lat = ORIGIN_LAT - record["centroid"][1] / METERS_NORTH
            writer.writerow({
                "object_id": object_id,
                "address": attributes.get("ADDRESS") or "",
                "name": (attributes.get("BLDG_NAME") or "").strip() or primary["name"],
                "bldg_class": attributes.get("BLDG_CLASS") or "",
                "area_m2": round(record["area"], 1),
                "game_height_m": round(game, 2),
                "planning_primary_height_m": round(primary_m, 2),
                "planning_max_height_m": round(tallest["height_ft"] * 0.3048, 2),
                "planning_primary_height_ft": round(primary["height_ft"], 2),
                "base_elevation_ft": "" if primary["elev_ft"] is None else round(primary["elev_ft"], 2),
                "part_count": len(pieces),
                "year_built": primary["year"] if primary["year"] is not None else "",
                "source_code": primary["source"] if primary["source"] is not None else "",
                "landuse": primary["landuse"],
                "feature_code": primary["code"],
                "error_game_minus_primary_m": round(game - primary_m, 2),
                "longitude": round(lon, 6),
                "latitude": round(lat, 6),
                "game_x_m": round(record["centroid"][0], 2),
                "game_z_m": round(record["centroid"][1], 2),
            })
    print(f"footprints {len(footprints)} parts {len(parts)} matched_footprints {len(grouped)}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
