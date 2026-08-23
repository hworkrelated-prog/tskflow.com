"""Confirm-summary assignee editor must search groups, not only people."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUICK = ROOT / "frontend" / "src" / "components" / "AIQuickCreate.js"


def test_inline_assignee_search_includes_groups():
    src = QUICK.read_text(encoding="utf-8")
    block = src.split('data-testid="ai-inline-assignees"')[1].split("Done</button>")[0]
    assert "Search people or groups" in block
    assert "ai-inline-groups-header" in block
    assert "ai-inline-pick-group-" in block
    assert "kind: 'group'" in block
    assert "addAssigneeChip" in block
    # People-only placeholder must not remain in this editor.
    assert "Search people or type an email" not in block
