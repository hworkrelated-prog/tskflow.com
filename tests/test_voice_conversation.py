"""ChatGPT-style voice: conversation loop, app Q&A, and action coverage."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"
sys.path.insert(0, str(ROOT / "backend"))

from voice_intents import match_local_voice_intent  # noqa: E402


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_local_intents_cover_app_actions():
    hi = match_local_voice_intent("hey")
    assert hi["action"]["type"] == "assistant_answer"
    assert "what do you want" in hi["reply"].lower()

    can = match_local_voice_intent("what can you do")
    assert "chatgpt" in can["reply"].lower() or "talk" in can["reply"].lower()
    assert "unbiassly" in can["reply"].lower() or "recording" in can["reply"].lower() or "page" in can["reply"].lower()

    nav = match_local_voice_intent("open analytics")
    assert nav["action"] == {"type": "navigate", "params": {"target": "analytics"}}

    for phrase, target in (
        ("go to activity", "activity"),
        ("open transcript", "transcript"),
        ("take me to unbiassly", "unbiassly"),
        ("open calendar", "calendar"),
        ("show recordings", "recordings"),
        ("go to help", "help"),
        ("open leaderboard", "leaderboard"),
    ):
        hit = match_local_voice_intent(phrase)
        assert hit, phrase
        assert hit["action"]["type"] == "navigate", phrase
        assert hit["action"]["params"]["target"] == target, phrase

    search = match_local_voice_intent("search for the vendor recap")
    assert search["action"]["type"] == "search"
    assert "vendor recap" in search["action"]["params"]["query"]

    rec = match_local_voice_intent("record my screen")
    assert rec["action"]["type"] == "start_recording"

    series = match_local_voice_intent("create a recurring task")
    assert series["action"]["type"] == "start_recurring"

    form = match_local_voice_intent("full form")
    assert form["action"]["type"] == "open_form"

    howto = match_local_voice_intent("how do I assign a task")
    assert howto["action"]["type"] == "assistant_answer"
    assert "send" in howto["reply"].lower()

    find_out = match_local_voice_intent("find out how to assign a task")
    assert find_out and find_out["action"]["type"] == "assistant_answer"

    assert match_local_voice_intent("ask Alice to open analytics by Friday") is None


def test_kb_and_prompt_are_chatgpt_like_and_complete():
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "Talk the way ChatGPT Voice talks" in server
    assert "start_recording" in server
    assert "start_recurring" in server
    assert "open_form" in server
    assert "json_mode=True" in server.split("VOICE_ASSISTANT_SYSTEM", 1)[-1][:800] or "json_mode=True" in server
    for needle in (
        "Unbiassly",
        "Transcript import",
        "Google Calendar",
        "Google Sheets",
        "Hound",
        "Activity log",
        "ChatGPT Voice",
        "/unbiassly",
        "/transcript",
        "/connect-calendar",
    ):
        assert needle in server, needle


def test_prompt_bar_is_a_chatgpt_conversation():
    src = _read("components", "AIQuickCreate.js")
    helper = _read("lib", "voiceActions.js")
    css = (ROOT / "frontend" / "src" / "index.css").read_text(encoding="utf-8")
    assert "speakChatGptVoice" in src
    assert "stopChatGptVoice" in src
    assert "handleVoiceTurn" in src
    assert "continueListening" in src
    assert "endVoiceConversation" in src
    assert "voiceSession" in src
    assert "Start voice conversation" in src
    assert "Talk like ChatGPT" in src
    assert 'data-testid="ai-voice-status"' in src
    assert "shouldComposeTask" in src
    assert "applyVoiceAction" in src
    assert "start_recording" in src
    assert "start_recurring" in helper
    assert "routeForVoiceTarget" in helper
    assert "/unbiassly" in helper
    assert "/connect-calendar" in helper
    assert "is-speaking" in css
    assert "is-speaking" in src


def test_voice_actions_helper():
    script = r"""
import { applyVoiceAction, shouldComposeTask, routeForVoiceTarget, VOICE_ROUTES } from './frontend/src/lib/voiceActions.js';

if (routeForVoiceTarget('analytics') !== '/analytics') process.exit(2);
if (routeForVoiceTarget('unbiassly') !== '/unbiassly') process.exit(3);
if (routeForVoiceTarget('calendar') !== '/connect-calendar') process.exit(4);
if (!VOICE_ROUTES.transcript) process.exit(5);

if (shouldComposeTask('create a recurring task')) process.exit(13);
if (shouldComposeTask('ask Alice to send the recap by Friday') === false) process.exit(14);
if (shouldComposeTask('how do I assign a task?')) process.exit(7);
if (shouldComposeTask('open analytics')) process.exit(8);
if (shouldComposeTask('hey')) process.exit(9);

const navs = [];
applyVoiceAction({ type: 'navigate', params: { target: 'activity' } }, {
  navigate: (p) => navs.push(p),
  delay: 0,
});
if (navs[0] !== '/activity') process.exit(10);

const searches = [];
applyVoiceAction({ type: 'search', params: { query: 'vendor recap' } }, {
  navigate: (p) => searches.push(p),
});
if (!String(searches[0]).includes('q=vendor')) process.exit(11);

let rec = false;
applyVoiceAction({ type: 'start_recording', params: {} }, { startRecording: () => { rec = true; } });
if (!rec) process.exit(12);

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


def test_help_center_describes_chatgpt_voice():
    help_src = _read("pages", "HelpCenter.js")
    assert "like ChatGPT" in help_src
    assert "keeps listening" in help_src or "keep listening" in help_src
