"""Database connection via SQLAlchemy — allows multiple simultaneous connections."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine


def parse_dsn(dsn: str) -> str:
    """Normalise any DSN to a SQLAlchemy URL."""
    dsn = dsn.strip()
    if dsn.startswith("postgresql://") or dsn.startswith("postgres://"):
        return dsn.replace("postgres://", "postgresql://", 1)
    if dsn.startswith("mysql://"):
        return dsn if "+pymysql" in dsn else dsn.replace("mysql://", "mysql+pymysql://", 1)
    if dsn.startswith("duckdb://") or dsn.startswith("sqlite://") or dsn.startswith("snowflake://"):
        return dsn
    if "/" in dsn or dsn.endswith(".db") or dsn.endswith(".duckdb"):
        return f"duckdb:///{dsn}"
    return dsn


class Database:
    """Wraps a SQLAlchemy engine with convenience methods."""

    def __init__(self, dsn: str, name: str = "default"):
        self.dsn = parse_dsn(dsn)
        self.name = name
        self._engine: Engine | None = None

    @property
    def engine(self) -> Engine:
        if self._engine is None:
            args: dict[str, Any] = {}
            if self.dsn.startswith("duckdb:///"):
                args = {"connect_args": {"config": {"allow_unsigned_extensions": "true"}}}
            self._engine = create_engine(self.dsn, **args)
        return self._engine

    @contextmanager
    def connect(self) -> Generator[Any, None, None]:
        conn = self.engine.connect()
        try:
            yield conn
        finally:
            conn.close()

    def test(self) -> bool:
        try:
            with self.connect() as c:
                c.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    def get_tables(self, schema: str | None = None) -> list[dict[str, str]]:
        insp = inspect(self.engine)
        tables = []
        schemas = [schema] if schema else insp.get_schema_names()
        for sch in schemas:
            if sch in ("information_schema", "performance_schema", "mysql", "pg_catalog"):
                continue
            for tbl in insp.get_table_names(schema=sch):
                tables.append({"name": tbl, "type": "table", "schema": sch})
            for vw in insp.get_view_names(schema=sch):
                tables.append({"name": vw, "type": "view", "schema": sch})
        return tables

    def get_columns(self, table: str, schema: str | None = None) -> list[dict[str, Any]]:
        insp = inspect(self.engine)
        cols = []
        for col in insp.get_columns(table, schema=schema):
            cols.append({
                "name": col["name"],
                "type": str(col["type"]),
                "nullable": col.get("nullable", True),
                "default": str(col.get("default", "")) if col.get("default") else None,
                "pk": col.get("primary_key", False),
                "comment": col.get("comment", ""),
            })
        return cols

    def get_primary_keys(self, table: str, schema: str | None = None) -> list[str]:
        pk = inspect(self.engine).get_pk_constraint(table, schema=schema)
        return pk.get("constrained_columns", []) if pk else []

    def get_foreign_keys(self, table: str, schema: str | None = None) -> list[dict[str, Any]]:
        fks = []
        for fk in inspect(self.engine).get_foreign_keys(table, schema=schema):
            fks.append({
                "columns": fk["constrained_columns"],
                "ref_table": fk["referred_table"],
                "ref_schema": fk.get("referred_schema", schema),
                "ref_columns": fk["referred_columns"],
            })
        return fks

    def execute(self, sql: str) -> list[dict[str, Any]]:
        with self.connect() as c:
            res = c.execute(text(sql))
            if res.returns_rows:
                keys = res.keys()
                return [dict(zip(keys, row)) for row in res.fetchall()]
            c.commit()
            return []

    def get_row_count(self, table: str, schema: str | None = None) -> int:
        fqn = f'"{schema}"."{table}"' if schema else f'"{table}"'
        try:
            rows = self.execute(f"SELECT COUNT(*) AS cnt FROM {fqn}")
            return rows[0]["cnt"] if rows else 0
        except Exception:
            return -1

    def sample_rows(self, table: str, schema: str | None = None, limit: int = 5) -> list[dict[str, Any]]:
        fqn = f'"{schema}"."{table}"' if schema else f'"{table}"'
        return self.execute(f"SELECT * FROM {fqn} LIMIT {limit}")

    def close(self) -> None:
        if self._engine:
            self._engine.dispose()
            self._engine = None


# ── Connection registry ─────────────────────────────────────────────

_registry: dict[str, Database] = {}


def register(name: str, db: Database) -> None:
    _registry[name] = db


def get(name: str = "default") -> Database | None:
    return _registry.get(name)


def remove(name: str) -> None:
    if name in _registry:
        _registry[name].close()
        del _registry[name]


def close_all() -> None:
    for db in _registry.values():
        db.close()
    _registry.clear()
