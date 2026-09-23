"""Database layer: SQLite locally, Postgres (Supabase) in production.

Everything goes through SQLAlchemy Core so the same code runs against both.
Set DATABASE_URL to point at Supabase; with it unset we fall back to the
local data/yale_som.db file that ships with the course zip.

Tables:
  courses  — the SOM catalog (already in yale_som.db; created here for Postgres)
  users    — login accounts, bcrypt password hashes
  chats    — one row per chat message, so a user's history survives a reload
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    func,
    or_,
    select,
)
from sqlalchemy.engine import Engine

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")

DEFAULT_SQLITE_PATH = ROOT / "data" / "yale_som.db"

metadata = MetaData()

courses = Table(
    "courses",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("course_id", Text),
    Column("course_number", Text),
    Column("course_title", Text),
    Column("course_category", Text),
    Column("course_type", Text),
    Column("course_session", Text),
    Column("course_description", Text),
    Column("faculty_1", Text),
    Column("faculty_1_email", Text),
    Column("faculty_bio", Text),
    Column("daytimes", Text),
    Column("timings_day", Text),
    Column("timings_start", Text),
    Column("timings_end", Text),
    Column("room", Text),
    Column("section", Text),
    Column("units", Text),
    Column("term_code", Text),
    Column("syllabus", Text),
    Column("old_syllabus", Text),
)

users = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    # 255 so the column works on Postgres, where unindexed TEXT unique is fine
    # but a bounded type is friendlier.
    Column("username", String(255), nullable=False, unique=True),
    Column("password_hash", String(255), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

chats = Table(
    "chats",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("role", String(16), nullable=False),  # "user" | "assistant"
    Column("content", Text, nullable=False),
    Column("tools_used", Text, nullable=False, default=""),  # comma-separated
    Column("created_at", DateTime(timezone=True), nullable=False),
)


def database_url() -> str:
    """Resolve the connection string, normalizing Supabase's URL for psycopg 3."""
    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        return f"sqlite:///{DEFAULT_SQLITE_PATH}"
    # Supabase hands out postgresql:// (or the legacy postgres://); SQLAlchemy 2
    # needs an explicit driver or it reaches for psycopg2, which we don't install.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = database_url()
        # pool_pre_ping: Supabase closes idle connections; without this the first
        # query after a quiet spell fails instead of transparently reconnecting.
        _engine = create_engine(url, pool_pre_ping=True, future=True)
    return _engine


def init_db() -> None:
    """Create users/chats (and courses if absent). Never drops anything."""
    metadata.create_all(get_engine())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------
# courses
# --------------------------------------------------------------------------


def list_courses(q: str | None = None) -> list[dict[str, Any]]:
    """Catalog rows for the React grid, with an optional text filter."""
    stmt = select(courses)
    if q and q.strip():
        needle = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(courses.c.course_title).like(needle),
                func.lower(courses.c.course_number).like(needle),
                func.lower(courses.c.faculty_1).like(needle),
                func.lower(courses.c.course_category).like(needle),
                func.lower(courses.c.daytimes).like(needle),
                func.lower(courses.c.course_description).like(needle),
            )
        )
    stmt = stmt.order_by(courses.c.course_number, courses.c.section)
    with get_engine().connect() as con:
        return [dict(row) for row in con.execute(stmt).mappings()]


def all_courses() -> list[dict[str, Any]]:
    """Every course, for the agent's semantic ranking pass."""
    with get_engine().connect() as con:
        return [dict(r) for r in con.execute(select(courses).order_by(courses.c.id)).mappings()]


# --------------------------------------------------------------------------
# users
# --------------------------------------------------------------------------


def get_user_by_username(username: str) -> dict[str, Any] | None:
    stmt = select(users).where(func.lower(users.c.username) == username.strip().lower())
    with get_engine().connect() as con:
        row = con.execute(stmt).mappings().first()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> dict[str, Any] | None:
    with get_engine().connect() as con:
        row = con.execute(select(users).where(users.c.id == user_id)).mappings().first()
    return dict(row) if row else None


def create_user(username: str, password_hash: str) -> dict[str, Any]:
    with get_engine().begin() as con:
        con.execute(
            users.insert().values(
                username=username.strip(),
                password_hash=password_hash,
                created_at=_now(),
            )
        )
    created = get_user_by_username(username)
    assert created is not None  # just inserted
    return created


# --------------------------------------------------------------------------
# chats
# --------------------------------------------------------------------------


def add_chat_message(
    user_id: int, role: str, content: str, tools_used: list[str] | None = None
) -> None:
    with get_engine().begin() as con:
        con.execute(
            chats.insert().values(
                user_id=user_id,
                role=role,
                content=content,
                tools_used=",".join(tools_used or []),
                created_at=_now(),
            )
        )


def get_chat_history(user_id: int, limit: int = 200) -> list[dict[str, Any]]:
    stmt = (
        select(chats)
        .where(chats.c.user_id == user_id)
        .order_by(chats.c.id)
        .limit(limit)
    )
    with get_engine().connect() as con:
        rows = [dict(r) for r in con.execute(stmt).mappings()]
    for row in rows:
        row["tools_used"] = [t for t in (row.get("tools_used") or "").split(",") if t]
    return rows


def clear_chat_history(user_id: int) -> int:
    with get_engine().begin() as con:
        result = con.execute(chats.delete().where(chats.c.user_id == user_id))
    return result.rowcount or 0
