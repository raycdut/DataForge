"""DataForge engine config — persistent settings in ~/.dataforge/config.json"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

DF_HOME = Path(os.environ.get("DATAFORGE_HOME", Path.home() / ".dataforge"))
CONFIG_FILE = DF_HOME / "config.json"


def _ensure_home() -> None:
    DF_HOME.mkdir(parents=True, exist_ok=True)


def load_config() -> dict[str, Any]:
    _ensure_home()
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text())
    return {
        "llm_provider": "deepseek",
        "llm_model": "deepseek-chat",
        "llm_api_base": "https://api.deepseek.com",
        "llm_api_key": os.environ.get("DEEPSEEK_API_KEY", ""),
    }


def save_config(cfg: dict[str, Any]) -> None:
    _ensure_home()
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
