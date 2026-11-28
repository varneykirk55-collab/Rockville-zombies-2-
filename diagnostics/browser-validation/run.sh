#!/bin/bash
set -e
cd "$(dirname "$0")"
python3 -m http.server 8930 --bind 127.0.0.1 -d .. >/dev/null 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
sleep 0.4
node "$@"
