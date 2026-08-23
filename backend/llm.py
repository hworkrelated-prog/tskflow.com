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
