"""Leaderboard chevron must open the assignee's individual task."""
from pathlib import Path

FRONT = Path(__file__).resolve().parents[1] / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_participant_row_navigates_to_assignee_task():
    src = _read("pages", "TaskDetail.js")
    assert "resolveAssigneeTaskId" in src
    assert "navigate(`/task/${r.subtaskId}`)" in src
    assert 'data-testid={`participant-chevron-${r.subtaskId}`}' in src
    assert "window.location.assign" not in src
    assert "Open ${r.name}" in src or "Open ${r.name}" in src.replace("’", "'")


def test_peer_leaderboard_also_opens_assignee_task():
    src = _read("pages", "TaskDetail.js")
    assert "peer-leaderboard-open-" in src
    assert "navigate(`/task/${t.id}`)" in src


def test_group_detail_leaderboard_opens_child_task():
    src = _read("pages", "GroupTaskDetail.js")
    assert "onOpen={(id) => navigate(`/task/${id}`)}" in src
    assert "lb-open-" in src
