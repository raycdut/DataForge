"""dbt project generator — turn schema + relations into ready-to-run dbt models."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def generate_dbt_project(
    tables: list[dict[str, Any]],
    relations: list[dict[str, Any]],
    output_dir: str,
    project_name: str = "dataforge_project",
) -> dict[str, Any]:
    """Generate a complete dbt project.

    Returns summary of what was created.
    """
    base = Path(output_dir)
    models_dir = base / "models"
    models_staging = models_dir / "staging"
    models_marts = models_dir / "marts"

    for d in [base, models_dir, models_staging, models_marts]:
        d.mkdir(parents=True, exist_ok=True)

    # ── dbt_project.yml ──
    _write(base / "dbt_project.yml", _dbt_project_yml(project_name))

    # ── sources.yml ──
    sources = _build_sources(tables)
    _write(models_dir / "sources.yml", _yaml_dump({"sources": sources}))

    # ── Staging models (one per source table) ──
    stg_models = []
    for t in tables:
        sql = _stg_model_sql(t)
        fname = f"stg_{t['table']}.sql"
        _write(models_staging / fname, sql)
        stg_models.append({"name": f"stg_{t['table']}", "file": f"models/staging/{fname}"})

    # ── Marts models (AI-generated, here simple passthroughs) ──
    marts = []
    fact_tables = _suggest_facts(tables, relations)
    for ft in fact_tables:
        sql = _marts_model_sql(ft, relations)
        fname = ft["model_file"]
        _write(models_marts / fname, sql)
        marts.append({"name": ft["model_name"], "file": f"models/marts/{fname}"})

    # ── schema.yml for docs & tests ──
    schema_yml = _build_schema_yml(tables, fact_tables)
    _write(models_dir / "schema.yml", _yaml_dump(schema_yml))

    return {
        "project": project_name,
        "output_dir": str(base),
        "staging_models": len(stg_models),
        "marts_models": len(marts),
        "files": [f"models/{f}" for f in os.listdir(models_dir)]
            + [f"models/staging/{f}" for f in os.listdir(models_staging)]
            + [f"models/marts/{f}" for f in os.listdir(models_marts)],
    }


def _write(path: Path, content: str) -> None:
    path.write_text(content)


def _yaml_dump(data: Any) -> str:
    """Simple YAML-like dumper — avoids pyyaml dependency for now."""
    def _dump(obj, indent=0):
        pad = "  " * indent
        lines = []
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, (dict, list)):
                    lines.append(f"{pad}{k}:")
                    lines.extend(_dump(v, indent + 1))
                else:
                    lines.append(f"{pad}{k}: {_yaml_val(v)}")
        elif isinstance(obj, list):
            for item in obj:
                if isinstance(item, (dict, list)):
                    lines.append(f"{pad}-")
                    sub = _dump(item, indent + 1)
                    lines.extend(sub if sub else [f"{pad}  {{}}"])
                else:
                    lines.append(f"{pad}- {_yaml_val(item)}")
        return lines
    return "\n".join(_dump(data))


def _yaml_val(v: Any) -> str:
    if isinstance(v, str):
        if ":" in v or v.startswith(("{", "[", ">", "|", "'", '"')):
            return json.dumps(v, ensure_ascii=False)
        return v
    return str(v).lower() if isinstance(v, bool) else str(v)


def _dbt_project_yml(name: str) -> str:
    return f"""name: '{name}'
version: '1.0.0'
config-version: 2

profile: '{name}'

model-paths: ["models"]
seed-paths: ["seeds"]
test-paths: ["tests"]
analysis-paths: ["analyses"]
macro-paths: ["macros"]

clean-targets:
  - "target"
  - "dbt_packages"

models:
  {name}:
    staging:
      +materialized: view
      +tags: ["staging"]
    marts:
      +materialized: table
      +tags: ["marts"]
"""


def _build_sources(tables: list) -> list:
    sources = {}
    for t in tables:
        sch = t["schema"]
        if sch not in sources:
            sources[sch] = {
                "name": sch,
                "database": "raw",
                "schema": sch,
                "tables": [],
            }
        sources[sch]["tables"].append({
            "name": t["table"],
            "description": f"Raw {t['type']}: {t['table']}",
            "columns": [{"name": c["name"], "description": ""} for c in t["columns"]],
        })
    return list(sources.values())


def _stg_model_sql(t: dict) -> str:
    """Generate a staging model — rename, cast types."""
    indent = "        "
    col_lines = [f"{indent}{c['name']}" for c in t["columns"]]
    sep = ",\n"
    source_ref = f"{{{{ source('{t['schema']}', '{t['table']}') }}}}"
    return f"""-- staging model for {t['schema']}.{t['table']}
with source as (
    select * from {source_ref}
),

renamed as (
    select
{sep.join(col_lines)}
    from source
)

select * from renamed
"""


def _suggest_facts(tables: list, relations: list) -> list[dict]:
    """Heuristic: tables with most FKs are likely fact tables."""
    scored = []
    for t in tables:
        fqn = f"{t['schema']}.{t['table']}"
        fk_count = len(t.get("foreign_keys", []))
        # Count FK references to this table
        ref_count = sum(1 for r in relations if r["target_table"] == fqn if r["type"] in ("explicit_fk", "verified"))
        score = fk_count + ref_count
        if "order" in t["table"].lower() or "fact" in t["table"].lower() or "sale" in t["table"].lower():
            score += 5
        scored.append((score, t))

    scored.sort(reverse=True, key=lambda x: x[0])
    result = []
    for score, t in scored[:3]:  # top 3
        if score < 1:
            continue
        table_name = t["table"]
        model_name = f"fact_{table_name}" if "dim_" not in table_name else table_name
        model_file = f"{model_name}.sql"
        result.append({
            "score": score,
            "model_name": model_name,
            "model_file": model_file,
            "table": table_name,
            "schema": t["schema"],
            "columns": t["columns"],
            "foreign_keys": t.get("foreign_keys", []),
        })
    return result


def _marts_model_sql(ft: dict, relations: list) -> str:
    """Generate a mart model SQL with joins to dimensions."""
    src = f"{{{{ ref('stg_{ft['table']}') }}}}"
    table = ft["table"]
    joins = []

    for fk in ft.get("foreign_keys", []):
        for col in fk["columns"]:
            dim_table = fk["ref_table"]
            joins.append(f"""left join {{{{ ref('stg_{dim_table}') }}}} as {dim_table}
    on {table}.{col} = {dim_table}.{fk['ref_columns'][0]}""")

    join_sql = "\n        ".join(joins) if joins else ""
    return f"""-- mart model: {ft['model_name']}
with source as (
    select * from {src}
)

select
    source.*
from source
{join_sql}
"""


def _build_schema_yml(tables: list, fact_tables: list) -> dict:
    models_list = []

    # Staging models
    for t in tables:
        model = {
            "name": f"stg_{t['table']}",
            "description": f"Staging model for {t['table']}",
            "columns": [{"name": c["name"], "description": ""} for c in t["columns"]],
            "tests": [{"unique": True, "column_name": c["name"]} for c in t["columns"] if c.get("pk")],
        }
        models_list.append(model)

    # Mart models
    for ft in fact_tables:
        model = {
            "name": ft["model_name"],
            "description": f"Mart model — {ft['table']}",
            "columns": [{"name": c["name"], "description": ""} for c in ft["columns"]],
            "tests": [{"unique": True, "column_name": c["name"]} for c in ft["columns"] if c.get("pk")],
        }
        models_list.append(model)

    return {"version": 2, "models": models_list}
