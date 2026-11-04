#!/usr/bin/env bash
# Starts the backend and all three Vite dev servers.
# Press Ctrl+C to stop everything.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  echo ""
  echo "Stopping local services..."
  kill 0 2>/dev/null || true
}
trap cleanup INT TERM EXIT

if ! pgrep -x mongod >/dev/null 2>&1; then
  echo "⚠️  MongoDB does not appear to be running."
  echo "   Start it with: brew services start mongodb-community"
fi

echo "Starting backend on http://localhost:4000"
(cd "$ROOT/backend" && node server.js) &

echo "Starting admin panel on http://localhost:5173"
(cd "$ROOT/admin-panel" && npm run dev) &

echo "Starting student panel on http://localhost:5174"
(cd "$ROOT/student-panel" && npm run dev) &

echo "Starting principal panel on http://localhost:5175"
(cd "$ROOT/principal-panel" && npm run dev) &

wait
