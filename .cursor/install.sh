#!/usr/bin/env bash
# Idempotent Cloud Agent install: system deps, app deps, and default dev env files.
# Runs after the repository is checked out. Must terminate and be safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

EMERGENT_INDEX="https://d33sy5i8bnduwe.cloudfront.net/simple/"

# 1. MongoDB server (system dependency). Install once from the official repo.
if ! command -v mongod >/dev/null 2>&1; then
  echo "==> Installing MongoDB 8.0"
  . /etc/os-release
  CODENAME="${UBUNTU_CODENAME:-noble}"
  curl -fsSL https://pgp.mongodb.com/server-8.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor --yes
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${CODENAME}/mongodb-org/8.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
  sudo apt-get update
  sudo apt-get install -y mongodb-org
fi

# 2. Frontend dependencies (Yarn Classic, pinned via packageManager).
echo "==> Installing frontend dependencies"
( cd frontend && yarn install --frozen-lockfile )

# 3. Backend dependencies. emergentintegrations is served from Emergent's index.
echo "==> Installing backend dependencies"
pip install --break-system-packages -r backend/requirements.txt --extra-index-url "$EMERGENT_INDEX"

# 4. Default local dev env files (only if missing). Real secrets belong in the
#    Cloud Agent secrets panel, not in the repo. These defaults enable local dev.
if [ ! -f backend/.env ]; then
  echo "==> Writing backend/.env defaults"
  cat > backend/.env <<'EOF'
MONGO_URL=mongodb://localhost:27017
DB_NAME=tskflow
JWT_SECRET_KEY=dev-secret-change-me
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
EOF
fi

if [ ! -f frontend/.env ]; then
  echo "==> Writing frontend/.env defaults"
  echo "REACT_APP_BACKEND_URL=http://localhost:8001" > frontend/.env
fi

echo "==> install.sh complete"
