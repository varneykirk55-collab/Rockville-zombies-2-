#!/usr/bin/env python3
"""Render the audit boundary and district maps over OpenStreetMap tiles.

Coordinates below were measured in the 26 Nov 2026 audit (county centerlines,
Montgomery Planning footprints, OSM, and the Rockville 2023 ortho). The script
only draws those coordinates. It does not change the game.
"""

import json
import math
import urllib.request
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MAPS = ROOT / "maps"
TILE_ZOOM = 16
UA = {"User-Agent": "RockvilleGeographicAudit/1.0 (research; boundary map)"}

# Same tangent frame as src/utils.js. Origin is config.js ORIGIN.
ORIGIN_LON, ORIGIN_LAT = -77.152, 39.086
LAT_R = ORIGIN_LAT * math.pi / 180
METERS_EAST = (
    111412.84 * math.cos(LAT_R)
    - 93.5 * math.cos(3 * LAT_R)
    + 0.118 * math.cos(5 * LAT_R)
)
METERS_NORTH = (
    111132.92
    - 559.82 * math.cos(2 * LAT_R)
    + 1.175 * math.cos(4 * LAT_R)
    - 0.0023 * math.cos(6 * LAT_R)
)


def world(lon, lat):
    return (
        round((lon - ORIGIN_LON) * METERS_EAST, 2),
        round((ORIGIN_LAT - lat) * METERS_NORTH, 2),
    )


def ring_xyz(coords):
    return [
        {"longitude": lon, "latitude": lat, "game_x_m": world(lon, lat)[0], "game_z_m": world(lon, lat)[1]}
        for lon, lat in coords
    ]


# Working playable rectangle. West option A and the Highland Avenue circle
# are proposals; see 03-playable-boundary.md.
PLAYABLE = [
    (-77.15500, 39.08050),
    (-77.14220, 39.08050),
    (-77.14220, 39.09505),
    (-77.15500, 39.09505),
    (-77.15500, 39.08050),
]
# Current repository BOUNDS in src/config.js.
GAME_BOUNDS = [
    (-77.155, 39.080),
    (-77.140, 39.080),
    (-77.140, 39.095),
    (-77.155, 39.095),
    (-77.155, 39.080),
]
# West proposal B: include the strip inspected west of the current bound.
WEST_B = [(-77.16000, 39.08050), (-77.16000, 39.09505)]
# East alternative if the owner means the station parking rather than the circle.
EAST_ALT = [(-77.14460, 39.08050), (-77.14460, 39.09505)]

# OSM way 239942500, queried 26 Nov 2026. North tip is 39.080413.
SCHOOL = [
    (-77.147174, 39.076869), (-77.148067, 39.077442), (-77.149232, 39.078263),
    (-77.149519, 39.078466), (-77.148973, 39.079318), (-77.148823, 39.079552),
    (-77.148603, 39.08014), (-77.147882, 39.08003), (-77.147327, 39.080072),
    (-77.147107, 39.080113), (-77.14628, 39.080398), (-77.146141, 39.080413),
    (-77.145959, 39.080384), (-77.145806, 39.080298), (-77.145747, 39.080255),
    (-77.145682, 39.080144), (-77.145197, 39.079759), (-77.145087, 39.079697),
    (-77.144829, 39.079497), (-77.14469, 39.079297), (-77.144615, 39.079128),
    (-77.144537, 39.07891), (-77.144475, 39.07872), (-77.144397, 39.078552),
    (-77.144237, 39.078335), (-77.143917, 39.078083), (-77.143718, 39.077951),
    (-77.143762, 39.07792), (-77.144003, 39.077746), (-77.144729, 39.077224),
    (-77.144974, 39.077046), (-77.145101, 39.076855), (-77.145445, 39.076702),
    (-77.145755, 39.076701), (-77.145992, 39.076732), (-77.146707, 39.077132),
    (-77.147015, 39.076998), (-77.147174, 39.076869),
]
# Envelope of the 19 county footprints named Montgomery College - Rockville Campus.
COLLEGE = [
    (-77.161632, 39.096234),
    (-77.154939, 39.096234),
    (-77.154939, 39.100850),
    (-77.161632, 39.100850),
    (-77.161632, 39.096234),
]
# OSM way 266681164, highway=footway, bridge=yes.
BRIDGE = [
    (-77.146665, 39.084408),
    (-77.146739, 39.084363),
    (-77.146793, 39.084348),
    (-77.147645, 39.084114),
    (-77.147754, 39.084087),
    (-77.147906, 39.084072),
]
# County footprint centroid, 808 Hungerford Dr. OSM node "gLeaf" is 6.6 m away.
GLEAF = (-77.153844, 39.094821)
# County Metro Stations point named Rockville, address 251 Hungerford Dr.
METRO = (-77.146634, 39.084431)
# Approximate Highland Avenue circle from the 2023 ortho and centerline vertices.
# Not a surveyed roundabout polygon. See the boundary report.
CIRCLE = (-77.14260, 39.08520)

