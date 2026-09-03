"""Unbiassly: anonymous share-link discussions with organizer insights."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "tests"))

from unbiassly import (  # noqa: E402
    TOKEN_ALPHABET,
    expires_at_for,
    extract_trends,
    fallback_summary,
    is_concluded,
    new_share_token,
    organizer_room_payload,
    public_post,
    public_room_payload,
    share_url,
)


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_share_url_is_short_and_public():
    assert share_url("https://tskflow.com", "abc123") == "https://tskflow.com/u/abc123"
    assert share_url("https://tskflow.com/", "abc123") == "https://tskflow.com/u/abc123"
    token = new_share_token()
    assert len(token) == 16
    assert all(c in TOKEN_ALPHABET for c in token)
    assert not any(c in token for c in "0O1Il")


def test_public_payload_never_leaks_organizer_or_ip():
    room = {
        "id": "room-1",
        "share_token": "tok123",
        "organizer_id": "user-9",
        "organizer_email": "owner@acme.test",
        "topic": "Office snacks",
        "prompt": "What should we keep in the kitchen?",
        "status": "open",
        "contribution_count": 1,
        "created_at": "2026-08-30T00:00:00+00:00",
    }
    posts = [{
        "id": "p1",
        "body": "Fruit is better than candy.",
        "created_at": "2026-08-30T00:01:00+00:00",
        "ip_hash": "abc",
        "organizer_id": "user-9",
    }]
    public = public_room_payload(room, posts, app_base_url="https://tskflow.com")
    blob = json.dumps(public)
    assert "owner@acme.test" not in blob
    assert "user-9" not in blob
    assert "ip_hash" not in blob
    assert "organizer_email" not in blob
    assert "organizer_id" not in blob
    assert public["topic"] == "Office snacks"
    assert public["posts"] == []
    assert public["answers_hidden"] is True
    assert public["share_url"].endswith("/u/tok123")
    assert public_post(posts[0]) == {
        "id": "p1",
        "body": "Fruit is better than candy.",
        "created_at": "2026-08-30T00:01:00+00:00",
    }


def test_organizer_payload_includes_summary_not_emails():
    room = {
        "id": "room-1",
        "share_token": "tok123",
        "organizer_id": "user-9",
        "organizer_email": "owner@acme.test",
        "topic": "Remote Fridays",
        "prompt": "",
        "status": "open",
        "contribution_count": 0,
        "created_at": "2026-08-30T00:00:00+00:00",
        "summary": {"headline": "Waiting", "highlights": [], "trends": []},
    }
    payload = organizer_room_payload(room, [], app_base_url="https://tskflow.com")
    assert payload["organizer"] is True
    assert payload["id"] == "room-1"
    assert payload["answers_hidden"] is True
    assert payload["posts"] == []
    assert "owner@acme.test" not in json.dumps(payload)


def test_answers_stay_sealed_until_concluded():
    room = {
        "id": "room-1",
        "share_token": "tok123",
        "topic": "Office snacks",
        "prompt": "",
        "status": "open",
        "contribution_count": 1,
        "created_at": "2026-08-30T00:00:00+00:00",
    }
    posts = [{"id": "p1", "body": "Fruit is better than candy.", "created_at": "2026-08-30T00:01:00+00:00"}]
    assert is_concluded(room) is False
    public = public_room_payload(room, posts, app_base_url="https://tskflow.com")
    org = organizer_room_payload(room, posts, app_base_url="https://tskflow.com")
    assert public["posts"] == []
    assert org["posts"] == []
    room["status"] = "closed"
    assert is_concluded(room) is True
    org_done = organizer_room_payload(room, posts, app_base_url="https://tskflow.com")
    public_done = public_room_payload(room, posts, app_base_url="https://tskflow.com")
    assert org_done["posts"][0]["body"] == "Fruit is better than candy."
    assert public_done["posts"] == []
    assert expires_at_for("never") is None
    assert expires_at_for("24h")


def test_fallback_summary_finds_trends_and_highlights():
    room = {"topic": "The standup format"}
    posts = [
        {"body": "Standup is too long and the updates repeat themselves."},
        {"body": "The standup updates are long. Keep standup to blockers only."},
        {"body": "I like written updates instead of a long standup."},
        {"body": "Ok"},
    ]
    trends = extract_trends(posts)
    labels = {t["label"] for t in trends}
    assert "standup" in labels
    assert "updates" in labels
    summary = fallback_summary(room, posts)
    assert summary["contribution_count"] == 4
    assert summary["source"] == "fallback"
    assert "standup" in summary["headline"].lower() or "4" in summary["headline"]
    assert summary["highlights"]
    assert all(len(h) >= 12 for h in summary["highlights"])
    empty = fallback_summary(room, [])
    assert empty["contribution_count"] == 0
    assert "no contribution" in empty["headline"].lower()


def test_frontend_wires_unbiassly():
    app = _read("App.js")
    hub = _read("pages", "UnbiasslyHub.js")
    public = _read("pages", "UnbiasslyRoomPage.js")
    dash = _read("pages", "TaskHub.js")
    landing = _read("pages", "LandingPage.js")
    help_src = _read("pages", "HelpCenter.js")
    dock = _read("components", "GlobalAIDock.js")
    login = _read("pages", "LoginPage.js")
    bar = _read("components", "UnbiasslyTopicBar.js")
    public_create = _read("components", "LandingUnbiassly.js")

    assert "UnbiasslyHub" in app
    assert "UnbiasslyRoomPage" in app
    assert 'path="/unbiassly"' in app
    assert 'path="/u/:token"' in app
    assert 'data-testid="unbiassly-hub"' in hub
    assert 'data-testid="unbiassly-create"' in bar
    assert 'data-testid="unbiassly-topic"' in bar
    assert "A topic for discussion or collecting feedback" in bar
    assert 'data-testid="unbiassly-copy-link"' in hub
    assert 'data-testid="unbiassly-refresh-insights"' in hub
    assert 'data-testid="unbiassly-email-summary"' in hub
    assert "People hold back when names and titles are in the room." in hub
    assert 'data-testid="unbiassly-expires"' not in hub
    assert "{user?.name}" not in hub
    assert "Hashim" not in hub
    assert "UnbiasslyTopicBar" in hub
    assert "Conclude" in hub
    assert "unbiassly-answers-hidden" in public
    assert "unbiasslyGuest" in public_create or "rememberUnbiasslyRoom" in public_create
    assert "/login?next=/unbiassly" not in public_create
    assert "FOUNDER_CALENDAR" not in public_create
    assert "Book a meeting" not in public_create
    assert 'data-testid="unbiassly-send"' in public
    assert "Post anonymously" in public
    assert 'data-testid="unbiassly-button"' in dash
    assert 'data-testid="landing-unbiassly"' in landing
    assert "Unbiassly" in help_src
    assert "LandingUnbiassly" in hub
    assert "user.is_guest" in hub
    assert "pinDocumentTheme('dark')" in hub
    assert "startsWith('/u/')" in dock
    assert "startsWith('/unbiassly')" in dock
    assert "searchParams.get('next')" in login
    assert "${API}/unbiassly/rooms" in hub
    assert "${API}/unbiassly/${token}/posts" in public


def test_unbiassly_stays_nameless():
    """Unbiassly is nameless even for a logged-in organizer. Booking lives on the founder page."""
    bar = _read("components", "UnbiasslyTopicBar.js")
    landing = _read("components", "LandingUnbiassly.js")
    hub = _read("pages", "UnbiasslyHub.js")
    public = _read("pages", "UnbiasslyRoomPage.js")
    founder = _read("components", "LandingFounder.js")
    for src in (bar, landing, hub, public):
        low = src.lower()
        assert "hashim" not in low
        assert "book a meeting" not in low
        assert "calendly" not in low
        assert "office-hours" not in src
        assert "{user?.name}" not in src
        assert "user.name" not in src
        assert "\u2014" not in src
        assert "\u2013" not in src
    assert "A topic for discussion or collecting feedback" in bar
    assert "Book a meeting" in founder
    assert "Hashim Mahmood" in founder


def test_copy_avoids_em_dashes():
    hub = _read("pages", "UnbiasslyHub.js")
    public = _read("pages", "UnbiasslyRoomPage.js")
    be = (ROOT / "backend" / "unbiassly.py").read_text(encoding="utf-8")
    for src in (hub, public, be):
        assert "\u2014" not in src
        assert "\u2013" not in src


def test_server_registers_unbiassly_routes():
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "from unbiassly import register_unbiassly_routes" in server
    assert "register_unbiassly_routes(" in server
    assert '"area": "Unbiassly"' in server


def test_live_anonymous_discussion_and_organizer_insights():
    import live_app
    import uuid

    server = live_app.app_or_skip()

    async def scenario():
        oid = uuid.uuid4().hex[:12]
        other = uuid.uuid4().hex[:12]
        await server.db.users.insert_one({
            "id": oid,
            "name": "Organizer Ori",
            "email": f"ori-{oid}@acme.test",
            "email_verified": True,
            "subscription_tier": "free",
        })
        await server.db.users.insert_one({
            "id": other,
            "name": "Other Pat",
            "email": f"pat-{other}@acme.test",
            "email_verified": True,
            "subscription_tier": "free",
        })
        org_auth = {"Authorization": f"Bearer {server.create_access_token({'sub': oid})}"}
        other_auth = {"Authorization": f"Bearer {server.create_access_token({'sub': other})}"}
        headers = live_app.caller_headers("unbiassly-live")

        async with live_app.client(server) as api:
            guest = await api.post(
                "/api/unbiassly/rooms",
                json={"topic": "Should we keep Friday demos?", "expires_in": "48h"},
                headers=headers,
            )
            assert guest.status_code == 200, guest.text
            assert guest.json().get("manage_token")
            assert guest.json()["answers_hidden"] is True

            created = await api.post(
                "/api/unbiassly/rooms",
                json={
                    "topic": "Should we keep Friday demos?",
                    "prompt": "Say what you actually think.",
                },
                headers={**org_auth, **headers},
            )
            assert created.status_code == 200, created.text
            room = created.json()
            assert room["topic"] == "Should we keep Friday demos?"
            assert room["status"] == "open"
            assert "/u/" in room["share_url"]
            assert "ori-" not in json.dumps(room)
            token = room["share_token"]
            room_id = room["id"]

            listed = await api.get("/api/unbiassly/rooms", headers={**org_auth, **headers})
            assert listed.status_code == 200
            assert any(r["id"] == room_id for r in listed.json()["rooms"])

            public = await api.get(f"/api/unbiassly/{token}", headers=headers)
            assert public.status_code == 200, public.text
            pub = public.json()
            assert pub["topic"] == "Should we keep Friday demos?"
            assert pub["posts"] == []
            blob = json.dumps(pub)
            assert "organizer_email" not in blob
            assert "organizer_id" not in blob
            assert oid not in blob

            first = await api.post(
                f"/api/unbiassly/{token}/posts",
                json={"body": "Friday demos help the whole company see progress. Keep them."},
                headers=headers,
            )
            assert first.status_code == 200, first.text
            assert first.json()["contribution_count"] == 1
            assert first.json()["posts"] == []
            assert first.json()["answers_hidden"] is True

            second = await api.post(
                f"/api/unbiassly/{token}/posts",
                json={"body": "Demos run too long. Keep Friday demos, but cap them at twenty minutes."},
                headers=live_app.caller_headers("unbiassly-live-b"),
            )
            assert second.status_code == 200, second.text
            assert second.json()["contribution_count"] == 2

            too_short = await api.post(
                f"/api/unbiassly/{token}/posts",
                json={"body": "no"},
                headers=headers,
            )
            assert too_short.status_code == 422

            stored = await server.db.unbiassly_posts.find_one({"room_id": room_id}, {"_id": 0})
            assert stored.get("ip_hash")
            assert "user_id" not in stored
            assert "organizer_id" not in stored
            assert stored.get("body")

            other_list = await api.get("/api/unbiassly/rooms", headers={**other_auth, **headers})
            assert other_list.json()["rooms"] == []
            forbidden = await api.get(f"/api/unbiassly/rooms/{room_id}", headers={**other_auth, **headers})
            assert forbidden.status_code == 403

            insights = await api.post(
                f"/api/unbiassly/rooms/{room_id}/summary",
                headers={**org_auth, **headers},
            )
            assert insights.status_code == 200, insights.text
            assert insights.json()["answers_hidden"] is True
            assert insights.json()["posts"] == []
            sealed = insights.json()["summary"]
            assert sealed["contribution_count"] == 2
            assert sealed.get("highlights") == []

            closed = await api.post(
                f"/api/unbiassly/rooms/{room_id}/close",
                headers={**org_auth, **headers},
            )
            assert closed.status_code == 200
            assert closed.json()["status"] == "closed"
            assert closed.json()["answers_visible"] is True
            assert len(closed.json()["posts"]) == 2
            summary = closed.json()["summary"]
            assert summary["headline"]
            assert "trends" in summary
            labels = " ".join(t.get("label", "") for t in summary.get("trends") or [])
            assert "demo" in labels or "friday" in labels or "demos" in (summary.get("overview") or "").lower()
            assert summary["highlights"]

            blocked = await api.post(
                f"/api/unbiassly/{token}/posts",
                json={"body": "One more thought after close."},
                headers=headers,
            )
            assert blocked.status_code == 403

            missing = await api.get("/api/unbiassly/not-a-real-token", headers=headers)
            assert missing.status_code == 404

    live_app.run(scenario())
