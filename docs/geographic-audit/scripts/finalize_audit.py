#!/usr/bin/env python3
"""Build the irregular playable polygon and the height-reconciliation table.

Research output only. Heights are chosen only where a measured source is
corroborated. The area-and-seed formula is never written as a chosen height.
"""

import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CACHE = Path("/tmp/rv-audit")

ORIGIN_LON, ORIGIN_LAT = -77.152, 39.086
LAT_R = ORIGIN_LAT * math.pi / 180
METERS_EAST = (
    111412.84 * math.cos(LAT_R) - 93.5 * math.cos(3 * LAT_R) + 0.118 * math.cos(5 * LAT_R)
)
METERS_NORTH = (
    111132.92 - 559.82 * math.cos(2 * LAT_R) + 1.175 * math.cos(4 * LAT_R)
    - 0.0023 * math.cos(6 * LAT_R)
)

# Western rail of the CSX / Metrorail bundle, sampled from county centerlines
# on 26 Nov 2026. The boundary sits on this line except at the station bulge.
RAIL = [
    (-77.152440, 39.09510), (-77.152277, 39.09465), (-77.152113, 39.09420),
    (-77.151948, 39.09375), (-77.151782, 39.09330), (-77.151616, 39.09285),
    (-77.151450, 39.09240), (-77.151284, 39.09195), (-77.151119, 39.09150),
    (-77.150958, 39.09105), (-77.150792, 39.09060), (-77.150623, 39.09015),
    (-77.150462, 39.08970), (-77.150258, 39.08925), (-77.150023, 39.08880),
    (-77.149789, 39.08835), (-77.149512, 39.08790), (-77.149239, 39.08745),
    (-77.148936, 39.08700), (-77.148632, 39.08655), (-77.148287, 39.08610),
    (-77.147840, 39.08565), (-77.147362, 39.08520), (-77.146843, 39.08475),
    (-77.146326, 39.08430), (-77.145810, 39.08385), (-77.145294, 39.08340),
    (-77.144723, 39.08295), (-77.144156, 39.08250), (-77.143632, 39.08205),
    (-77.143108, 39.08160), (-77.141856, 39.08058),
]

# OSM way 46963862, name "Rockville Metro Station Parking". East corner is the
# rear of the station lot. Way 46963870 is the closed aisle just east of the platform.
BUS_LOOP = [
    (-77.145854, 39.084683), (-77.145631, 39.084679), (-77.145612, 39.084795),
    (-77.145365, 39.084816), (-77.145333, 39.085263), (-77.145567, 39.085276),
    (-77.145787, 39.085288), (-77.145837, 39.084831), (-77.145854, 39.084683),
]
PARKING = [
    (-77.144456, 39.083196), (-77.143955, 39.083535), (-77.145191, 39.084614),
    (-77.145400, 39.084477), (-77.145435, 39.084508), (-77.145569, 39.084410),
    (-77.145634, 39.084464), (-77.145696, 39.084429), (-77.145725, 39.084454),
    (-77.145766, 39.084543), (-77.145785, 39.084572), (-77.145805, 39.084596),
    (-77.145814, 39.084612), (-77.145810, 39.084634), (-77.145804, 39.084641),
    (-77.145782, 39.084646), (-77.145762, 39.084647), (-77.145708, 39.084646),
    (-77.145676, 39.084646), (-77.145577, 39.084668), (-77.145540, 39.084753),
    (-77.145266, 39.084783), (-77.145219, 39.085297), (-77.145286, 39.085301),
    (-77.145277, 39.085356), (-77.145749, 39.085374), (-77.145834, 39.085377),
    (-77.145839, 39.085331), (-77.145898, 39.085332), (-77.145910, 39.085238),
    (-77.145924, 39.085132), (-77.145933, 39.085013), (-77.145942, 39.084908),
    (-77.145948, 39.084849), (-77.145969, 39.084641), (-77.145967, 39.084616),
    (-77.145966, 39.084597), (-77.145948, 39.084531), (-77.145918, 39.084458),
    (-77.145867, 39.084401), (-77.145763, 39.084312), (-77.144456, 39.083196),
]
SCHOOL = [
    (-77.147174, 39.076869), (-77.148067, 39.077442), (-77.149232, 39.078263),
    (-77.149519, 39.078466), (-77.148973, 39.079318), (-77.148823, 39.079552),
    (-77.148603, 39.080140), (-77.147882, 39.080030), (-77.147327, 39.080072),
    (-77.147107, 39.080113), (-77.146280, 39.080398), (-77.146141, 39.080413),
    (-77.145959, 39.080384), (-77.145806, 39.080298), (-77.145747, 39.080255),
    (-77.145682, 39.080144), (-77.145197, 39.079759), (-77.145087, 39.079697),
    (-77.144829, 39.079497), (-77.144690, 39.079297), (-77.144615, 39.079128),
    (-77.144537, 39.078910), (-77.144475, 39.078720), (-77.144397, 39.078552),
    (-77.144237, 39.078335), (-77.143917, 39.078083), (-77.143718, 39.077951),
    (-77.143762, 39.077920), (-77.144003, 39.077746), (-77.144729, 39.077224),
    (-77.144974, 39.077046), (-77.145101, 39.076855), (-77.145445, 39.076702),
    (-77.145755, 39.076701), (-77.145992, 39.076732), (-77.146707, 39.077132),
    (-77.147015, 39.076998), (-77.147174, 39.076869),
]
BRIDGE = [
    (-77.146665, 39.084408), (-77.146739, 39.084363), (-77.146793, 39.084348),
    (-77.147645, 39.084114), (-77.147754, 39.084087), (-77.147906, 39.084072),
]
COLLEGE = [
    (-77.161632, 39.096234), (-77.154939, 39.096234),
    (-77.154939, 39.100850), (-77.161632, 39.100850), (-77.161632, 39.096234),
]

