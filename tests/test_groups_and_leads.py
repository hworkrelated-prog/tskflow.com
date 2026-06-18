"""
Tests for new features:
  - User Groups (Pro/Teams only): dedupe emails, duplicate-name prevention, free user 403
  - Leads/Prospecting CRM: ICP guide, CRUD, import, per-owner isolation, status counts
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

PRO_USER = {"email": "prouser@acmecorp.com", "password": "Password123"}
TEAMS_USER = {"email": "owner@acmecorp.com", "password": "Password123"}
FREE_USER = {"email": "freeuser@example.org", "password": "Password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def pro_token():
    return _login(PRO_USER)


@pytest.fixture(scope="module")
def teams_token():
    return _login(TEAMS_USER)


@pytest.fixture(scope="module")
def free_token():
    return _login(FREE_USER)


# =========================================================================
# GROUPS
# =========================================================================
class TestGroups:

    def test_pro_can_list_groups(self, pro_token):
        r = requests.get(f"{API}/groups", headers=_h(pro_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_free_user_forbidden_create(self, free_token):
        r = requests.post(f"{API}/groups", headers=_h(free_token),
                          json={"name": f"TEST_free_{uuid.uuid4().hex[:6]}", "emails": ["a@b.com"]}, timeout=15)
        assert r.status_code == 403

    def test_free_user_forbidden_list(self, free_token):
        r = requests.get(f"{API}/groups", headers=_h(free_token), timeout=15)
        assert r.status_code == 403

    def test_create_group_dedupes_emails(self, pro_token):
        name = f"TEST_dedupe_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": name,
            "emails": ["a@b.com", "A@B.COM", " a@b.com ", "c@d.com", "not-an-email", ""]
        }
        r = requests.post(f"{API}/groups", headers=_h(pro_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == name
        # only 2 unique emails should remain (a@b.com, c@d.com)
        assert sorted(data["emails"]) == ["a@b.com", "c@d.com"]
        assert "id" in data
        assert "_id" not in data

        # Cleanup
        requests.delete(f"{API}/groups/{data['id']}", headers=_h(pro_token), timeout=15)

    def test_duplicate_name_case_insensitive(self, pro_token):
        name = f"TEST_dup_{uuid.uuid4().hex[:6]}"
        r1 = requests.post(f"{API}/groups", headers=_h(pro_token),
                           json={"name": name, "emails": ["x@y.com"]}, timeout=15)
        assert r1.status_code == 200
        gid = r1.json()["id"]
        # try same name uppercased
        r2 = requests.post(f"{API}/groups", headers=_h(pro_token),
                           json={"name": name.upper(), "emails": ["z@y.com"]}, timeout=15)
        assert r2.status_code == 400
        requests.delete(f"{API}/groups/{gid}", headers=_h(pro_token), timeout=15)

    def test_empty_name_rejected(self, pro_token):
        r = requests.post(f"{API}/groups", headers=_h(pro_token),
                          json={"name": "  ", "emails": ["a@b.com"]}, timeout=15)
        assert r.status_code == 400

    def test_update_and_delete_group(self, pro_token):
        name = f"TEST_upd_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/groups", headers=_h(pro_token),
                          json={"name": name, "emails": ["one@x.com"]}, timeout=15)
        assert r.status_code == 200
        gid = r.json()["id"]

        # Update name + emails
        new_name = f"TEST_upd2_{uuid.uuid4().hex[:6]}"
        ru = requests.put(f"{API}/groups/{gid}", headers=_h(pro_token),
                          json={"name": new_name, "emails": ["two@x.com", "TWO@x.com"]},
                          timeout=15)
        assert ru.status_code == 200, ru.text
        updated = ru.json()
        assert updated["name"] == new_name
        assert updated["emails"] == ["two@x.com"]

        # Verify via GET list
        rg = requests.get(f"{API}/groups", headers=_h(pro_token), timeout=15)
        assert rg.status_code == 200
        found = [g for g in rg.json() if g["id"] == gid]
        assert len(found) == 1 and found[0]["name"] == new_name

        # Delete
        rd = requests.delete(f"{API}/groups/{gid}", headers=_h(pro_token), timeout=15)
        assert rd.status_code == 200

        # Verify gone
        rg2 = requests.get(f"{API}/groups", headers=_h(pro_token), timeout=15)
        assert not [g for g in rg2.json() if g["id"] == gid]

    def test_update_to_existing_name_rejected(self, pro_token):
        n1 = f"TEST_a_{uuid.uuid4().hex[:6]}"
        n2 = f"TEST_b_{uuid.uuid4().hex[:6]}"
        a = requests.post(f"{API}/groups", headers=_h(pro_token),
                         json={"name": n1, "emails": []}, timeout=15).json()
        b = requests.post(f"{API}/groups", headers=_h(pro_token),
                         json={"name": n2, "emails": []}, timeout=15).json()
        # rename b to n1 (case-insensitive)
        r = requests.put(f"{API}/groups/{b['id']}", headers=_h(pro_token),
                        json={"name": n1.upper()}, timeout=15)
        assert r.status_code == 400
        # cleanup
        requests.delete(f"{API}/groups/{a['id']}", headers=_h(pro_token), timeout=15)
        requests.delete(f"{API}/groups/{b['id']}", headers=_h(pro_token), timeout=15)

    def test_teams_user_can_create_group(self, teams_token):
        name = f"TEST_teams_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/groups", headers=_h(teams_token),
                         json={"name": name, "emails": ["t@x.com"]}, timeout=15)
        assert r.status_code == 200
        gid = r.json()["id"]
        requests.delete(f"{API}/groups/{gid}", headers=_h(teams_token), timeout=15)

    def test_delete_nonexistent_group_returns_404(self, pro_token):
        r = requests.delete(f"{API}/groups/nonexistent-id-xyz", headers=_h(pro_token), timeout=15)
        assert r.status_code == 404


# =========================================================================
# LEADS / PROSPECTING
# =========================================================================
class TestLeads:

    def test_icp_guide_returns_data(self, pro_token):
        r = requests.get(f"{API}/leads/icp", headers=_h(pro_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "personas" in data and len(data["personas"]) > 0
        assert "industries" in data and len(data["industries"]) > 0
        assert "regions" in data and len(data["regions"]) > 0

    def test_icp_available_to_free_user(self, free_token):
        r = requests.get(f"{API}/leads/icp", headers=_h(free_token), timeout=15)
        assert r.status_code == 200

    def test_create_lead_and_persist(self, pro_token):
        payload = {
            "name": "TEST_Jane Doe",
            "title": "Ops Manager",
            "company": "TEST_Acme",
            "email": "jane@test.com",
            "region": "United States - West (SF, LA, Seattle)",
            "status": "To Call",
            "notes": "Found via LinkedIn"
        }
        r = requests.post(f"{API}/leads", headers=_h(pro_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == payload["name"]
        assert created["status"] == "To Call"
        assert "id" in created
        assert "_id" not in created
        lead_id = created["id"]

        # Verify via GET list
        rg = requests.get(f"{API}/leads", headers=_h(pro_token), timeout=15)
        assert rg.status_code == 200
        body = rg.json()
        assert "leads" in body and "counts" in body and "statuses" in body
        assert any(l["id"] == lead_id for l in body["leads"])
        # cleanup
        requests.delete(f"{API}/leads/{lead_id}", headers=_h(pro_token), timeout=15)

    def test_create_lead_empty_name_rejected(self, pro_token):
        r = requests.post(f"{API}/leads", headers=_h(pro_token),
                         json={"name": "  "}, timeout=15)
        assert r.status_code == 400

    def test_import_leads_skips_empty_names(self, pro_token):
        payload = {
            "leads": [
                {"name": "TEST_Alpha", "company": "A"},
                {"name": "  "},  # should be skipped
                {"name": "TEST_Bravo", "company": "B", "status": "Interested"},
                {"name": ""},  # skipped
                {"name": "TEST_Charlie", "status": "InvalidStatus"},  # status falls back to To Call
            ]
        }
        r = requests.post(f"{API}/leads/import", headers=_h(pro_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["imported"] == 3

        # Verify they exist & filter by q
        rg = requests.get(f"{API}/leads?q=TEST_", headers=_h(pro_token), timeout=15)
        assert rg.status_code == 200
        names = [l["name"] for l in rg.json()["leads"]]
        assert "TEST_Alpha" in names and "TEST_Bravo" in names and "TEST_Charlie" in names
        # Charlie should have fallback status
        charlie = next(l for l in rg.json()["leads"] if l["name"] == "TEST_Charlie")
        assert charlie["status"] == "To Call"

        # cleanup
        for l in rg.json()["leads"]:
            if l["name"].startswith("TEST_"):
                requests.delete(f"{API}/leads/{l['id']}", headers=_h(pro_token), timeout=15)

    def test_update_lead_status(self, pro_token):
        r = requests.post(f"{API}/leads", headers=_h(pro_token),
                         json={"name": "TEST_Upd"}, timeout=15)
        lead_id = r.json()["id"]

        # Update status
        ru = requests.put(f"{API}/leads/{lead_id}", headers=_h(pro_token),
                         json={"status": "Won", "company": "TEST_NewCo"}, timeout=15)
        assert ru.status_code == 200, ru.text
        assert ru.json()["status"] == "Won"
        assert ru.json()["company"] == "TEST_NewCo"

        # Invalid status rejected
        ri = requests.put(f"{API}/leads/{lead_id}", headers=_h(pro_token),
                         json={"status": "Bogus"}, timeout=15)
        assert ri.status_code == 400

        # cleanup
        requests.delete(f"{API}/leads/{lead_id}", headers=_h(pro_token), timeout=15)

    def test_status_counts_present(self, pro_token):
        # create 2 leads with different statuses
        a = requests.post(f"{API}/leads", headers=_h(pro_token),
                         json={"name": "TEST_C1", "status": "To Call"}, timeout=15).json()
        b = requests.post(f"{API}/leads", headers=_h(pro_token),
                         json={"name": "TEST_C2", "status": "Won"}, timeout=15).json()

        rg = requests.get(f"{API}/leads", headers=_h(pro_token), timeout=15)
        counts = rg.json()["counts"]
        assert all(s in counts for s in ["To Call", "Called", "Interested", "Won", "Lost"])
        assert counts["To Call"] >= 1
        assert counts["Won"] >= 1

        # Filter by status
        rs = requests.get(f"{API}/leads?status=Won", headers=_h(pro_token), timeout=15)
        assert all(l["status"] == "Won" for l in rs.json()["leads"])

        # cleanup
        requests.delete(f"{API}/leads/{a['id']}", headers=_h(pro_token), timeout=15)
        requests.delete(f"{API}/leads/{b['id']}", headers=_h(pro_token), timeout=15)

    def test_lead_per_owner_isolation(self, pro_token, free_token):
        # Pro creates a lead
        r = requests.post(f"{API}/leads", headers=_h(pro_token),
                         json={"name": "TEST_PRO_ONLY"}, timeout=15)
        lead_id = r.json()["id"]

        # Free user should NOT see it
        rg = requests.get(f"{API}/leads", headers=_h(free_token), timeout=15)
        assert rg.status_code == 200
        assert not any(l["id"] == lead_id for l in rg.json()["leads"])

        # Free user trying to delete pro's lead → 404
        rd = requests.delete(f"{API}/leads/{lead_id}", headers=_h(free_token), timeout=15)
        assert rd.status_code == 404

        # cleanup as pro
        requests.delete(f"{API}/leads/{lead_id}", headers=_h(pro_token), timeout=15)

    def test_delete_lead_verify_404_after(self, pro_token):
        r = requests.post(f"{API}/leads", headers=_h(pro_token),
                         json={"name": "TEST_DEL"}, timeout=15)
        lead_id = r.json()["id"]
        rd = requests.delete(f"{API}/leads/{lead_id}", headers=_h(pro_token), timeout=15)
        assert rd.status_code == 200
        # Try delete again → 404
        rd2 = requests.delete(f"{API}/leads/{lead_id}", headers=_h(pro_token), timeout=15)
        assert rd2.status_code == 404


# =========================================================================
# Regression: task creation no longer needs note/category
# =========================================================================
class TestTaskCreationRegression:

    def test_create_task_without_note_or_category(self, pro_token):
        # First find the user's own id via /api/auth/me
        rme = requests.get(f"{API}/auth/me", headers=_h(pro_token), timeout=15)
        assert rme.status_code == 200, rme.text
        me = rme.json()
        my_email = me["email"]

        payload = {
            "title": "TEST_regression_task",
            "description": "no note no category",
            "assigned_to": my_email,
            "due_date": "2030-01-15T09:00",
            "priority": "medium"
        }
        r = requests.post(f"{API}/tasks", headers=_h(pro_token), json=payload, timeout=15)
        assert r.status_code in (200, 201), f"task create failed: {r.status_code} {r.text}"
        task = r.json()
        # Cleanup if id present
        tid = task.get("id") or (task.get("tasks") or [{}])[0].get("id") if isinstance(task, dict) else None
        if tid:
            requests.delete(f"{API}/tasks/{tid}", headers=_h(pro_token), timeout=15)
