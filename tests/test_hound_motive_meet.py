"""Hound: Slack chase buttons + slash launch. Motive proof. Meet roles."""
from datetime import datetime
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from hound import (  # noqa: E402
    ACTION_ACCEPT,
    ACTION_DONE,
    HOUND_SLASH,
    SLACK_BOT_SCOPES,
    chase_blocks,
    help_blocks,
    intent_from_action,
    interact_action,
    launch_preview_blocks,
    parse_hound_slash,
    parse_interact_payload,
    parse_slash_payload,
    silent_blocks,
)
from salesforce_helpers import classify_sales_ask, proof_soql, soql_escape, summarize_proof, writeback_task_payload
from meet_helpers import apply_draft_vote, can_edit_session, can_publish_session, event_cohost_emails, event_has_ended, kept_drafts, session_roles
from brand import ASSISTANT_NAME, SLACK_PRODUCT, SALESFORCE_PRESET_LABEL


def test_brand_names_are_unique():
    assert ASSISTANT_NAME == "Rook"
    assert SLACK_PRODUCT == "Hound"
    assert SALESFORCE_PRESET_LABEL == "Motive"
    assert ASSISTANT_NAME != "Jarvis"
    assert HOUND_SLASH == "hound"
    assert "incoming-webhook" in SLACK_BOT_SCOPES
    assert "commands" in SLACK_BOT_SCOPES


def test_parse_hound_slash_kinds():
    assert parse_hound_slash("")["kind"] == "help"
    assert parse_hound_slash("help")["kind"] == "help"
    assert parse_hound_slash("silent")["kind"] == "silent"
    assert parse_hound_slash("who's silent")["kind"] == "silent"
    launch = parse_hound_slash("ask sales to log every call by 5")
    assert launch["kind"] == "launch"
    assert "log every call" in launch["text"].lower()


def test_slash_and_interact_payloads():
    body = b"command=%2Fhound&text=silent&user_id=U1&response_url=https%3A%2F%2Fhooks.slack.com%2Fx"
    parsed = parse_slash_payload(body)
    assert parsed["command"] == "hound"
    assert parsed["text"] == "silent"
    assert parsed["user_id"] == "U1"
    interact = parse_interact_payload(
        b'payload=%7B%22type%22%3A%22block_actions%22%2C%22actions%22%3A%5B%7B%22action_id%22%3A%22hound_accept%22%2C%22value%22%3A%22t1%22%7D%5D%7D'
    )
    assert interact["type"] == "block_actions"
    assert interact_action(interact) == (ACTION_ACCEPT, "t1")
    assert intent_from_action(ACTION_ACCEPT) == "accept"
    assert intent_from_action(ACTION_DONE) == "complete"


def test_chase_and_silent_blocks_are_buttons_not_essays():
    blocks = chase_blocks({"id": "abc", "title": "Log calls"}, "Hey.")
    assert any(b.get("type") == "actions" for b in blocks)
    labels = [el["text"]["text"] for b in blocks if b.get("type") == "actions" for el in b["elements"]]
    assert labels == ["On it", "Can't", "Blocked", "Done"]
    silent = silent_blocks(["Chris", "Priya"], 2)
    text = silent[0]["text"]["text"]
    assert "Chris" in text and "Priya" in text
    assert len(text) < 200
    helpb = help_blocks()
    assert any("/hound" in str(b) for b in helpb)
    preview = launch_preview_blocks("L1", "Log calls", "East Coast (36)", "by 5")
    assert any(
        el.get("action_id") == "hound_launch_confirm"
        for b in preview if b.get("type") == "actions"
        for el in b["elements"]
    )


def test_motive_classifies_and_builds_soql():
    assert classify_sales_ask("Remind my team to log every call by 5") == "call"
    assert classify_sales_ask("Tell sales to send this week's forecast by Friday") == "forecast"
    assert classify_sales_ask("Ask the org to submit their best deal") == "deal"
    assert classify_sales_ask("Tell my manager to send a pipeline update every day at 9") == "pipeline"
    q = proof_soql("call", "005xxUSER", datetime(2026, 8, 30))
    assert "FROM Task" in q
    assert "005xxUSER" in q
    assert "2026-08-30" in q
    pipe = proof_soql("pipeline", "005xxUSER", datetime(2026, 8, 30))
    assert "LastModifiedDate >=" in pipe
    assert "2026-08-30T00:00:00Z" in pipe
    assert "LastModifiedDate = 2026-08-30" not in pipe
    assert soql_escape("o'clock") == "o\\'clock"
    payload = writeback_task_payload({"title": "Log calls", "description": "EOD"}, "005x", "call")
    assert payload["Status"] == "Completed"
    assert payload["Type"] == "Call"
    summary = summarize_proof("call", [{"Id": "00T1", "Subject": "Call"}])
    assert summary["found"] is True
    assert summary["auto_complete_eligible"] is True
    assert summary["preset_label"] == "Motive"


