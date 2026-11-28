"""Export the collected browser measurements with unmeasured fields left blank."""
import csv
import json
import math
import statistics as stats
import sys
from pathlib import Path

out = Path(sys.argv[1] if len(sys.argv) > 1 else "out")
sites = ("town-square", "regal-theater", "maryland-avenue", "gibbs-street", "courthouse-square",
         "rockville-metro-station", "choice-hotels-circle", "dense-commercial", "citywide-overview")


def lines(name):
    path = out / name
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line]


def json_file(name, default):
    path = out / name
    return json.loads(path.read_text()) if path.exists() else default


def percentile(values, q):
    xs = sorted(values)
    return xs[max(0, math.ceil(len(xs) * q) - 1)] if xs else None


def round3(x):
    return round(x, 3) if x is not None else None


def frame_stats(intervals):
    if not intervals:
        return {}
    slow = sorted(intervals, reverse=True)[:max(1, math.ceil(len(intervals) / 100))]
    return {
        "frames": len(intervals), "duration_ms": round3(sum(intervals)),
        "mean_fps": round3(1000 / stats.mean(intervals)),
        "median_ms": round3(stats.median(intervals)),
        "one_percent_low_fps": round3(1000 / stats.mean(slow)),
        "p95_ms": round3(percentile(intervals, 0.95)), "p99_ms": round3(percentile(intervals, 0.99)),
        "max_ms": round3(max(intervals)), "over_100ms": sum(x > 100 for x in intervals),
    }


def rows_of(name):
    return {(r["build"], r["location"], r["preset"], r["zombies"]): r for r in lines(name)}


def write_table(name, rows):
    fields = list(dict.fromkeys(k for row in rows for k in row))
    with (out / name).open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


sync = rows_of("sync-matrix.ndjson")
fenced = rows_of("readback-matrix.ndjson")
work = rows_of("workload.ndjson")
raf = rows_of("matrix.ndjson")
matrix = []
for location in sites:
    for preset in ("low", "medium", "high"):
        for zombies in (0, 6, 10, 24, 50):
            for build in ("baseline", "game"):
                key = (build, location, preset, zombies)
                pair_keys = [(side, location, preset, zombies) for side in ("baseline", "game")]
                fenced_pair = all(k in fenced for k in pair_keys)
                timed = fenced.get(key) if fenced_pair else sync.get(key) or fenced.get(key)
                structural = timed or work.get(key)
                row = dict(build=build, location=location, preset=preset, zombies=zombies,
                           timing_status="measured" if timed else "unmeasured",
                           timing_method=("pixel-readback" if timed.get("fencedReadback") else "finish-probe") if timed else "",
                           timing_cohort=timed.get("cohort", "initial concurrent software tests") if timed else "",
                           structural_status=("raster" if timed else "no-raster diagnostic") if structural else "unmeasured")
                if timed:
                    frames = timed["frames"]
                    row.update(frame_stats([f["interval"] for f in frames if f["interval"] > 0]))
                    row.update(cpu_update_median_ms=round3(stats.median(f["update"] for f in frames)),
                               cpu_submit_median_ms=round3(stats.median(f["render"] for f in frames)),
                               cpu_update_and_submit_median_ms=round3(stats.median(f["update"]+f["render"] for f in frames)),
                               software_backend_query_mean_ms=timed.get("gpuFrameMs"),
                               software_backend_query_samples=timed.get("gpuBackendSampleCount",0),
                               shader_api_stall_max_ms=max((s["ms"] for s in timed["shaders"]), default=0))
                if structural:
                    row.update(viewport="x".join(map(str, structural["viewport"])),
                               render_resolution="x".join(map(str, structural["resolution"])),
                               average_draw_calls=round3(stats.mean(f["calls"] for f in structural["frames"])),
                               average_triangles=round3(stats.mean(f["triangles"] for f in structural["frames"])),
                               scene_nodes=structural["objects"], node_visible_flags=structural["visible"],
                               estimated_rgba8_mib=round3(structural["estimatedTextureBytes"] / 2**20),
                               three_textures=structural["renderInfo"]["textures"],
                               js_heap_mib=round3(structural["heap"] / 2**20) if structural["heap"] else None)
                matrix.append(row)
write_table("Rockville_009_Benchmark_Matrix.csv", matrix)

