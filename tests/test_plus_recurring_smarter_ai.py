"""Plus-menu Recurring, smarter parse model, chat-through-gaps, assignee question color."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"
SERVER = ROOT / "backend" / "server.py"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_plus_menu_has_recurring():
    src = _read("components", "AIQuickCreate.js")
    assert 'data-testid="ai-recurring-btn"' in src
    assert "startRecurringCompose" in src
    assert "Recurring" in src
    assert "Repeat" in src
    assert "recurringHintRef" in src
    assert "User tapped Recurring in the plus menu" in src


def test_preview_sends_history_and_hint():
    src = _read("components", "AIQuickCreate.js")
    assert "history: threadRef.current.slice(-12)" in src
    assert "context_hint: recurringHintRef.current" in src
    assert "timeout: 35000" in src


def test_who_question_uses_readable_foreground():
    src = _read("components", "AIQuickCreate.js")
    assert 'data-testid="ai-clarify-question"' in src
    clarify = src.split('data-testid="ai-clarifying"')[1].split("ambiguous.length")[0]
    assert "text-amber-950" not in clarify
    assert "text-foreground" in clarify
    assert "bg-muted/70" in clarify
    assert "Who should this go to?" in src
    assert "text-teal-950" not in src
    people_drop = src.split('data-testid="clarify-people-dropdown"')[1].split("peopleSearch.includes")[0]
    assert "ai-people-dropdown" in people_drop
    assert "hover:bg-teal-50" not in people_drop
    assert "text-foreground" in people_drop


def test_parse_uses_high_intelligence_model():
    server = SERVER.read_text(encoding="utf-8")
    assert 'def _task_llm_model()' in server
    assert 'return (os.getenv("TSKFLOW_PARSE_MODEL") or "gpt-4o")' in server
    parse = server.split("async def _llm_parse")[1].split("async def smart_parse_task")[0]
    assert "_task_llm_model()" in parse
    assert 'gpt-4o-mini' not in parse
    voice = server.split("VOICE_ASSISTANT_SYSTEM")[1].split("TSKFLOW_KB")[0] if False else ""
    assert ").with_model(\"openai\", _task_llm_model())" in server
    assert "history: Optional[List[dict]]" in server.split("class QuickCreatePreviewRequest")[1].split("async def quick_create_preview")[0]
    assert "How often should this repeat" in server
    assert "Who should this be assigned to?" in server
    assert "fully-present colleague" in server