def test_meet_organizer_publishes_cohosts_edit():
    roles = session_roles("maya@acme.com", ["chris@acme.com"], ["chris@acme.com", "priya@acme.com"])
    session = {
        "status": "pending_review",
        "organizer_email": roles["organizer_email"],
        "editor_emails": roles["editor_emails"],
        "drafts": [{"id": "d1", "title": "Forecast", "dropped": False}],
        "votes": {},
    }
    assert can_edit_session(session, "chris@acme.com")
    assert can_edit_session(session, "maya@acme.com")
    assert not can_publish_session(session, "chris@acme.com")
    assert can_publish_session(session, "maya@acme.com")
    dropped = apply_draft_vote(session, "chris@acme.com", "d1", keep=False)
    assert dropped["drafts"][0]["dropped"] is True
    assert kept_drafts(dropped) == []
    kept = apply_draft_vote(dropped, "maya@acme.com", "d1", keep=True)
    assert kept_drafts(kept)[0]["id"] == "d1"
    cohosts = event_cohost_emails({
        "organizer": {"email": "maya@acme.com"},
        "attendees": [
            {"email": "maya@acme.com", "organizer": True},
            {"email": "chris@acme.com", "organizer": True},
            {"email": "priya@acme.com"},
        ],
    })
    assert cohosts == ["chris@acme.com"]
    ended = event_has_ended(
        {"end": {"dateTime": "2026-08-30T16:00:00Z"}},
        datetime(2026, 8, 30, 17, 0),
    )
    assert ended is True
    live = event_has_ended(
        {"end": {"dateTime": "2026-08-30T18:00:00Z"}},
        datetime(2026, 8, 30, 17, 0),
    )
    assert live is False


def test_server_wires_hound_motive_meet():
    src = (Path(__file__).resolve().parents[1] / "backend" / "server.py").read_text(encoding="utf-8")
    assert "/integrations/slack/commands" in src
    assert "/integrations/slack/interact" in src
    assert "SLACK_BOT_SCOPES" in src
    assert "/integrations/salesforce/connect" in src
    assert "_maybe_salesforce_writeback" in src
    assert "_sweep_motive_proof_autocomplete" in src
    assert "/auth/google/meet/connect" in src
    assert "_sweep_meet_transcripts" in src
    assert "can_publish_session" in src
    assert "_any_hound_token" in src
    assert "if not slack_bot_token():" in src
    assert "incoming-webhook" in src


def test_frontend_names_and_visuals():
    root = Path(__file__).resolve().parents[1] / "frontend" / "src"
    integ = (root / "components" / "LandingIntegrations.js").read_text(encoding="utf-8")
    assert "landing-integ-${item.id}" in integ
    assert "Email" in integ and "Slack" in integ and "Salesforce" in integ and "Meet" in integ
    assert "HoundScene" in integ and "MotiveScene" in integ
    assert "landing-hound" in integ and "landing-motive" in integ
    settings = (root / "pages" / "SettingsPage.js").read_text(encoding="utf-8")
    assert "Hound" in settings
    assert "Motive" in settings
    assert "meet-connect-btn" in settings
    assert "SLACK_BOT_TOKEN" in settings
    assert "motive-proof-strip" in (root / "pages" / "TaskDetail.js").read_text(encoding="utf-8")
    hub = (root / "pages" / "TaskHub.js").read_text(encoding="utf-8")
    assert "meetSessions.length > 0" in hub
    assert "Add to Slack" in settings
    app = (root / "App.js").read_text(encoding="utf-8")
    assert "/meetings/:sessionId" in app
    assert "/api/auth/google/meet/callback" in app
    voice = (root / "components" / "VoiceMode.js").read_text(encoding="utf-8")
    assert "Rook lives in the prompt bar" in voice
    help_src = (root / "pages" / "HelpCenter.js").read_text(encoding="utf-8")
    assert "Rook is in the prompt" in help_src
    brand = (root / "lib" / "brand.js").read_text(encoding="utf-8")
    assert "Rook" in brand and "Hound" in brand
