"""Relationship inference — FK constraints, naming conventions, data verification."""
from __future__ import annotations

from typing import Any

from ..db import Database


def infer_relations(db: Database, tables: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Discover relationships across all tables.

    Three levels (increasing confidence):
    1. Explicit FK constraints
    2. Naming convention (same field name + matching type)
    3. Data verification (sample check values match)
    """
    relations = []

    # Build column index: (schema, table) -> {col_name: type}
    col_index: dict[tuple[str, str], dict[str, str]] = {}
    for t in tables:
        key = (t["schema"], t["table"])
        col_index[key] = {c["name"]: c["type"] for c in t["columns"]}

    # Level 1: FK constraints
    for t in tables:
        for fk in t.get("foreign_keys", []):
            relations.append({
                "type": "explicit_fk",
                "source_table": f"{t['schema']}.{t['table']}",
                "source_columns": fk["columns"],
                "target_table": f"{fk['ref_schema']}.{fk['ref_table']}",
                "target_columns": fk["ref_columns"],
                "confidence": "high",
            })

    # Level 2: Naming convention — find FK-like field names
    for t in tables:
        key = (t["schema"], t["table"])
        cols = col_index[key]
        for c_name, c_type in cols.items():
            # Pattern: "something_id" suggests FK
            if c_name.endswith("_id") and c_name != "id":
                target_name = c_name.replace("_id", "")  # e.g., customer_id → customer
                # Find matching table: `customers` or `customer`
                potential_targets = []
                for (ts, tt), tcols in col_index.items():
                    if ts == t["schema"] and tt in (target_name, target_name + "s", target_name + "es"):
                        if "id" in tcols:
                            potential_targets.append(f"{ts}.{tt}")

                for target in potential_targets:
                    # Check not already covered by explicit FK
                    already = any(
                        r["source_table"] == f"{t['schema']}.{t['table']}"
                        and r["target_table"] == target
                        and c_name in r["source_columns"]
                        for r in relations
                    )
                    if not already:
                        relations.append({
                            "type": "inferred_naming",
                            "source_table": f"{t['schema']}.{t['table']}",
                            "source_columns": [c_name],
                            "target_table": target,
                            "target_columns": ["id"],
                            "confidence": "medium",
                        })

    # Level 3: Data verification — sample check inferred relations
    for r in relations:
        if r["type"] != "inferred_naming":
            continue
        try:
            src_col = r["source_columns"][0]
            tgt_col = r["target_columns"][0]
            src_tbl = r["source_table"].split(".", 1)
            tgt_tbl = r["target_table"].split(".", 1)
            src_q = f'"{src_tbl[0]}"."{src_tbl[1]}"'
            tgt_q = f'"{tgt_tbl[0]}"."{tgt_tbl[1]}"'

            sample = db.execute(f"""
                SELECT COUNT(*) AS cnt FROM {src_q} s
                WHERE s."{src_col}" IS NOT NULL
                AND NOT EXISTS (
                    SELECT 1 FROM {tgt_q} t WHERE t."{tgt_col}" = s."{src_col}"
                )
            """)
            orphans = sample[0]["cnt"] if sample else -1
            r["orphan_count"] = orphans
            if orphans == 0:
                r["confidence"] = "high"
                r["type"] = "verified"
            elif orphans and orphans < 100:
                r["confidence"] = "medium"
            else:
                r["confidence"] = "low"
        except Exception:
            r["_verify_error"] = "verify_failed"

    return relations
