"""Accounts and sessions.

Passwords are hashed with bcrypt — the salt is generated per password and baked
into the hash string, so there is no separate salt column.

Sessions are stateless signed tokens (HMAC-SHA256 over "user_id:expiry"). That
keeps the schema to the two tables the assignment asks for, with no sessions
table and no server-side state to clean up.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time

import bcrypt

import db

# bcrypt 5.x raises on anything longer rather than silently truncating.
MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LEN = 8
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # one week


class AuthError(Exception):
    """Raised for any bad credential or malformed token."""


def _secret() -> bytes:
    """Signing key for session tokens.

    In production set SECRET_KEY (Render env var). Without it we generate a
    random key per process, which is safe but logs everyone out on restart.
    """
    configured = (os.getenv("SECRET_KEY") or "").strip()
    if configured:
        return configured.encode("utf-8")
    global _EPHEMERAL_SECRET
    if _EPHEMERAL_SECRET is None:
        _EPHEMERAL_SECRET = secrets.token_bytes(32)
    return _EPHEMERAL_SECRET


_EPHEMERAL_SECRET: bytes | None = None


# --------------------------------------------------------------------------
# passwords
# --------------------------------------------------------------------------


def validate_credentials(username: str, password: str) -> tuple[str, str]:
    """Normalize and check a signup pair, or raise AuthError with a usable message."""
    username = (username or "").strip()
    password = password or ""

    if len(username) < 3:
        raise AuthError("Username must be at least 3 characters.")
    if len(username) > 40:
        raise AuthError("Username must be 40 characters or fewer.")
    if not all(c.isalnum() or c in "._-" for c in username):
        raise AuthError("Username can only use letters, numbers, dot, underscore and hyphen.")
    if len(password) < MIN_PASSWORD_LEN:
        raise AuthError(f"Password must be at least {MIN_PASSWORD_LEN} characters.")
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise AuthError(f"Password must be {MAX_PASSWORD_BYTES} bytes or fewer.")
    return username, password


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        # Over-long password or a corrupt hash — treat as a failed login.
        return False


# --------------------------------------------------------------------------
# tokens
# --------------------------------------------------------------------------


def _sign(payload: str) -> str:
    digest = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def create_token(user_id: int) -> str:
    expiry = int(time.time()) + TOKEN_TTL_SECONDS
    payload = f"{user_id}:{expiry}"
    return f"{payload}:{_sign(payload)}"


def verify_token(token: str) -> int:
    """Return the user id encoded in a valid token, else raise AuthError."""
    try:
        user_id_raw, expiry_raw, signature = (token or "").split(":")
        payload = f"{user_id_raw}:{expiry_raw}"
    except ValueError:
        raise AuthError("Malformed session token.") from None

    if not hmac.compare_digest(signature, _sign(payload)):
        raise AuthError("Invalid session token.")
    if int(expiry_raw) < time.time():
        raise AuthError("Session expired. Please sign in again.")
    return int(user_id_raw)


# --------------------------------------------------------------------------
# account operations
# --------------------------------------------------------------------------


def signup(username: str, password: str) -> tuple[dict, str]:
    username, password = validate_credentials(username, password)
    if db.get_user_by_username(username):
        raise AuthError("That username is already taken.")
    user = db.create_user(username, hash_password(password))
    return user, create_token(user["id"])


def login(username: str, password: str) -> tuple[dict, str]:
    user = db.get_user_by_username((username or "").strip())
    # Same message either way so the response can't be used to enumerate users.
    if not user or not verify_password(password or "", user["password_hash"]):
        raise AuthError("Incorrect username or password.")
    return user, create_token(user["id"])
