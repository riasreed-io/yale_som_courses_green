"""Yale SOM course explorer API desk.

Run from backend/:  uvicorn main:app --reload --port 8000
Open API docs:      http://127.0.0.1:8000/docs
Frontend (Vite):    http://127.0.0.1:5173

Lecture 8: courses come from the database (SQLite locally, Supabase Postgres in
production), accounts are bcrypt-hashed, and each user's chat is saved.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

import auth
import db
from agent import run_agent

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")

app = FastAPI(title="Yale SOM Courses", version="0.2.0")

# In production set ALLOWED_ORIGINS to the Render static-site URL. The wildcard
# default keeps local dev on any Vite port working.
_origins = [o.strip() for o in (os.getenv("ALLOWED_ORIGINS") or "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    # Auth rides in the Authorization header, not cookies, so credentials are
    # not needed — and "*" with credentials is rejected by browsers anyway.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer = HTTPBearer(auto_error=False)


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


# --------------------------------------------------------------------------
# schemas
# --------------------------------------------------------------------------


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)


class ChatResponse(BaseModel):
    reply: str
    tools_used: list[str] = Field(default_factory=list)


class AuthRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class AuthResponse(BaseModel):
    token: str
    username: str


class ChatMessage(BaseModel):
    role: str
    content: str
    tools_used: list[str] = Field(default_factory=list)
    created_at: str = ""


# --------------------------------------------------------------------------
# auth dependency
# --------------------------------------------------------------------------


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue."
        )
    try:
        user_id = auth.verify_token(creds.credentials)
    except auth.AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Account no longer exists."
        )
    return user


# --------------------------------------------------------------------------
# routes
# --------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"ok": True, "database": db.database_url().split("@")[-1]}


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(body: AuthRequest):
    try:
        user, token = auth.signup(body.username, body.password)
    except auth.AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return AuthResponse(token=token, username=user["username"])


@app.post("/api/auth/login", response_model=AuthResponse)
def login(body: AuthRequest):
    try:
        user, token = auth.login(body.username, body.password)
    except auth.AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return AuthResponse(token=token, username=user["username"])


@app.get("/api/auth/me")
def me(user: dict = Depends(current_user)):
    return {"username": user["username"]}


@app.get("/api/courses")
def list_courses(q: str | None = Query(default=None)):
    """Courses for the React catalog, straight from the database."""
    rows = db.list_courses(q)
    return {"count": len(rows), "courses": rows}


@app.get("/api/chat/history", response_model=list[ChatMessage])
def chat_history(user: dict = Depends(current_user)):
    return [
        ChatMessage(
            role=row["role"],
            content=row["content"],
            tools_used=row["tools_used"],
            created_at=row["created_at"].isoformat() if row.get("created_at") else "",
        )
        for row in db.get_chat_history(user["id"])
    ]


@app.delete("/api/chat/history")
def clear_history(user: dict = Depends(current_user)):
    return {"deleted": db.clear_chat_history(user["id"])}


@app.post("/api/chat", response_model=ChatResponse)
def chat(body: ChatRequest, user: dict = Depends(current_user)):
    db.add_chat_message(user["id"], "user", body.message)
    result = run_agent(body.message)
    reply = result.get("reply", "")
    tools_used = list(result.get("tools_used") or [])
    db.add_chat_message(user["id"], "assistant", reply, tools_used)
    return ChatResponse(reply=reply, tools_used=tools_used)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
