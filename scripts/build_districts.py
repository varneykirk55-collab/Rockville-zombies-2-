#!/usr/bin/env python3
"""Partition the  playable Rockville footprints into four non-overlapping districts.

The district of a building is a rule on its address and centroid. District
polygons are the Voronoi cells of those centroids (plus a few open-space
anchors), unioned by district and clipped to the playable boundary. A
centroid therefore cannot fall in another district's polygon.
"""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import MultiPoint, Point, mapping, shape
from shapely.ops import unary_union, voronoi_diagram

ROOT = Path(__file__).resolve().parents[1]
M_LON = 86521.40974372809
M_LAT = 111017.09630490161
ORIGIN = (-77.152, 39.086)

DISTRICTS = {
    "A": {
        "id": "town-square",
        "name": "Town Square",
        "owner": "district-a",
        "color": "#d4a017",
        "summary": "Plaza and the mixed-use buildings around it, including the Helen Heneghan turret block and the Cambria tower.",
    },
    "B": {
        "id": "hungerford",
        "name": "Hungerford Corridor",
        "owner": "district-b",
        "color": "#2f7d4a",
        "summary": "Northern commercial corridor, both sides of Hungerford Drive inside the playable boundary.",
    },
    "C": {
        "id": "regal-courthouse",
        "name": "Regal and Courthouse",
        "owner": "district-c",
        "color": "#8d3b4c",
        "summary": "Regal and the East Montgomery colonnade, Maryland Avenue, Courthouse Square, the historic courthouse, Circuit Court, District Court, and the Executive Office Building.",
    },
    "D": {
        "id": "pike-metro",
        "name": "Rockville Pike and Metro",
        "owner": "district-d",
        "color": "#2c6cb0",
        "summary": "Remaining southern and eastern development, the Metro station, parking structures, and the pedestrian bridge.",
    },
}

# Open ground that should stay with a district even though no footprint sits on it.
ANCHORS = [
    ("A", -77.15045, 39.08412, "town-square-plaza"),
    ("A", -77.15015, 39.08455, "town-square-north-walk"),
    ("C", -77.15155, 39.08385, "courthouse-square-lawn"),
    ("D", -77.1460, 39.0845, "metro-platform"),
    ("D", -77.1452, 39.0844, "metro-rear-loop"),
]


def xz(lon: float, lat: float) -> tuple[float, float]:
    return (lon - ORIGIN[0]) * M_LON, (ORIGIN[1] - lat) * M_LAT


def centroid_of(geometry: dict) -> tuple[float, float]:
    """Area-weighted centroid. Coordinates are shifted to the first vertex so the
    shoelace sum does not cancel at geographic scale."""
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    area_sum = 0.0
    lon_sum = 0.0
    lat_sum = 0.0
    for rings in polygons:
        ring = rings[0]
        origin_lon, origin_lat = ring[0][0], ring[0][1]
        area = 0.0
        cx = 0.0
        cy = 0.0
        for i in range(len(ring) - 1):
            x1, y1 = ring[i][0] - origin_lon, ring[i][1] - origin_lat
            x2, y2 = ring[i + 1][0] - origin_lon, ring[i + 1][1] - origin_lat
            cross = x1 * y2 - x2 * y1
            area += cross
            cx += (x1 + x2) * cross
            cy += (y1 + y2) * cross
        area *= 0.5
        if abs(area) < 1e-18:
            continue
        area_sum += area
        lon_sum += (origin_lon + cx / (6 * area)) * area
        lat_sum += (origin_lat + cy / (6 * area)) * area
    if abs(area_sum) < 1e-18:
        raise ValueError("footprint has no area")
    return lon_sum / area_sum, lat_sum / area_sum