paired = []
by_key = {(r["build"], r["location"], r["preset"], r["zombies"]): r for r in matrix}
for row in matrix:
    if row["build"] != "baseline":
        continue
    other = by_key["game", row["location"], row["preset"], row["zombies"]]
    pair = dict(location=row["location"], preset=row["preset"], zombies=row["zombies"])
    for name in ("frames", "median_ms", "mean_fps", "p95_ms", "p99_ms", "average_draw_calls", "average_triangles",
                 "scene_nodes", "estimated_rgba8_mib", "three_textures", "js_heap_mib"):
        left, right = row.get(name), other.get(name)
        pair[f"baseline_{name}"], pair[f"current_{name}"] = left, right
        pair[f"delta_{name}"] = round3(right - left) if left is not None and right is not None else None
    pair["both_timed"] = row["timing_status"] == other["timing_status"] == "measured" and row["timing_method"] == other["timing_method"]
    pair["method"] = row["timing_method"] if pair["both_timed"] else ""
    paired.append(pair)
write_table("Rockville_009_Matched_Comparison.csv", paired)

stability = []
for label, source in (("initial mixed-preset", "stability.ndjson"), ("Low retry", "stability-retry.ndjson"), ("isolated Low", "stability-isolated.ndjson")):
 for r in lines(source):
    s, m, d = r["sample"], r["metrics"], r["dom"]
    positive = [f for f in s["observedIntervals"] if f > 0]
    end_frames = []
    elapsed = 0
    for f in reversed(positive):
        elapsed += f
        end_frames.append(f)
        if elapsed >= 30000:
            break
    stability.append(dict(session=label, minutes=round(r["seconds"] / 60, 2), elapsed_seconds=r["seconds"],
                          preset=s["preset"], round=s["survival"]["round"], phase=s["survival"]["phase"],
                          active_zombies=s["survival"]["alive"], corpses=s["survival"]["corpses"],
                          pooled_zombies=s["survival"]["pooled"], kills=s["survival"]["kills"],
                          shots=s["combat"]["shots"], hits=s["combat"]["hits"], points=s["points"],
                          metres=round3(s["driver"]["distance"]) if s.get("driver") else None,
                          heap_mib=round3(m["JSHeapUsedSize"] / 2**20), heap_capacity_mib=round3(m["JSHeapTotalSize"] / 2**20),
                          scene_nodes=s["count"]["n"], listeners=d["jsEventListeners"], audio_handlers=m.get("AudioHandlers"),
                          scene_audio_nodes=s["count"]["audioNodes"], textures=s["renderer"]["memory"]["textures"],
                          programs=s["renderer"]["programs"], context_losses=s["contextLoss"],
                          errors=len(r["issues"]), external_requests=len(r["external"]), **frame_stats(end_frames)))
if stability:
    write_table("Rockville_009_Stability.csv", stability)

def feature_summary():
    summary = []
    for r in json_file("feature-isolation.json", []):
        f = r["samples"][1:]
        gpu = [x["gpuBackendMs"] for x in f if x.get("gpuBackendMs") is not None]
        summary.append(dict(location=r["location"], feature=r["feature"], samples=len(f),
                            readback_median_ms=round3(stats.median(x["ms"] for x in f)),
                            submit_median_ms=round3(stats.median(x["submitMs"] for x in f)),
                            backend_query_median_ms=round3(stats.median(gpu)) if gpu else None,
                            draws=round3(stats.mean(x["draws"] for x in f)), triangles=round3(stats.mean(x["triangles"] for x in f))))
    if summary:
        write_table("Rockville_009_Cost_Isolation.csv", summary)
    return summary


def profile_summary():
    report = json_file("chromium-cpu-profile.json", {})
    result = {}
    for phase in ("startup", "active"):
        if phase not in report:
            continue
        profile = report[phase]
        names = {n["id"]: n["callFrame"] for n in profile["nodes"]}
        by_name = {}
        for node, us in zip(profile["samples"], profile["timeDeltas"]):
            frame = names[node]
            key = (frame["functionName"] or "<anonymous>", frame["url"].split("/")[-1])
            by_name[key] = by_name.get(key, 0) + us / 1000
        result[phase] = [{"function": k[0], "file": k[1], "self_sample_ms": round3(v)} for k, v in
                         sorted(by_name.items(), key=lambda kv: -kv[1])[:30]]
    return result


brief = dict(timed=len(sync.keys() | fenced.keys()), fenced=len(fenced), finish_probe=len(sync), workload=len(work), raf=len(raf),
             matched=sum(r["both_timed"] for r in paired), stability=stability,
             reference_cases=[r for r in paired if r["zombies"] == 24],
             costs=feature_summary(), profile=profile_summary())
(out / "brief.json").write_text(json.dumps(brief, indent=2))
print(json.dumps({k: brief[k] for k in ("timed", "workload", "matched")}))
