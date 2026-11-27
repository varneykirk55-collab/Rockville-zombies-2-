#!/usr/bin/env python3
"""Check district ownership, boundary partition, and the latest headless capture."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    ownership = json.loads((ROOT / "public/data/ownership.json").read_text())
    boundaries = json.loads((ROOT / "public/data/districts/boundaries.geojson").read_text())
    heights = json.loads((ROOT / "public/data/building-heights.json").read_text())["buildings"]
    audit_ids = set()
    with (ROOT / "docs/geographic-audit/data/height-reconciliation.csv").open() as handle:
        for row in csv.DictReader(handle):
            audit_ids.add(row["object_id"])

    problems = []
    owners = {}
    for building_id, record in ownership["buildings"].items():
        owners.setdefault(record["district"], []).append(building_id)
        if building_id not in heights:
            problems.append(f"{building_id} is owned but has no height record")
    if len(ownership["buildings"]) != 512:
        problems.append(f"expected 512 playable owners, found {len(ownership['buildings'])}")
    missing_audit = [item for item in audit_ids if item not in ownership["buildings"]]
    if missing_audit:
        problems.append(f"{len(missing_audit)} audit ids have no owner")
    if len(audit_ids) != 508:
        problems.append(f"audit table has {len(audit_ids)} rows")

    polygons = {feature["properties"]["code"]: shape(feature["geometry"]) for feature in boundaries["features"]}
    if set(polygons) != {"A", "B", "C", "D"}:
        problems.append(f"boundary codes are {sorted(polygons)}")
    codes = list(polygons)
    for i, left in enumerate(codes):
        for right in codes[i + 1:]:
            area = polygons[left].intersection(polygons[right]).area
            if area > 1e-12:
                problems.append(f"{left} overlaps {right} by {area}")
    for building_id, record in ownership["buildings"].items():
        point = Point(record["longitude"], record["latitude"])
        hits = [code for code, geom in polygons.items() if geom.covers(point)]
        if hits != [record["district"]]:
            problems.append(f"{building_id} classified {record['district']} but polygons say {hits}")

    capture_path = ROOT / "docs/city-development-foundation/screenshots/integrated/capture.json"
    if not capture_path.exists():
        capture_path = ROOT / "docs/city-development-foundation/screenshots/after/capture.json"
    capture = json.loads(capture_path.read_text()) if capture_path.exists() else None
    if capture:
        audit = capture["summary"].get("windowAudit") or {}
        if audit.get("buried"):
            problems.append(f"buried windows {audit['buried']}")
        if capture.get("errors"):
            problems.append(f"console errors: {capture['errors']}")
        placed = {item["id"]: item for item in capture["summary"]["landmarks"]}
        for required in (
            "clock-tower", "turret-corner", "regal-cinemas", "white-columned",
            "circuit-court", "district-court", "historic-red-brick-courthouse",
            "courthouse-roundabout",
        ):
            if not placed.get(required, {}).get("placed"):
                problems.append(f"{required} was not placed")
        if placed.get("missing-model-fallback", {}).get("fallback") != "procedural":
            problems.append("missing model did not fall back to procedural")
        pedestrian = (capture.get("walk") or {}).get("pedestrian") or {}
        if pedestrian.get("interior"):
            problems.append(f"interior pedestrian samples {pedestrian.get('interior')}")

    counts = {code: len(ids) for code, ids in owners.items()}
    result = {
        "playableOwners": len(ownership["buildings"]),
        "auditOwners": sum(1 for record in ownership["buildings"].values() if record["inAudit508"]),
        "districtCounts": counts,
        "overlapProblems": [item for item in problems if "overlap" in item],
        "problems": problems,
        "capture": None if not capture else {
            "drawCalls": capture["performance"]["drawCalls"],
            "triangles": capture["performance"]["triangles"],
            "frameMs": round(capture["performance"]["frameMs"], 1),
            "errors": capture["errors"],
            "windows": capture["summary"]["windows"],
            "windowAudit": capture["summary"]["windowAudit"],
            "roads": capture["summary"]["roads"],
            "walk": {
                "roadSamples": capture["walk"]["roadSamples"],
                "roadBlocked": capture["walk"]["roadBlocked"],
                "pedestrian": capture["walk"]["pedestrian"],
                "controllerMovedM": capture["walk"]["controller"]["movedM"],
                "blockedSteps": capture["walk"]["controller"]["blockedSteps"],
            },
            "gameplayMovedM": capture["gameplay"]["movedM"],
            "landmarks": [
                {key: item[key] for key in ("id", "approval", "loaded", "placed", "fallback", "reason", "triangles") if key in item}
                for item in capture["summary"]["landmarks"]
            ],
        },
    }
    out = ROOT / "docs/city-development-foundation/data/validation-results.json"
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"problems": problems, "counts": counts}, indent=2))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
