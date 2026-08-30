"""Drafts can be multi-selected and deleted like live tasks."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HUB = (ROOT / "frontend" / "src" / "pages" / "TaskHub.js").read_text(encoding="utf-8")
TRANSCRIPT = (ROOT / "frontend" / "src" / "pages" / "TranscriptImportPage.js").read_text(encoding="utf-8")
SERVER = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")


def test_hub_drafts_popover_has_select_and_bulk_delete():
    assert 'data-testid="drafts-select"' in HUB
    assert 'data-testid="drafts-select-all"' in HUB
    assert 'data-testid="drafts-bulk-delete"' in HUB
    assert 'data-testid="drafts-selected-count"' in HUB
    assert "toggleDraftSelection" in HUB
    assert "handleBulkDeleteDrafts" in HUB
    assert "${API}/tasks/drafts/bulk-delete" in HUB
    assert "session_ids" in HUB


def test_transcript_review_has_select_and_bulk_delete():
    assert 'data-testid="transcript-drafts-select"' in TRANSCRIPT
    assert 'data-testid="transcript-drafts-bulk-delete"' in TRANSCRIPT
    assert "${API}/task-drafts/bulk-delete" in TRANSCRIPT


def test_backend_draft_bulk_delete_only_touches_drafts():
    task_fn = SERVER.split("async def bulk_delete_draft_tasks")[1].split("async def ")[0]
    assert '"status": "Draft"' in task_fn
    assert 'created_by": current_user["id"]' in task_fn
    assert "delete_one" in task_fn
    assert "deleted_count" in task_fn
    tr_fn = SERVER.split("async def bulk_delete_transcript_drafts")[1].split("async def ")[0]
    assert '"status": "Draft"' in tr_fn
    assert "session_ids" in tr_fn
    assert "delete_many" in tr_fn