DISTRICTS = {
    "hungerford-corridor": [
        (-77.15500, 39.08850), (-77.14930, 39.08850),
        (-77.14930, 39.09505), (-77.15500, 39.09505),
        (-77.15500, 39.08850),
    ],
    "town-center-core": [
        (-77.15500, 39.08240), (-77.14760, 39.08240),
        (-77.14760, 39.08850), (-77.15500, 39.08850),
        (-77.15500, 39.08240),
    ],
    "metro-and-bridge": [
        (-77.14760, 39.08240), (-77.14220, 39.08240),
        (-77.14220, 39.08850), (-77.14760, 39.08850),
        (-77.14760, 39.08240),
    ],
    "south-pike-approach": [
        (-77.15500, 39.08050), (-77.14220, 39.08050),
        (-77.14220, 39.08240), (-77.15500, 39.08240),
        (-77.15500, 39.08050),
    ],
    "northeast-residential": [
        (-77.14930, 39.08850), (-77.14220, 39.08850),
        (-77.14220, 39.09505), (-77.14930, 39.09505),
        (-77.14930, 39.08850),
    ],
}


def feature(geometry, properties):
    return {"type": "Feature", "properties": properties, "geometry": geometry}


def polygon_feature(coords, properties):
    properties = dict(properties)
    properties["vertices_wgs84_and_game_frame"] = ring_xyz(coords[:-1])
    return feature({"type": "Polygon", "coordinates": [coords]}, properties)


def line_feature(coords, properties):
    properties = dict(properties)
    properties["vertices_wgs84_and_game_frame"] = ring_xyz(coords)
    return feature({"type": "LineString", "coordinates": coords}, properties)


def point_feature(lon, lat, properties):
    x, z = world(lon, lat)
    properties = dict(properties)
    properties.update({"game_x_m": x, "game_z_m": z})
    return feature({"type": "Point", "coordinates": [lon, lat]}, properties)


def write_geojson():
    boundary = {
        "type": "FeatureCollection",
        "properties": {
            "crs_note": "Geometries are WGS84 longitude/latitude. Game-frame meters are in properties. "
                        "+X east, +Y up, +Z south, origin longitude -77.152 latitude 39.086. 1 unit = 1 metre.",
            "meters_per_degree_east": METERS_EAST,
            "meters_per_degree_north": METERS_NORTH,
            "status": "Research proposal. West edge and the Highland Avenue circle are not approved.",
        },
        "features": [
            polygon_feature(PLAYABLE, {
                "name": "Working playable boundary",
                "status": "proposal",
                "west": "option A, longitude -77.155",
                "north": "north end of the Hungerford 800 address block, at gLeaf",
                "south": "0.00009 degrees north of the OSM school polygon's northern tip",
                "east": "just east of the approximate Highland Avenue circle",
            }),
            polygon_feature(GAME_BOUNDS, {
                "name": "Current repository BOUNDS",
                "status": "existing",
                "source": "src/config.js",
            }),
            line_feature(WEST_B, {
                "name": "West proposal B",
                "status": "proposal",
                "note": "Longitude -77.160. Includes the western strip and still sits south of the college buildings.",
            }),
            line_feature(EAST_ALT, {
                "name": "East alternative",
                "status": "proposal",
                "note": "Longitude -77.1446, east of the station parking if the Highland circle is not the intended roundabout.",
            }),
            polygon_feature(SCHOOL, {
                "name": "Richard Montgomery High School",
                "status": "exclude",
                "source": "OSM way 239942500",
            }),
            polygon_feature(COLLEGE, {
                "name": "Montgomery College Rockville campus building envelope",
                "status": "exclude",
                "source": "Envelope of 19 county footprints named Montgomery College - Rockville Campus",
            }),
            line_feature(BRIDGE, {
                "name": "Pedestrian bridge",
                "status": "include",
                "source": "OSM way 266681164, highway=footway, bridge=yes",
            }),
            point_feature(*GLEAF, {"name": "808 Hungerford Drive footprint centroid", "role": "gLeaf address match"}),
            point_feature(*METRO, {"name": "Rockville Metro station point", "source": "County Metro Stations layer"}),
            point_feature(*CIRCLE, {"name": "Approximate Highland Avenue traffic circle", "status": "unconfirmed roundabout"}),
        ],
    }
    districts = {
        "type": "FeatureCollection",
        "properties": {
            "crs_note": boundary["properties"]["crs_note"],
            "status": "Proposed assignment areas inside the working boundary. They are not official neighborhoods.",
        },
        "features": [
            polygon_feature(coords, {"name": name, "status": "proposed district"})
            for name, coords in DISTRICTS.items()
        ],
    }
    (DATA / "playable-boundary.geojson").write_text(json.dumps(boundary, indent=2))
    (DATA / "districts.geojson").write_text(json.dumps(districts, indent=2))
    print("meters/deg", METERS_EAST, METERS_NORTH)
    print("gLeaf game", world(*GLEAF), "metro", world(*METRO), "circle", world(*CIRCLE))