# Published roofs retrieved from the SkyscraperPage HTML on 26 Nov 2026.
# Planning feet are kept as the chosen value when they match that roof.
OVERRIDES = {
    "51 MONROE PL 20850": {
        "chosen_m": 241.63 * 0.3048,
        "confidence": "High",
        "evidence": (
            "Planning BLDG_HEIGHT 241.63 ft matches SkyscraperPage roof 240 ft "
            "(73.2 m) for One Rockville Metro Center, 51 Monroe Street, 19 floors, "
            "finished 1979, source noted as Google Earth. Spire/mechanical is 246 ft "
            "and was not used. Rockville parts near this footprint top out near 74 ft "
            "and do not record the tower roof. SKYDB lists 69 m and 21 floors, which "
            "does not match the roof or the Planning measurement."
        ),
    },
    "101 MONROE ST 20850": {
        "chosen_m": 222.89 * 0.3048,
        "confidence": "High",
        "evidence": (
            "Planning BLDG_HEIGHT 222.89 ft is 1.4 percent under the SkyscraperPage "
            "roof of 226 ft (68.9 m) for the Executive Office Building, 101 Monroe "
            "Street, 16 floors, finished 1981. The antenna height on that page is "
            "262 ft and was not used. Rockville HEIGHT 207.23 ft is the same mass "
            "but 19 ft lower, so it is not the chosen roof. The county directory "
            "places Finance on floor 15, consistent with a 16-storey count."
        ),
    },
    "50 MARYLAND AVE 20850": {
        "chosen_m": None,
        "confidence": "Unresolved",
        "evidence": (
            "County press release of 15 May 2014 says the Circuit Court south tower "
            "is six stories and is connected to the older north tower, which has at "
            "least floors 6 through 9. Planning 169.44 ft and the nearest Rockville "
            "part at 84 ft can be those two different masses. Neither number is "
            "assigned to the whole courthouse."
        ),
    },
    "196 E MONTGOMERY AVE 20850": {
        "chosen_m": None,
        "confidence": "Unresolved",
        "evidence": (
            "Choice Hotels describes the Cambria at Rockville Town Square as eight "
            "hotel floors inside a 15-storey west tower, and a 2007 Washington Post "
            "report described a 15-storey tower and an 18-storey tower on this block. "
            "Neither article states a foot height. Planning 28.8 m is too short for "
            "15 storeys and Rockville 41.8 m is still short of a typical 15-storey "
            "floor-to-floor height, so neither is chosen."
        ),
    },
}


def world(lon, lat):
    return (
        round((lon - ORIGIN_LON) * METERS_EAST, 2),
        round((ORIGIN_LAT - lat) * METERS_NORTH, 2),
    )


