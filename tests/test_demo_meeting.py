"""Landing 'take TskFlow to your next meeting': notes → short assignable list → send."""
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import live_app  # noqa: E402
from demo_launch import GUEST_EMAIL_DOMAIN, is_valid_assignee_email  # noqa: E402
from demo_meeting import (  # noqa: E402
    MAX_MEETING_TASKS,
    SAMPLE_MEETING,
    drafts_for_client,
    due_date_for_send,
    extract_meeting_tasks,
    meeting_notes_text,
    sendable_tasks,
)


NOW = datetime(2026, 9, 4, 10, 0)


def test_sample_meeting_yields_a_short_named_list():
    drafts = extract_meeting_tasks(SAMPLE_MEETING, NOW)
    titles = " | ".join(d["title"].lower() for d in drafts)
    assert 3 <= len(drafts) <= MAX_MEETING_TASKS, titles
    blob = titles
    assert "forecast" in blob
    assert "salesforce" in blob or "stage" in blob
    assert "proposal" in blob
    assert "kickoff" in blob
    assert "plant" not in blob
    names = {str(d.get("assignee_hint") or "") for d in drafts}
    assert any("Maya" in n for n in names)
    assert any("Chris" in n for n in names)
    client = drafts_for_client(drafts)
    assert client[0]["id"] == "m1"
    assert all(row["title"] for row in client)
    assert all(row["assignee_name"] != "You" for row in client)


def test_chatter_without_owners_is_not_a_task_list():
    drafts = extract_meeting_tasks(
        "We discussed Q4 in general.\nThe numbers look okay.\nParking lot: coffee machine.",
        NOW,
    )
    assert drafts == []


def test_sample_flag_uses_canned_notes():
    assert "Q3 forecast" in meeting_notes_text("", True)
    assert meeting_notes_text("  Maya: I'll send it.  ", False).startswith("Maya:")


def test_sendable_tasks_require_a_real_email():
    rows = sendable_tasks(
        [
            {"title": "Send forecast", "assignee_email": "maya@acme.test", "assignee_name": "Maya"},
            {"title": "Skip me", "assignee_email": "not-an-email"},
            {"title": "", "assignee_email": "chris@acme.test"},
        ],
        is_valid_email=is_valid_assignee_email,
    )
    assert len(rows) == 1
    assert rows[0]["assignee_name"] == "Maya"
    assert due_date_for_send("2026-09-05T17:00", "fallback") == "2026-09-05T17:00"
    assert due_date_for_send("soon", "2026-09-04T17:00") == "2026-09-04T17:00"


def test_landing_cta_opens_the_free_meeting_notepad():
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    app = (FRONT / "App.js").read_text(encoding="utf-8")
    page = (FRONT / "pages" / "DemoMeetingPage.js").read_text(encoding="utf-8")
    pad = (FRONT / "components" / "LandingMeetingPad.js").read_text(encoding="utf-8")
    css = (FRONT / "App.css").read_text(encoding="utf-8")
    assert "TAKE TSKFLOW TO YOUR NEXT MEETING" in landing
    assert 'data-testid="landing-meeting-cta"' in landing
    assert "navigate('/demo/meeting')" in landing
    assert 'className="sr-only landing-final-headline"' in landing
    assert 'className="sr-only landing-hero-plot landing-final-plot"' in landing
    assert 'path="/demo/meeting"' in app
    assert "DemoMeetingPage" in app
    assert "<PublicRoute>" in app.split('path="/demo/meeting"')[1][:180]
    assert "Keep this tab open" in page
    assert "Free. No account." in page
    assert "/demo/meeting-notes" in pad
    assert "/demo/meeting-send" in pad
    assert "Pull the tasks" in pad
    assert "Use a sample" in pad
    assert "Send the list" in pad
    assert "landing-meet-cta" in css
    assert "landing-meet-notes" in css


def test_meeting_notes_endpoint_returns_assignable_drafts():
    server = live_app.app_or_skip()

    async def scenario():
        async with live_app.client(server) as api:
            empty = await api.post("/api/demo/meeting-notes", json={"transcript": "hi"}, headers=live_app.caller_headers("meet-empty"))
            assert empty.status_code == 400, empty.text

            chatter = await api.post(
                "/api/demo/meeting-notes",
                json={"transcript": "We discussed the plants. No action there."},
                headers=live_app.caller_headers("meet-chatter"),
            )
            assert chatter.status_code == 400, chatter.text

            sample = await api.post(
                "/api/demo/meeting-notes",
                json={"use_sample": True},
                headers=live_app.caller_headers("meet-sample"),
            )
            assert sample.status_code == 200, sample.text
            data = sample.json()
            assert data["sample"] is True
            assert "Q3 forecast" in data["transcript"]
            titles = " ".join(d["title"].lower() for d in data["drafts"])
            assert "forecast" in titles
            assert len(data["drafts"]) <= MAX_MEETING_TASKS
            assert all(d.get("assignee_name") for d in data["drafts"])

    live_app.run(scenario())


def test_meeting_send_creates_guest_tasks_and_opens_the_room():
    server = live_app.app_or_skip()

    async def scenario():
        async with live_app.client(server) as api:
            pulled = await api.post(
                "/api/demo/meeting-notes",
                json={"use_sample": True},
                headers=live_app.caller_headers("meet-send-pull"),
            )
            assert pulled.status_code == 200, pulled.text
            drafts = pulled.json()["drafts"][:2]
            payload = {
                "session_id": "meet-send-1",
                "tasks": [
                    {
                        "title": drafts[0]["title"],
                        "description": drafts[0].get("description"),
                        "assignee_email": "Maya.Chen@acme.test",
                        "assignee_name": drafts[0]["assignee_name"],
                        "due_date": drafts[0].get("due_date"),
                    },
                    {
                        "title": drafts[1]["title"],
                        "assignee_email": "chris.park@acme.test",
                        "assignee_name": drafts[1]["assignee_name"],
                    },
                ],
            }
            res = await api.post(
                "/api/demo/meeting-send",
                json=payload,
                headers=live_app.caller_headers("meet-send"),
            )
            assert res.status_code == 200, res.text
            data = res.json()
            assert data["user"]["is_guest"] is True
            assert data["user"]["email"].endswith(f"@{GUEST_EMAIL_DOMAIN}")
            assert data["environment_url"] == f"/env/{data['task_id']}"
            assert len(data["task_ids"]) == 2
            task = await server.db.tasks.find_one({"id": data["task_id"]}, {"_id": 0})
            assert task["demo_from_meeting"] is True
            assert task["assigned_to_email"] == "maya.chen@acme.test"
            room = await api.get(
                f"/api/demo/room/{data['task_id']}",
                headers={"Authorization": f"Bearer {data['access_token']}"},
            )
            assert room.status_code == 200, room.text
            assert room.json()["is_guest"] is True

    live_app.run(scenario())
