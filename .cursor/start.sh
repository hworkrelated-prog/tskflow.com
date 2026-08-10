#!/usr/bin/env bash
# Per-boot reconciliation: bring up MongoDB and seed dev data, then return.
# Must tolerate restarts and avoid duplicate processes.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Ensuring MongoDB data/log directories"
sudo mkdir -p /var/lib/mongodb /var/log/mongodb
sudo chown -R "$(id -u):$(id -g)" /var/lib/mongodb /var/log/mongodb

if mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then
  echo "==> MongoDB already running"
else
  echo "==> Starting MongoDB"
  mongod --dbpath /var/lib/mongodb --logpath /var/log/mongodb/mongod.log \
    --bind_ip 127.0.0.1 --fork
fi

echo "==> Waiting for MongoDB to accept connections"
for _ in $(seq 1 30); do
  if mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null

echo "==> Seeding test users (idempotent upsert)"
python3 backend/seed_test_users.py || echo "WARN: seeding skipped/failed"

echo "==> start.sh complete"
