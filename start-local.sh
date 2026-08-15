#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Starting HNSChat test..."
echo "Web: http://127.0.0.1:8080"
(cd "$ROOT/server" && node server.js) &
NODE_PID=$!
trap 'kill $NODE_PID 2>/dev/null || true' EXIT
(cd "$ROOT/web" && php -S 127.0.0.1:8080)
