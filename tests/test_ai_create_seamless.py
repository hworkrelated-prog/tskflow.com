"""Conversational create, drafts placement, hierarchy, and Sheets hide."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FE = ROOT / "frontend" / "src"
BE = ROOT / "backend" / "server.py"


def _read(*parts: str) -> str:
    return Path(*parts).read_text(encoding="utf-8")


def test_confirm_is_a_message_not_a_form():
    src = _read(FE, "components", "AIQuickCreate.js")
    assert 'data-testid="ai-confirm-message"' in src
    assert "I'll ask" in src or "I&apos;ll ask" in src
    assert "Confirm & send" not in src
    assert 'data-testid="ai-send-btn"' in src
    assert "{sending ? 'Sending…' : 'Send'}" in src
    # Default confirm is not labeled Task / To / Due rows
    confirm = src[src.index("ai-confirm-summary") : src.index("ai-send-btn")]
    assert ">Task<" not in confirm
    assert ">To<" not in confirm
    assert ">Done well<" not in confirm


def test_who_picker_does_not_rerun_preview_after_pick():
    src = _read(FE, "components", "AIQuickCreate.js")
    pick = src[src.index("const pickPerson") : src.index("const reset =")]
    assert "runPreview(text, nextAnswers)" not in pick
    assert "skipMentionSyncRef" in src
    assert "mergeAssigneeLists" in src


def test_composer_has_formatting_toolbar():
    src = _read(FE, "components", "AIQuickCreate.js")
    assert 'data-testid="ai-format-toolbar"' in src
    assert "htmlToMarkdown" in src
    assert "wrapSelection('**', '**')" in src


def test_exited_prompts_save_as_header_drafts():
    dock = _read(FE, "components", "GlobalAIDock.js")
    hub = _read(FE, "pages", "TaskHub.js")
    assert "persistDraftFromSnap" in dock
    assert "/tasks/drafts" in dock
    assert "tskflow:drafts-changed" in dock
    assert 'data-testid="drafts-compact"' in hub
    assert 'data-testid="drafts-popover"' in hub
    assert "drafts-compact" in hub
    # Drafts live in the welcome toolbar popover, not a details strip above the columns
    welcome = hub[hub.index("Welcome,") : hub.index("grid grid-cols-1 md:grid-cols-3")]
    assert 'data-testid="drafts-compact"' in welcome
    assert 'data-testid="drafts-popover"' in welcome
    assert 't.status !== \'Draft\'' in hub or 't.status !== "Draft"' in hub


def test_sheets_connector_hidden():
    src = _read(FE, "pages", "SettingsPage.js")
    assert "google-sheets-sync" in src
    assert "{false && (" in src
    eod = src[src.index("eod-sections") : src.index("eod-sections") + 1200]
    assert "sheet_metrics" not in eod
    assert "Spreadsheet activity" not in src


def test_hierarchy_editor_asks_three_questions():
    src = _read(FE, "pages", "TeamManagementPage.js")
    assert 'data-testid="hierarchy-editor"' in src
    assert "What&apos;s your role?" in src or "What's your role?" in src
    assert "Who reports to you?" in src
    assert "Who is your manager?" in src
    assert "Individual Contributor" in src
    assert "Area Vice President" in src


def test_backend_team_scope_and_contacts():
    src = _read(BE)
    assert "_classify_team_hint" in src
    assert "_hints_from_answers" in src
    assert "_name_hints_from_text" in src
    assert "user_contacts" in src[src.index("async def _resolve_assignee_hints") :]
    assert '"$nin": ["Completed", "Draft"]' in src
    assert 'PUT /team/hierarchy' in src or '@api_router.put("/team/hierarchy")' in src
    assert "Dale Carnegie" in src or "carnegie" in src.lower()
    assert "_carnegie_format_description" in src


def test_classify_team_hint_and_name_extract():
    src = _read(BE)
    # Evaluate the pure helpers from server.py without importing the FastAPI app.
    start = src.index("_DIRECT_HINTS = ")
    end = src.index("async def _resolve_assignee_hints")
    chunk = src[start:end]
    ns = {}
    exec("import re\nfrom typing import Optional, List\n" + chunk, ns)
    assert ns["_classify_team_hint"]("my team") == "team"
    assert ns["_classify_team_hint"]("my direct reports") == "direct"
    assert ns["_classify_team_hint"]("everyone under me") == "team"
    assert ns["_classify_team_hint"]("harold") is None
    names = ns["_name_hints_from_text"]("have harold go through this and send me an update")
    assert any(n.lower().startswith("harold") for n in names)
    hints = ns["_hints_from_answers"]({"Who should own this task?": "Harold John"})
    assert "Harold John" in hints


def test_carnegie_adds_next_steps():
    src = _read(BE)
    start = src.index("def _infer_next_steps")
    end = src.index("def _assignee_name_list")
    ns = {}
    exec("import re\nfrom typing import Optional, List\n" + src[start:end], ns)
    out = ns["_carnegie_format_description"](
        "Please go through this and send an update.",
        title="Send an update",
        manager_name="Henrik",
    )
    assert "Next steps:" in out
    assert "1." in out
    assert "Henrik" in out or "update" in out.lower()
