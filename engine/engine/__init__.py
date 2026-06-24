"""DataForge engine — JSON-RPC stdin/stdout interface.

Protocol: each line is a JSON-RPC request, response on stdout.
For sidecar use: Tauri spawns this as a long-lived process.
"""
from __future__ import annotations

import json
import sys
from typing import Any

from .db.connector import Database, register, close_all
from .db.profiler import profile_table
from .analysis.schema import describe_schema, schema_to_text
from .analysis.relations import infer_relations
from .llm.client import call_llm, build_prompt
from .dbt.generator import generate_dbt_project
from .config import load_config


def handle_request(req: dict[str, Any]) -> dict[str, Any]:
    method = req.get("method", "")
    params = req.get("params", {})

    if method == "ping":
        return {"result": "pong"}

    if method == "connect":
        dsn = params["dsn"]
        name = params.get("name", "default")
        db = Database(dsn, name=name)
        ok = db.test()
        if ok:
            register(name, db)
            return {"result": {"connected": True, "name": name, "dsn": dsn}}
        return {"result": {"connected": False, "error": "Connection failed"}}

    if method == "schema":
        name = params.get("connection", "default")
        db = _get_db(name)
        schema = params.get("schema")
        tables = describe_schema(db, schema=schema)
        return {"result": tables}

    if method == "profile":
        name = params.get("connection", "default")
        db = _get_db(name)
        table = params["table"]
        schema = params.get("schema")
        result = profile_table(db, table, schema=schema)
        return {"result": result}

    if method == "relations":
        name = params.get("connection", "default")
        db = _get_db(name)
        schema = params.get("schema")
        tables = describe_schema(db, schema=schema)
        relations = infer_relations(db, tables)
        return {"result": relations}

    if method == "analyze":
        """Full analysis: schema + relations + quality summary for LLM context."""
        name = params.get("connection", "default")
        db = _get_db(name)
        schema = params.get("schema")
        tables = describe_schema(db, schema=schema)
        relations = infer_relations(db, tables)
        schema_text = schema_to_text(tables)

        # Build LLM prompt for modeling suggestions
        prompt = build_prompt(
            system="You are a data modeling expert. Given a database schema, suggest an optimal star-schema model. Output as a JSON array of model definitions, each with: name, type (fact/dimension), columns (name, type, source_table, source_column, description), and relationships.",
            user=f"Here is the database schema:\n\n{schema_text}\n\nRelationships:\n{json.dumps(relations, indent=2)}\n\nSuggest a star-schema data model for analytics."
        )
        cfg = load_config()
        llm_response = call_llm(
            prompt,
            api_key=cfg.get("llm_api_key", ""),
            api_base=cfg.get("llm_api_base", "https://api.deepseek.com"),
            model=cfg.get("llm_model", "deepseek-chat"),
        )

        return {"result": {
            "schema": tables,
            "relations": relations,
            "llm_suggestion": llm_response,
        }}

    if method == "generate":
        """Generate dbt project from analysis."""
        name = params.get("connection", "default")
        db = _get_db(name)
        schema = params.get("schema")
        output_dir = params.get("output_dir", "./dataforge_output")
        tables = describe_schema(db, schema=schema)
        relations = infer_relations(db, tables)
        result = generate_dbt_project(tables, relations, output_dir)
        return {"result": result}

    if method == "config":
        cfg = load_config()
        if "key" in params:
            cfg[params["key"]] = params["value"]
            from .config import save_config
            save_config(cfg)
        return {"result": cfg}

    if method == "disconnect":
        name = params.get("connection", "default")
        from .db.connector import _registry
        if name in _registry:
            _registry[name].close()
            del _registry[name]
        return {"result": f"Disconnected {name}"}

    return {"error": f"Unknown method: {method}"}


def _get_db(name: str = "default") -> Database:
    from .db.connector import get
    db = get(name)
    if not db:
        raise ValueError(f"Not connected. Use connect first.")
    return db


def main():
    """Stdin/stdout JSON-RPC loop."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            resp = handle_request(req)
        except Exception as e:
            resp = {"error": str(e)}
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
