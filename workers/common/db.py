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


# TCP keepalive settings, passed through to libpq.
#
# Without these, a managed Postgres (Neon, which is what this deploys against)
# silently drops a connection that has been idle at the TCP level, and the next
# statement fails with "SSL connection has been closed unexpectedly". That is not
# hypothetical: it is the live production failure mode. run_pipeline.py holds one
# connection open across a whole crawl, and a crawl spends most of its wall-clock
# time in HTTP fetches, not SQL - the greenhouse source alone fetched 1,541 jobs
# in a single run - so the connection sits idle for long stretches between
# writes and gets reaped mid-run.
#
# 30s idle is well inside typical proxy/NAT idle timeouts, and the cost is one
# empty TCP packet per half-minute per connection.
_KEEPALIVE_OPTS = {
    "keepalives": 1,
    "keepalives_idle": 30,
    "keepalives_interval": 10,
    "keepalives_count": 5,
}


def connect(dsn: str | None = None) -> psycopg2.extensions.connection:
    """Open a new raw psycopg2 connection. Caller is responsible for closing it."""
    conn = psycopg2.connect(dsn or get_database_url(), **_KEEPALIVE_OPTS)
    return conn


def is_usable(conn: psycopg2.extensions.connection | None) -> bool:
    """Whether `conn` can still be used for new statements.

    `closed` covers a connection we closed ourselves; `OperationalError` on a
    trivial round-trip covers one the server dropped underneath us, which
    psycopg2 does not notice until something is actually sent.
    """
    if conn is None or conn.closed:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except psycopg2.Error:
        return False


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