def classify(oid: int, rec: dict, lon: float, lat: float) -> str:
    address = (rec.get("address") or "").upper()
    name = (rec.get("name") or "").upper()
    # Northern corridor. The latitude cut is the commercial stretch inside the
    # boundary. Hungerford addresses just south of that cut, east of Maryland
    # Avenue, stay with the corridor instead of the courthouse streets.
    if lat >= 39.08725:
        return "B"
    if "HUNGERFORD" in address and lat >= 39.08645 and lon >= -77.15095:
        return "B"
    if "MARYLAND AVE" in address or "COURTHOUSE" in address:
        return "C"
    # Named courthouse-district buildings that do not carry those street words.
    if oid in {129058, 129932, 129186, 132710, 274036, 277318, 274034}:
        return "C"
    if "CIRCUIT" in name or "DISTRICT COURT" in name or "EXECUTIVE OFFICE" in name:
        return "C"
    if "RED BRICK" in name or name.strip() == "GRAY COURTHOUSE":
        return "C"
    # Town Square cluster: plaza block north of East Montgomery, not Maryland
    # Avenue and not Courthouse Square (those already returned C).
    if "HELEN HENEGHAN" in address:
        return "A"
    if address.startswith("196 E MONTGOMERY") or address.startswith("198 E MONTGOMERY"):
        return "A"
    if "E MIDDLE LN" in address and -77.1513 <= lon <= -77.1490 and 39.0840 <= lat <= 39.0853:
        return "A"
    if "E MONTGOMERY" in address and lat >= 39.08405 and lon >= -77.1512:
        return "A"
    return "D"


def as_feature(geom, properties: dict) -> dict:
    return {"type": "Feature", "properties": properties, "geometry": mapping(geom)}


def game_ring(geom) -> list[dict]:
    polygons = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
    rings = []
    for polygon in polygons:
        for ring in [polygon.exterior, *polygon.interiors]:
            coords = []
            for lon, lat in ring.coords:
                x, z = xz(lon, lat)
                coords.append({
                    "longitude": round(lon, 6),
                    "latitude": round(lat, 6),
                    "game_x_m": round(x, 2),
                    "game_z_m": round(z, 2),
                })
            rings.append(coords)
    return rings


