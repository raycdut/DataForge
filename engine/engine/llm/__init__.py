"""LLM module for DataForge engine."""
from __future__ import annotations

from typing import Any

from .client import call_llm, build_prompt


def get_modeling_suggestions(schema_text: str, relations: list[dict], api_key: str, api_base: str, model: str) -> str:
    """Ask LLM for star-schema modeling suggestions."""
    prompt = build_prompt(
        system="You are a data modeling expert. Given a database schema and its table relationships, suggest an optimal star-schema model for analytics. Output as JSON array of model definitions.",
        user=f"Schema:\n{schema_text}\n\nRelations:\n{relations}\n\nSuggest star-schema models.",
    )
    return call_llm(prompt, api_key=api_key, api_base=api_base, model=model, temperature=0.1)
