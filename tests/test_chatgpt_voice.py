"""Spoken replies use OpenAI Nova TTS, ChatGPT's public voice."""
import asyncio
import subprocess
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import live_app  # noqa: E402
from llm import (  # noqa: E402
    CHATGPT_TTS_EXPRESSIVE_MODEL,
    CHATGPT_TTS_FALLBACK_MODEL,
    CHATGPT_TTS_INSTRUCTIONS,
    CHATGPT_TTS_MODEL,
    CHATGPT_TTS_VOICE,
    synthesize_speech,
)


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_tts_uses_chatgpt_nova_stack():
    assert CHATGPT_TTS_VOICE == "nova"
    assert CHATGPT_TTS_MODEL == "gpt-4o-mini-tts"
    assert CHATGPT_TTS_EXPRESSIVE_MODEL == "gpt-4o-mini-tts-2025-03-20"
    assert CHATGPT_TTS_FALLBACK_MODEL == "tts-1-hd"
    assert "chatgpt voice" in CHATGPT_TTS_INSTRUCTIONS.lower()
    assert "nova" in CHATGPT_TTS_INSTRUCTIONS.lower()
    assert "\u2014" not in CHATGPT_TTS_INSTRUCTIONS

    llm_src = (ROOT / "backend" / "llm.py").read_text(encoding="utf-8")
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "synthesize_speech" in llm_src
    assert "/voice/speak" in server
    assert "get_optional_user" in server
    assert "audio/mpeg" in server


def test_spoken_ui_uses_nova_tts_not_the_browser_robot():
    helper = _read("lib", "chatGptVoice.js")
    guide = _read("components", "LandingVoiceGuide.js")
    voice = _read("components", "VoiceMode.js")
    center = _read("components", "VoiceCommandCenter.js")
    assert "speakChatGptVoice" in helper
    assert "/voice/speak" in helper
    assert "fetch(" in helper
    assert "axios" not in helper
    assert "speakChatGptVoice" in guide
    assert "/voice/command" not in guide
    assert "speakChatGptVoice" in voice
    assert "speakChatGptVoice" in center
    create = _read("components", "AIQuickCreate.js")
    assert "speakChatGptVoice" in create
    assert "handleVoiceTurn" in create
    assert "window.speechSynthesis.speak" not in voice
    assert "window.speechSynthesis.speak" not in guide
    assert "window.speechSynthesis.speak" not in center


def test_synthesize_speech_requires_key_and_text(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        asyncio.run(synthesize_speech("Type the ask."))

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    with pytest.raises(ValueError, match="empty"):
        asyncio.run(synthesize_speech("   "))


def test_voice_helper_picks_natural_fallback_and_posts_speak():
    script = r"""
globalThis.window = {
  speechSynthesis: {
    getVoices: () => [
      { name: 'Zarvox', lang: 'en-US' },
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Compact eSpeak', lang: 'en-GB' },
    ],
    cancel() { window.speechSynthesis.cancelled = true; },
    speak(u) { window.speechSynthesis.last = u; },
  },
  SpeechSynthesisUtterance: function (t) { this.text = t; },
};
globalThis.localStorage = { getItem: () => null };
const played = [];
globalThis.Audio = class {
  constructor() { this.src = ''; this.currentTime = 0; }
  async play() { played.push(this.src); this.onplay?.(); }
  pause() {}
};
const blobs = [];
globalThis.URL.createObjectURL = (b) => { blobs.push(b); return 'blob:tts'; };
globalThis.URL.revokeObjectURL = () => {};
const fetches = [];
globalThis.fetch = async (url, opts) => {
  fetches.push({ url, opts });
  return { ok: true, blob: async () => new Blob([new Uint8Array(120)]) };
};

const {
  pickChatGptLikeVoice,
  cleanSpeechText,
  speakChatGptVoice,
} = await import('./frontend/src/lib/chatGptVoice.js');

if (cleanSpeechText('  **Hello** • world  ') !== 'Hello world') process.exit(2);
if (pickChatGptLikeVoice().name !== 'Samantha') process.exit(3);

await speakChatGptVoice('Type the ask. Add who it is for.');
if (fetches.length !== 1) process.exit(4);
if (!String(fetches[0].url).endsWith('/voice/speak')) process.exit(5);
if (fetches[0].opts.method !== 'POST') process.exit(6);
const body = JSON.parse(fetches[0].opts.body);
if (body.text !== 'Type the ask. Add who it is for.') process.exit(7);
if (!played.some((src) => src === 'blob:tts')) process.exit(8);
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


def test_guest_can_speak_short_lines_without_auth():
    server = live_app.app_or_skip()
    import llm

    fake_mp3 = b"ID3" + b"\x00" * 200
    original = llm.synthesize_speech

    async def fake_synth(text, **kwargs):
        assert "Type the ask" in text
        return fake_mp3

    llm.synthesize_speech = fake_synth
    try:
        async def scenario():
            async with live_app.client(server) as api:
                empty = await api.post("/api/voice/speak", json={"text": "  "})
                assert empty.status_code == 400

                long = await api.post("/api/voice/speak", json={"text": "x" * 321})
                assert long.status_code == 400

                ok = await api.post(
                    "/api/voice/speak",
                    json={"text": "Type the ask. Add who it is for."},
                    headers=live_app.caller_headers("speak-ok"),
                )
                assert ok.status_code == 200, ok.text
                assert ok.headers["content-type"].startswith("audio/mpeg")
                assert ok.content == fake_mp3

                llm.synthesize_speech = AsyncMock(side_effect=RuntimeError("no key"))
                down = await api.post(
                    "/api/voice/speak",
                    json={"text": "Type the ask."},
                    headers=live_app.caller_headers("speak-down"),
                )
                assert down.status_code == 503

                llm.synthesize_speech = fake_synth
                server._speak_hits.clear()
                flood_headers = live_app.caller_headers("speak-flood")
                for _ in range(24):
                    hit = await api.post(
                        "/api/voice/speak",
                        json={"text": "Type the ask."},
                        headers=flood_headers,
                    )
                    assert hit.status_code == 200, hit.text
                blocked = await api.post(
                    "/api/voice/speak",
                    json={"text": "Type the ask."},
                    headers=flood_headers,
                )
                assert blocked.status_code == 429

        live_app.run(scenario())
    finally:
        llm.synthesize_speech = original