def tile_xy(lat, lon, zoom):
    n = 2 ** zoom
    x = (lon + 180.0) / 360.0 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def osm_mosaic(west, south, east, north):
    x0, y_north = tile_xy(north, west, TILE_ZOOM)
    x1, y_south = tile_xy(south, east, TILE_ZOOM)
    tx0, tx1 = int(math.floor(x0)), int(math.floor(x1))
    ty0, ty1 = int(math.floor(y_north)), int(math.floor(y_south))
    tiles = {}
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            url = f"https://tile.openstreetmap.org/{TILE_ZOOM}/{tx}/{ty}.png"
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as response:
                data = response.read()
            path = Path(f"/tmp/rv-audit/tiles/{tx}_{ty}.png")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            tiles[(tx, ty)] = Image.open(path).convert("RGB")
    width = (tx1 - tx0 + 1) * 256
    height = (ty1 - ty0 + 1) * 256
    mosaic = Image.new("RGB", (width, height))
    for (tx, ty), image in tiles.items():
        mosaic.paste(image, ((tx - tx0) * 256, (ty - ty0) * 256))
    # Geographic extent of the tile block.
    def tile_lon(tx):
        return tx / 2 ** TILE_ZOOM * 360.0 - 180.0

    def tile_lat(ty):
        n = math.pi - 2.0 * math.pi * ty / 2 ** TILE_ZOOM
        return math.degrees(math.atan(math.sinh(n)))

    extent = (tile_lon(tx0), tile_lon(tx1 + 1), tile_lat(ty1 + 1), tile_lat(ty0))
    return mosaic, extent


def draw_base(ax, mosaic, extent, view):
    ax.imshow(mosaic, extent=extent, interpolation="bilinear")
    ax.set_xlim(view[0], view[1])
    ax.set_ylim(view[2], view[3])
    ax.set_xlabel("Longitude (WGS84)")
    ax.set_ylabel("Latitude (WGS84)")
    ax.tick_params(labelsize=8)
    ax.grid(True, color="white", alpha=0.25, linewidth=0.4)
    # 200 m scale bar at the south-west of the view.
    x0 = view[0] + 0.0006
    y0 = view[2] + 0.00035
    dx = 200 / METERS_EAST
    ax.plot([x0, x0 + dx], [y0, y0], color="black", linewidth=3, solid_capstyle="butt")
    ax.text(x0 + dx / 2, y0 + 0.00018, "200 m", ha="center", va="bottom", fontsize=8, color="black")


def load_rings(path):
    data = json.loads(Path(path).read_text())
    rings = []
    for feature in data["features"]:
        geom = feature["geometry"]
        name = feature["properties"].get("name", "")
        if geom["type"] == "Polygon":
            rings.append((name, geom["coordinates"][0]))
        elif geom["type"] == "LineString":
            rings.append((name, geom["coordinates"]))
    return rings


