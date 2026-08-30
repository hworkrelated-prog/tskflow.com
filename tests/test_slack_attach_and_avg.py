"""Slack-style image mosaic + group average completion."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_slack_attach_grid_mosaic_exists():
    grid = _read("components", "SlackAttachGrid.js")
    lib = _read("lib", "slackAttach.js")
    css = _read("index.css")
    assert "slack-image-mosaic" in grid
    assert "slack-lightbox" in grid
    assert "slackMosaicClass" in lib
    assert "slack-mosaic--1" in css
    assert "slack-mosaic--4" in css
    viewer = _read("components", "AttachmentViewer.js")
    assert "SlackAttachGrid" in viewer
    quick = _read("components", "AIQuickCreate.js")
    assert "ai-confirm-attachments" in quick
    assert "ai-composer-attachments" in quick
    assert "SlackAttachGrid" in quick
    picker = _read("components", "AttachmentPicker.js")
    assert "SlackAttachGrid" in picker
    detail = _read("pages", "TaskDetail.js")
    assert "SlackAttachGrid" in detail


def test_group_shows_average_completion_ring():
    detail = _read("pages", "TaskDetail.js")
    group = _read("pages", "GroupTaskDetail.js")
    ring = _read("components", "CompletionRing.js")
    assert "CompletionRing" in detail
    assert "CompletionRing" in group
    assert 'data-testid={testId}' in ring or "group-avg-completion" in ring
    assert "completion-ring-pct" in _read("index.css")


def test_ai_dock_closes_with_reverse_morph():
    dock = _read("components", "GlobalAIDock.js")
    css = _read("index.css")
    assert "is-closing" in dock
    assert "setClosing" in dock
    assert ".ai-command-dock.is-closing .ai-dock-panel" in css
    assert "width 400ms cubic-bezier(0.22, 1, 0.36, 1)" in css
    closing = css.split(".ai-command-dock.is-closing .ai-dock-panel {")[1].split("}")[0]
    assert "width: 4.75rem" in closing
    assert "opacity: 0" in closing
