"""Landing page 'Send it' → guest session + a real task in a robot room."""
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import live_app  # noqa: E402
from demo_launch import (  # noqa: E402
    GUEST_EMAIL_DOMAIN,
    GUEST_TTL_HOURS,
    LAUNCHES_PER_HOUR,
    SAMPLE_ASSIGNEE,
    assignee_display_name,
    demo_channel,
    eod_due_date,
    guest_company_domain,
    guest_email,
    guest_user_doc,
    is_valid_assignee_email,
    launch_rate_limited,
    robot_room_beats,
    room_copy,
    split_task_text,
)


# ---------------------------------------------------------------- pure helpers

def test_task_text_becomes_a_title_without_the_scaffolding():
    title, description = split_task_text("Tell my team to finish the Q3 outreach email by EOD")
    assert title.startswith("Finish the Q3 outreach email")
    assert "Tell my team" not in title
    assert description  # the manager's own words are kept as the body

    title2, _ = split_task_text("Assign East Coast sales to send the Q3 outreach email by EOD.")
    assert title2.lower().startswith("send the q3 outreach email")

    long_title, _ = split_task_text("x" * 300)
    assert len(long_title) <= 91


def test_due_defaults_to_end_of_day_pacific():
    assert eod_due_date(datetime(2026, 8, 29, 9, 30)) == "2026-08-29T17:00"
    # After 5 PM the ask lands on tomorrow rather than in the past
    assert eod_due_date(datetime(2026, 8, 29, 18, 30)) == "2026-08-30T17:00"


def test_assignee_email_validation_and_rate_limit():
    assert is_valid_assignee_email("chris.park@acme.com") is True
    assert is_valid_assignee_email("  Chris@Acme.com ") is True
    assert is_valid_assignee_email("nope") is False
    assert is_valid_assignee_email("") is False
    assert is_valid_assignee_email(f"demo+abc@{GUEST_EMAIL_DOMAIN}") is False
    assert assignee_display_name("chris.park@acme.com") == "Chris Park"
    assert demo_channel("Slack") == "slack"
    assert demo_channel(None) == "email"
    assert launch_rate_limited(LAUNCHES_PER_HOUR - 1) is False
    assert launch_rate_limited(LAUNCHES_PER_HOUR) is True


def test_guest_user_is_verified_and_expires():
    now = datetime(2026, 8, 29, 10, 0)
    doc = guest_user_doc(guest_id="abc12345", now=now, ip_hash="hash")
    assert doc["is_guest"] is True
    assert doc["email_verified"] is True
    assert doc["subscription_tier"] == "free"
    assert doc["name"] == "You"
    assert doc["email"].endswith(f"@{GUEST_EMAIL_DOMAIN}")
    assert doc["guest_expires_at"] > now.isoformat()
    assert GUEST_TTL_HOURS == 72
    # per-guest domain so two guests never share an activity scope
    assert guest_company_domain("abc12345") != guest_company_domain("def67890")
    assert guest_email("abc").startswith("demo+")


def test_robot_beats_are_polite_and_never_empty():
    beats = robot_room_beats(task_title="Send the Q3 outreach email", assignee_name="Chris Park")
    assert len(beats) >= 4
    titles = " ".join(b["title"] for b in beats)
    assert "delivered" in titles.lower()
    assert any("Slack" in b["body"] for b in beats)
    bodies = " ".join(b["body"] for b in beats)
    assert "Chris Park" in bodies
    queued = robot_room_beats(task_title="x", assignee_name="Sample", delivered=False)
    assert queued[0]["title"] == "Ask queued"
    copy = room_copy(assignee_name="Chris Park", delivered=True)
    assert "Chris Park" in copy["sub"]
    assert "circling back" in copy["reassurance"]


# ------------------------------------------------------------------ live API

