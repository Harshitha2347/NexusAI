import os, json
from datetime import datetime
from typing import AsyncGenerator
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from groq import AsyncGroq

from database import (
    get_db, SessionLocal, User, Conversation, Message,
    get_active_path, get_siblings, deepest_leaf, branch_info, new_share_token,
)
from auth import hash_pw, verify_pw, create_token, get_current_user
from streaming import SentenceBuffer
from llm_utils import decide_and_search, generate_title

router = APIRouter()
public_router = APIRouter()

groq  = AsyncGroq(api_key=os.getenv("GROQ_API_KEY", ""))
MODEL = "llama-3.3-70b-versatile"


def _base_system_prompt() -> str:
    today = datetime.utcnow().strftime("%A, %B %d, %Y")
    return f"""You are a knowledgeable, friendly, and reliable AI assistant.

Today's date is {today} (UTC). Use this as your anchor for anything involving "today", "this year", "recent", or similar — never assume an earlier date from your training.

Formatting guidelines for your replies:
- Structure longer answers with short paragraphs and blank lines between them — avoid large walls of text.
- Use Markdown: ## or ### headings for distinct sections, bullet/numbered lists for multiple items or steps, **bold** for key terms, and > blockquotes sparingly for emphasis.
- Use fenced code blocks with a language tag for any code, command, or config.
- Use a Markdown table when comparing multiple items across attributes.
- For short, simple questions, answer directly and concisely — don't force headings or lists onto a one- or two-sentence answer.
- Never fabricate specific dates, numbers, names, or statistics — if you don't know, say so."""


NO_SEARCH_SUFFIX = (
    "\n\nYou do not have live internet access for this reply. If the question depends on "
    "something that may have changed recently (news, prices, scores, releases, current "
    "office-holders, etc.), say plainly that your knowledge may be outdated instead of "
    "guessing a specific current answer."
)

SEARCH_SYSTEM_SUFFIX = """

You were given live web search results below because this question needs current or external information. Treat them as accurate and up to date — use them confidently and directly to answer, synthesized in your own words (don't just copy them verbatim), and briefly mention that the answer is based on a web search. Only flag uncertainty if the results themselves are unclear, conflicting, or don't actually answer the question.

WEB SEARCH RESULTS:
{context}
"""

# ── Schemas ──────────────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    name: str
    email: str
    password: str

class LoginBody(BaseModel):
    email: str
    password: str

class RenameBody(BaseModel):
    title: str

class ChatBody(BaseModel):
    conversation_id: str
    message: str

class EditBody(BaseModel):
    content: str

class SelectBranchBody(BaseModel):
    message_id: str   
    direction: int     


# ── Auth ─────────────────────────────────────────────────────────────────────

