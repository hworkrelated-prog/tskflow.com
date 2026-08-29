"""Daily product funnel: anonymous event ingest, 8 AM Pacific email, admin panel."""
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import live_app  # noqa: E402
from product_analytics import (  # noqa: E402
    DAILY_SEND_HOUR_PST,
    DIGEST_COLLECTION,
    EVENTS_COLLECTION,
    KNOWN_EVENTS,
    analytics_blurb,
    clean_meta,
    daily_subject,
    day_id,
    empty_day,
    event_doc,
    funnel_stages,
    hash_ip,
    normalize_event,
    render_daily_analytics_html,
    should_send_daily,
    snapshot_for_email,
)


# ---------------------------------------------------------------- pure helpers

def test_daily_send_window_is_eight_am_pacific():
    assert DAILY_SEND_HOUR_PST == 8
    assert should_send_daily(datetime(2026, 8, 29, 8, 4)) is True
    assert should_send_daily(datetime(2026, 8, 29, 7, 59)) is False
    assert should_send_daily(datetime(2026, 8, 29, 9, 0)) is False
    # every calendar day, not just Fridays
    assert should_send_daily(datetime(2026, 8, 23, 8, 30)) is True
    assert day_id(datetime(2026, 8, 29, 8, 30)) == "2026-08-29"
    assert daily_subject(datetime(2026, 8, 29)).startswith("Tskflow daily")


def test_only_known_events_are_accepted():
    for name in (
        "landing_view",
        "landing_interact",
        "demo_launch",
        "demo_send",
        "recording_start",
        "login",
        "register",
        "google_signup",
        "env_view",
    ):
        assert name in KNOWN_EVENTS
        assert normalize_event(name) == name
    assert normalize_event("Landing-View") == "landing_view"
    assert normalize_event("drop table users") is None
    assert normalize_event("") is None


def test_events_never_store_raw_pii():
    meta = clean_meta({"kind": "typed", "assignee": "chris@acme.com", "ip": "203.0.113.9", "count": 3})
    assert meta["kind"] == "typed"
    assert meta["count"] == 3
    assert "assignee" not in meta  # emails are dropped
    assert "ip" not in meta
    doc = event_doc(
        "landing_view",
        now=datetime(2026, 8, 29, 8, 30),
        session_id="Sess-1!",
        ip_hash=hash_ip("203.0.113.9", "salt"),
        meta={"path": "/"},
    )
    assert doc["date"] == "2026-08-29"
    assert doc["session_id"] == "sess1"
    assert doc["ip_hash"] and "203.0.113.9" not in str(doc)
    assert hash_ip(None) is None


def test_funnel_and_blurb_read_land_interact_launch_join():
    day = {
        **empty_day("2026-08-29"),
        "landing_views": 20,
        "interactions": 8,
        "demo_launches": 3,
        "demo_sends": 2,
        "logins": 1,
        "signups": 1,
    }
    stages = funnel_stages(day)
    assert [s["label"] for s in stages] == [
        "Landed",
        "Interacted",
        "Launched a robot",
        "Logged in or signed up",
    ]
    assert [s["value"] for s in stages] == [20, 8, 3, 2]
    assert stages[1]["share"] == 40
    blurb = analytics_blurb(day)
    assert "20 landed" in blurb
    assert "3 launched" in blurb
    assert "No landing traffic today." in analytics_blurb(empty_day("2026-08-29"))


def test_daily_email_shows_funnel_and_the_old_core_metrics():
    day = {
        **empty_day("2026-08-29"),
        "landing_views": 20,
        "interactions": 8,
        "demo_launches": 3,
        "demo_sends": 2,
        "recording_starts": 1,
        "guest_sessions": 3,
        "env_views": 3,
        "logins": 4,
        "login_users": 3,
        "logins_email": 3,
        "logins_google": 1,
        "signups": 2,
        "google_signups": 1,
        "tasks_created": 9,
        "tasks_completed": 4,
    }
    totals = {
        "total_users": 42,
        "dau": 6,
        "never_created_a_task": 5,
        "abandonment_rate": 12.5,
        "top_domains": [{"domain": "acmecorp.com", "users": 8}],
    }
    snap = snapshot_for_email(day, empty_day("2026-08-28"), totals, datetime(2026, 8, 29, 8, 5))
    html = render_daily_analytics_html(snap, datetime(2026, 8, 29, 8, 5))
    for label in (
        "Funnel today",
        "Unique landing views",
        "Interactions",
        "Demo launches",
        "Tasks sent from landing",
        "Screen recordings started",
        "Guest sessions created",
        "Logins with Google",
        "New signups",
        "Total users",
        "Daily active users",
        "Tasks created",
        "Tasks completed",
        "First-session abandonment",
        "acmecorp.com",
    ):
        assert label in html, label
    assert snap["blurb"] in html