def test_launch_creates_a_guest_and_a_real_task():
    server = live_app.app_or_skip()

    async def scenario():
        async with live_app.client(server) as api:
            res = await api.post(
                "/api/demo/launch",
                json={
                    "task": "Tell my team to send the Q3 outreach email by EOD",
                    "assignee_email": "Chris.Park@acme.test",
                    "channel": "email",
                    "session_id": "sess1",
                },
                headers=live_app.caller_headers("launch-real"),
            )
            assert res.status_code == 200, res.text
            data = res.json()
            assert data["access_token"]
            assert data["user"]["is_guest"] is True
            assert data["environment_url"] == f"/env/{data['task_id']}"
            assert data["assignee"]["email"] == "chris.park@acme.test"
            assert data["assignee"]["sample"] is False

            guest = await server.db.users.find_one({"id": data["user"]["id"]}, {"_id": 0})
            assert guest["is_guest"] is True
            assert guest["email_verified"] is True
            assert guest["guest_expires_at"]
            assert guest["email"].endswith(f"@{GUEST_EMAIL_DOMAIN}")

            task = await server.db.tasks.find_one({"id": data["task_id"]}, {"_id": 0})
            assert task["created_by"] == guest["id"]
            assert task["assigned_to"] == "email_chris.park@acme.test"
            assert task["assigned_to_email"] == "chris.park@acme.test"
            assert task["source"] == "landing_demo"
            assert task["due_date"].endswith("T17:00")

            # The guest token opens the room without any extra login step
            room = await api.get(
                f"/api/demo/room/{data['task_id']}",
                headers={"Authorization": f"Bearer {data['access_token']}"},
            )
            assert room.status_code == 200, room.text
            body = room.json()
            assert body["delivered"] is True
            assert body["is_guest"] is True
            assert len(body["activity"]) >= 4
            assert body["task"]["assigned_to_name"]

            events = await server.db[server.EVENTS_COLLECTION].distinct(
                "event", {"user_id": guest["id"]}
            )
            assert "demo_launch" in events
            assert "demo_send" in events

    live_app.run(scenario())


def test_blank_assignee_opens_the_room_without_mailing_anyone():
    server = live_app.app_or_skip()

    async def scenario():
        async with live_app.client(server) as api:
            res = await api.post(
                "/api/demo/launch",
                json={"task": "Send the Q3 outreach email by EOD"},
                headers=live_app.caller_headers("launch-sample"),
            )
            assert res.status_code == 200, res.text
            data = res.json()
            assert data["assignee"]["sample"] is True
            assert data["assignee"]["email"] == SAMPLE_ASSIGNEE["email"]
            assert data["delivery"] == "demo"
            task = await server.db.tasks.find_one({"id": data["task_id"]}, {"_id": 0})
            assert task["demo_delivered"] is False
            room = await api.get(
                f"/api/demo/room/{data['task_id']}",
                headers={"Authorization": f"Bearer {data['access_token']}"},
            )
            assert room.json()["delivered"] is False
            sent = await server.db[server.EVENTS_COLLECTION].count_documents(
                {"event": "demo_send", "user_id": data["user"]["id"]}
            )
            assert sent == 0

    live_app.run(scenario())


def test_bad_input_and_bulk_launches_are_rejected():
    server = live_app.app_or_skip()

    async def scenario():
        async with live_app.client(server) as api:
            headers = live_app.caller_headers("launch-limits")
            short = await api.post("/api/demo/launch", json={"task": "hi"}, headers=headers)
            assert short.status_code == 400

            bad_email = await api.post(
                "/api/demo/launch",
                json={"task": "Send the outreach email", "assignee_email": "not-an-email"},
                headers=headers,
            )
            assert bad_email.status_code == 400

            for _ in range(server.LAUNCHES_PER_HOUR):
                ok = await api.post(
                    "/api/demo/launch",
                    json={"task": "Send the outreach email by EOD"},
                    headers=headers,
                )
                assert ok.status_code == 200, ok.text
            blocked = await api.post(
                "/api/demo/launch",
                json={"task": "Send the outreach email by EOD"},
                headers=headers,
            )
            assert blocked.status_code == 429

    live_app.run(scenario())


def test_landing_walkthrough_attaches_to_the_guest_task():
    """The landing recorder uploads after launch, so the attach must survive a
    task whose `attachments` field is still null."""
    server = live_app.app_or_skip()

    async def scenario():
        async with live_app.client(server) as api:
            launch = await api.post(
                "/api/demo/launch",
                json={
                    "task": "Walk through the new pricing page and fix the copy",
                    "assignee_email": "dana.lee@acme.test",
                },
                headers=live_app.caller_headers("launch-recording"),
            )
            assert launch.status_code == 200, launch.text
            data = launch.json()
            task_id = data["task_id"]
            auth = {"Authorization": f"Bearer {data['access_token']}"}

            fresh = await server.db.tasks.find_one({"id": task_id}, {"_id": 0, "attachments": 1})
            assert not fresh.get("attachments")

            res = await api.post(
                "/api/recordings/standalone",
                json={
                    "recording_url": "https://cdn.example.com/walkthrough.webm",
                    "task_id": task_id,
                    "size_bytes": 175470,
                    "mime_type": "video/mp4",
                    "title": "Walkthrough for your ask",
                },
                headers=auth,
            )
            assert res.status_code == 200, res.text
            assert res.json()["attached_to_task"] is True

            task = await server.db.tasks.find_one({"id": task_id}, {"_id": 0})
            assert len(task["attachments"]) == 1
            assert task["attachments"][0]["storage_path"] == "https://cdn.example.com/walkthrough.webm"
            assert task["attachments"][0]["kind"] == "video"

            # A second walkthrough appends instead of replacing
            again = await api.post(
                "/api/recordings/standalone",
                json={"recording_url": "https://cdn.example.com/second.webm", "task_id": task_id},
                headers=auth,
            )
            assert again.status_code == 200, again.text
            task = await server.db.tasks.find_one({"id": task_id}, {"_id": 0})
            assert len(task["attachments"]) == 2

            room = await api.get(f"/api/demo/room/{task_id}", headers=auth)
            titles = [a["title"] for a in room.json()["activity"]]
            assert "Walkthrough attached" in titles

    live_app.run(scenario())


