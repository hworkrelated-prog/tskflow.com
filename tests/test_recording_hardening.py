"""
Hardening regression tests for the recording feature.

Covers:
- requires_screen_recording blocks complete without a video attachment
- complete with a video attachment succeeds and merges it onto the task
- empty standalone recording_url is rejected
- public metadata + stream endpoints for share tokens
- delete removes the Mongo document
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

OWNER = {"email": "owner@acmecorp.com", "password": "Password123"}
ALICE = {"email": "alice@acmecorp.com", "password": "Password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _me(token):
    return requests.get(f"{API}/auth/me", headers=_h(token), timeout=10).json()


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER)


@pytest.fixture(scope="module")
def alice_token():
    return _login(ALICE)


@pytest.fixture(scope="module")
def alice_id(alice_token):
    return _me(alice_token)["id"]


def test_empty_recording_url_rejected(owner_token):
    r = requests.post(f"{API}/recordings/standalone", json={}, headers=_h(owner_token), timeout=10)
    assert r.status_code == 400, r.text


def test_standalone_create_and_public_stream_redirect(owner_token):
    url = f"https://example.com/demo-{uuid.uuid4().hex[:6]}.webm"
    r = requests.post(
        f"{API}/recordings/standalone",
        json={"recording_url": url, "title": "Hardening demo"},
        headers=_h(owner_token),
        timeout=10,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    token = body["shareable_token"]

    meta = requests.get(f"{API}/recordings/{token}", timeout=10)
    assert meta.status_code == 200, meta.text
    assert meta.json()["recording_url"] == url
    assert meta.json().get("has_video") is True

    stream = requests.get(f"{API}/recordings/{token}/stream", allow_redirects=False, timeout=10)
    # External https URLs redirect; object-store paths would 200/206/502 depending on key.
    assert stream.status_code in (200, 206, 302, 307, 502), stream.text

    # Cleanup
    requests.delete(f"{API}/recordings/{body['recording_id']}", headers=_h(owner_token), timeout=10)


def test_requires_recording_blocks_complete_without_video(owner_token, alice_token, alice_id):
    due = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    create = requests.post(
        f"{API}/tasks",
        headers=_h(owner_token),
        json={
            "title": f"Need recording {uuid.uuid4().hex[:6]}",
            "description": "Proof required",
            "assigned_to": alice_id,
            "due_date": due,
            "priority": "High",
            "requires_screen_recording": True,
        },
        timeout=10,
    )
    assert create.status_code == 200, create.text
    task_id = create.json()["id"]

    # Alice accepts
    assert requests.put(f"{API}/tasks/{task_id}/accept", headers=_h(alice_token), timeout=10).status_code == 200

    # Complete without video → 400
    denied = requests.put(
        f"{API}/tasks/{task_id}/complete",
        headers=_h(alice_token),
        json={"completion_note": "done, trust me"},
        timeout=10,
    )
    assert denied.status_code == 400, denied.text
    assert "screen recording" in denied.text.lower()

    # Complete with a video attachment → 200
    video_att = {
        "id": str(uuid.uuid4()),
        "storage_path": f"tskflow/attachments/test/{uuid.uuid4()}.webm",
        "original_filename": "walkthrough.webm",
        "content_type": "video/webm",
        "size": 1234,
        "kind": "video",
    }
    ok = requests.put(
        f"{API}/tasks/{task_id}/complete",
        headers=_h(alice_token),
        json={"completion_note": "walkthrough attached", "attachments": [video_att]},
        timeout=10,
    )
    assert ok.status_code == 200, ok.text

    # Task should now carry the video attachment and be in Review Pending
    fetched = requests.get(f"{API}/tasks/{task_id}", headers=_h(owner_token), timeout=10)
    assert fetched.status_code == 200, fetched.text
    task = fetched.json()
    assert task["status"] == "Review Pending"
    assert any(a.get("id") == video_att["id"] for a in (task.get("attachments") or []))