# ------------------------------------------------------------------ live API

def test_public_event_ingest_stores_the_funnel_step():
    server = live_app.app_or_skip()

    async def scenario():
        async with live_app.client(server) as api:
            res = await api.post(
                "/api/analytics/event",
                json={"event": "landing_view", "session_id": "abc123", "meta": {"path": "/"}},
                headers=live_app.caller_headers("ingest-ok"),
            )
            assert res.status_code == 200, res.text
            assert res.json() == {"stored": True, "event": "landing_view"}

            junk = await api.post(
                "/api/analytics/event",
                json={"event": "not_a_real_event"},
                headers=live_app.caller_headers("ingest-junk"),
            )
            assert junk.json()["stored"] is False

            row = await server.db[EVENTS_COLLECTION].find_one(
                {"event": "landing_view", "session_id": "abc123"}, {"_id": 0}
            )
            assert row["ip_hash"]  # hashed, never the raw address
            assert row["source"] == "client"
            assert row["meta"] == {"path": "/"}

    live_app.run(scenario())


def test_event_ingest_is_rate_limited_per_ip():
    server = live_app.app_or_skip()

    async def scenario():
        headers = live_app.caller_headers("ingest-flood")
        async with live_app.client(server) as api:
            for _ in range(60):
                await api.post("/api/analytics/event", json={"event": "landing_interact"}, headers=headers)
            blocked = await api.post(
                "/api/analytics/event", json={"event": "landing_interact"}, headers=headers
            )
            assert blocked.status_code == 429

    live_app.run(scenario())


def test_email_login_is_recorded_server_side():
    server = live_app.app_or_skip()

    async def scenario():
        async with live_app.client(server) as api:
            reg = await api.post(
                "/api/auth/register",
                json={"name": "Dana Cole", "email": "dana@loginco.io", "password": "Password123"},
            )
            assert reg.status_code == 200, reg.text
            await server.db.users.update_one({"email": "dana@loginco.io"}, {"$set": {"email_verified": True}})
            res = await api.post(
                "/api/auth/login", json={"email": "dana@loginco.io", "password": "Password123"}
            )
            assert res.status_code == 200, res.text
            user = await server.db.users.find_one({"email": "dana@loginco.io"}, {"_id": 0})
            login_row = await server.db[EVENTS_COLLECTION].find_one(
                {"event": "login", "user_id": user["id"]}, {"_id": 0}
            )
            assert login_row["meta"]["method"] == "email"
            assert login_row["source"] == "server"
            register_row = await server.db[EVENTS_COLLECTION].find_one(
                {"event": "register", "user_id": user["id"]}, {"_id": 0}
            )
            assert register_row is not None

    live_app.run(scenario())