@router.post("/auth/register")
def register(body: RegisterBody, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(400, "Email already registered")
    user = User(email=body.email, name=body.name, hashed_pw=hash_pw(body.password))
    db.add(user); db.commit(); db.refresh(user)
    return {"token": create_token(user.id), "user": _user_dict(user)}


@router.post("/auth/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_pw(body.password, user.hashed_pw):
        raise HTTPException(401, "Invalid credentials")
    return {"token": create_token(user.id), "user": _user_dict(user)}


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return _user_dict(user)


# ── Conversations ─────────────────────────────────────────────────────────────

@router.get("/conversations")
def list_convos(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Conversation)
        .filter(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    return [_convo_dict(c) for c in rows]


@router.post("/conversations")
def create_convo(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = Conversation(user_id=user.id)
    db.add(c); db.commit(); db.refresh(c)
    return _convo_dict(c)


@router.get("/conversations/{convo_id}/messages")
def get_messages(convo_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get_convo(convo_id, user.id, db)
    path = get_active_path(c, db)
    return [_message_dict(m, db) for m in path]


@router.patch("/conversations/{convo_id}")
def rename_convo(convo_id: str, body: RenameBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get_convo(convo_id, user.id, db)
    c.title = body.title
    c.title_is_final = True  
    db.commit()
    return _convo_dict(c)


@router.delete("/conversations/{convo_id}")
def delete_convo(convo_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get_convo(convo_id, user.id, db)
    c.active_leaf_id = None
    db.commit()
    db.delete(c); db.commit()
    return {"ok": True}


# ── Branch switching ──────────────────────────────────────────────────────────

@router.patch("/conversations/{convo_id}/select-branch")
def select_branch(convo_id: str, body: SelectBranchBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get_convo(convo_id, user.id, db)
    current = db.query(Message).filter(Message.id == body.message_id, Message.convo_id == c.id).first()
    if not current:
        raise HTTPException(404, "Message not found")

    siblings = get_siblings(current, db)
    ids = [s.id for s in siblings]
    try:
        idx = ids.index(current.id)
    except ValueError:
        idx = 0
    new_idx = max(0, min(len(siblings) - 1, idx + body.direction))
    target = siblings[new_idx]

    leaf = deepest_leaf(target, db)
    c.active_leaf_id = leaf.id
    db.commit()
    path = get_active_path(c, db)
    return [_message_dict(m, db) for m in path]


# ── Sharing / export ───────────────────────────────────────────────────────────

@router.post("/conversations/{convo_id}/share")
def share_convo(convo_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get_convo(convo_id, user.id, db)
    if not c.share_token:
        c.share_token = new_share_token()
    c.is_shared = True
    db.commit()
    return {"share_token": c.share_token, "is_shared": c.is_shared}


@router.delete("/conversations/{convo_id}/share")
def unshare_convo(convo_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get_convo(convo_id, user.id, db)
    c.is_shared = False
    db.commit()
    return {"is_shared": False}


@public_router.get("/shared/{token}")
def get_shared_convo(token: str, db: Session = Depends(get_db)):
    c = db.query(Conversation).filter(Conversation.share_token == token, Conversation.is_shared == True).first()  # noqa: E712
    if not c:
        raise HTTPException(404, "This shared chat doesn't exist or is no longer shared")
    path = get_active_path(c, db)
    return {
        "title": c.title,
        "created_at": c.created_at,
        "messages": [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at} for m in path],
    }


# ── SSE Streaming Chat ────────────────────────────────────────────────────────

@router.post("/chat/stream")
async def chat_stream(body: ChatBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _get_convo(body.conversation_id, user.id, db)

    parent_id = c.active_leaf_id
    user_msg = Message(convo_id=c.id, parent_id=parent_id, role="user", content=body.message)
    db.add(user_msg); db.commit(); db.refresh(user_msg)
    c.active_leaf_id = user_msg.id
    db.commit()

    history = [{"role": m.role, "content": m.content} for m in get_active_path(c, db)][-20:]

    return StreamingResponse(
        _stream_assistant_reply(c.id, user_msg.id, history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.put("/messages/{message_id}")
async def edit_message(message_id: str, body: EditBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    original = db.query(Message).filter(Message.id == message_id).first()
    if not original or original.role != "user":
        raise HTTPException(404, "User message not found")
    c = _get_convo(original.convo_id, user.id, db)

    new_user_msg = Message(convo_id=c.id, parent_id=original.parent_id, role="user", content=body.content)
    db.add(new_user_msg); db.commit(); db.refresh(new_user_msg)
    c.active_leaf_id = new_user_msg.id
    db.commit()

    history = [{"role": m.role, "content": m.content} for m in get_active_path(c, db)][-20:]
    idx, count = branch_info(new_user_msg, db)
    convo_id, new_msg_id = c.id, new_user_msg.id

    async def gen():
        yield f"data: {json.dumps({'type': 'branch', 'message_id': new_msg_id, 'branch_index': idx, 'branch_count': count})}\n\n"
        async for chunk in _stream_assistant_reply(convo_id, new_msg_id, history):
            yield chunk

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/messages/{message_id}/regenerate")
async def regenerate_message(message_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Regenerate an assistant reply. Creates a sibling branch of that assistant
    message so earlier answers stay accessible via branch navigation."""
    original = db.query(Message).filter(Message.id == message_id).first()
    if not original or original.role != "assistant":
        raise HTTPException(404, "Assistant message not found")
    c = _get_convo(original.convo_id, user.id, db)
    parent = db.query(Message).filter(Message.id == original.parent_id).first()
    if not parent:
        raise HTTPException(400, "Cannot regenerate a message with no parent")

    c.active_leaf_id = parent.id
    db.commit()
    history = [{"role": m.role, "content": m.content} for m in get_active_path(c, db)][-20:]

    return StreamingResponse(
        _stream_assistant_reply(c.id, parent.id, history),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream_assistant_reply(convo_id: str, parent_msg_id: str, history: list[dict]) -> AsyncGenerator[str, None]:
    db = SessionLocal()
    try:
        parent_msg = db.query(Message).filter(Message.id == parent_msg_id).first()
        c = db.query(Conversation).filter(Conversation.id == convo_id).first()
        if not parent_msg or not c:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Conversation or message no longer exists'})}\n\n"
            return

        is_root = parent_msg.parent_id is None
        base_prompt = _base_system_prompt()
        search_context, used_search, query = await decide_and_search(groq, MODEL, base_prompt, history)
        if used_search and search_context:
            system_prompt = base_prompt + SEARCH_SYSTEM_SUFFIX.format(context=search_context)
            yield f"data: {json.dumps({'type': 'search', 'query': query})}\n\n"
        else:
            system_prompt = base_prompt + NO_SEARCH_SUFFIX

        buf = SentenceBuffer()
        full = ""
        try:
            stream = await groq.chat.completions.create(
                model=MODEL,
                messages=[{"role": "system", "content": system_prompt}, *history],
                stream=True,
                max_tokens=2048,
                temperature=0.7,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if not delta:
                    continue
                full += delta
                for sentence in buf.feed(delta):
                    yield f"data: {json.dumps({'type': 'delta', 'content': sentence})}\n\n"

            tail = buf.flush_all()
            if tail:
                yield f"data: {json.dumps({'type': 'delta', 'content': tail})}\n\n"

            if not full.strip():
                full = "I wasn't able to generate a response that time — could you try rephrasing?"
                yield f"data: {json.dumps({'type': 'delta', 'content': full})}\n\n"

            ai_msg = Message(convo_id=c.id, parent_id=parent_msg.id, role="assistant",
                              content=full, used_search=used_search)
            db.add(ai_msg); db.commit(); db.refresh(ai_msg)
            c.active_leaf_id = ai_msg.id
            c.updated_at = datetime.utcnow()

            title = None
            if is_root and not c.title_is_final:
                user_text = parent_msg.content
                title = await generate_title(groq, MODEL, user_text, full)
                if title:
                    c.title = title
                    c.title_is_final = True
                elif c.title in (None, "New Chat"):
                    c.title = user_text[:60] + ("…" if len(user_text) > 60 else "")

            db.commit()

            yield f"data: {json.dumps({'type': 'done', 'message_id': ai_msg.id, 'title': c.title, 'used_search': used_search})}\n\n"

        except Exception as e:
            db.rollback()
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    finally:
        db.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_dict(u: User):
    return {"id": u.id, "name": u.name, "email": u.email}

def _convo_dict(c: Conversation):
    return {
        "id": c.id, "title": c.title, "created_at": c.created_at, "updated_at": c.updated_at,
        "is_shared": c.is_shared, "share_token": c.share_token if c.is_shared else None,
    }

def _message_dict(m: Message, db: Session):
    idx, count = branch_info(m, db)
    return {
        "id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at,
        "used_search": m.used_search, "branch_index": idx, "branch_count": count,
    }

def _get_convo(convo_id: str, user_id: str, db: Session) -> Conversation:
    c = db.query(Conversation).filter(Conversation.id == convo_id, Conversation.user_id == user_id).first()
    if not c:
        raise HTTPException(404, "Conversation not found")
    return c
