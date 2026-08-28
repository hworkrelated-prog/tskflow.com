"""Invite funnel ranking: fastest in vs still waiting."""
from datetime import datetime, timezone, timedelta
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from team_invite_progress import (
    derive_invite_stage,
    format_join_pace,
    build_invite_progress_rows,
)


def test_stage_order():
    assert derive_invite_stage() == "invited"
    assert derive_invite_stage(invite={"clicked_at": "2026-08-28T00:00:00Z"}) == "opened"
    assert derive_invite_stage(user={"email_verified": False}) == "signed_up"
    assert derive_invite_stage(user={"email_verified": True}) == "verified"
    assert derive_invite_stage(user={"email_verified": True, "last_login": "x"}) == "logged_in"
    assert derive_invite_stage(user={"last_login": "x", "preferences": {"team_setup_complete": True}}) == "ready"


def test_pace_labels():
    assert format_join_pace(20) == "under a minute"
    assert format_join_pace(180) == "3 min"
    assert format_join_pace(3600) == "1h"
    assert format_join_pace(5400) == "1h 30m"
    assert format_join_pace(3 * 86400) == "3d"


def test_leaderboard_ranks_fastest_first():
    start = datetime(2026, 8, 28, 12, 0, tzinfo=timezone.utc)
    invites = [
        {"email": "slow@co.com", "created_at": start.isoformat()},
        {"email": "fast@co.com", "created_at": start.isoformat()},
        {"email": "waiting@co.com", "created_at": start.isoformat()},
    ]
    users = [
        {
            "email": "fast@co.com",
            "name": "Fast",
            "email_verified": True,
            "last_login": (start + timedelta(minutes=8)).isoformat(),
            "created_at": (start + timedelta(minutes=5)).isoformat(),
        },
        {
            "email": "slow@co.com",
            "name": "Slow",
            "email_verified": True,
            "last_login": (start + timedelta(hours=5)).isoformat(),
            "created_at": (start + timedelta(hours=4)).isoformat(),
        },
    ]
    payload = build_invite_progress_rows(invites, users, viewer_email="owner@co.com")
    emails = [r["email"] for r in payload["rows"]]
    assert emails[0] == "fast@co.com"
    assert payload["rows"][0]["badge"] == "Fastest"
    assert payload["rows"][0]["rank"] == 1
    assert emails[-1] == "waiting@co.com"
    assert payload["rows"][-1]["waiting"] is True
    assert payload["summary"]["in"] == 2
    assert payload["summary"]["waiting"] == 1
    assert payload["where"] == "Team → Joining"


def test_frontend_surfaces():
    front = ROOT / "frontend" / "src"
    page = (front / "pages" / "TeamManagementPage.js").read_text()
    modal = (front / "components" / "TeamSetupModal.js").read_text()
    app = (front / "App.js").read_text()
    assert 'value="joining"' in page
    assert "TeamInviteProgress" in page
    assert "Joining" in modal
    assert "Team → Joining" in modal
    assert "We’ll notify them" not in modal
    assert "How often should we remind you" not in modal
    assert "Find this anytime" not in modal
    assert 'path="/join/:token"' in app
    assert "/team/invite-progress" in (front / "components" / "TeamInviteProgress.js").read_text()
    server = (ROOT / "backend" / "server.py").read_text()
    assert "/team/invite-progress" in server
    assert "/team/join/{token}" in server
    assert "/join/{token}" in server
