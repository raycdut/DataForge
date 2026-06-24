"""Data profiling — column stats, null rates, distributions."""
from __future__ import annotations

from typing import Any

from . import Database


def profile_table(db: Database, table: str, schema: str | None = None) -> dict[str, Any]:
    columns = db.get_columns(table, schema=schema)
    row_count = db.get_row_count(table, schema=schema)
    pk_cols = db.get_primary_keys(table, schema=schema)
    fk_list = db.get_foreign_keys(table, schema=schema)
    sample = db.sample_rows(table, schema=schema, limit=3)

    col_profiles = []
    for col in columns:
        col_profiles.append(_profile_column(db, table, col, schema))

    fqn = f'"{schema}"."{table}"' if schema else f'"{table}"'
    return {
        "table": table, "schema": schema or "public", "fqn": fqn,
        "row_count": row_count, "column_count": len(columns),
        "columns": col_profiles,
        "primary_keys": pk_cols, "foreign_keys": fk_list,
        "sample_rows": sample[:3] if sample else [],
        "size_estimate": _estimate_size(row_count, columns),
    }


def _profile_column(db: Database, table: str, col: dict[str, Any], schema: str | None = None) -> dict[str, Any]:
    name = col["name"]
    fqn = f'"{schema}"."{table}"' if schema else f'"{table}"'
    result: dict[str, Any] = {
        "name": name, "type": col["type"],
        "nullable": col.get("nullable", True), "is_pk": col.get("pk", False),
    }
    try:
        nulls = db.execute(f'SELECT COUNT(*) AS cnt FROM {fqn} WHERE "{name}" IS NULL')
        result["null_count"] = nulls[0]["cnt"] if nulls else 0
        distinct = db.execute(f'SELECT COUNT(DISTINCT "{name}") AS cnt FROM {fqn}')
        result["distinct_count"] = distinct[0]["cnt"] if distinct else 0

        lower = col["type"].lower()
        if any(t in lower for t in ("int", "float", "double", "decimal", "numeric", "number")):
            stats = db.execute(f'SELECT MIN("{name}") AS min_val, MAX("{name}") AS max_val, AVG("{name}") AS avg_val FROM {fqn}')
            if stats:
                result["min"] = stats[0].get("min_val")
                result["max"] = stats[0].get("max_val")
                result["avg"] = stats[0].get("avg_val")
        elif any(t in lower for t in ("char", "text", "varchar", "date", "timestamp")):
            stats = db.execute(f'SELECT MIN(LENGTH(CAST("{name}" AS TEXT))) AS min_len, MAX(LENGTH(CAST("{name}" AS TEXT))) AS max_len FROM {fqn}')
            if stats:
                result["min_length"] = stats[0].get("min_len")
                result["max_length"] = stats[0].get("max_len")
    except Exception as e:
        result["_error"] = str(e)
    return result


def _estimate_size(row_count: int, columns: list) -> str:
    if row_count <= 0:
        return "unknown"
    est = row_count * max(len(columns) * 8, 64)
    if est < 1024 * 1024:
        return f"{est / 1024:.0f} KB"
    elif est < 1024 * 1024 * 1024:
        return f"{est / 1024 / 1024:.0f} MB"
    else:
        return f"{est / 1024 / 1024 / 1024:.1f} GB"
