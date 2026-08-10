"""Async Emergent LLM client — avoids blocking the uvicorn event loop."""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional


async def emergent_chat(
    system_message: str,
    user_text: str,
    *,
    model: str = "gpt-4o-mini",
    timeout: float = 12.0,
    temperature: float = 0.2,
) -> Optional[str]:
    """Call Emergent/OpenAI via async litellm.

    emergentintegrations.LlmChat uses sync litellm.completion inside an async
    method, which freezes uvicorn so Jarvis timeouts hang until Cloudflare
    kills the request. This uses acompletion + the same Emergent proxy headers.
    """
    api_key = os.getenv("EMERGENT_LLM_KEY")
    if not api_key:
        return None
    try:
        import litellm
        from emergentintegrations.llm.utils import get_app_identifier, get_integration_proxy_url

        params = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_text},
            ],
            "api_key": api_key,
            "temperature": temperature,
        }
        if api_key.startswith("sk-emergent-"):
            proxy = (get_integration_proxy_url() or "https://integrations.emergentagent.com").rstrip("/")
            params["api_base"] = f"{proxy}/llm"
            params["custom_llm_provider"] = "openai"
            app_id = (
                get_app_identifier()
                or os.getenv("FRONTEND_URL")
                or os.getenv("APP_URL")
                or "https://tskflow.com"
            )
            if app_id:
                params["extra_headers"] = {"X-App-ID": app_id}
        else:
            params["model"] = f"openai/{model}"

        resp = await asyncio.wait_for(litellm.acompletion(**params), timeout=timeout)
        content = None
        if resp and getattr(resp, "choices", None):
            content = resp.choices[0].message.content
        text = (content or "").strip()
        return text or None
    except asyncio.TimeoutError:
        logging.error("Emergent LLM timed out after %.1fs (model=%s)", timeout, model)
        return None
    except Exception as e:
        logging.error("Emergent LLM error: %s", e)
        return None
