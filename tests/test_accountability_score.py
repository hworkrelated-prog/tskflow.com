"""Accountability score: respond, execute, and not leave work sitting."""
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from accountability import (  # noqa: E402
    accountability_label,
    compute_accountability_score,
    score_assignee_tasks,
    summarize_assignee_tasks,
)


NOW = datetime(2026, 8, 29, 18, 0, tzinfo=timezone.utc)


def _task(status, *, due=None, completed=False, nudges=0, deleted=False):
    doc = {
        "status": status,
        "due_date": due or "2026-08-30T17:00:00+00:00",
        "nudge_count": nudges,
        "deleted": deleted,
    }
    if completed:
        doc["completed_at"] = "2026-08-28T17:00:00+00:00"
    return doc


def test_no_history_has_no_score():
    scored = score_assignee_tasks([], now=NOW)
    assert scored["tasks_assigned"] == 0
    assert scored["accountability_score"] is None
    assert scored["accountability_label"] == "No history"


def test_finisher_who_responds_scores_high():
    tasks = [
        _task("Completed", completed=True),
        _task("Completed", completed=True),
        _task("Completed", completed=True),
    ]
    scored = score_assignee_tasks(tasks, now=NOW)
    assert scored["completion_rate"] == 100
    assert scored["response_rate"] == 100
    assert scored["tasks_silent"] == 0
    assert scored["accountability_score"] >= 90
    assert scored["accountability_label"] == "Strong"


def test_silent_overdue_work_scores_low():
    yesterday = (NOW - timedelta(days=1)).isoformat()
    tasks = [
        _task("Pending", due=yesterday, nudges=3),
        _task("Pending", due=yesterday, nudges=2),
    ]
    scored = score_assignee_tasks(tasks, now=NOW)
    assert scored["response_rate"] == 0
    assert scored["completion_rate"] == 0
    assert scored["tasks_overdue_open"] == 2
    assert scored["accountability_score"] is not None
    assert scored["accountability_score"] < 40
    assert scored["accountability_label"] == "Needs follow-up"


def test_responding_without_finishing_is_better_than_silence():
    accepted = [_task("Accepted"), _task("Accepted"), _task("Review Pending")]
    silent = [_task("Pending"), _task("Pending"), _task("Pending")]
    a = compute_accountability_score(summarize_assignee_tasks(accepted, now=NOW))
    s = compute_accountability_score(summarize_assignee_tasks(silent, now=NOW))
    assert a is not None and s is not None
    assert a > s


def test_deleted_incomplete_tasks_are_ignored():
    tasks = [
        _task("Pending", deleted=True),
        _task("Completed", completed=True, deleted=True),
    ]
    scored = score_assignee_tasks(tasks, now=NOW)
    assert scored["tasks_assigned"] == 1
    assert scored["tasks_completed"] == 1


def test_label_bands():
    assert accountability_label(None) == "No history"
    assert accountability_label(90) == "Strong"
    assert accountability_label(72) == "Steady"
    assert accountability_label(55) == "Uneven"
    assert accountability_label(20) == "Needs follow-up"


def test_accountability_me_endpoint_scores_assigned_work():
    sys.path.insert(0, str(ROOT / "tests"))
    import live_app  # noqa: E402

    server = live_app.app_or_skip()
    now = datetime.now(timezone.utc)
    yesterday = (now - timedelta(days=1)).isoformat()

    async def scenario():
        import uuid
        uid = uuid.uuid4().hex[:12]
        await server.db.users.insert_one({
            "id": uid,
            "name": "Casey Walsh",
            "email": f"casey-{uid}@acme.test",
            "email_verified": True,
            "subscription_tier": "free",
            "is_guest": False,
        })
        await server.db.tasks.insert_many([
            {
                "id": f"{uid}-done",
                "assigned_to": uid,
                "created_by": "mgr",
                "status": "Completed",
                "completed_at": now.isoformat(),
                "due_date": (now + timedelta(days=1)).isoformat(),
                "nudge_count": 0,
                "deleted": False,
                "created_at": now.isoformat(),
            },
            {
                "id": f"{uid}-late",
                "assigned_to": uid,
                "created_by": "mgr",
                "status": "Pending",
                "due_date": yesterday,
                "nudge_count": 2,
                "deleted": False,
                "created_at": now.isoformat(),
            },
        ])
        token = server.create_access_token({"sub": uid})
        async with live_app.client(server) as api:
            res = await api.get("/api/accountability/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["tasks_assigned"] == 2
        assert body["tasks_completed"] == 1
        assert body["tasks_silent"] == 1
        assert body["accountability_score"] is not None
        assert 0 <= body["accountability_score"] <= 100
        assert body["accountability_label"]

    live_app.run(scenario())


def test_backend_exposes_me_endpoint():
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "from accountability import score_assignee_tasks" in server
    assert '"/accountability/me"' in server
    assert "accountability_score" in server


def test_frontend_surfaces_the_score():
    front = ROOT / "frontend" / "src"
    analytics = (front / "pages" / "AnalyticsPage.js").read_text(encoding="utf-8")
    team = (front / "pages" / "TeamManagementPage.js").read_text(encoding="utf-8")
    settings = (front / "pages" / "SettingsPage.js").read_text(encoding="utf-8")
    hub = (front / "pages" / "TaskHub.js").read_text(encoding="utf-8")
    badge = (front / "components" / "AccountabilityScore.js").read_text(encoding="utf-8")
    assert "AccountabilityScore" in analytics
    assert "accountability_score" in analytics
    # CRA/ESLint rejects `??` mixed with `||` without parens (Render build).
    assert "accountability_score ?? r.performance_score ||" not in analytics
    assert "accountability_score ?? r.performance_score ?? 0" in analytics
    assert "AccountabilityScore" in team
    assert "accountability/me" in settings
    assert "accountability/me" in hub
    assert "data-testid={testId}" in badge
    assert "accountability-score" in badge
