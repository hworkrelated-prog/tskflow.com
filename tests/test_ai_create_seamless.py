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
    assert 'data-testid="ai-confirm-assignee-ask"' in src
    assert "I'll ask" in src or "I&apos;ll ask" in src
    assert "I'll remind you" in src or "I&apos;ll remind you" in src
    assert "Confirm & send" not in src
    assert 'data-testid="ai-send-btn"' in src
    assert "{sending ? 'Sending…' : 'Send'}" in src
    # Default confirm is not labeled Task / To / Due rows
    confirm = src[src.index("ai-confirm-summary") : src.index("ai-send-btn")]
    assert ">Task<" not in confirm
    assert ">To<" not in confirm
    assert ">Done well<" not in confirm
    # Continuous chat — no More/Less form toggles
    assert 'data-testid="ai-edit-details"' not in src
    assert "showDetails" not in src
    assert 'data-testid="ai-confirm-chat-hint"' in src
    assert "parseConfirmChatEdit" in src
    assert "applyConfirmChatEdit" in src
    assert "CONFIRM_READY_HINT" in src


def test_confirm_chat_edits_priority_and_recording():
    src = _read(FE, "components", "AIQuickCreate.js")
    start = src.index("const parseConfirmChatEdit")
    end = src.index("const COMMAND_ROUTES")
    chunk = src[start:end]
    # Smoke the pure parser via Node-less string checks + exec isn't needed —
    # assert the intents we care about are handled.
    assert "kind: 'send'" in chunk or 'kind: "send"' in chunk or "return { kind: 'send' }" in chunk
    assert "requires_screen_recording" in chunk
    assert "is_sales_task" in chunk
    assert "due_phrase" in chunk
    assert "Urgent" in chunk
    # Ready confirm keeps chatting instead of wiping the card
    run = src[src.index("const runPreview") : src.index("runPreviewRef.current = runPreview")]
    assert "applyConfirmChatEdit" in run
    assert "readyNow" in run


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
    assert "formatOpen" in src
    assert "{formatOpen ? (" in src
    assert "e.key.toLowerCase() === 'b'" in src


def test_exited_prompts_save_as_header_drafts():
    dock = _read(FE, "components", "GlobalAIDock.js")
    hub = _read(FE, "pages", "TaskHub.js")
    assert "upsertDraftFromSnap" in dock
    assert "scheduleDraftSave" in dock
    assert "draftPayloadFromSnap" in dock
    assert "conversationStarted" in dock
    assert "activePrompt" in dock
    assert "/tasks/drafts" in dock
    assert "tskflow:drafts-changed" in dock
    assert "discardDraft" in dock
    assert 'data-testid="drafts-compact"' in hub
    assert 'data-testid="drafts-popover"' in hub
    assert "drafts-compact" in hub
    # Drafts live in the welcome toolbar popover, not a details strip above the columns
    welcome = hub[hub.index("Welcome,") : hub.index("grid grid-cols-1 md:grid-cols-3")]
    assert 'data-testid="drafts-compact"' in welcome
    assert 'data-testid="drafts-popover"' in welcome
    assert 't.status !== \'Draft\'' in hub or 't.status !== "Draft"' in hub


def test_conversation_start_saves_draft_immediately():
    dock = _read(FE, "components", "GlobalAIDock.js")
    quick = _read(FE, "components", "AIQuickCreate.js")
    # Snapshot exposes the sent prompt + thread so drafts work after text is cleared.
    assert "activePrompt" in quick
    assert "threadTexts" in quick
    assert "scheduleDraftSave(snap)" in dock or "scheduleDraftSave(snap," in dock
    assert "immediate" in dock
    assert "axios.post(`${API}/tasks/drafts`" in dock or 'axios.post(`${API}/tasks/drafts`' in dock
    # Sent tasks remove the draft; exit keeps/updates it.
    assert "discardDraft" in dock
    created = dock.split("onCreated={() => {")[1].split("onOpenAdvanced")[0]
    assert "discardDraft()" in created
    clear = dock.split("const clearFlow")[1].split("useEffect(() => {")[0]
    assert "upsertDraftFromSnap(snap, { force: true })" in clear
    assert "draftIdRef.current = null" in clear


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
    exec(
        "import re\nfrom typing import Optional, List\n"
        "def first_name(name, fallback=''):\n"
        "    p = (name or '').strip().split()\n"
        "    return p[0] if p else fallback\n" + chunk,
        ns,
    )
    assert ns["_classify_team_hint"]("my team") == "team"
    assert ns["_classify_team_hint"]("my direct reports") == "direct"
    assert ns["_classify_team_hint"]("everyone under me") == "team"
    assert ns["_classify_team_hint"]("harold") is None
    names = ns["_name_hints_from_text"]("have harold go through this and send me an update")
    assert any(n.lower().startswith("harold") for n in names)
    owner = ns["_name_hints_from_text"](
        "Benjamin needs to review and clear all redundant open opportunities by 1 pm PST today. "
        "He should either close lost them, or move them to September or October on their close dates."
    )
    assert [n.lower() for n in owner] == ["benjamin"]
    assert not ns["_name_hints_from_text"]("He should close lost opportunities")
    hints = ns["_hints_from_answers"]({"Who should own this task?": "Harold John"})
    assert "Harold John" in hints
    # Due answers must never become assignee hints (was "Assign to ASAP")
    assert ns["_hints_from_answers"]({"When should this be done by?": "ASAP"}) == []
    assert ns["_hints_from_answers"]({"Who should own this task?": "ASAP"}) == []
    ctx = ns["_answers_as_natural_context"]({"When should this be done by?": "ASAP"})
    assert "Additional info" not in ctx
    assert "due" in ctx.lower()
    assert "ASAP" in ctx


def test_carnegie_adds_next_steps():
    src = _read(BE)
    start = src.index("_SUBJECT_FOR_RE = ")
    end = src.index("def _assignee_name_list")
    ns = {}
    exec(
        "import re\nfrom typing import Optional, List\n"
        "def first_name(name, fallback=''):\n"
        "    p = (name or '').strip().split()\n"
        "    return p[0] if p else fallback\n" + src[start:end],
        ns,
    )
    out = ns["_carnegie_format_description"](
        "Please go through this and send an update.",
        title="Send an update",
        manager_name="Henrik",
    )
    assert "Next steps:" in out
    assert "1." in out
    assert "Henrik" in out or "update" in out.lower()
