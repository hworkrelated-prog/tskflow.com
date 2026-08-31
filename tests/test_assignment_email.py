"""Assignment emails stay short: greeting, one line, the task, a button."""
import html as html_mod
import re
import sys
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
SERVER = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
sys.path.insert(0, str(ROOT / "backend"))

from email_followup import first_name  # noqa: E402


def _load_helper():
    start = SERVER.index("def _assignment_email_due")
    end = SERVER.index("async def check_and_send_reminders")
    ns = {"first_name": first_name, "html": html_mod, "Optional": Optional, "re": re}
    exec(SERVER[start:end], ns)
    return ns["_assignment_email_html"]


def _visible_text(markup: str) -> str:
    text = re.sub(r"<[^>]+>", " ", markup)
    return re.sub(r"\s+", " ", text).strip()


def test_assignment_email_source_drops_the_lecture():
    for phrase in (
        "New Task Assignment",
        "when you have a moment",
        "Open the task when you are ready",
        "Either way, you are respected",
        "You can confirm, ask for a different time",
        "View Task in Tskflow",
    ):
        assert phrase not in SERVER, phrase
    assert "def _assignment_email_html" in SERVER
    assert SERVER.count("_assignment_email_html(") == 5
    assert "assigned you this." in SERVER
    assert ">New task<" not in SERVER
    assert "Assign it. See who did it." not in SERVER
    assert "View task" in SERVER


def test_assignment_email_is_one_line_plus_the_task():
    render = _load_helper()
    markup = render(
        recipient_name="Hashim Khan",
        assigner_name="Alex Rivera",
        title="Send a pipeline update every day at 9",
        description="Tell my manager to send a pipeline update every day at 9.",
        due_date="2026-08-29T17:00:00",
        priority="Medium",
        cta_url="https://tskflow.com/invite?token=abc123",
    )
    visible = _visible_text(markup)
    assert "Send a pipeline update every day at 9" in visible
    assert "Alex assigned you this." in visible
    assert "Hi Hashim" not in visible
    assert "New task" not in visible
    assert "Tell my manager" not in visible
    assert "Medium" in visible
    assert "Due 2026-08-29 at 17:00" in visible
    assert "17:00:00" not in visible
    assert "View task" in visible
    assert "https://tskflow.com/invite?token=abc123" in markup
    assert "when you have a moment" not in visible
    assert "respected" not in visible.lower()
    assert "confirm, ask" not in visible.lower()
    assert "Tskflow" not in visible
    assert visible.index("Send a pipeline update") < visible.index("Alex assigned you this.")


def test_assignment_email_skips_duplicate_description():
    render = _load_helper()
    markup = render(
        recipient_name="Ada",
        assigner_name="Henrik Morgan",
        title="Call Maya",
        description="Call Maya.",
        due_date="2026-08-29T09:00:00",
        priority="High",
        cta_url="https://tskflow.com/invite?token=xyz",
    )
    visible = _visible_text(markup)
    assert visible.count("Call Maya") == 1
    assert "High" in visible
    assert "Henrik assigned you this." in visible


def test_assignment_email_keeps_description_that_adds_detail():
    render = _load_helper()
    markup = render(
        recipient_name="Ada",
        assigner_name="Henrik",
        title="Call Maya",
        description="Call Maya. Bring the Q3 deck and ask about the Acme renewal.",
        due_date="2026-08-29T09:00:00",
        priority="High",
        cta_url="https://tskflow.com/invite?token=xyz",
    )
    visible = _visible_text(markup)
    assert "Bring the Q3 deck" in visible
    assert "Acme renewal" in visible
