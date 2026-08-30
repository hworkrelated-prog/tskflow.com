"""Help and assign share one ChatGPT-style thread in the prompt bar."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_thread_has_no_you_asked_chrome():
    src = _read("components", "AIQuickCreate.js")
    assert "You asked" not in src
    assert "Ask another question or create a task" not in src
    assert 'data-testid="ai-qa-answer"' not in src
    assert 'data-testid="ai-chat-thread"' in src
    assert "ai-thread-user" in src
    assert "ai-thread-assistant" in src
    assert "appendThread" in src
    assert "skipThreadUser" in src
    assert "/voice/command" in src
    assert "history" in src


def test_jarvis_mark_is_not_in_the_prompt_toolbar():
    src = _read("components", "AIQuickCreate.js")
    toolbar = src[src.index("relative z-[1] flex items-center justify-between") : src.index("ai-inline-recorder")]
    assert 'data-testid="ai-jarvis-mark"' not in src
    assert "JarvisIcon" not in src
    assert 'data-testid="ai-plus-btn"' in toolbar
    assert 'data-testid="ai-prompt-voice-btn"' in toolbar


def test_integrated_voice_mode_renders_no_fab():
    app = _read("App.js")
    voice = _read("components", "VoiceMode.js")
    assert "<VoiceMode dockIntegrated />" in app
    assert "voice-mode-fab" not in app
    assert "Rook lives in the prompt bar" in voice
    assert "return null" in voice.split("Rook lives in the prompt bar")[1][:220]
    assert "tskflow:start-prompt-voice" in voice
    assert "tskflow:start-prompt-voice" in _read("components", "AIQuickCreate.js")


def test_help_center_points_at_the_prompt_bar():
    help_src = _read("pages", "HelpCenter.js")
    assert "J orb" not in help_src
    assert "bottom-right" not in help_src
    assert "Rook is in the prompt" in help_src or "Rook lives in the prompt" in help_src


def test_degraded_voice_reply_stays_in_the_bar():
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "full brain" not in server
    assert "New Task on the left" not in server
    assert "I’ll send it and follow up if they go quiet." in server
    chunk = server.split("I can still help from here.", 1)[1][:500]
    assert "Slack" not in chunk


def test_thread_stays_open_after_send():
    src = _read("components", "AIQuickCreate.js")
    assert "keepThread" in src
    assert "sentTaskFollowupMessage" in src
    assert "I’ll Slack them" not in src and "I'll Slack them" not in src
    dock = _read("components", "GlobalAIDock.js")
    created = dock[dock.index("onCreated={() => {") : dock.index("onOpenAdvanced")]
    assert "setActive(false)" not in created
