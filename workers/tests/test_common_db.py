"""Tests for common/db.py: the thin Postgres access layer shared by every
worker module. Runs against the real local Postgres (no mocking psycopg2 --
these are the primitives every other test in this suite already trusts, so
they need their own direct coverage rather than only being exercised
incidentally through other tests' use of `db.connect()`).
"""
from __future__ import annotations

import pytest

from common import db


def test_get_database_url_uses_env_var_when_set(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://someone:somewhere@example.com:5432/somedb")
    assert db.get_database_url() == "postgresql://someone:somewhere@example.com:5432/somedb"


def test_get_database_url_falls_back_to_default_when_unset(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert db.get_database_url() == db.DEFAULT_DATABASE_URL


def test_connection_context_manager_yields_a_working_connection():
    with db.connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1")
        assert cur.fetchone()[0] == 1
        assert conn.closed == 0
    assert conn.closed != 0  # closed on normal exit


def test_connection_context_manager_closes_even_when_the_body_raises():
    """The whole point of wrapping connect() in a context manager instead of
    callers managing close() themselves -- a failure inside the `with` block
    must not leak the connection.
    """
    captured_conn = None

    class Boom(Exception):
        pass

    with pytest.raises(Boom):
        with db.connection() as conn:
            captured_conn = conn
            raise Boom("something went wrong mid-transaction")

    assert captured_conn is not None
    assert captured_conn.closed != 0


def test_dict_cursor_returns_dict_like_rows():
    with db.connection() as conn:
        cur = db.dict_cursor(conn)
        cur.execute("SELECT 1 AS x, 2 AS y")
        row = cur.fetchone()
        assert row["x"] == 1
        assert row["y"] == 2