def test_registering_pulls_the_demo_task_into_the_real_account():
    server = live_app.app_or_skip()

    async def scenario():
        async with live_app.client(server) as api:
            launch = await api.post(
                "/api/demo/launch",
                json={"task": "Send the Q3 outreach email by EOD", "assignee_email": "chris@acme.test"},
                headers=live_app.caller_headers("launch-merge"),
            )
            data = launch.json()
            guest_id = data["user"]["id"]

            reg = await api.post(
                "/api/auth/register",
                json={
                    "name": "Maya Chen",
                    "email": "maya@mergecorp.io",
                    "password": "Password123",
                    "guest_user_id": guest_id,
                },
            )
            assert reg.status_code == 200, reg.text
            assert reg.json()["merged_guest_tasks"] == 1

            real = await server.db.users.find_one({"email": "maya@mergecorp.io"}, {"_id": 0})
            task = await server.db.tasks.find_one({"id": data["task_id"]}, {"_id": 0})
            assert task["created_by"] == real["id"]
            guest = await server.db.users.find_one({"id": guest_id}, {"_id": 0})
            assert guest["merged_into"] == real["id"]

    live_app.run(scenario())


# ------------------------------------------------------------------- wiring

def test_backend_endpoints_and_guest_guards_are_wired():
    server_src = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert '@api_router.post("/demo/launch")' in server_src
    assert '@api_router.get("/demo/room/{task_id}")' in server_src
    assert "is_guest" in server_src
    assert "guest_expires_at" in server_src
    assert "merge_guest_into_user" in server_src
    # guests never get push / EOD / catch-up spam
    assert 'db.users.find_one({"id": user_id, "is_guest": True}' in server_src
    assert 'db.users.find({"is_guest": {"$ne": True}}' in server_src
    assert 'if current_user.get("is_guest"):' in server_src


def test_landing_composer_sends_for_real_instead_of_dead_ending_at_register():
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    assert 'data-testid="landing-send-it"' in landing
    assert 'data-testid="landing-assignee-email"' in landing
    assert "/demo/launch" in landing
    assert "Send it" in landing
    assert "Send this for real" not in landing
    assert "navigate('/register')" not in landing
    assert "environment_url" in landing
    assert "rememberGuestSession" in landing


def test_env_room_is_a_protected_route_with_robot_copy():
    app = (FRONT / "App.js").read_text(encoding="utf-8")
    room = (FRONT / "pages" / "RobotRoomPage.js").read_text(encoding="utf-8")
    assert 'path="/env/:taskId"' in app
    assert "RobotRoomPage" in app
    assert "<ProtectedRoute>" in app.split('path="/env/:taskId"')[1][:220]
    assert 'data-testid="env-page"' in room
    assert 'data-testid="env-activity"' in room
    assert 'data-testid="env-connect-slack"' in room
    assert 'data-testid="env-keep-workspace"' in room
    assert "circling back" in room
    assert "/demo/room/" in room
    assert "trackEnvView" in room


def test_screen_recorder_is_on_the_landing_composer():
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    recorder = (FRONT / "components" / "LandingScreenRecorder.js").read_text(encoding="utf-8")
    sheet = (FRONT / "components" / "LandingPhoneRecordSheet.js").read_text(encoding="utf-8")
    assert "LandingScreenRecorder" in landing
    assert 'data-testid="landing-record-screen"' in recorder
    assert "getDisplayMedia" in recorder
    assert "saveRecordingBlob" in recorder  # works with no account, blob stays local
    assert "trackRecordingStart" in recorder
    # phones without getDisplayMedia get a camera / Photos path, not a desktop-only toast
    assert "desktop browser" not in recorder
    assert "LandingPhoneRecordSheet" in recorder
    assert "needsIosScreenRecordFlow" in recorder
    assert "canRecordWithCamera" in recorder
    assert "getUserMedia" in recorder
    assert 'data-testid="landing-phone-record-sheet"' in sheet
    assert 'data-testid="landing-phone-record-camera"' in sheet
    assert 'data-testid="landing-phone-record-photos"' in sheet
    assert 'data-testid="landing-phone-record-capture"' in sheet
    assert "Control Center" in sheet
    # the blob is attached to the task after the guest launch
    assert "recordings/standalone" in landing
    assert "task_id: taskId" in landing
