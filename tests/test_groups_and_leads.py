"""
Tests for features:
  - User Groups (Pro/Teams only): dedupe emails, duplicate-name prevention, free user 403
  - Leads/Prospecting CRM: ADMIN-ONLY now (owner='admin'). Uses admin token from /api/admin/login.
  - Apollo: apollo-search returns 402 (free plan) with upgrade message; requires admin auth.
  - Task creation regression (no note/category).
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
ADMIN_PASSWORD = "3369434114Ha."


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


def _admin_login():
    r = requests.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok
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


@pytest.fixture(scope="module")
def admin_token():
    return _admin_login()


# =========================================================================
# GROUPS - normal user auth, unchanged
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
        payload = {"name": name, "emails": ["a@b.com", "A@B.COM", " a@b.com ", "c@d.com", "not-an-email", ""]}
        r = requests.post(f"{API}/groups", headers=_h(pro_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == name
        assert sorted(data["emails"]) == ["a@b.com", "c@d.com"]
        assert "id" in data and "_id" not in data
        requests.delete(f"{API}/groups/{data['id']}", headers=_h(pro_token), timeout=15)

    def test_duplicate_name_case_insensitive(self, pro_token):
        name = f"TEST_dup_{uuid.uuid4().hex[:6]}"
        r1 = requests.post(f"{API}/groups", headers=_h(pro_token),
                           json={"name": name, "emails": ["x@y.com"]}, timeout=15)
        assert r1.status_code == 200
        gid = r1.json()["id"]
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
        new_name = f"TEST_upd2_{uuid.uuid4().hex[:6]}"
        ru = requests.put(f"{API}/groups/{gid}", headers=_h(pro_token),
                          json={"name": new_name, "emails": ["two@x.com", "TWO@x.com"]}, timeout=15)
        assert ru.status_code == 200, ru.text
        updated = ru.json()
        assert updated["name"] == new_name
        assert updated["emails"] == ["two@x.com"]
        rd = requests.delete(f"{API}/groups/{gid}", headers=_h(pro_token), timeout=15)
        assert rd.status_code == 200

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
# LEADS / PROSPECTING - now ADMIN-ONLY
# =========================================================================
class TestLeadsAdminGating:
    """Confirm leads endpoints require admin token; user/no-token → 401/403."""

    def test_admin_login_returns_token(self):
        r = requests.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("access_token")

    def test_admin_login_wrong_password(self):
        r = requests.post(f"{API}/admin/login", json={"password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_leads_list_no_token(self):
        r = requests.get(f"{API}/leads", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_leads_list_with_user_token_forbidden(self, pro_token):
        r = requests.get(f"{API}/leads", headers=_h(pro_token), timeout=15)
        assert r.status_code in (401, 403)

    def test_leads_create_with_user_token_forbidden(self, pro_token):
        r = requests.post(f"{API}/leads", headers=_h(pro_token),
                          json={"name": "TEST_X"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_icp_with_user_token_forbidden(self, free_token):
        # Previously open to free; now admin-only
        r = requests.get(f"{API}/leads/icp", headers=_h(free_token), timeout=15)
        assert r.status_code in (401, 403)


class TestLeadsAdminCRUD:
    """Admin CRUD + import + status counts with admin token."""

    def test_icp_with_admin(self, admin_token):
        r = requests.get(f"{API}/leads/icp", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "personas" in data and len(data["personas"]) > 0
        assert "industries" in data and len(data["industries"]) > 0
        assert "regions" in data and len(data["regions"]) > 0

    def test_create_lead_and_persist(self, admin_token):
        payload = {
            "name": "TEST_admin_lead",
            "title": "Ops Manager",
            "company": "TEST_Acme",
            "email": "jane@test.com",
            "status": "To Call",
            "notes": "found via LinkedIn"
        }
        r = requests.post(f"{API}/leads", headers=_h(admin_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == payload["name"]
        assert created["status"] == "To Call"
        assert "id" in created and "_id" not in created
        lead_id = created["id"]

        rg = requests.get(f"{API}/leads", headers=_h(admin_token), timeout=15)
        assert rg.status_code == 200
        body = rg.json()
        assert "leads" in body and "counts" in body and "statuses" in body
        assert any(l["id"] == lead_id for l in body["leads"])
        requests.delete(f"{API}/leads/{lead_id}", headers=_h(admin_token), timeout=15)

    def test_create_lead_empty_name_rejected(self, admin_token):
        r = requests.post(f"{API}/leads", headers=_h(admin_token),
                          json={"name": "  "}, timeout=15)
        assert r.status_code == 400

    def test_import_skips_empty_names_and_falls_back_status(self, admin_token):
        payload = {"leads": [
            {"name": "TEST_Alpha", "company": "A"},
            {"name": "  "},
            {"name": "TEST_Bravo", "company": "B", "status": "Interested"},
            {"name": ""},
            {"name": "TEST_Charlie", "status": "InvalidStatus"},
        ]}
        r = requests.post(f"{API}/leads/import", headers=_h(admin_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["imported"] == 3
        rg = requests.get(f"{API}/leads?q=TEST_", headers=_h(admin_token), timeout=15)
        names = [l["name"] for l in rg.json()["leads"]]
        assert "TEST_Alpha" in names and "TEST_Bravo" in names and "TEST_Charlie" in names
        charlie = next(l for l in rg.json()["leads"] if l["name"] == "TEST_Charlie")
        assert charlie["status"] == "To Call"
        for l in rg.json()["leads"]:
            if l["name"].startswith("TEST_"):
                requests.delete(f"{API}/leads/{l['id']}", headers=_h(admin_token), timeout=15)

    def test_update_lead_status(self, admin_token):
        r = requests.post(f"{API}/leads", headers=_h(admin_token),
                         json={"name": "TEST_Upd"}, timeout=15)
        lead_id = r.json()["id"]
        ru = requests.put(f"{API}/leads/{lead_id}", headers=_h(admin_token),
                         json={"status": "Won", "company": "TEST_NewCo"}, timeout=15)
        assert ru.status_code == 200, ru.text
        assert ru.json()["status"] == "Won"
        assert ru.json()["company"] == "TEST_NewCo"
        ri = requests.put(f"{API}/leads/{lead_id}", headers=_h(admin_token),
                         json={"status": "Bogus"}, timeout=15)
        assert ri.status_code == 400
        requests.delete(f"{API}/leads/{lead_id}", headers=_h(admin_token), timeout=15)

    def test_status_counts_and_filter(self, admin_token):
        a = requests.post(f"{API}/leads", headers=_h(admin_token),
                         json={"name": "TEST_C1", "status": "To Call"}, timeout=15).json()
        b = requests.post(f"{API}/leads", headers=_h(admin_token),
                         json={"name": "TEST_C2", "status": "Won"}, timeout=15).json()
        rg = requests.get(f"{API}/leads", headers=_h(admin_token), timeout=15)
        counts = rg.json()["counts"]
        assert all(s in counts for s in ["To Call", "Called", "Interested", "Won", "Lost"])
        assert counts["To Call"] >= 1 and counts["Won"] >= 1
        rs = requests.get(f"{API}/leads?status=Won", headers=_h(admin_token), timeout=15)
        assert all(l["status"] == "Won" for l in rs.json()["leads"])
        requests.delete(f"{API}/leads/{a['id']}", headers=_h(admin_token), timeout=15)
        requests.delete(f"{API}/leads/{b['id']}", headers=_h(admin_token), timeout=15)

    def test_delete_lead_then_404(self, admin_token):
        r = requests.post(f"{API}/leads", headers=_h(admin_token),
                         json={"name": "TEST_DEL"}, timeout=15)
        lead_id = r.json()["id"]
        rd = requests.delete(f"{API}/leads/{lead_id}", headers=_h(admin_token), timeout=15)
        assert rd.status_code == 200
        rd2 = requests.delete(f"{API}/leads/{lead_id}", headers=_h(admin_token), timeout=15)
        assert rd2.status_code == 404


# =========================================================================
# APOLLO - admin-only; free plan -> 402 with upgrade message
# =========================================================================
class TestApollo:

    def test_apollo_search_requires_admin(self, pro_token):
        r = requests.post(f"{API}/leads/apollo-search", headers=_h(pro_token),
                          json={"persona_titles": ["CEO"]}, timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}: {r.text}"

    def test_apollo_search_no_token(self):
        r = requests.post(f"{API}/leads/apollo-search",
                          json={"persona_titles": ["CEO"]}, timeout=30)
        assert r.status_code in (401, 403)

    def test_apollo_search_returns_402_free_plan(self, admin_token):
        r = requests.post(f"{API}/leads/apollo-search", headers=_h(admin_token),
                          json={"persona_titles": ["CEO", "Founder"], "page": 1, "per_page": 5},
                          timeout=60)
        assert r.status_code == 402, f"expected 402 (Apollo free plan), got {r.status_code}: {r.text}"
        body = r.json()
        msg = (body.get("detail") or "").lower()
        assert any(k in msg for k in ["upgrade", "apollo", "plan", "inaccessible"]), \
            f"expected upgrade message; got: {body}"


# =========================================================================
# Regression: task creation no longer needs note/category
# =========================================================================
class TestTaskCreationRegression:

    def test_create_task_without_note_or_category(self, pro_token):
        rme = requests.get(f"{API}/auth/me", headers=_h(pro_token), timeout=15)
        assert rme.status_code == 200, rme.text
        my_email = rme.json()["email"]
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
        tid = task.get("id")
        if tid:
            requests.delete(f"{API}/tasks/{tid}", headers=_h(pro_token), timeout=15)
