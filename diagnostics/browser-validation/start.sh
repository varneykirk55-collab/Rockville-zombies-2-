#!/bin/bash
set -e
cd "$(dirname "$0")"
python3 -m http.server 8930 --bind 127.0.0.1 -d .. > ../http-009.log 2>&1 &
server=$!
trap 'kill "$server"' EXIT
sleep 0.4
node session.mjs "$@"
