"""Smart reminder activity copy should never show raw bucket keys like before_due."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
BE = ROOT / "backend" / "server.py"
FE = ROOT / "frontend" / "src" / "pages" / "TaskDetail.js"


def _helpers():
    src = BE.read_text(encoding="utf-8")
    start = src.index("def _reminder_kind_label")
    end = src.index("def _reminder_wording")
    ns = {}
    exec("import re\nfrom typing import Optional\nfrom no_ai_dash import strip_ai_dashes\n" + src[start:end], ns)
    return ns


def test_reminder_kind_label_humanizes_before_due():
    ns = _helpers()
    assert ns["_reminder_kind_label"]("before_due") == "coming due soon"
    assert ns["_reminder_kind_label"]("no_response") == "waiting on a response"
    assert ns["_reminder_kind_label"]("3h") == "due in about 3 hours"


def test_humanize_reminder_body_rewrites_legacy_hyphen_key():
    ns = _helpers()
    fn = ns["_humanize_reminder_body"]
    out = fn("Review and clear all redundant open opportunities - before_due")
    assert out == "Review and clear all redundant open opportunities - coming due soon"
    assert "before_due" not in out
    assert fn("Send the report — 30min") == "Send the report - due in 30 minutes"
    # Already human labels stay put
    assert fn("Review X — coming due soon") == "Review X - coming due soon"
    # meta.fired_kind fallback when body is just the key
    assert fn("before_due", "before_due") == "coming due soon"


def test_activity_log_uses_kind_label_not_raw_key():
    src = BE.read_text(encoding="utf-8")
    assert "{t.get('title')} - {_reminder_kind_label(fired_kind)}" in src
    assert "{t.get('title')} — {fired_kind}" not in src


def test_task_detail_humanizes_legacy_reminder_body():
    src = FE.read_text(encoding="utf-8")
    assert "humanizeReminderBody(a.body)" in src
    assert "reminderActivityTone" in src
    assert "from {a.actor_name}" in src
    assert "formatAppDateTime" in src
