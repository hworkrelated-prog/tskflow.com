"""
Tests for Phase 3-5 features:
  - Multi-assignee parent/subtask model + reminder emails
  - Voice command endpoint (GPT-backed)
  - Web Push (VAPID) endpoints
  - Regression: single-assignee task, dashboard categorization
"""
import os
import time
import pytest
import requests
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

OWNER = {"email": "owner@acmecorp.com", "password": "Password123"}
ALICE = {"email": "alice@acmecorp.com", "password": "Password123"}
BOB = {"email": "bob@acmecorp.com", "password": "Password123"}
PRO_USER = {"email": "prouser@acmecorp.com", "password": "Password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER)


@pytest.fixture(scope="module")
def alice_token():
    return _login(ALICE)


@pytest.fixture(scope="module")
def bob_token():
    return _login(BOB)


@pytest.fixture(scope="module")
def pro_token():
    return _login(PRO_USER)


# ==========================================================================
# PARENT TASK GROUPS (multi-assignee)
# ==========================================================================
class TestParentGroups:
    """Bulk 2+ assignees creates parent + children; dashboard hides children;
    /tasks/parents returns per-assignee data."""

    def test_bulk_multi_assignee_creates_parent(self, owner_token):
        payload = {
            "title": f"TEST_parent_{uuid.uuid4().hex[:6]}",
            "description": "multi assignee test",
            "assigned_to": ["alice@acmecorp.com", "bob@acmecorp.com"],
            "due_date": "2030-06-15T09:00",
            "priority": "Medium"
        }
        r = requests.post(f"{API}/tasks/bulk", headers=_h(owner_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        children = r.json()
        assert len(children) == 2
        assert all("id" in c and "_id" not in c for c in children)

        # /tasks/parents should return this group
        rp = requests.get(f"{API}/tasks/parents", headers=_h(owner_token), timeout=15)
        assert rp.status_code == 200
        groups = rp.json()
        match = next((g for g in groups if g["title"] == payload["title"]), None)
        assert match, f"parent group not found: titles={[g['title'] for g in groups]}"

        # Structure asserts
        assert match["total"] == 2
        assert match["completed"] == 0
        assert match["outstanding"] == 2
        assert match["percent"] == 0
        assert len(match["assignees"]) == 2
        for a in match["assignees"]:
            assert "name" in a and "status" in a and "completed" in a
            assert a["completed"] is False
            assert a["status"] in ("Pending", "Accepted")

        # Cleanup: mark deleted on children + parent
        for c in children:
            requests.delete(f"{API}/tasks/{c['id']}", headers=_h(owner_token), timeout=15)
        requests.delete(f"{API}/tasks/{match['id']}", headers=_h(owner_token), timeout=15)

    def test_children_hidden_from_owner_assigned_by_me(self, owner_token):
        title = f"TEST_hide_children_{uuid.uuid4().hex[:6]}"
        payload = {
            "title": title,
            "description": "hide from delegated",
            "assigned_to": ["alice@acmecorp.com", "bob@acmecorp.com"],
            "due_date": "2030-06-15T09:00",
            "priority": "Medium"
        }
        r = requests.post(f"{API}/tasks/bulk", headers=_h(owner_token), json=payload, timeout=30)
        assert r.status_code == 200
        children = r.json()

        rd = requests.get(f"{API}/dashboard", headers=_h(owner_token), timeout=20)
        assert rd.status_code == 200
        data = rd.json()
        by_me_titles = [t["title"] for t in data.get("assigned_by_me", [])]
        assert title not in by_me_titles, \
            f"parent's children leaked into assigned_by_me: {by_me_titles}"

        # Also confirm no is_parent row leaked
        for t in data.get("assigned_by_me", []):
            assert t.get("status") != "Parent"

        # Cleanup
        for c in children:
            requests.delete(f"{API}/tasks/{c['id']}", headers=_h(owner_token), timeout=15)

    def test_assignee_sees_own_child_in_assigned_to_me(self, owner_token, alice_token):
        title = f"TEST_assignee_view_{uuid.uuid4().hex[:6]}"
        payload = {
            "title": title,
            "description": "assignee visibility",
            "assigned_to": ["alice@acmecorp.com", "bob@acmecorp.com"],
            "due_date": "2030-06-15T09:00",
            "priority": "Medium"
        }
        r = requests.post(f"{API}/tasks/bulk", headers=_h(owner_token), json=payload, timeout=30)
        assert r.status_code == 200
        children = r.json()

        # Alice should see her copy
        rd = requests.get(f"{API}/dashboard", headers=_h(alice_token), timeout=20)
        assert rd.status_code == 200
        titles = [t["title"] for t in rd.json().get("assigned_to_me", [])]
        assert title in titles, \
            f"alice should see her child; titles={titles}"

        # Cleanup
        for c in children:
            requests.delete(f"{API}/tasks/{c['id']}", headers=_h(owner_token), timeout=15)

    def test_remind_outstanding_only_creator(self, owner_token, alice_token):
        title = f"TEST_remind_{uuid.uuid4().hex[:6]}"
        payload = {
            "title": title,
            "description": "remind test",
            "assigned_to": ["alice@acmecorp.com", "bob@acmecorp.com"],
            "due_date": "2030-06-15T09:00",
            "priority": "Medium"
        }
        r = requests.post(f"{API}/tasks/bulk", headers=_h(owner_token), json=payload, timeout=30)
        assert r.status_code == 200
        children = r.json()

        rp = requests.get(f"{API}/tasks/parents", headers=_h(owner_token), timeout=15)
        parent = next(g for g in rp.json() if g["title"] == title)
        pid = parent["id"]

        # Non-creator (alice) should get 404
        r_alice = requests.post(f"{API}/tasks/parents/{pid}/remind", headers=_h(alice_token), timeout=15)
        assert r_alice.status_code == 404

        # Creator reminds -> reminded should equal outstanding count (2)
        r_owner = requests.post(f"{API}/tasks/parents/{pid}/remind", headers=_h(owner_token), timeout=30)
        assert r_owner.status_code == 200, r_owner.text
        body = r_owner.json()
        assert "reminded" in body
        assert body["reminded"] == 2, f"expected 2 reminded, got {body}"

        # Cleanup
        for c in children:
            requests.delete(f"{API}/tasks/{c['id']}", headers=_h(owner_token), timeout=15)


# ==========================================================================
# WEB PUSH
# ==========================================================================
class TestPush:

    def test_vapid_public_key_returns_key(self):
        r = requests.get(f"{API}/push/vapid-public-key", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "public_key" in body
        # Public key should be a non-empty base64url string (VAPID = 87-88 chars)
        assert isinstance(body["public_key"], str)
        assert len(body["public_key"]) > 10

    def test_subscribe_requires_auth(self):
        r = requests.post(f"{API}/push/subscribe", json={
            "endpoint": "https://example.com/push/no-auth",
            "keys": {"p256dh": "x", "auth": "y"}
        }, timeout=15)
        assert r.status_code in (401, 403)

    def test_subscribe_stores_subscription(self, pro_token):
        endpoint = f"https://example.com/push/{uuid.uuid4().hex}"
        payload = {"endpoint": endpoint, "keys": {"p256dh": "abc", "auth": "def"}}
        r = requests.post(f"{API}/push/subscribe", headers=_h(pro_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        assert "message" in r.json()

        # Idempotent (upsert): repeat should still be 200
        r2 = requests.post(f"{API}/push/subscribe", headers=_h(pro_token), json=payload, timeout=15)
        assert r2.status_code == 200

        # Cleanup
        requests.post(f"{API}/push/unsubscribe", headers=_h(pro_token), json=payload, timeout=15)


# ==========================================================================
# VOICE COMMAND
# ==========================================================================
class TestVoice:

    def test_query_outstanding(self, owner_token):
        r = requests.post(f"{API}/voice/command", headers=_h(owner_token),
                          json={"transcript": "what is outstanding"}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "reply" in data and isinstance(data["reply"], str) and len(data["reply"]) > 0
        assert "action" in data
        assert data["action"]["type"] == "query_outstanding", \
            f"expected query_outstanding, got {data['action']}"

    def test_empty_transcript_rejected(self, owner_token):
        r = requests.post(f"{API}/voice/command", headers=_h(owner_token),
                          json={"transcript": "   "}, timeout=15)
        assert r.status_code == 400

    def test_requires_auth(self):
        r = requests.post(f"{API}/voice/command", json={"transcript": "hello"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_create_task_via_voice(self, owner_token):
        unique = uuid.uuid4().hex[:6]
        transcript = f"create a task to email the vendor tomorrow called TEST_voice_{unique}"
        r = requests.post(f"{API}/voice/command", headers=_h(owner_token),
                          json={"transcript": transcript}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["action"]["type"] in ("create_task", "assign_task"), \
            f"expected create_task/assign_task, got {data['action']}"
        assert "executed" in data
        tid = data["executed"].get("task_id")
        assert tid, f"no task_id in executed: {data['executed']}"

        # Confirm via dashboard - task should exist for owner (self-assigned)
        rd = requests.get(f"{API}/dashboard", headers=_h(owner_token), timeout=20)
        assert rd.status_code == 200
        all_ids = ([t["id"] for t in rd.json().get("assigned_to_me", [])]
                   + [t["id"] for t in rd.json().get("self_assigned", [])]
                   + [t["id"] for t in rd.json().get("assigned_by_me", [])])
        assert tid in all_ids, f"created task {tid} not present in owner dashboard"

        # Cleanup
        requests.delete(f"{API}/tasks/{tid}", headers=_h(owner_token), timeout=15)


# ==========================================================================
# REGRESSION - Team page tabs / analytics / single-assignee create
# ==========================================================================
class TestRegression:

    def test_team_endpoints_load(self, owner_token):
        # Team members list
        r = requests.get(f"{API}/team/members", headers=_h(owner_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_analytics_runs_without_error(self, owner_token):
        # /api/analytics is a POST with start_date/end_date
        payload = {"start_date": "2020-01-01T00:00:00", "end_date": "2030-12-31T23:59:59"}
        r = requests.post(f"{API}/analytics", headers=_h(owner_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, dict)

    def test_single_assignee_task_still_works(self, owner_token):
        rme = requests.get(f"{API}/auth/me", headers=_h(owner_token), timeout=15)
        my_email = rme.json()["email"]
        payload = {
            "title": f"TEST_single_{uuid.uuid4().hex[:6]}",
            "description": "solo",
            "assigned_to": my_email,
            "due_date": "2030-05-01T09:00",
            "priority": "Low"
        }
        r = requests.post(f"{API}/tasks", headers=_h(owner_token), json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        tid = r.json().get("id")
        assert tid
        # Ensure no parent was created; not a bulk call
        requests.delete(f"{API}/tasks/{tid}", headers=_h(owner_token), timeout=15)
