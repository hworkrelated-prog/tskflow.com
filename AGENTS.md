# AGENTS.md

## Cursor Cloud specific instructions

Tskflow is a single-product app with three services: **MongoDB**, a **FastAPI backend** (`backend/server.py`), and a **React (CRACO) frontend** (`frontend/`). Minimal end-to-end stack is MongoDB + backend + frontend; all third-party integrations (Stripe, Resend, Google Calendar, Apollo, VAPID push, Emergent LLM/voice) are optional and degrade gracefully when their env vars are unset.

### Dependency install (handled by the startup update script)
- Backend Python deps: `pip install --break-system-packages --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ -r backend/requirements.txt`. The extra index URL is **required** — `emergentintegrations` is published only to that private CDN, not PyPI. Backend scripts (e.g. `uvicorn`) install to `~/.local/bin`, so run the server via `python3 -m uvicorn`.
- Frontend deps: `yarn --cwd frontend install` (Yarn 1.x; `frontend/yarn.lock` is the lockfile — do not use npm).

### Environment files (gitignored — not in the repo)
Both services need `.env` files that are gitignored. If missing, recreate them:
- `backend/.env`: requires `MONGO_URL` and `DB_NAME` (backend hard-fails to import without them). Dev values: `MONGO_URL="mongodb://localhost:27017"`, `DB_NAME="tskflow"`, plus `JWT_SECRET_KEY`, `FRONTEND_URL="http://localhost:3000"`, `CORS_ORIGINS="*"`.
- `frontend/.env`: `REACT_APP_BACKEND_URL=http://localhost:8001` (frontend derives both the REST base and the `ws(s)://.../api/ws` WebSocket URL from this).

### Running the services
MongoDB is **not** managed by systemd here — start it manually and keep it running:
- MongoDB: `mongod --dbpath /data/db --bind_ip 127.0.0.1 --port 27017` (create `/data/db` first, owned by the current user).
- Backend (port 8001, from `backend/`): `python3 -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload`. There is no `__main__` block in `server.py`; it must be launched with uvicorn. `/api/` returns 404 (no root route) — use `/docs` or an actual route like `/api/auth/login` to health-check.
- Frontend (port 3000, from `frontend/`): `BROWSER=none yarn start`. First compile takes ~40s.

### Test data
Seed the standard test users after MongoDB is up: `python3 seed_test_users.py` (run from `backend/`). Credentials are in `memory/test_credentials.md` (e.g. `owner@acmecorp.com` / `Password123`, a Teams-plan owner).

### Lint / test / build
- Frontend lint runs through CRACO's webpack/ESLint integration during `yarn start` / `yarn build` (config lives in `frontend/craco.config.js`). There is **no** standalone `lint` script, and running `eslint` directly fails because the repo uses the legacy config format, not ESLint 9 flat config.
- Frontend build: `yarn --cwd frontend build`.
- Backend tests are **integration tests** that hit a running backend + MongoDB and read `REACT_APP_BACKEND_URL`. Run with `REACT_APP_BACKEND_URL="http://localhost:8001" python3 -m pytest tests/`. Tests covering optional integrations (VAPID push, voice/LLM, Apollo/admin) will fail or skip unless the corresponding secrets are configured — this is expected in the minimal dev setup.
- Root-level `backend_test*.py`, `regression_test.py`, etc. are large standalone integration scripts run as `python3 <file>` against the live backend.

### Known non-obvious behavior
- After creating a task in the UI, the dashboard list does not auto-refresh; a page reload shows the new task. This is app behavior, not an environment problem.
