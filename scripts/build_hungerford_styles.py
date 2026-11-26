#!/usr/bin/env python3
"""Build the Hungerford facade spec from the approved district polygon.

Ownership is the hungerford-corridor ring in
docs/geographic-audit/data/districts.geojson. A playable footprint is in the
district when its shoelace centroid is inside that ring. This is the same
centroid test the audit used. Buildings in the gap south of the ring, including
430 Hungerford (Walgreens) and 5 Dawson Avenue, are not assigned here. Fire
Station 3 at 380 Hungerford is inside town-center-core and is not assigned.

The output is data, not a random palette. Named businesses come from the
county building name or from an OpenStreetMap point within 18 m. Materials
follow the year and the researched anchors. Unnamed bays get no invented
tenant.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISTRICT = ROOT / "docs/geographic-audit/data/districts.geojson"
FOOTPRINTS = ROOT / "public/data/footprints.geojson"
HEIGHTS = ROOT / "public/data/building-heights.json"
STYLES = ROOT / "public/districts/hungerford/styles.json"
CSV_PATH = ROOT / "docs/hungerford-corridor/buildings.csv"
BOUNDARY = ROOT / "src/districts/hungerford/boundary.js"

# OSM points retrieved 26 Nov 2026 from lz4.overpass-api.de.
# A point is attached to the nearest in-district footprint within 18 m
# when that footprint is smaller than 1,000 m² and has no explicit business.
OSM = [
    ("gLeaf", "cannabis", 39.09480, -77.153775, "808 Hungerford Drive"),
    ("Fresh Baguette", "cafe", 39.09462, -77.154363, "804 Hungerford Drive"),
    ("Taipei Cafe", "restaurant", 39.09447, -77.153851, "802 Hungerford Drive"),
    ("Hungerford Marathon", "fuel", 39.09451, -77.152867, "801 Hungerford Drive"),
    ("7-Eleven", "convenience", 39.09394, -77.152829, "779 Hungerford Drive"),
    ("Yi Fang Tea", "cafe", 39.09389, -77.152837, "777 Hungerford Drive"),
    ("Smile Dental Care", "dentist", 39.09386, -77.152760, "775 Hungerford Drive"),
    ("Pho 75", "restaurant", 39.09369, -77.152885, "711 Hungerford Drive"),
    ("Asian Bakery Cafe", "bakery", 39.09349, -77.152893, ""),
    ("The Thai Cuisine Restaurant", "restaurant", 39.09328, -77.152906, ""),
    ("Great Wall Supermarket", "supermarket", 39.09308, -77.154269, "460 Hungerford Drive"),
    ("Giant", "supermarket", 39.09249, -77.151936, "625 Hungerford Drive"),
    ("Popeyes", "fast_food", 39.09180, -77.152322, "587 Hungerford Drive"),
    ("Bread Corner", "bakery", 39.09179, -77.152226, "591 Hungerford Drive"),
    ("Aria", "restaurant", 39.09179, -77.152051, "595 Hungerford Drive"),
    ("Hong Kong Tea House", "cafe", 39.09178, -77.151789, "605 Hungerford Drive"),
    ("Rockville Post Office", "post_office", 39.09150, -77.154147, ""),
    ("fuel", "fuel", 39.09118, -77.153349, "510 Hungerford Drive"),
    ("Wells Fargo", "bank", 39.09085, -77.153261, "502 Hungerford Drive"),
    ("Corner Bites", "restaurant", 39.08993, -77.154114, "316 North Washington Street"),
    ("UPS Store", "post_office", 39.08941, -77.151230, "451 Hungerford Drive"),
    ("Montgomery County ABS", "alcohol", 39.08941, -77.154128, "300 North Washington Street"),
    ("T-Swirl Crêpe", "restaurant", 39.08927, -77.153256, "313 North Washington Street"),
    ("Bob's Shanghai 66", "restaurant", 39.08904, -77.153248, ""),
    ("Gimme More Thai", "restaurant", 39.08889, -77.154271, "13 Dawson Avenue"),
    ("Vibes Hookah Lounge", "restaurant", 39.08888, -77.153876, "1 Dawson Avenue"),
]


def pip(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-18) + xi):
            inside = not inside
        j = i
    return inside


def centroid(coords):
    ring = coords[0]
    if ring[0] == ring[-1]:
        ring = ring[:-1]
    area = cx = cy = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    area *= 0.5
    if abs(area) < 1e-18:
        return sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n, 0.0
    return cx / (6 * area), cy / (6 * area), abs(area) * 86521.41 * 111017.096


def house_number(address):
    token = (address or "").split(" ", 1)[0]
    return int(token) if token.isdigit() else None


def adopt(base, **kwargs):
    item = dict(base)
    item.update(kwargs)
    return item


def spec(**kwargs):
    base = {
        "style": "storefront",
        "material": "brick",
        "tint": [1, 1, 1],
        "wall": [0.48, 0.24, 0.20],
        "glass": [0.16, 0.25, 0.28],
        "metal": [0.34, 0.36, 0.35],
        "bay": 4.2,
        "canopy": "metal",
        "canopyDepth": 1.15,
        "canopyColor": [0.30, 0.32, 0.31],
        "sign": None,
        "signBg": "#2c2824",
        "signFg": "#f4f0e8",
        "signScale": "band",
        "front": "auto",
        "side": "blank",
        "rtu": False,
        "balcony": None,
        "fuelCanopy": False,
        "floors": None,
        "upperStyle": None,
        "upperSign": None,
        "business": "",
        "sources": "",
        "notes": "",
    }
    base.update(kwargs)
    return base


BRICK = spec()
STUCCO = spec(
    material="stucco",
    tint=[0.93, 0.84, 0.70],
    wall=[0.74, 0.66, 0.54],
    canopyColor=[0.45, 0.40, 0.34],
)
CREAM = spec(
    material="stucco",
    tint=[0.96, 0.93, 0.86],
    wall=[0.80, 0.76, 0.68],
    canopyColor=[0.55, 0.50, 0.42],
)
PANEL = spec(
    material="concrete",
    tint=[0.90, 0.88, 0.84],
    wall=[0.70, 0.69, 0.66],
    glass=[0.27, 0.38, 0.44],
    metal=[0.62, 0.63, 0.64],
    canopy="none",
    side="same",
)


def brick_year(year):
    if year and year >= 1990:
        return dict(CREAM)
    if year and year >= 1975:
        return dict(STUCCO)
    return dict(BRICK)


def sign_block(text, bg, fg, scale="band"):
    return {"sign": text, "signBg": bg, "signFg": fg, "signScale": scale}


# Explicit anchors. These replace the year rule.
ANCHORS = {
    338888: spec(
        business="gLeaf",
        **sign_block("gLeaf", "#1b3a2c", "#e7f3ea"),
        notes="One-storey 1967 retail bay. Dark green sign band, brick piers, metal canopy. County footprint 808 Hungerford; OSM cannabis node is 6 m away.",
        sources="County OBJECTID 338888; OSM node gLeaf; geographic audit 03.",
        rtu=True,
    ),
    119203: adopt(
        STUCCO,
        business="Fresh Baguette",
        canopy="fabric",
        canopyColor=[0.62, 0.36, 0.24],
        **sign_block("FRESH BAGUETTE", "#6a3a28", "#f8f1e6"),
        notes="1984 one-storey cafe front. Fabric awning, stucco, separate from the brick gLeaf bay.",
        sources="OSM cafe Fresh Baguette at 804 Hungerford Drive.",
    ),
    209982: adopt(
        BRICK,
        business="Taipei Cafe",
        canopy="fabric",
        canopyColor=[0.55, 0.16, 0.20],
        bay=5.0,
        rtu=True,
        **sign_block("TAIPEI CAFE", "#6e2430", "#f7f0e6"),
        notes="Large 1984 one-storey restaurant block, 1,557 m². Brick with a fabric awning, not the same canopy as 804.",
        sources="OSM restaurant Taipei Cafe at 802 Hungerford Drive.",
    ),
    231090: adopt(
        CREAM,
        business="",
        bay=5.2,
        rtu=True,
        canopy="metal",
        notes="Large one-storey retail pad at 800 Hungerford, 1,151 m², same 5.40 m roof as 802 and 804. No tenant name was verified, so the sign band is blank.",
        sources="County footprint 231090, 800 Hungerford Drive.",
    ),
    211301: spec(
        business="811 Hungerford shopping center",
        **sign_block("811", "#2c2824", "#f4f0e8", "plaque"),
        notes="County name Shopping Center. 1978, 4.92 m. Tenants were not verified, so the sign is the street number only.",
        sources="County name Shopping Center, 811 Hungerford Drive.",
    ),
    116279: spec(
        style="gas",
        business="Hungerford fuel (Gulf / Marathon)",
        **sign_block("FUEL", "#2a2c28", "#f3f1e8", "plaque"),
        fuelCanopy=True,
        canopy="entry",
        notes="County building name Hungerford Gulf (1963). OSM way is Hungerford Marathon. The sign says FUEL so neither logo is copied. Canopy is limited so it stays off the travel lane.",
        sources="County name Hungerford Gulf; OSM fuel way Hungerford Marathon, 801 Hungerford Drive.",
    ),
    118557: spec(
        style="gas",
        business="Rockville Sunoco",
        **sign_block("SUNOCO", "#2c2a28", "#f2efe8", "plaque"),
        fuelCanopy=True,
        canopy="entry",
        notes="County name Rockville Sunoco. Plain text on a dark band, not the diamond logo. The OSM fuel query on 26 Nov 2026 did not return this node.",
        sources="County building name Rockville Sunoco, 790 Hungerford Drive.",
    ),
    339338: spec(
        business="Great Wall Supermarket",
        **sign_block("GREAT WALL", "#7a1e24", "#f7f1e6"),
        canopy="metal",
        canopyDepth=0.7,
        rtu=False,
        notes="OSM supermarket node sits 3 m from this centroid, tagged 460 Hungerford Drive, which does not match this 700 Hungerford footprint. Measured height is 2.84 m (Planning 9.3 ft, Medium). The mass stays that low. It reads as a market shed, not a full grocery hall.",
        sources="OSM Great Wall Supermarket; county 700 Hungerford Drive, height evidence in building-heights.json.",
    ),
    336694: spec(
        style="grocery",
        material="stucco",
        tint=[0.90, 0.82, 0.68],
        wall=[0.72, 0.64, 0.52],
        business="Giant Food",
        bay=6.0,
        canopy="entry",
        canopyDepth=2.2,
        canopyColor=[0.42, 0.24, 0.22],
        side="blank",
        rtu=True,
        **sign_block("GIANT", "#6e1c22", "#f6f1e8", "billboard"),
        notes="2002 grocery box, measured 11.22 m (the higher Planning figure; Rockville measured 8.10 m). Tall blank masonry, one glazed entry, rooftop units. The sign is a colour block, not the Giant logo.",
        sources="stores.giantfood.com lists 625 Hungerford Drive; OSM supermarket node; county footprint 336694.",
    ),
    233829: spec(
        business="Popeyes",
        **sign_block("POPEYES", "#7a2e14", "#f8f1e4"),
        canopy="metal",
        canopyColor=[0.55, 0.28, 0.16],
        notes="OSM fast_food at 587 Hungerford. The county footprint is a 3 m by 20 m sliver, so the facade is a narrow bay on that measured plan, not a freestanding restaurant box.",
        sources="popeyes.com restaurant at 587 Hungerford Drive; OSM node.",
    ),
    233827: spec(business="Bread Corner", canopy="fabric", canopyColor=[0.58, 0.40, 0.22], **sign_block("BREAD CORNER", "#5c3a24", "#f8f1e4")),
    233826: spec(business="Aria", canopy="fabric", canopyColor=[0.25, 0.32, 0.34], **sign_block("ARIA", "#243238", "#f3f0e8")),
    233821: spec(business="Hong Kong Tea House", canopy="fabric", canopyColor=[0.20, 0.38, 0.34], **sign_block("TEA HOUSE", "#1c3330", "#f2f6f3")),
    231635: spec(
        business="7-Eleven",
        **sign_block("7-ELEVEN", "#1d3d34", "#f4f7f2"),
        canopy="metal",
        notes="Convenience storefront. Plain text on a dark green band, not the striped trade dress.",
        sources="OSM convenience 7-Eleven, 779 Hungerford Drive.",
    ),
    210511: spec(business="Yi Fang Tea", canopy="fabric", canopyColor=[0.70, 0.22, 0.28], **sign_block("YI FANG", "#6e2430", "#f8f1e6"), sources="OSM cafe Yi Fang Tea, 777 Hungerford Drive."),
    231636: spec(business="Smile Dental Care", canopy="entry", **sign_block("DENTAL", "#2c3440", "#f4f1ea", "plaque"), sources="OSM dentist Smile Dental Care, 775 Hungerford Drive."),
    231637: spec(
        business="Pho 75",
        canopy="fabric",
        canopyColor=[0.52, 0.22, 0.18],
        **sign_block("PHO 75", "#5c2a22", "#f6f0e4"),
        notes="OSM node tagged 711 Hungerford Drive is 8 m from this 771 footprint. There is no 711 footprint in the county set. Assigned as the nearest storefront and flagged.",
        sources="OSM restaurant Pho 75; county Shopping Center at 771 Hungerford Drive.",
    ),
    337980: spec(
        style="garage",
        material="concrete",
        tint=[0.78, 0.78, 0.76],
        wall=[0.58, 0.58, 0.56],
        glass=[0.10, 0.11, 0.11],
        metal=[0.55, 0.56, 0.55],
        bay=8.0,
        canopy="none",
        side="same",
        floors=5,
        business="City Center garage",
        **sign_block("PARKING", "#2e3130", "#eceae4", "plaque"),
        notes="garage flag, year 2003, 16.59 m, three courtyard holes. Five open decks. The holes stay open. No second collider.",
        sources="County name City Center, 501 Hungerford Drive, garage true in the height table.",
    ),
    123826: spec(
        style="bank",
        business="Wells Fargo",
        bay=5.6,
        canopy="entry",
        canopyDepth=1.6,
        **sign_block("WELLS FARGO", "#3d2a22", "#f3ecdf"),
        notes="1984 branch, long and narrow (about 46 m by 8 m). Brick, a few wide windows, entry canopy. Plain text, not the stagecoach logo.",
        sources="locations.wellsfargo.com 502 Hungerford Drive; OSM bank way.",
    ),
    124333: spec(
        style="gas",
        business="510 Hungerford fuel (county name Freestate)",
        **sign_block("FUEL", "#2a2c28", "#f3f1e8", "plaque"),
        fuelCanopy=True,
        canopy="entry",
        notes="OSM fuel way at 510 Hungerford, 4 m from the centroid. County name is Freestate. Sign says FUEL.",
        sources="OSM fuel, 510 Hungerford Drive; county name Freestate.",
    ),
    120023: spec(
        style="civic",
        business="Rockville Post Office",
        bay=4.4,
        canopy="entry",
        side="punched",
        **sign_block("POST OFFICE", "#2c3340", "#f4f1ea"),
        notes="1964 civic brick, 6.84 m, symmetrical punched windows, canopy only over the entry.",
        sources="County name Rockville Post Office, 500 N Washington Street; OSM post_office node.",
    ),
    208937: spec(
        style="office-ribbon",
        material="concrete",
        tint=[0.86, 0.85, 0.82],
        wall=[0.68, 0.67, 0.64],
        glass=[0.25, 0.38, 0.46],
        metal=[0.58, 0.60, 0.62],
        bay=3.8,
        canopy="entry",
        canopyDepth=1.4,
        side="same",
        floors=10,
        rtu=True,
        business="Office tower at 315 N Washington (Gateway mass)",
        notes="Measured 40.83 m, year 1971, floor plate about 3,100 m². That matches the 1972 Gateway tower marketed as 401 N Washington (9 storeys, concrete and steel, new windows in 2000). The county address on this footprint is 315 N Washington, which is also the published Social Security field office. The ribbon is 10 bands on the measured height (9 storeys plus a base). No GATEWAY or SSA wordmark.",
        sources="Height table year 1971 and 134 ft Planning part; 401nwashington.com; commercialcafe Gateway Tower; SSA listing for 315 N Washington.",
    ),
    122323: spec(
        style="office-punched",
        material="concrete",
        tint=[0.84, 0.78, 0.68],
        wall=[0.70, 0.64, 0.54],
        glass=[0.34, 0.28, 0.20],
        metal=[0.45, 0.40, 0.34],
        bay=3.6,
        canopy="entry",
        side="same",
        floors=7,
        rtu=True,
        business="Exchange Place, 451 Hungerford",
        notes="Published seven storeys, built 1980, measured 29.87 m. Bronze punched windows over a ground-floor storefront. UPS Store and an acupuncture office are ground-floor tenants; the sign is not a chain logo.",
        sources="City-geometry report LoopNet/CompStak seven storeys; OSM UPS Store suite 119 and Healing Acupuncture at 451 Hungerford.",
    ),
    126115: spec(
        style="apartment",
        business="Heritage House",
        bay=3.5,
        canopy="entry",
        side="punched",
        balcony="alternate",
        floors=6,
        **sign_block("HERITAGE HOUSE", "#4a3028", "#f3ece4", "plaque"),
        notes="Senior apartments, built 1981, county name HERITAGE HOUSE. A listing says 7 storeys and 100 units; the measured roof is 19.11 m, so the facade uses 6 floors inside that height. Brick, punched windows, balconies on alternate bays of the long faces.",
        sources="County name HERITAGE HOUSE, 95 Dawson Avenue; apartmenthomeliving.com (7 storeys, 1981, 100 units); height table.",
    ),
    122429: spec(
        style="civic",
        business="DHHS Administrative Building",
        bay=4.0,
        canopy="entry",
        side="punched",
        upperStyle="office-ribbon",
        upperSign="DHHS",
        floors=None,
        notes="Low wing stays at the measured 4.54 m. The Planning part rises to 31.24 m on its own polygon and is dressed as a brick ribbon tower. Both parts are inside the district ring.",
        sources="County name DHHS Administrative Building, 401 Hungerford Drive; building-sections.geojson parent 122429.",
    ),
    123877: adopt(
        STUCCO,
        business="401 N Washington annex",
        bay=4.6,
        canopy="metal",
        rtu=True,
        notes="County name Commission for Women, but the height is an estimate (median of neighbours, 5.66 m) on a 2,046 m² pad. The Gateway leasing page describes a low annex with ground-floor retail beside the tower. Dressed as stucco storefront at the measured estimate. No tenant names were copied.",
        sources="County name on 401 N Washington; 401nwashington.com annex and retail description; height method median-of-measured-neighbours.",
    ),
    122161: spec(
        business="Corner Bites",
        canopy="fabric",
        canopyColor=[0.62, 0.28, 0.18],
        **sign_block("CORNER BITES", "#5a2c22", "#f8f1e8"),
        notes="1977 commercial building, 6.49 m, at 316 N Washington.",
        sources="OSM restaurant Corner Bites, 316 North Washington Street.",
    ),
    232689: spec(
        business="T-Swirl Crêpe",
        canopy="fabric",
        canopyColor=[0.64, 0.20, 0.24],
        bay=4.8,
        **sign_block("T-SWIRL", "#6e2430", "#f8f1e6"),
        notes="OSM restaurant at 313 N Washington. The footprint is 675 m², so the sign marks the tenant and the rest of the front is ordinary storefront.",
        sources="OSM restaurant T-Swirl Crêpe & XO Pho, 313 North Washington Street.",
    ),
    232691: spec(
        business="Bob's Shanghai 66",
        canopy="fabric",
        canopyColor=[0.18, 0.36, 0.30],
        **sign_block("BOB'S SHANGHAI", "#1c3330", "#f3f6f2"),
        notes="OSM node has no street number. It is 17 m from 309 N Washington and 16 m from 305. The name stays on 309 so it is not painted on both.",
        sources="OSM restaurant Bob's Shanghai 66.",
    ),
    225290: spec(
        style="cottage",
        business="Vibes Hookah Lounge",
        canopy="fabric",
        canopyColor=[0.22, 0.24, 0.28],
        side="punched",
        front="short",
        **sign_block("VIBES", "#242428", "#f2f0ea", "plaque"),
        notes="Small 4.03 m building at 1 Dawson Avenue.",
        sources="OSM restaurant Vibes Hookah Lounge, 1 Dawson Avenue.",
    ),
    225294: spec(
        style="cottage",
        business="Gimme More Thai",
        canopy="fabric",
        canopyColor=[0.20, 0.40, 0.28],
        side="punched",
        front="short",
        **sign_block("THAI", "#1c3330", "#f3f6f2", "plaque"),
        sources="OSM restaurant Gimme More Thai, 13 Dawson Avenue.",
    ),
    120347: spec(
        business="Montgomery County ABS",
        canopy="entry",
        **sign_block("COUNTY", "#2e3a44", "#eef2f4", "plaque"),
        notes="OSM alcohol shop Montgomery County ABS at 300 N Washington. Civic-leaning storefront, not a retail chain.",
        sources="OSM shop, 300 North Washington Street.",
    ),
}


def classify(row, group_count):
    if row["id"] in ANCHORS:
        return dict(ANCHORS[row["id"]])
    street = row["street"] or ""
    number = house_number(row["address"])
    area = row["area"]
    height = row["height"]
    year = row["year"]
    if row["cls"] == "S" or area < 28:
        return spec(
            style="shed",
            material="concrete",
            tint=[0.75, 0.75, 0.73],
            wall=[0.55, 0.55, 0.53],
            canopy="none",
            notes="Small outbuilding. Skin only, no storefront.",
        )
    if row["garage"]:
        return spec(
            style="garage",
            material="concrete",
            tint=[0.78, 0.78, 0.76],
            wall=[0.58, 0.58, 0.56],
            glass=[0.10, 0.11, 0.11],
            bay=8,
            canopy="none",
            side="same",
            notes="Marked garage in the height table.",
        )
    if "MARTINS SQUARE" in street:
        return spec(
            style="townhouse",
            front="short",
            side="punched",
            canopy="entry",
            canopyDepth=0.7,
            floors=3,
            bay=3.2,
            notes="Martins Square Lane townhouse module, about 11–13 m, narrow footprint. Brick, three floors inside the measured height, a small entry hood. No per-unit colour variation was sourced, so the row shares one brick.",
            sources="County address on Martins Square Lane.",
        )
    if "IVY LEAGUE" in street:
        return spec(
            style="townhouse",
            material="stucco",
            tint=[0.86, 0.80, 0.70],
            wall=[0.70, 0.62, 0.50],
            front="short",
            side="punched",
            canopy="entry",
            canopyDepth=0.65,
            floors=3,
            bay=3.2,
            notes="Ivy League Lane townhouse, about 10–11 m, built around 1982. Painted masonry so the row does not repeat the Martins Square brick.",
            sources="County address on Ivy League Lane.",
        )
    if group_count >= 6 and area < 140 and 5.5 <= height <= 14:
        material = brick_year(year)
        # 620 and 622 are two different rows. Split them by address so neighbours differ.
        if number == 622:
            material = dict(STUCCO)
        return adopt(
            material,
            style="townhouse",
            front="short",
            side="punched",
            canopy="entry",
            canopyDepth=0.55,
            floors=2 if height < 9 else 3,
            bay=3.0,
            notes="Repeated narrow footprint in a same-address group. Treated as a 2-storey townhouse row. 620 stays brick; 622 is painted so the two rows are not the same template.",
            sources="County footprints sharing this street address.",
        )
    if street == "DAWSON" and area < 140 and height < 6:
        return spec(
            style="cottage",
            material="stucco",
            tint=[0.90, 0.84, 0.72],
            wall=[0.72, 0.64, 0.52],
            front="short",
            side="punched",
            canopy="none",
            notes="Small Dawson Avenue building without a verified tenant. Door and windows, no invented shop name.",
            sources="County footprint.",
        )
    if street == "NORTH" and area < 220:
        return spec(
            style="townhouse",
            front="short",
            side="punched",
            canopy="entry",
            floors=2 if height < 9 else 3,
            notes="10 North Street is a single narrow building, dressed as a house rather than a shop. No business name was found.",
            sources="County footprint.",
        )
    # The 580–630 Hungerford bays are one tenant strip. Keep them brick with awnings.
    if street == "HUNGERFORD" and number and 580 <= number <= 630 and area < 450:
        return spec(
            canopy="fabric",
            canopyColor=[0.42, 0.24, 0.20],
            bay=3.6,
            notes="One-storey bay in the tenant strip south of Giant. Shared brick and awning module; sign only where a business was matched.",
            sources="County footprint on the 580–630 Hungerford block.",
        )
    if street == "WASHINGTON" and height < 8:
        return spec(
            canopy="fabric",
            canopyColor=[0.36, 0.24, 0.20],
            bay=4.4,
            notes="North Washington one-storey commercial front. Fabric awning. No tenant name unless a source matched.",
            sources="County footprint on North Washington Street.",
        )
    chosen = brick_year(year)
    chosen["rtu"] = area > 500 and height >= 4.5
    chosen["notes"] = "One-storey commercial front. Material follows the year band: brick before 1975, warm stucco from 1975, cream stucco from 1990. Blank sign where no tenant was verified."
    chosen["sources"] = "County footprint and year in the height table."
    if height >= 7.4:
        chosen["notes"] += " Upper windows are added because the measured wall clears a second floor."
    return chosen


def modules_of(item):
    style = item["style"]
    parts = []
    if item["material"] == "brick":
        parts.append("brick skin")
    elif item["material"] == "concrete":
        parts.append("concrete panel skin")
    else:
        parts.append("stucco skin")
    table = {
        "storefront": "storefront bays, parapet",
        "grocery": "grocery entry, blank side walls, parapet",
        "gas": "kiosk storefront",
        "bank": "bank windows, entry",
        "office-ribbon": "ribbon windows, spandrels",
        "office-punched": "punched office windows",
        "apartment": "apartment windows",
        "townhouse": "townhouse door and windows",
        "garage": "garage deck slots",
        "civic": "civic punched windows",
        "cottage": "cottage door and window",
        "shed": "shed skin",
    }
    parts.append(table.get(style, style))
    if item.get("balcony"):
        parts.append("balconies")
    if item.get("canopy") == "fabric":
        parts.append("fabric awning")
    elif item.get("canopy") == "metal":
        parts.append("metal canopy")
    elif item.get("canopy") == "entry":
        parts.append("entry canopy")
    if item.get("fuelCanopy"):
        parts.append("fuel canopy")
    if item.get("sign"):
        parts.append("text sign")
    if item.get("rtu"):
        parts.append("rooftop units")
    if item.get("upperStyle"):
        parts.append("upper " + item["upperStyle"])
    return ", ".join(parts)


def storeys_of(item, height):
    if item.get("floors"):
        return item["floors"]
    if item["style"] in {"townhouse", "apartment"}:
        return 3 if height >= 9.2 else 2
    if item["style"] in {"office-ribbon", "office-punched"}:
        return max(2, round(height / 3.6))
    if item["style"] == "garage":
        return max(2, round(height / 3.2))
    if height >= 7.4 and item["style"] == "storefront":
        return 2
    return 1


def main():
    districts = json.loads(DISTRICT.read_text())
    ring = next(
        feature["geometry"]["coordinates"][0]
        for feature in districts["features"]
        if feature["properties"]["name"] == "hungerford-corridor"
    )
    footprints = json.loads(FOOTPRINTS.read_text())
    heights = json.loads(HEIGHTS.read_text())["buildings"]
    rows = []
    for feature in footprints["features"]:
        if feature["properties"].get("role") != "playable":
            continue
        lon, lat, area = centroid(feature["geometry"]["coordinates"])
        if not pip(lon, lat, ring):
            continue
        oid = int(feature["properties"]["OBJECTID"])
        record = heights[str(oid)]
        rows.append({
            "id": oid,
            "address": (feature["properties"].get("ADDRESS") or "").strip(),
            "name": (record.get("name") or "").strip(),
            "street": feature["properties"].get("STREET_NAME") or "",
            "cls": feature["properties"].get("BLDG_CLASS") or "",
            "lon": lon,
            "lat": lat,
            "area": round(area, 1),
            "height": record["heightM"],
            "confidence": record["confidence"],
            "year": record.get("year"),
            "garage": bool(record.get("garage")),
            "roof": record.get("roof") or "Flat",
        })
    counts = {}
    for row in rows:
        counts[row["address"]] = counts.get(row["address"], 0) + 1

    drafted = []
    for row in rows:
        item = classify(row, counts[row["address"]])
        drafted.append((row, item))
    # Each OSM point sticks to its single nearest footprint. If that footprint
    # already has a business, the point is used up and does not label a neighbour.
    claims = []
    already = {item.get("business") for _, item in drafted if item.get("business")}
    for name, kind, plat, plon, addr in OSM:
        if name in already:
            continue
        wanted = house_number(addr)
        ranked = []
        for row, item in drafted:
            if item["style"] in {"shed", "townhouse", "garage"} or row["area"] >= 1000:
                continue
            dist = (((row["lat"] - plat) * 111017.096) ** 2 + ((row["lon"] - plon) * 86521.41) ** 2) ** 0.5
            address_hit = wanted is not None and house_number(row["address"]) == wanted and dist <= 40
            if dist <= 18 or address_hit:
                ranked.append((0 if address_hit else 1, dist, row, item))
        if not ranked:
            continue
        ranked.sort(key=lambda item: (item[0], item[1]))
        # An address hit is consumed by that footprint even when the name is already set.
        if ranked[0][0] == 0:
            _, dist, row, item = ranked[0]
            claims.append((dist, row, item, kind, addr, name, True))
            continue
        for _, dist, row, item in ranked:
            if not item.get("business"):
                claims.append((dist, row, item, kind, addr, name, False))
                break
    claims.sort(key=lambda item: item[0])
    used_rows = set()
    for dist, row, item, kind, addr, name, address_hit in claims:
        if row["id"] in used_rows:
            continue
        used_rows.add(row["id"])
        if item.get("business"):
            continue
        item["business"] = name
        item["sources"] = (item.get("sources") or "County footprint. ") + f"OSM {kind} {name} at {dist:.0f} m ({addr})."
        short = {
            "Asian Bakery Cafe": "BAKERY",
            "The Thai Cuisine Restaurant": "THAI",
            "Bread Corner": "BREAD CORNER",
            "Aria": "ARIA",
            "Hong Kong Tea House": "TEA HOUSE",
            "Gimme More Thai": "THAI",
            "Vibes Hookah Lounge": "VIBES",
            "Bob's Shanghai 66": "BOB'S SHANGHAI",
            "T-Swirl Crêpe": "T-SWIRL",
            "Corner Bites": "CORNER BITES",
            "Pho 75": "PHO 75",
        }.get(name)
        if short and not item.get("sign") and item["style"] in {"storefront", "cottage"}:
            item["sign"] = short
            item["notes"] = (item.get("notes") or "") + " Sign text is the OSM name in plain letters."
    buildings = {}
    review = []
    for row, item in drafted:
        item["id"] = row["id"]
        item["address"] = row["address"]
        item["countyName"] = row["name"]
        item["heightM"] = row["height"]
        item["confidence"] = row["confidence"]
        item["year"] = row["year"]
        item["areaM2"] = row["area"]
        item["storeys"] = storeys_of(item, row["height"])
        item["modules"] = modules_of(item)
        if not item.get("sources"):
            item["sources"] = "County footprint and the approved height table."
        buildings[str(row["id"])] = item
        review.append((row["lat"], row, item))

    payload = {
        "district": "hungerford-corridor",
        "ownership": "Centroid inside docs/geographic-audit/data/districts.geojson feature hungerford-corridor.",
        "excluded": [
            "430 Hungerford Drive / Walgreens (Hungerford Plaza, OBJECTID 126073) centroid is in the gap between hungerford-corridor and town-center-core.",
            "380 Hungerford Drive / Fire Station 3 (OBJECTID 125245) centroid is in town-center-core.",
            "5 Dawson Avenue (OBJECTID 225291) centroid is in the same south-edge gap.",
            "Montgomery College is north of latitude 39.09510 and outside the playable boundary.",
        ],
        "buildings": buildings,
    }
    STYLES.parent.mkdir(parents=True, exist_ok=True)
    STYLES.write_text(json.dumps(payload, indent=1) + "\n")

    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "footprint_id", "address", "county_name", "business", "style", "material",
        "storeys", "height_m", "confidence", "year", "area_m2", "sign", "modules",
        "sources", "notes",
    ]
    with CSV_PATH.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for _, row, item in sorted(review, key=lambda entry: -entry[0]):
            writer.writerow({
                "footprint_id": row["id"],
                "address": row["address"],
                "county_name": row["name"],
                "business": item.get("business") or "",
                "style": item["style"],
                "material": item["material"],
                "storeys": item["storeys"],
                "height_m": row["height"],
                "confidence": row["confidence"],
                "year": row["year"] if row["year"] else "",
                "area_m2": row["area"],
                "sign": item.get("sign") or "",
                "modules": item["modules"],
                "sources": item.get("sources") or "",
                "notes": item.get("notes") or "",
            })

    ring_js = json.dumps([[round(lon, 6), round(lat, 6)] for lon, lat in ring])
    BOUNDARY.parent.mkdir(parents=True, exist_ok=True)
    BOUNDARY.write_text(
        "// Generated by scripts/build_hungerford_styles.py from the audit district ring.\n"
        "// Centroid-in-ring is the ownership test. Do not edit by hand.\n"
        f"export const HUNGERFORD_RING = {ring_js};\n"
    )

    from collections import Counter
    styles = Counter(item["style"] for _, _, item in review)
    print(f"buildings {len(buildings)}")
    print(styles)
    print("--- named ---")
    for _, row, item in sorted(review, key=lambda entry: -entry[0]):
        if item.get("business") or item["style"] not in {"storefront", "townhouse", "shed", "cottage"}:
            print(f"{row['id']:7} {row['address'][:34]:34} {item['style']:16} {item.get('business','')[:28]:28} h={row['height']}")


if __name__ == "__main__":
    main()
