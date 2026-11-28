"""Encode original screencast frames using their capture timestamps."""
import argparse
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
source = args.source.resolve()
frames = sorted(json.loads((source / "frames.json").read_text()), key=lambda frame: frame[1])
assert len(frames) > 1
timestamps = [float(t) for _, t in frames]
assert all(a <= b for a, b in zip(timestamps, timestamps[1:]))
lines = ["ffconcat version 1.0"]
for index, (file, time) in enumerate(frames[:-1]):
    lines.extend([f"file '{source / file}'", f"duration {float(frames[index + 1][1]) - time:.6f}"])
lines.append(f"file '{source / frames[-1][0]}'")
manifest = source / "capture.ffconcat"
manifest.write_text("\n".join(lines) + "\n")
subprocess.run([
    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
    "-i", str(manifest), "-vf", "fps=20,format=yuv420p", "-c:v", "libx264", "-threads", "2",
    "-preset", "fast", "-crf", "21", "-movflags", "+faststart", str(args.output),
], check=True)
print(f"{args.output.name} | {timestamps[-1] - timestamps[0]:.3f}s | {len(frames)} original frames")