def main() -> None:
    heights = json.loads((ROOT / "public/data/building-heights.json").read_text())["buildings"]
    footprints = json.loads((ROOT / "public/data/footprints.geojson").read_text())
    boundary = json.loads((ROOT / "docs/geographic-audit/data/playable-boundary.geojson").read_text())
    audit_ids = set()
    with (ROOT / "docs/geographic-audit/data/height-reconciliation.csv").open() as handle:
        for row in csv.DictReader(handle):
            audit_ids.add(int(row["object_id"]))

    playable = shape(boundary["features"][0]["geometry"]).buffer(0)
    audit_point = {}
    with (ROOT / "docs/geographic-audit/data/height-reconciliation.csv").open() as handle:
        for row in csv.DictReader(handle):
            audit_point[int(row["object_id"])] = (float(row["longitude"]), float(row["latitude"]))
    records = []
    for feature in footprints["features"]:
        if feature["properties"].get("role") != "playable":
            continue
        oid = int(feature["properties"]["OBJECTID"])
        rec = heights[str(oid)]
        # The audit centroid is the point that was tested against the boundary.
        lon, lat = audit_point.get(oid) or centroid_of(feature["geometry"])
        code = classify(oid, rec, lon, lat)
        records.append({
            "id": oid,
            "lon": lon,
            "lat": lat,
            "code": code,
            "address": (rec.get("address") or "").strip(),
            "name": (rec.get("name") or "").strip(),
            "heightM": rec["heightM"],
            "inAudit": oid in audit_ids,
        })

    points = [(item["lon"], item["lat"], item["code"], f"building:{item['id']}") for item in records]
    points.extend((lon, lat, code, name) for code, lon, lat, name in ANCHORS)
    multipoint = MultiPoint([(lon, lat) for lon, lat, _, _ in points])
    cells = voronoi_diagram(multipoint, envelope=playable.buffer(0.002), edges=False)
    grouped: dict[str, list] = defaultdict(list)
    unmatched = 0
    for cell in cells.geoms:
        owner = None
        for lon, lat, code, _name in points:
            if cell.covers(Point(lon, lat)):
                owner = code
                break
        if owner is None:
            unmatched += 1
            continue
        piece = cell.intersection(playable)
        if not piece.is_empty:
            grouped[owner].append(piece)

    polygons = {}
    for code in DISTRICTS:
        polygons[code] = unary_union(grouped[code]).buffer(0)

    # Force a partition: earlier districts keep their cells; D fills anything
    # left so the four polygons cover the playable area and do not overlap.
    claimed = unary_union([polygons[code] for code in ("A", "B", "C")])
    polygons["D"] = playable.difference(claimed).buffer(0)
    for code in ("A", "B", "C"):
        polygons[code] = polygons[code].intersection(playable).buffer(0)

    ownership_rows = []
    mismatches = []
    for item in records:
        point = Point(item["lon"], item["lat"])
        hits = [code for code, geom in polygons.items() if geom.covers(point)]
        if hits != [item["code"]]:
            mismatches.append((item["id"], item["code"], hits, item["address"]))
        x, z = xz(item["lon"], item["lat"])
        ownership_rows.append({
            **item,
            "districtId": DISTRICTS[item["code"]]["id"],
            "districtName": DISTRICTS[item["code"]]["name"],
            "gameX": round(x, 2),
            "gameZ": round(z, 2),
            "longitude": round(item["lon"], 6),
            "latitude": round(item["lat"], 6),
        })

    overlap_area = 0.0
    codes = list(DISTRICTS)
    for i, left in enumerate(codes):
        for right in codes[i + 1:]:
            overlap_area += polygons[left].intersection(polygons[right]).area
    covered = unary_union([polygons[code] for code in codes])
    gap_area = playable.difference(covered).area

    counts = Counter(item["code"] for item in records)
    audit_counts = Counter(item["code"] for item in records if item["inAudit"])
    extras = [item for item in records if not item["inAudit"]]

    out_data = ROOT / "public/data/districts"
    out_data.mkdir(parents=True, exist_ok=True)
    features = []
    for code, meta in DISTRICTS.items():
        geom = polygons[code]
        features.append(as_feature(geom, {
            "code": code,
            "id": meta["id"],
            "name": meta["name"],
            "owner": meta["owner"],
            "color": meta["color"],
            "summary": meta["summary"],
            "buildingCount": counts[code],
            "auditBuildingCount": audit_counts[code],
            "anchors": [name for anchor_code, _lon, _lat, name in ANCHORS if anchor_code == code],
            "gameFrame": game_ring(geom),
        }))
    collection = {
        "type": "FeatureCollection",
        "properties": {
            "crs_note": "WGS84. Game frame +X east, +Z south, origin -77.152, 39.086, 1 unit = 1 metre.",
            "meters_per_degree_east": M_LON,
            "meters_per_degree_north": M_LAT,
            "partition": "Voronoi of building centroids and open-space anchors, clipped to the playable boundary. Polygons do not overlap and their union is the playable polygon.",
            "playableBoundary": "public/data/playable-boundary.geojson",
        },
        "features": features,
    }
    (out_data / "boundaries.geojson").write_text(json.dumps(collection))
    (ROOT / "docs/city-development-foundation/data").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs/city-development-foundation/data/district-boundaries.geojson").write_text(json.dumps(collection))

    buildings_json = {
        "description": "Every playable footprint inside the owner-accepted boundary has exactly one district. The 508-row audit table is the required set. Four extra county footprints whose centroids also fall inside the polygon are included so the runtime set has no unowned building.",
        "auditBuildingCount": len(audit_ids),
        "playableBuildingCount": len(records),
        "extraInsideBoundary": [
            {"id": item["id"], "address": item["address"], "district": item["code"]} for item in extras
        ],
        "districts": {
            code: {
                **{k: meta[k] for k in ("id", "name", "owner", "color", "summary")},
                "buildingCount": counts[code],
                "auditBuildingCount": audit_counts[code],
            }
            for code, meta in DISTRICTS.items()
        },
        "buildings": {
            str(item["id"]): {
                "district": item["code"],
                "districtId": DISTRICTS[item["code"]]["id"],
                "address": item["address"],
                "name": item["name"],
                "longitude": round(item["lon"], 6),
                "latitude": round(item["lat"], 6),
                "gameX": round(xz(item["lon"], item["lat"])[0], 2),
                "gameZ": round(xz(item["lon"], item["lat"])[1], 2),
                "inAudit508": item["inAudit"],
            }
            for item in records
        },
    }
    (out_data / "ownership.json").write_text(json.dumps(buildings_json))
    (ROOT / "public/data/ownership.json").write_text(json.dumps(buildings_json))

    csv_path = ROOT / "docs/city-development-foundation/data/building-ownership.csv"
    with csv_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "id", "district", "districtId", "districtName", "address", "name",
            "longitude", "latitude", "gameX", "gameZ", "heightM", "inAudit508",
        ])
        writer.writeheader()
        for item in sorted(ownership_rows, key=lambda row: (row["code"], row["id"])):
            writer.writerow({
                "id": item["id"],
                "district": item["code"],
                "districtId": item["districtId"],
                "districtName": item["districtName"],
                "address": item["address"],
                "name": item["name"],
                "longitude": item["longitude"],
                "latitude": item["latitude"],
                "gameX": item["gameX"],
                "gameZ": item["gameZ"],
                "heightM": item["heightM"],
                "inAudit508": "yes" if item["inAudit"] else "no",
            })

    write_map(playable, polygons, records)
    print(json.dumps({
        "counts": dict(counts),
        "auditCounts": dict(audit_counts),
        "extras": len(extras),
        "mismatches": mismatches[:12],
        "mismatchCount": len(mismatches),
        "overlapAreaDeg2": overlap_area,
        "gapAreaDeg2": gap_area,
        "unmatchedCells": unmatched,
        "anchors": len(ANCHORS),
    }, indent=2))
    # Spot-check the landmarks the assignment names.
    watch = {
        129621: "turret candidate",
        129521: "1 Church Street",
        129058: "red brick courthouse",
        129932: "gray courthouse",
        129186: "circuit court",
        132710: "district court",
        274036: "executive office",
        277318: "199 E Montgomery / town square retail",
        240005: "Cambria",
        338888: "808 Hungerford",
        135172: "700 Rockville Pike",
        131132: "metro station",
        274034: "city hall",
    }
    by_id = {item["id"]: item for item in records}
    for oid, label in watch.items():
        item = by_id.get(oid)
        print(f"  {oid} {label}: {item['code'] if item else 'MISSING'} {item['address'] if item else ''}")
    print("--- district A buildings ---")
    for item in sorted((row for row in records if row["code"] == "A"), key=lambda row: row["address"]):
        print(f"  {item['id']:8} {item['lat']:.5f} {item['lon']:.5f} {item['address'][:40]:40} {item['name'][:24]}")
    print("--- district C sample (named) ---")
    for item in sorted((row for row in records if row["code"] == "C" and row["name"]), key=lambda row: row["address"]):
        print(f"  {item['id']:8} {item['address'][:40]:40} {item['name'][:28]}")