def pip(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def ring_xyz(coords):
    return [
        {"longitude": lon, "latitude": lat, "game_x_m": world(lon, lat)[0], "game_z_m": world(lon, lat)[1]}
        for lon, lat in coords
    ]


def close(ring):
    if ring[0] != ring[-1]:
        ring = ring + [ring[0]]
    return ring


def build_polygon():
    # North cutoff is the north end of the Hungerford 800-block centerline (39.09506),
    # just past the gLeaf footprint's north edge at 39.094982.
    north = 39.09510
    rail_north = [pt for pt in RAIL if pt[1] <= north]
    # Station bulge leaves the rail near lat 39.0857 and rejoins near 39.0833.
    upper = [pt for pt in rail_north if pt[1] >= 39.08565]
    lower = [pt for pt in rail_north if pt[1] <= 39.08335]
    # Walk the parking outline from its northwest, around the east tip, to its southwest.
    # Vertices are already a closed ring. Buffer the east tip by taking the ring as the
    # curb and stepping the boundary 12 m outside the easternmost and southernmost points
    # via an explicit outer path rather than a geometric buffer library.
    bulge = [
        (-77.147840, 39.08565),
        (-77.145900, 39.08555),
        (-77.145200, 39.08550),
        (-77.143820, 39.08362),
        (-77.143820, 39.08305),
        (-77.144700, 39.08305),
        (-77.145294, 39.08340),
    ]
    south = [
        (-77.141856, 39.08058),
        (-77.143100, 39.08058),
        (-77.143100, 39.08018),
        (-77.144200, 39.08018),
        (-77.144200, 39.08058),
        (-77.149600, 39.08058),
        (-77.149600, 39.07970),
        (-77.150500, 39.07970),
        (-77.150500, 39.08070),
        (-77.155000, 39.08070),
        (-77.155000, north),
        (rail_north[0][0], north),
    ]
    # Order: NW corner across the north edge, south along the upper rail, around the
    # bulge, south along the lower rail, then the south edge back to the west side.
    ring = [(rail_north[0][0], north), (-77.155000, north)]
    # The construction above got the winding backwards. Rebuild explicitly.
    ring = [(-77.155000, north), (rail_north[0][0], north)]
    ring.extend(upper)
    ring.extend(bulge)
    ring.extend(lower)
    ring.extend(south[1:])  # south starts with the rail point already added as lower[-1]
    # south[0] is the same rail point as lower[-1]; skip it.
    ring = [(-77.155000, north), (upper[0][0], north)]
    ring.extend(upper[1:])
    ring.extend(bulge[1:])
    ring.extend(lower[1:])
    ring.extend([
        (-77.143100, 39.08058),
        (-77.143100, 39.08018),
        (-77.144200, 39.08018),
        (-77.144200, 39.08058),
        (-77.149600, 39.08058),
        (-77.149600, 39.07970),
        (-77.150500, 39.07970),
        (-77.150500, 39.08070),
        (-77.155000, 39.08070),
        (-77.155000, north),
    ])
    return close(ring)


def feature(geom, props):
    return {"type": "Feature", "properties": props, "geometry": geom}


def polygon_feature(coords, props):
    props = dict(props)
    props["vertices_wgs84_and_game_frame"] = ring_xyz(coords[:-1])
    return feature({"type": "Polygon", "coordinates": [coords]}, props)


def line_feature(coords, props):
    props = dict(props)
    props["vertices_wgs84_and_game_frame"] = ring_xyz(coords)
    return feature({"type": "LineString", "coordinates": coords}, props)


def point_feature(lon, lat, props):
    x, z = world(lon, lat)
    props = dict(props)
    props.update({"game_x_m": x, "game_z_m": z})
    return feature({"type": "Point", "coordinates": [lon, lat]}, props)


def districts_from(playable):
    # Four assignment areas. Shared edges follow latitude 39.0885 and 39.0824
    # and the rail. The metro piece is the station bulge, described separately
    # so it can be handed out without the residential blocks east of the lot.
    north = 39.09510
    hungerford = [(-77.155, north), (RAIL[0][0], north)]
    hungerford += [pt for pt in RAIL if 39.08850 <= pt[1] < north]
    hungerford += [(-77.155, 39.08850), (-77.155, north)]
    town = [(-77.155, 39.08850)]
    town += [pt for pt in RAIL if 39.08240 <= pt[1] <= 39.08850]
    town += [(-77.155, 39.08240), (-77.155, 39.08850)]
    # Metro is everything in the playable ring east of the rail between the
    # bulge latitudes, approximated by the bulge path itself plus the rail chord.
    metro = [pt for pt in RAIL if 39.08335 <= pt[1] <= 39.08565]
    metro += [
        (-77.145900, 39.08555), (-77.145200, 39.08550), (-77.143820, 39.08362),
        (-77.143820, 39.08305), (-77.144700, 39.08305), (-77.145294, 39.08340),
    ]
    south = [(-77.155, 39.08240)]
    south += [pt for pt in RAIL if pt[1] <= 39.08240]
    south += [
        (-77.143100, 39.08058), (-77.143100, 39.08018), (-77.144200, 39.08018),
        (-77.144200, 39.08058), (-77.149600, 39.08058), (-77.149600, 39.07970),
        (-77.150500, 39.07970), (-77.150500, 39.08070), (-77.155, 39.08070),
        (-77.155, 39.08240),
    ]
    return {
        "hungerford-corridor": close(hungerford),
        "town-center-core": close(town),
        "metro-station": close(metro),
        "south-pike-approach": close(south),
    }


def rect_contains(lon, lat, west, south, east, north):
    return west <= lon <= east and south <= lat <= north


def nearest_rockville(lon, lat, parts, limit_m=15):
    best = None
    best_d = limit_m
    for part in parts:
        d = math.hypot((part["lon"] - lon) * METERS_EAST, (part["lat"] - lat) * METERS_NORTH)
        if d < best_d:
            best_d = d
            best = part
    return best, best_d


def reconcile(playable):
    rows = list(csv.DictReader(open(DATA / "height-comparison.csv")))
    parts = json.loads((CACHE / "rockville_parts.json").read_text())
    footprints = json.loads((CACHE / "county_footprints_bounds.json").read_text())["features"]
    by_id = {int(r["object_id"]): r for r in rows}
    out = []
    for feature in footprints:
        attrs = feature["attributes"]
        oid = int(attrs["OBJECTID"])
        ring = feature["geometry"]["rings"][0]
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        lon = sum(xs) / len(xs)
        lat = sum(ys) / len(ys)
        if not pip(lon, lat, playable):
            continue
        base = by_id.get(oid)
        address = (attrs.get("ADDRESS") or "").strip()
        name = (attrs.get("BLDG_NAME") or "").strip()
        rock, dist = nearest_rockville(lon, lat, parts)
        planning_m = float(base["planning_primary_height_m"]) if base else None
        planning_max = float(base["planning_max_height_m"]) if base else None
        planning_ft = float(base["planning_primary_height_ft"]) if base else None
        rock_ft = rock["h"] if rock else None
        rock_m = rock_ft * 0.3048 if rock_ft is not None else None
        override = OVERRIDES.get(address)
        if override:
            chosen = "" if override["chosen_m"] is None else f"{override['chosen_m']:.2f}"
            confidence = override["confidence"]
            evidence = override["evidence"]
        elif planning_m is None and rock_m is None:
            chosen, confidence = "", "Unresolved"
            evidence = "No Planning part fell inside this county footprint and no Rockville part is within 25 m."
        elif planning_m is None and dist <= 8:
            chosen = f"{rock_m:.2f}"
            confidence = "Medium"
            evidence = (
                f"No Planning part matched this footprint. Rockville HEIGHT {rock_ft:.1f} ft "
                f"is {dist:.1f} m from the centroid, so it is used as a single measured source."
            )
        elif planning_m is None:
            chosen, confidence = "", "Unresolved"
            evidence = (
                f"Rockville HEIGHT {rock_ft:.1f} ft is {dist:.0f} m away and no Planning part "
                "matched. That is too far to treat as this footprint's roof."
            )
        elif rock_m is None:
            if planning_max is not None and planning_max - planning_m > 8:
                chosen, confidence = "", "Unresolved"
                evidence = (
                    f"Planning largest-area part is {planning_m:.2f} m and the tallest part is "
                    f"{planning_max:.2f} m. No Rockville part within 25 m. The two parts disagree "
                    "by more than 8 m, so neither is chosen."
                )
            else:
                chosen = f"{planning_m:.2f}"
                confidence = "Medium"
                evidence = (
                    f"Planning largest-area part {planning_ft:.1f} ft ({planning_m:.2f} m). "
                    "No Rockville part within 25 m. Single measured source, not cross-checked."
                )
        else:
            gap = abs(planning_m - rock_m)
            tol = max(2.0, 0.10 * max(planning_m, rock_m))
            if gap <= tol:
                chosen = f"{planning_m:.2f}"
                confidence = "High"
                evidence = (
                    f"Planning {planning_ft:.1f} ft and Rockville {rock_ft:.1f} ft "
                    f"({rock.get('name') or 'unnamed'}, {dist:.0f} m) differ by {gap:.2f} m, "
                    f"inside {tol:.2f} m. Chosen value is the Planning figure."
                )
            elif max(planning_m, rock_m) < 18 and gap <= 4:
                higher = max(planning_m, rock_m)
                chosen = f"{higher:.2f}"
                confidence = "Medium"
                evidence = (
                    f"Planning {planning_m:.2f} m and Rockville {rock_m:.2f} m differ by {gap:.2f} m "
                    "on a building under 18 m. The higher measured value is kept so a parapet is not "
                    "dropped. This is not the area-seed formula, and it is not High confidence."
                )
            else:
                chosen, confidence = "", "Unresolved"
                evidence = (
                    f"Planning {planning_ft:.1f} ft ({planning_m:.2f} m) and Rockville "
                    f"{rock_ft:.1f} ft ({rock_m:.2f} m, {rock.get('name') or 'unnamed'}, {dist:.0f} m) "
                    f"differ by {gap:.2f} m. No published roof was found for this address. Not guessed."
                )
        out.append({
            "object_id": oid,
            "address": address,
            "name": name or (base["name"] if base else ""),
            "longitude": round(lon, 6),
            "latitude": round(lat, 6),
            "planning_primary_ft": "" if planning_ft is None else round(planning_ft, 2),
            "planning_primary_m": "" if planning_m is None else round(planning_m, 2),
            "planning_max_m": "" if planning_max is None else round(planning_max, 2),
            "planning_base_ft": base["base_elevation_ft"] if base else "",
            "planning_source_code": base["source_code"] if base else "",
            "planning_year": base["year_built"] if base else "",
            "rockville_height_ft": "" if rock_ft is None else round(rock_ft, 2),
            "rockville_height_m": "" if rock_m is None else round(rock_m, 2),
            "rockville_name": (rock.get("name") or "") if rock else "",
            "rockville_roof": (rock.get("roof") or "") if rock else "",
            "rockville_distance_m": "" if rock is None else round(dist, 1),
            "chosen_height_m": chosen,
            "confidence": confidence,
            "evidence": evidence,
        })
    return out


def boundary_change(playable, footprints):
    game = (-77.155, 39.080, -77.140, 39.095)
    previous = (-77.155, 39.08050, -77.14220, 39.09505)
    rows = []
    for feature in footprints:
        attrs = feature["attributes"]
        ring = feature["geometry"]["rings"][0]
        lon = sum(p[0] for p in ring) / len(ring)
        lat = sum(p[1] for p in ring) / len(ring)
        now = pip(lon, lat, playable)
        in_game = rect_contains(lon, lat, *game)
        in_prev = rect_contains(lon, lat, *previous)
        if now == in_game and now == in_prev:
            continue
        if not now and not in_game and not in_prev:
            continue
        change_game = "gained" if now and not in_game else "lost" if in_game and not now else "kept"
        change_prev = "gained" if now and not in_prev else "lost" if in_prev and not now else "kept"
        if change_game == "kept" and change_prev == "kept":
            continue
        rows.append({
            "object_id": int(attrs["OBJECTID"]),
            "address": attrs.get("ADDRESS") or "",
            "name": (attrs.get("BLDG_NAME") or "").strip(),
            "longitude": round(lon, 6),
            "latitude": round(lat, 6),
            "versus_game_bounds": change_game,
            "versus_previous_audit_rectangle": change_prev,
        })
    return rows


def main():
    playable = build_polygon()
    must_in = {
        "gLeaf": (-77.153844, 39.094821),
        "Fresh Baguette": (-77.15436, 39.09462),
        "811 Hungerford": (-77.152790, 39.094797),
        "Great Wall": (-77.15427, 39.09308),
        "Giant": (-77.15194, 39.09249),
        "Wells Fargo": (-77.15326, 39.09085),
        "Fire Station 3": (-77.15081, 39.08761),
        "EOB": (-77.149407, 39.083040),
        "51 Monroe": (-77.148179, 39.083809),
        "metro point": (-77.146634, 39.084431),
        "bridge west": (-77.147906, 39.084072),
        "bus loop": (-77.14559, 39.08498),
        "parking east tip": (-77.143955, 39.083535),
        "700 Pike": (-77.14350, 39.08042),
        "208 Monroe": (-77.15009, 39.07997),
        "315 N Washington": (-77.153027, 39.08952),
    }
    must_out = {
        "school tip": (-77.146141, 39.080413),
        "school centroid": (-77.14717, 39.07856),
        "college": (-77.1580, 39.0985),
        "Highland circle": (-77.14260, 39.08520),
        "east residential": (-77.1448, 39.0905),
        "north of cutoff": (-77.15286, 39.09518),
    }
    print("PLAYABLE vertices", len(playable))
    failed = False
    for label, (lon, lat) in must_in.items():
        ok = pip(lon, lat, playable)
        print(("IN " if ok else "MISSING"), label)
        failed = failed or not ok
    for label, (lon, lat) in must_out.items():
        ok = pip(lon, lat, playable)
        print(("OUT" if not ok else "LEAKED"), label)
        failed = failed or ok
    school_hit = any(pip(lon, lat, playable) for lon, lat in SCHOOL)
    print("school vertex inside", school_hit)
    failed = failed or school_hit
    if failed:
        raise SystemExit("boundary tests failed")

    districts = districts_from(playable)
    collection = {
        "type": "FeatureCollection",
        "properties": {
            "crs_note": "WGS84. Game frame: +X east, +Z south, origin -77.152, 39.086, 1 unit = 1 metre.",
            "meters_per_degree_east": METERS_EAST,
            "meters_per_degree_north": METERS_NORTH,
            "status": "Owner-directed irregular boundary, 26 Nov 2026. West -77.155. North at gLeaf. East on the west rail except the station parking bulge.",
        },
        "features": [
            polygon_feature(playable, {
                "name": "Playable boundary",
                "status": "owner-directed",
                "west": "-77.155",
                "north": "39.09510, north end of the Hungerford 800 block at gLeaf",
                "east": "west rail of the CSX/Metrorail bundle, bulging around Rockville Metro Station parking",
                "south": "local dips retain 208 Monroe Street and 700 Rockville Pike; the OSM school polygon is outside",
            }),
            polygon_feature(SCHOOL, {"name": "Richard Montgomery High School", "status": "exclude", "source": "OSM way 239942500"}),
            polygon_feature(COLLEGE, {"name": "Montgomery College Rockville campus envelope", "status": "exclude"}),
            line_feature(BRIDGE, {"name": "Pedestrian bridge", "status": "include", "source": "OSM way 266681164"}),
            line_feature(BUS_LOOP, {"name": "East-of-platform bus and parking aisle", "status": "include", "source": "OSM way 46963870, closed parking_aisle"}),
            polygon_feature(close(PARKING), {"name": "Rockville Metro Station Parking", "status": "include", "source": "OSM way 46963862"}),
            point_feature(-77.153844, 39.094821, {"name": "808 Hungerford Drive footprint centroid"}),
            point_feature(-77.146634, 39.084431, {"name": "County Rockville Metro station point"}),
            point_feature(-77.14260, 39.08520, {"name": "Highland Avenue circle", "status": "excluded residential circle"}),
        ],
    }
    district_fc = {
        "type": "FeatureCollection",
        "properties": {"status": "Assignment areas inside the irregular boundary. Not official neighborhoods."},
        "features": [
            polygon_feature(ring, {"name": name, "status": "proposed district"})
            for name, ring in districts.items()
        ],
    }
    (DATA / "playable-boundary.geojson").write_text(json.dumps(collection, indent=2))
    (DATA / "districts.geojson").write_text(json.dumps(district_fc, indent=2))

    footprints = json.loads((CACHE / "county_footprints_bounds.json").read_text())["features"]
    changes = boundary_change(playable, footprints)
    with (DATA / "boundary-change.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(changes[0].keys()) if changes else ["object_id"])
        writer.writeheader()
        writer.writerows(changes)
    from collections import Counter
    print("boundary change", Counter((r["versus_game_bounds"], r["versus_previous_audit_rectangle"]) for r in changes))

    reconciled = reconcile(playable)
    fields = list(reconciled[0].keys())
    with (DATA / "height-reconciliation.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(reconciled)
    counts = Counter(row["confidence"] for row in reconciled)
    print("buildings in polygon", len(reconciled), "confidence", dict(counts))
    print("wrote boundary, districts, change table, reconciliation")


if __name__ == "__main__":
    main()
