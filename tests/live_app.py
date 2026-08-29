"""Boot the real FastAPI app against a scratch MongoDB for integration tests.

Modules that need live endpoints call `app_or_skip()`. When no MongoDB is reachable
the tests skip instead of failing, so static-only environments stay green.

Start one locally with:
    mongod --dbpath /tmp/tskmongo --port 27099 --fork --logpath /tmp/tskmongo/mongod.log
"""
import asyncio
import os
import sys
import uuid
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
MONGO_URL = os.environ.get("TSKFLOW_TEST_MONGO_URL", "mongodb://127.0.0.1:27099")

_state = {}


def _mongo_up() -> bool:
    try:
        from pymongo import MongoClient

        MongoClient(MONGO_URL, serverSelectionTimeoutMS=1200).admin.command("ping")
        return True
    except Exception:
        return False


def app_or_skip():
    """Import backend/server.py wired to a scratch database, or skip the module."""
    if "server" in _state:
        return _state["server"]
    if not _mongo_up():
        pytest.skip(f"No MongoDB at {MONGO_URL} - skipping live API tests")

    os.environ["MONGO_URL"] = MONGO_URL
    os.environ["DB_NAME"] = f"tskflow_test_{uuid.uuid4().hex[:8]}"
    os.environ["JWT_SECRET_KEY"] = "test-secret-key"
    os.environ["ADMIN_PASSWORD"] = "test-admin-password"
    os.environ["FRONTEND_URL"] = "https://tskflow.test"
    os.environ.pop("RESEND_API_KEY", None)  # never send mail from tests
    if str(BACKEND) not in sys.path:
        sys.path.insert(0, str(BACKEND))

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    import server  # noqa: E402  (import needs the env + loop above)

    _state["server"] = server
    _state["loop"] = loop
    return server


def run(coro):
    """Run a coroutine on the loop the Mongo client is bound to."""
    return _state["loop"].run_until_complete(coro)


def client(server):
    from httpx import ASGITransport, AsyncClient

    return AsyncClient(transport=ASGITransport(app=server.app), base_url="http://test")


def caller_headers(tag: str) -> dict:
    """A unique client IP per test so per-IP rate limits stay isolated."""
    return {"X-Forwarded-For": f"203.0.113.{abs(hash(tag)) % 250 + 1}"}
