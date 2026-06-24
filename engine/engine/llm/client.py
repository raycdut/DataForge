"""LLM client — chat completion API calls."""
from __future__ import annotations

from typing import Any

import requests


def call_llm(
    messages: list[dict[str, str]],
    model: str = "deepseek-chat",
    api_key: str = "",
    api_base: str = "https://api.deepseek.com",
    temperature: float = 0.1,
    max_tokens: int = 8192,
) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    url = f"{api_base.rstrip('/')}/v1/chat/completions"
    resp = requests.post(url, headers=headers, json=payload, timeout=180)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def build_prompt(system: str, user: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
