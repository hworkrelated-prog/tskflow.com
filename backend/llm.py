"""Shared OpenAI chat helper for TskFlow backend LLM calls."""
from __future__ import annotations

import asyncio
import os
from typing import List, Optional

from openai import AsyncOpenAI

_client: Optional[AsyncOpenAI] = None


def get_openai_api_key() -> Optional[str]:
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    return key or None


def _client_for(api_key: str) -> AsyncOpenAI:
    global _client
    # Reuse a process-wide client when the key matches; rebuild if env key changes.
    if _client is None or getattr(_client, "_tskflow_api_key", None) != api_key:
        _client = AsyncOpenAI(api_key=api_key)
        _client._tskflow_api_key = api_key  # type: ignore[attr-defined]
    return _client


async def chat_complete(
    *,
    model: str,
    user: str,
    system: Optional[str] = None,
    timeout: Optional[float] = None,
    json_mode: bool = False,
    api_key: Optional[str] = None,
) -> str:
    """
    Run a single chat completion and return the assistant text.

    Raises if the API key is missing or the request fails — callers keep their
    existing try/except fallbacks. When timeout is set, raises asyncio.TimeoutError
    (same as the previous wait_for wrappers).
    """
    key = (api_key or get_openai_api_key() or "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    messages: List[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": user})

    kwargs = {
        "model": model,
        "messages": messages,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    client = _client_for(key)

    async def _run():
        resp = await client.chat.completions.create(**kwargs)
        content = resp.choices[0].message.content if resp.choices else None
        return (content or "").strip()

    if timeout is not None:
        return await asyncio.wait_for(_run(), timeout=float(timeout))
    return await _run()


# Closest public stand-in for ChatGPT Voice. Advanced Voice (Sol, Cove, ...)
# is realtime-only and is not in this API. Nova + gpt-4o-mini-tts is the same
# stack ChatGPT's standard voice used; the March snapshot follows delivery
# instructions more closely if the alias is flat.
CHATGPT_TTS_MODEL = "gpt-4o-mini-tts"
CHATGPT_TTS_EXPRESSIVE_MODEL = "gpt-4o-mini-tts-2025-03-20"
CHATGPT_TTS_FALLBACK_MODEL = "tts-1-hd"
CHATGPT_TTS_VOICE = "nova"
CHATGPT_TTS_INSTRUCTIONS = (
    "Speak exactly like ChatGPT Voice, default Nova. Same timbre, warmth, "
    "and pacing as the ChatGPT app. American English, close-mic, slightly "
    "breathy, relaxed mid-tempo. Talk to one person across a table. "
    "Natural contractions. Statements fall at the end; questions lift a little. "
    "Warm and even, not bubbly, not dramatic, not a narrator, GPS, or IVR."
)


async def synthesize_speech(
    text: str,
    *,
    timeout: Optional[float] = 20,
    api_key: Optional[str] = None,
) -> bytes:
    """Return MP3 bytes from OpenAI TTS. Raises if the key is missing or the call fails."""
    key = (api_key or get_openai_api_key() or "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    spoken = " ".join((text or "").split()).strip()
    if not spoken:
        raise ValueError("empty speech text")

    client = _client_for(key)

    async def _run(model: str, with_instructions: bool):
        kwargs = {
            "model": model,
            "voice": CHATGPT_TTS_VOICE,
            "input": spoken,
            "response_format": "mp3",
        }
        if with_instructions:
            kwargs["instructions"] = CHATGPT_TTS_INSTRUCTIONS
        if model.startswith("tts-"):
            kwargs["speed"] = 0.97
        resp = await client.audio.speech.create(**kwargs)
        data = getattr(resp, "content", None)
        if data is None and hasattr(resp, "read"):
            data = await resp.read()
        if not data:
            raise RuntimeError("empty TTS audio")
        return data

    attempts = (
        (CHATGPT_TTS_MODEL, True),
        (CHATGPT_TTS_EXPRESSIVE_MODEL, True),
        (CHATGPT_TTS_FALLBACK_MODEL, False),
    )

    async def _try():
        last_err: Optional[BaseException] = None
        for model, with_instructions in attempts:
            try:
                return await _run(model, with_instructions)
            except Exception as err:
                last_err = err
        raise last_err or RuntimeError("TTS failed")

    if timeout is not None:
        return await asyncio.wait_for(_try(), timeout=float(timeout))
    return await _try()