def test_snapshot_counts_today_and_daily_email_sends_once_per_day():
    server = live_app.app_or_skip()

    async def scenario():
        now = server.get_pst_now()
        today = day_id(now)
        await server.db[EVENTS_COLLECTION].delete_many({"date": today})
        rows = [
            event_doc("landing_view", now=now, session_id="s1"),
            event_doc("landing_view", now=now, session_id="s1"),  # same visitor
            event_doc("landing_view", now=now, session_id="s2"),
            event_doc("landing_interact", now=now, session_id="s1", meta={"kind": "typed"}),
            event_doc("demo_launch", now=now, session_id="s1"),
            event_doc("demo_send", now=now, session_id="s1"),
            event_doc("recording_start", now=now, session_id="s1"),
            event_doc("env_view", now=now, session_id="s1"),
            event_doc("login", now=now, user_id="u1", meta={"method": "google"}),
            event_doc("login", now=now, user_id="u1", meta={"method": "email"}),
            event_doc("google_signup", now=now, user_id="u1", meta={"method": "google"}),
        ]
        await server.db[EVENTS_COLLECTION].insert_many([dict(r) for r in rows])

        snap = await server._build_daily_product_snapshot(now)
        today_snap = snap["today"]
        assert today_snap["landing_views"] == 2  # unique sessions, not raw hits
        assert today_snap["interactions"] == 1
        assert today_snap["demo_launches"] == 1
        assert today_snap["demo_sends"] == 1
        assert today_snap["recording_starts"] == 1
        assert today_snap["env_views"] == 1
        assert today_snap["logins"] == 2
        assert today_snap["login_users"] == 1
        assert today_snap["logins_google"] == 1
        assert today_snap["logins_email"] == 1
        assert today_snap["google_signups"] == 1
        assert snap["funnel"][0]["value"] == 2
        assert "totals" in snap and "total_users" in snap["totals"]

        await server.db[DIGEST_COLLECTION].delete_many({})
        # Outside the 8 AM hour the scheduler call is a no-op
        off_hour = now.replace(hour=(DAILY_SEND_HOUR_PST + 3) % 24)
        assert (await server.send_daily_analytics(now=off_hour))["reason"] == "not_8am_pt"

        in_window = now.replace(hour=DAILY_SEND_HOUR_PST, minute=5)
        first = await server.send_daily_analytics(now=in_window)
        assert first["sent"] is True
        assert first["to"] == server._analytics_inbox()
        second = await server.send_daily_analytics(now=in_window)
        assert second["sent"] is False
        assert second["reason"] == "already_sent"
        # the owner can still force a send from /admin
        forced = await server.send_daily_analytics(now=in_window, force=True)
        assert forced["sent"] is True

        stored = await server.db[DIGEST_COLLECTION].find_one({"id": f"daily-{day_id(in_window)}"}, {"_id": 0})
        assert stored["to"] == server._analytics_inbox()
        assert stored["snapshot"]["today"]["demo_launches"] == 1

    live_app.run(scenario())


def test_admin_can_view_and_force_send_the_funnel():
    server = live_app.app_or_skip()

    async def scenario():
        async with live_app.client(server) as api:
            login = await api.post("/api/admin/login", json={"password": "test-admin-password"})
            assert login.status_code == 200, login.text
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            view = await api.get("/api/admin/analytics/daily", headers=headers)
            assert view.status_code == 200, view.text
            body = view.json()
            assert body["email_to"] == server._analytics_inbox()
            assert "8:00 AM Pacific" in body["schedule"]
            assert len(body["funnel"]) == 4
            send = await api.post("/api/admin/analytics/send", headers=headers)
            assert send.status_code == 200, send.text
            assert send.json()["sent"] is True
            # the weekly Friday digest is still there
            weekly = await api.get("/api/admin/engagement", headers=headers)
            assert "Friday at 3:00 PM Pacific" in weekly.json()["schedule"]

    live_app.run(scenario())


# ------------------------------------------------------------------- wiring

def test_daily_analytics_runs_from_the_scheduler():
    src = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    loop_body = src.split("async def _scheduler_loop()")[1].split("async def _ensure_indexes")[0]
    assert "await send_daily_analytics()" in loop_body
    assert "await send_weekly_engagement_digest()" in loop_body  # weekly stays
    assert '@api_router.post("/analytics/event")' in src
    assert '@api_router.get("/admin/analytics/daily")' in src
    assert '@api_router.post("/admin/analytics/send")' in src
    assert '@api_router.post("/admin/send-analytics")' in src  # kept as a force-send
    assert "ANALYTICS_EMAIL" in src
    assert "connect@hashimmahmood.com" in src
    assert "_analytics_inbox()" in src


def test_admin_page_shows_the_funnel_next_to_the_weekly_digest():
    admin = (FRONT / "pages" / "AdminPage.js").read_text(encoding="utf-8")
    assert 'data-testid="admin-daily-analytics"' in admin
    assert 'data-testid="admin-daily-analytics-send"' in admin
    assert 'data-testid="admin-funnel-cards"' in admin
    assert "admin/analytics/daily" in admin
    assert "admin/analytics/send" in admin
    assert "Email me today" in admin
    # weekly digest card is untouched
    assert 'data-testid="admin-engagement"' in admin
    assert "Email me this week" in admin


def test_frontend_fires_the_funnel_events():
    lib = (FRONT / "lib" / "productAnalytics.js").read_text(encoding="utf-8")
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    room = (FRONT / "pages" / "RobotRoomPage.js").read_text(encoding="utf-8")
    recorder = (FRONT / "components" / "LandingScreenRecorder.js").read_text(encoding="utf-8")
    assert "analytics/event" in lib
    assert "sessionStorage" in lib  # landing_view fires once per session
    assert "trackLandingView" in landing
    assert "trackLandingInteract" in landing
    assert "trackEnvView" in room
    assert "trackRecordingStart" in recorder
