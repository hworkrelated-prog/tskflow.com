"""AI prompt bar rotates common use-case examples."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_examples_include_team_outreach_and_cycle():
    src = _read("lib", "promptExamples.js")
    assert "Tell my team to complete the outreach training by 12" in src
    assert "PROMPT_EXAMPLE_INTERVAL_MS" in src
    assert "nextPromptExampleIndex" in src


def test_composer_uses_rotating_placeholder():
    src = _read("components", "AIQuickCreate.js")
    css = _read("index.css")
    assert "PROMPT_EXAMPLES" in src
    assert 'data-testid="ai-prompt-placeholder"' in src
    assert "nextPromptExampleIndex" in src
    assert 'placeholder="Create, search, or go to…"' not in src
    assert "ai-prompt-field" in src
    # Overlay stays inside the field so it cannot paint over attach/Go.
    assert ".ai-prompt-field" in css
    assert "text-overflow: ellipsis" in css
    assert "white-space: nowrap" in css
    assert "-webkit-line-clamp: 2" not in css
    assert "right: 7rem" not in css


def test_next_example_index_wraps():
    script = r"""
import { nextPromptExampleIndex, PROMPT_EXAMPLES } from './frontend/src/lib/promptExamples.js';
if (nextPromptExampleIndex(0) !== 1) process.exit(1);
if (nextPromptExampleIndex(PROMPT_EXAMPLES.length - 1) !== 0) process.exit(1);
if (!PROMPT_EXAMPLES.includes('Tell my team to complete the outreach training by 12')) process.exit(1);
console.log('ok');
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    assert "ok" in result.stdout