def write_map(playable, polygons, records) -> None:
    minx, miny, maxx, maxy = playable.bounds
    pad = 0.0008
    minx -= pad
    miny -= pad
    maxx += pad
    maxy += pad
    width, height = 1400, 1800
    scale = min((width - 80) / (maxx - minx), (height - 140) / (maxy - miny))

    def px(lon: float, lat: float) -> tuple[float, float]:
        return 40 + (lon - minx) * scale, height - 80 - (lat - miny) * scale

    image = Image.new("RGB", (width, height), "#f4f1ea")
    draw = ImageDraw.Draw(image, "RGBA")
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
        small = font

    def paint(geom, fill, outline=None, width_px=2):
        parts = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
        for polygon in parts:
            shell = [px(lon, lat) for lon, lat in polygon.exterior.coords]
            draw.polygon(shell, fill=fill)
            if outline:
                draw.line(shell, fill=outline, width=width_px)

    def stroke(geom, outline, width_px=4):
        if geom.geom_type == "LineString":
            parts = [geom]
        elif geom.geom_type == "MultiLineString":
            parts = list(geom.geoms)
        else:
            parts = []
        for line in parts:
            draw.line([px(lon, lat) for lon, lat in line.coords], fill=outline, width=width_px)

    for code, meta in DISTRICTS.items():
        color = meta["color"].lstrip("#")
        rgb = tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))
        paint(polygons[code], rgb + (210,), rgb + (255,), 3)
    stroke(playable.boundary, (20, 20, 20, 255), 4)

    for item in records:
        x, y = px(item["lon"], item["lat"])
        color = DISTRICTS[item["code"]]["color"]
        draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill="#1b1b1b")

    draw.rectangle((0, 0, width, 64), fill="#1c2430")
    draw.text((24, 16), "Rockville playable area · district ownership", fill="white", font=font)
    legend_x = 24
    for code, meta in DISTRICTS.items():
        count = sum(1 for item in records if item["code"] == code)
        draw.rectangle((legend_x, height - 52, legend_x + 22, height - 30), fill=meta["color"])
        draw.text((legend_x + 28, height - 54), f"{code} {meta['name']} ({count})", fill="#1c2430", font=small)
        legend_x += 330

    out = ROOT / "docs/city-development-foundation/maps"
    out.mkdir(parents=True, exist_ok=True)
    image.save(out / "district-ownership.png")


if __name__ == "__main__":
    main()