def save_boundary_map(mosaic, extent):
    view = (-77.164, -77.138, 39.0755, 39.1025)
    named = dict(load_rings(DATA / "playable-boundary.geojson"))
    playable = named["Playable boundary"]
    fig, ax = plt.subplots(figsize=(11.5, 12.5), dpi=120)
    draw_base(ax, mosaic, extent, view)
    ax.add_patch(MplPolygon(GAME_BOUNDS, closed=True, fill=False, edgecolor="#666666",
                            linewidth=1.0, linestyle=(0, (2, 2)), label="Current game rectangle"))
    ax.add_patch(MplPolygon(playable, closed=True, facecolor="#1d4e89", edgecolor="#0b2545",
                            alpha=0.33, linewidth=2.0, label="Playable boundary"))
    ax.add_patch(MplPolygon(named["Richard Montgomery High School"], closed=True, facecolor="#c62828",
                            edgecolor="#7f1010", alpha=0.45, linewidth=1.0, label="Exclude: RMHS"))
    ax.add_patch(MplPolygon(named["Montgomery College Rockville campus envelope"], closed=True,
                            facecolor="#ef6c00", edgecolor="#e65100", alpha=0.35, linewidth=1.0,
                            label="Exclude: Montgomery College"))
    bridge = named["Pedestrian bridge"]
    ax.plot([p[0] for p in bridge], [p[1] for p in bridge], color="#00bcd4", linewidth=3.0,
            label="Pedestrian bridge")
    loop = named["East-of-platform bus and parking aisle"]
    ax.plot([p[0] for p in loop], [p[1] for p in loop], color="#fdd835", linewidth=2.0,
            label="East bus / parking loop")
    ax.scatter([-77.153844], [39.094821], s=36, color="#2e7d32", zorder=5, label="808 Hungerford")
    ax.scatter([-77.146634], [39.084431], s=36, marker="s", color="#212121", zorder=5, label="Metro station point")
    ax.scatter([-77.14260], [39.08520], s=42, marker="o", facecolors="none", edgecolors="#ad1457",
               linewidths=1.8, zorder=5, label="Excluded Highland Ave circle")
    ax.legend(loc="lower left", fontsize=7.5, framealpha=0.92)
    ax.set_title("Rockville playable boundary — owner-directed outline, 26 Nov 2026\n"
                 "West stays at -77.155. East follows the rail and bulges around the station lot.\n"
                 "Basemap © OpenStreetMap contributors", fontsize=11)
    fig.tight_layout()
    out = MAPS / "playable-boundary.png"
    fig.savefig(out)
    plt.close(fig)
    print("wrote", out, out.stat().st_size)


def save_district_map(mosaic, extent):
    view = (-77.1575, -77.1405, 39.0788, 39.0962)
    colors = {
        "hungerford-corridor": "#1565c0",
        "town-center-core": "#6a1b9a",
        "metro-station": "#00838f",
        "south-pike-approach": "#ef6c00",
    }
    districts = dict(load_rings(DATA / "districts.geojson"))
    fig, ax = plt.subplots(figsize=(11.5, 12.5), dpi=120)
    draw_base(ax, mosaic, extent, view)
    for name, coords in districts.items():
        ax.add_patch(MplPolygon(coords, closed=True, facecolor=colors[name], edgecolor="white",
                                alpha=0.38, linewidth=1.4, label=name.replace("-", " ")))
        cx = sum(p[0] for p in coords[:-1]) / (len(coords) - 1)
        cy = sum(p[1] for p in coords[:-1]) / (len(coords) - 1)
        ax.text(cx, cy, name.replace("-", "\n"), ha="center", va="center", fontsize=8, color="white",
                fontweight="bold")
    ax.plot([p[0] for p in BRIDGE], [p[1] for p in BRIDGE], color="#ffeb3b", linewidth=2.5)
    ax.set_title("Proposed districts inside the irregular boundary\n"
                 "Not official neighborhoods. Basemap © OpenStreetMap contributors", fontsize=11)
    ax.legend(loc="lower left", fontsize=7.5, framealpha=0.92)
    fig.tight_layout()
    out = MAPS / "districts.png"
    fig.savefig(out)
    plt.close(fig)
    print("wrote", out, out.stat().st_size)


def main():
    mosaic, extent = osm_mosaic(-77.164, 39.0755, -77.138, 39.1025)
    save_boundary_map(mosaic, extent)
    save_district_map(mosaic, extent)


if __name__ == "__main__":
    main()
