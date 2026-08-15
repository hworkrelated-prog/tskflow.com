"""Unit tests for transcript → draft extraction (no live backend required)."""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from transcript_helpers import (  # noqa: E402
    apply_owner_and_due_guesses,
    draft_matches_session,
    fallback_extract_action_items,
    filter_clear_identified_tasks,
    guess_owner_hint,
    next_business_day_17,
    transcript_session_mongo_filter,
)

NOW = datetime(2026, 8, 14, 10, 0, 0)  # Friday
IMPORTER = {"id": "u-owner", "name": "Pat Owner", "email": "owner@acmecorp.com"}
ROSTER = [
    IMPORTER,
    {"id": "u-alice", "name": "Alice Chen", "email": "alice@acmecorp.com"},
    {"id": "u-bob", "name": "Bob Martinez", "email": "bob@acmecorp.com"},
]


def _parse_friday_or_week(expr, now):
    e = (expr or "").lower()
    if "friday" in e:
        return "2026-08-14T17:00"
    if "next week" in e:
        return "2026-08-17T12:00"
    if "tomorrow" in e:
        return "2026-08-15T12:00"
    return None


MEETING = """
Standup notes.

We discussed Q4 in general and whether the office plants should be replaced.
Bob: Sounds good. The numbers look okay.
Maybe we should think about hiring next year.

Alice: I'll send the Q4 proposal to the client by Friday.
Bob: Bob to schedule the kickoff next week.

Parking lot: coffee machine, team offsite ideas.
- Agenda
- Introductions
- Budget discussion
"""


def test_fallback_keeps_only_clear_commitments():
    drafts = fallback_extract_action_items(
        MEETING, NOW, ROSTER, IMPORTER, parse_date=_parse_friday_or_week
    )
    titles = " | ".join(d["title"].lower() for d in drafts)
    assert len(drafts) == 2, titles
    assert any("proposal" in d["title"].lower() for d in drafts)
    assert any("kickoff" in d["title"].lower() or "schedule" in d["title"].lower() for d in drafts)
    assert not any("plant" in d["title"].lower() for d in drafts)
    assert not any("hiring" in d["title"].lower() for d in drafts)
    assert not any("agenda" in d["title"].lower() for d in drafts)
    assert not any("coffee" in d["title"].lower() for d in drafts)


def test_fallback_guesses_owner_and_deadline():
    drafts = fallback_extract_action_items(
        MEETING, NOW, ROSTER, IMPORTER, parse_date=_parse_friday_or_week
    )
    proposal = next(d for d in drafts if "proposal" in d["title"].lower())
    kickoff = next(d for d in drafts if "kickoff" in d["title"].lower() or "schedule" in d["title"].lower())
    assert proposal["assignee_hint"] in ("Alice Chen", "Alice")
    assert proposal["due_date"] == "2026-08-14T17:00"
    assert kickoff["assignee_hint"] in ("Bob Martinez", "Bob")
    assert kickoff["due_date"] == "2026-08-17T12:00"


def test_discussion_only_yields_no_tasks():
    text = (
        "We talked about Q4 in general. The numbers look okay. "
        "FYI the office move is still TBD. Parking lot: snacks."
    )
    drafts = fallback_extract_action_items(text, NOW, ROSTER, IMPORTER, parse_date=_parse_friday_or_week)
    assert drafts == []


def test_ill_without_speaker_defaults_to_importer():
    text = "I'll follow up with the vendor tomorrow."
    drafts = fallback_extract_action_items(text, NOW, ROSTER, IMPORTER, parse_date=_parse_friday_or_week)
    assert len(drafts) == 1
    assert drafts[0]["assignee_hint"] == "Pat Owner"
    assert drafts[0]["due_date"] == "2026-08-15T12:00"


def test_filter_drops_non_actions_and_caps():
    tasks = [
        {"title": "Discussion of budget", "description": "We discussed budget", "is_clear_action": False},
        {"title": "Send the proposal", "description": "Alice will send the proposal by Friday", "is_clear_action": True, "importance": 8},
        {"title": "Agenda", "description": "introductions"},
        {"title": "Send the proposal", "description": "duplicate"},
        *[{"title": f"Complete item {i} by Friday", "description": f"Complete item {i} by Friday", "is_clear_action": True} for i in range(20)],
    ]
    kept = filter_clear_identified_tasks(tasks)
    assert all(t.get("is_clear_action") is not False for t in kept)
    assert len(kept) <= 10
    assert not any("agenda" in (t["title"] or "").lower() for t in kept)
    assert not any("discussion of budget" in (t["title"] or "").lower() for t in kept)
    titles = [t["title"] for t in kept]
    assert titles.count("Send the proposal") == 1


def test_speaker_ill_owns_task_named_person_does_not_steal():
    text = "Bob: I'll ping Alice about the contract tomorrow."
    drafts = fallback_extract_action_items(text, NOW, ROSTER, IMPORTER, parse_date=_parse_friday_or_week)
    assert len(drafts) == 1
    assert drafts[0]["assignee_hint"] in ("Bob Martinez", "Bob")


def test_ill_mentions_teammate_stays_with_importer():
    hint = guess_owner_hint("I'll ping Alice about the contract tomorrow.", ROSTER, IMPORTER)
    assert hint == "Pat Owner"


def test_guess_owner_from_named_commitment():
    hint = guess_owner_hint("Alice will send the proposal by Friday.", ROSTER, IMPORTER)
    assert hint == "Alice Chen"


def test_apply_guesses_fills_missing_owner_and_due():
    d = apply_owner_and_due_guesses(
        {"title": "Follow up with vendor", "description": "I'll follow up with the vendor tomorrow."},
        transcript="",
        roster=ROSTER,
        importer=IMPORTER,
        now=NOW,
        parse_date=_parse_friday_or_week,
    )
    assert d["assignee_hint"] == "Pat Owner"
    assert d["due_date"] == "2026-08-15T12:00"
    assert d["due_source"] in ("spoken", "guessed")


def test_apply_guesses_defaults_deadline_when_none_spoken():
    d = apply_owner_and_due_guesses(
        {"title": "Send the proposal", "description": "Alice will send the proposal.", "assignee_hint": "Alice Chen"},
        transcript="",
        roster=ROSTER,
        importer=IMPORTER,
        now=NOW,
        parse_date=_parse_friday_or_week,
    )
    assert d["assignee_hint"] == "Alice Chen"
    assert d["due_date"] == next_business_day_17(NOW)
    assert d["due_source"] == "guessed"


def test_next_business_day_skips_weekend():
    saturday = datetime(2026, 8, 15, 9, 0, 0)
    assert next_business_day_17(saturday).startswith("2026-08-17T17:00")


def test_legacy_session_filter_matches_missing_session_id():
    q = transcript_session_mongo_filter("legacy")
    assert "$or" in q
    assert {"session_id": {"$exists": False}} in q["$or"]
    assert {"session_id": None} in q["$or"]
    assert draft_matches_session({"title": "King Dynasty demo"}, "legacy")
    assert draft_matches_session({"session_id": None, "title": "x"}, "legacy")
    assert not draft_matches_session({"session_id": "abc", "title": "x"}, "legacy")


def test_named_session_filter_is_exact():
    assert transcript_session_mongo_filter("sess-1") == {"session_id": "sess-1"}
    assert draft_matches_session({"session_id": "sess-1"}, "sess-1")
    assert not draft_matches_session({"session_id": "sess-2"}, "sess-1")
    assert transcript_session_mongo_filter("all") == {}
    assert transcript_session_mongo_filter("") == {}
