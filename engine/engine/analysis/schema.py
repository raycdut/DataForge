"""Schema discovery — list tables, columns, relationships from DB."""
from __future__ import annotations

from typing import Any

from ..db import Database


def describe_schema(db: Database, schema: str | None = None) -> list[dict[str, Any]]:
    """Full schema breakdown: tables + columns + PKs + FKs."""
    tables = db.get_tables(schema=schema)
    result = []
    for tbl in tables:
        cols = db.get_columns(tbl["name"], schema=tbl["schema"])
        pk = db.get_primary_keys(tbl["name"], schema=tbl["schema"])
        fks = db.get_foreign_keys(tbl["name"], schema=tbl["schema"])
        result.append({
            "table": tbl["name"],
            "schema": tbl["schema"],
            "type": tbl["type"],
            "columns": cols,
            "primary_key": pk,
            "foreign_keys": fks,
        })
    return result


def schema_to_text(tables: list[dict[str, Any]]) -> str:
    """Render schema as plain text — great for LLM context."""
    lines = []
    for t in tables:
        lines.append(f"\n## {t['schema']}.{t['table']} ({t['type']})")
        for c in t["columns"]:
            flags = []
            if c.get("pk"):
                flags.append("PK")
            if not c.get("nullable", True):
                flags.append("NOT NULL")
            if c.get("comment"):
                flags.append(c["comment"])
            tag = f" [{','.join(flags)}]" if flags else ""
            lines.append(f"  - {c['name']}: {c['type']}{tag}")
        for fk in t.get("foreign_keys", []):
            lines.append(f"  FK: {','.join(fk['columns'])} → {fk['ref_schema']}.{fk['ref_table']}({','.join(fk['ref_columns'])})")
    return "\n".join(lines)
