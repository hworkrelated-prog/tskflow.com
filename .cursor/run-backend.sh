#!/usr/bin/env bash
# Backend terminal launcher. Ensures MongoDB is up and dev data is seeded
# (idempotent) before starting uvicorn, so the backend works even on boots
# where the environment "start" phase did not run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

bash .cursor/start.sh

cd backend
exec python3 -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
