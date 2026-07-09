"""Thin Postgres access layer shared by the crawler, normalizer and deduplicator.

Design notes:
- We use psycopg2 with raw, hand-written SQL. All identifiers in this codebase
  are exactly what Prisma generated (see packages/db/prisma/migrations/*/migration.sql):
  snake_case table names, camelCase quoted column names.
- Functions here take a *connection* (or cursor) as their first argument and
  never call commit()/rollback() themselves. The caller (a script, a runner,
  or a test) owns the transaction boundary. This makes every DB-touching
  function trivially testable: a test can open a connection, run code against
  it, assert against the same open transaction, and roll back at the end
  without ever touching real persisted state.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

import psycopg2
import psycopg2.extras

DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/german_smart_apply"


def get_database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)


def connect(dsn: str | None = None) -> psycopg2.extensions.connection:
    """Open a new raw psycopg2 connection. Caller is responsible for closing it."""
    conn = psycopg2.connect(dsn or get_database_url())
    return conn


@contextmanager
def connection(dsn: str | None = None) -> Iterator[psycopg2.extensions.connection]:
    """Context manager that opens a connection and always closes it.

    Does NOT commit or rollback automatically -- callers decide.
    """
    conn = connect(dsn)
    try:
        yield conn
    finally:
        conn.close()


def dict_cursor(conn: psycopg2.extensions.connection) -> psycopg2.extras.RealDictCursor:
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
