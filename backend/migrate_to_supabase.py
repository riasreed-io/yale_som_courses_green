"""Copy the SQLite course catalog into Supabase (Postgres).

Supabase is Postgres, so data/yale_som.db can't just be uploaded — the 234
course rows have to be inserted. This creates every table (courses, users,
chats) on the target and copies courses across.

Usage, from backend/ with the venv active:

    DATABASE_URL='postgresql://postgres:<password>@<host>:5432/postgres' \
        python migrate_to_supabase.py

Add --force to replace courses that are already there. Without it the script
refuses to touch a non-empty courses table, so re-running is safe.

users and chats are created empty; accounts are made through the app.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import create_engine, func, insert, select

import db

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SQLITE_PATH = ROOT / "data" / "yale_som.db"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force", action="store_true", help="replace courses already in the target"
    )
    args = parser.parse_args()

    target_url = db.database_url()
    if target_url.startswith("sqlite"):
        print(
            "DATABASE_URL is not set, so the target resolved to local SQLite.\n"
            "Set it to your Supabase connection string first:\n"
            "  export DATABASE_URL='postgresql://postgres:<password>@<host>:5432/postgres'",
            file=sys.stderr,
        )
        return 1

    if not SQLITE_PATH.exists():
        print(f"Source database not found: {SQLITE_PATH}", file=sys.stderr)
        return 1

    # Read the catalog out of the local SQLite file.
    source = create_engine(f"sqlite:///{SQLITE_PATH}", future=True)
    with source.connect() as con:
        rows = [dict(r) for r in con.execute(select(db.courses)).mappings()]
    print(f"read {len(rows)} courses from {SQLITE_PATH.name}")

    target = create_engine(target_url, pool_pre_ping=True, future=True)
    db.metadata.create_all(target)
    print("created tables on target: courses, users, chats")

    with target.begin() as con:
        existing = con.execute(select(func.count()).select_from(db.courses)).scalar_one()
        if existing and not args.force:
            print(
                f"target already has {existing} courses — nothing written.\n"
                "Re-run with --force to replace them.",
                file=sys.stderr,
            )
            return 1
        if existing:
            con.execute(db.courses.delete())
            print(f"deleted {existing} existing courses (--force)")
        if rows:
            con.execute(insert(db.courses), rows)

    with target.connect() as con:
        total = con.execute(select(func.count()).select_from(db.courses)).scalar_one()
        sample = con.execute(
            select(db.courses.c.course_number, db.courses.c.course_title).limit(3)
        ).all()

    print(f"\ndone — {total} courses now in Supabase")
    for number, title in sample:
        print(f"  {number} {title}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
