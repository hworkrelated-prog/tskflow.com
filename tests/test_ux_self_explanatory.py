"""UI copy stays short. Features should not lecture."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_dashboard_does_not_lecture():
    hub = _read("pages", "TaskHub.js")
    assert "When something needs doing" not in hub
    assert "Select multiple team members" not in hub
    assert "A prominent banner will appear" not in hub
    assert "This is a Sales Task" not in hub
    assert "Auto-accept this task" not in hub
    assert "To me" in hub
    assert ">Personal<" in hub or "Personal</CardTitle>" in hub
    assert ">Sent<" in hub or "Sent</CardTitle>" in hub
    assert "New task" in hub
    assert "Manual form" not in hub


def test_onboarding_is_one_screen():
    src = _read("components", "OnboardingPopup.js")
    dash = src.split("dashboard:")[1].split("analytics:")[0]
    assert dash.count("description:") == 1
    assert "This is your command center" not in src
    assert "three columns based on their type" not in src
    assert "Got it" in src


def test_create_and_confirm_copy_is_terse():
    quick = _read("components", "AIQuickCreate.js")
    rec = _read("components", "RecurrenceEditor.js")
    assert "Want to change priority" not in quick
    assert "Groups appear first" not in quick
    assert "Open manual form" not in quick
    assert "Full form" in quick
    assert "Repeat this task" not in rec
    assert "rolling window" not in rec
    assert "Repeat" in rec


def test_help_is_not_an_essay():
    help_src = _read("pages", "HelpCenter.js")
    assert "Accountability Management" not in help_src
    assert "and remember, you can just ask Voice Mode too" not in help_src
    assert "5-minute walkthrough" not in help_src
