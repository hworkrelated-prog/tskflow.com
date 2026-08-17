"""Task detail page: mobile-readable title, badges, due date, description."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_task_detail_stacks_title_and_badges():
    src = _read("pages", "TaskDetail.js")
    assert "displayTaskTitle(task.title)" in src
    assert 'data-testid="task-title"' in src
    assert "text-2xl sm:text-3xl" in src
    assert "leading-snug" in src
    assert 'data-testid="task-badges"' in src
    assert "text-4xl" not in src
    assert "FormattedTaskDescription" in src
    assert "formatTaskDue" in src
    assert "grid-cols-2 md:grid-cols-3" not in src
    assert "grid-cols-1 sm:grid-cols-2" in src
    assert 'data-testid="from-transcript-chip"' in src
    assert "is_sales_task && String(task.category)" in src
    assert "dangerouslySetInnerHTML={{ __html: task.description }}" not in src


def test_formatted_description_component_exists():
    src = _read("components", "FormattedTaskDescription.js")
    assert "parseDescriptionBlocks" in src
    assert "list-decimal" in src
    assert "text-foreground" in src
    assert 'data-testid={testId}' in src or 'data-testid="task-description"' in src


def test_task_card_uses_display_title():
    src = _read("components", "TaskCard.js")
    assert "displayTaskTitle(task.title)" in src


def test_quick_create_does_not_prefix_sentences():
    src = _read("components", "AIQuickCreate.js")
    assert "fallbackTaskTitle" in src
    assert "displayTaskTitle(title)" in src
    assert "Complete ${cleaned}" not in src


def test_task_response_exposes_source():
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    model = server.split("class TaskResponse")[1].split("class TaskAction")[0]
    assert "source: Optional[str]" in model
    assert "source=task.get(\"source\")" in server
