"""Group-task assistant review: collect replies and brief the assigner."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from response_review import collect_assignee_responses, fallback_group_review, excerpt


def _child(**kwargs):
    base = {
        "id": kwargs.get("id", "c1"),
        "assigned_to_name": kwargs.get("name", "Ada"),
        "status": kwargs.get("status", "Pending"),
        "completion_note": kwargs.get("note"),
        "comments": kwargs.get("comments") or [],
        "blocked_reason": kwargs.get("blocked"),
        "reason_for_decline": kwargs.get("decline"),
        "counter_proposal_message": kwargs.get("counter"),
    }
    return base


def test_excerpt_trims_and_ellipses():
    assert excerpt("  hello   world  ") == "hello world"
    long = "x" * 400
    out = excerpt(long, 20)
    assert out.endswith("…")
    assert len(out) <= 20


def test_collect_includes_notes_comments_and_blocks():
    rows = collect_assignee_responses([
        _child(name="Ada", status="Review Pending", note="Sent the recap and booked Friday."),
        _child(name="Ben", status="Pending"),
        _child(
            name="Cara",
            status="Blocked",
            blocked="Waiting on legal",
            comments=[{"user_name": "Cara", "content": "Still stuck on the contract."}],
        ),
    ])
    assert rows[0]["has_note"] and rows[0]["has_reply"]
    assert rows[1]["status"] == "Pending" and not rows[1]["has_reply"]
    assert rows[2]["blocked_reason"].startswith("Waiting")
    assert rows[2]["comments"][0]["text"].startswith("Still stuck")


def test_fallback_without_criteria_is_a_summary_not_a_grade():
    parent = {"title": "Client recap", "success_criteria": ""}
    rows = collect_assignee_responses([
        _child(name="Ada", status="Review Pending", note="Recap sent."),
        _child(name="Ben", status="Pending"),
        _child(name="Cara", status="Review Pending", note=""),
    ])
    review = fallback_group_review(parent, rows)
    assert review["has_expectations"] is False
    assert review["counts"]["submitted"] == 2
    assert review["counts"]["silent"] == 1
    assert review["counts"]["looks_aligned"] is None
    assert "Ben" in review["silent"]
    assert any("No written expectation" in t for t in review["themes"])
    assert "Ada" in review["plain_summary"]


def test_fallback_with_criteria_flags_empty_submissions():
    parent = {"title": "Client recap", "success_criteria": "Include recap + next meeting date"}
    rows = collect_assignee_responses([
        _child(name="Ada", status="Completed", note="Recap + Friday 2pm."),
        _child(name="Ben", status="Review Pending", note=""),
    ])
    review = fallback_group_review(parent, rows)
    assert review["has_expectations"] is True
    names = [p["name"] for p in review["needs_attention"]]
    assert "Ben" in names
    assert "done well" in review["suggested_nudge"].lower() or "expectation" in review["suggested_nudge"].lower()


def test_ui_and_api_are_wired():
    root = Path(__file__).resolve().parents[1]
    server = (root / "backend" / "server.py").read_text(encoding="utf-8")
    detail = (root / "frontend" / "src" / "pages" / "TaskDetail.js").read_text(encoding="utf-8")
    card = (root / "frontend" / "src" / "components" / "GroupResponseReview.js").read_text(encoding="utf-8")
    assert '"/tasks/parents/{parent_id}/ai-review"' in server
    assert "ai_group_review" in server
    assert "GroupResponseReview" in detail
    assert "Review all responses" in card
