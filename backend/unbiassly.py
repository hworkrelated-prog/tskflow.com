"""Unbiassly: anonymous share-link discussions with organizer insights.

An organizer creates a room and a shareable /u/{token} link. Anyone with the
link can post without signing in. Posts never carry names, emails, or user ids.
The organizer sees the thread plus a summary with trends and highlights.
"""
from __future__ import annotations

import hashlib
import html
import json
import logging
import os
import re
import secrets
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field, validator

from no_ai_dash import strip_ai_dashes
from product_analytics import hash_ip
from text_clean import clean_display_text

MAX_TOPIC = 160
MAX_PROMPT = 800
MAX_BODY = 2000
MIN_BODY = 3
MAX_POSTS_PER_ROOM = 500
MAX_ROOMS_PER_USER = 80
POSTS_PER_WINDOW = 12
POST_WINDOW_MINUTES = 10
SUMMARY_POST_CAP = 80
STOPWORDS = {
    "the", "a", "an", "and", "or", "to", "of", "in", "is", "it", "for", "on",
    "that", "this", "with", "as", "be", "are", "was", "were", "we", "you", "i",
    "they", "them", "their", "our", "not", "but", "if", "so", "at", "by", "from",
    "about", "have", "has", "had", "will", "would", "can", "could", "should",
    "just", "like", "really", "also", "more", "than", "then", "there", "here",
    "what", "when", "who", "how", "why", "which", "all", "some", "any", "no",
    "yes", "one", "two", "get", "got", "do", "did", "does", "dont", "im", "its",
    "ive", "ill", "youre", "were", "wasnt", "isnt", "arent", "dont", "cant",
    "very", "too", "into", "over", "after", "before", "because", "been", "being",
    "my", "me", "your", "his", "her", "she", "he", "us", "them", "those", "these",
    "thing", "things", "people", "someone", "something", "think", "thought",
    "feel", "feels", "felt", "make", "makes", "made", "need", "needs", "want",
    "wanted", "know", "knew", "see", "saw", "say", "said", "going", "go", "gone",
}

WORD_RE = re.compile(r"[a-z][a-z0-9'-]{3,}")
CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


class RoomCreate(BaseModel):
    topic: str = Field(..., min_length=3, max_length=MAX_TOPIC)
    prompt: Optional[str] = Field(None, max_length=MAX_PROMPT)
    email_updates: Optional[bool] = True

    @validator("topic")
    def clean_topic(cls, v):
        text = _plain(v)
        if len(text) < 3:
            raise ValueError("Give the discussion a short topic")
        return text[:MAX_TOPIC]

    @validator("prompt")
    def clean_prompt(cls, v):
        if v is None:
            return None
        text = _plain(v)
        return text[:MAX_PROMPT] if text else None


class ContributionCreate(BaseModel):
    body: str = Field(..., min_length=MIN_BODY, max_length=MAX_BODY)

    @validator("body")
    def clean_body(cls, v):
        text = _plain(v)
        if len(text) < MIN_BODY:
            raise ValueError("Write a little more")
        return text[:MAX_BODY]


def _plain(value: Any) -> str:
    text = CTRL_RE.sub("", str(value or ""))
    text = clean_display_text(strip_ai_dashes(text))
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


TOKEN_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_share_token(length: int = 16) -> str:
    return "".join(secrets.choice(TOKEN_ALPHABET) for _ in range(length))


def share_url(app_base_url: str, token: str) -> str:
    base = (app_base_url or "").rstrip("/")
    return f"{base}/u/{token}"


def public_post(doc: dict) -> dict:
    return {
        "id": doc.get("id"),
        "body": doc.get("body") or "",
        "created_at": doc.get("created_at"),
    }


def public_room_payload(room: dict, posts: List[dict], *, app_base_url: str) -> dict:
    return {
        "topic": room.get("topic") or "",
        "prompt": room.get("prompt") or "",
        "status": room.get("status") or "open",
        "created_at": room.get("created_at"),
        "contribution_count": int(room.get("contribution_count") or len(posts)),
        "posts": [public_post(p) for p in posts],
        "share_url": share_url(app_base_url, room.get("share_token") or ""),
        "brand": "Unbiassly",
        "tagline": "An unbiased link for an unbiased discussion.",
    }


def organizer_room_payload(room: dict, posts: List[dict], *, app_base_url: str) -> dict:
    payload = public_room_payload(room, posts, app_base_url=app_base_url)
    payload.update({
        "id": room.get("id"),
        "share_token": room.get("share_token"),
        "email_updates": bool(room.get("email_updates", True)),
        "closed_at": room.get("closed_at"),
        "summary": room.get("summary") or empty_summary(room, posts),
        "organizer": True,
    })
    return payload


def organizer_list_item(room: dict, *, app_base_url: str) -> dict:
    summary = room.get("summary") or {}
    return {
        "id": room.get("id"),
        "topic": room.get("topic") or "",
        "prompt": room.get("prompt") or "",
        "status": room.get("status") or "open",
        "created_at": room.get("created_at"),
        "closed_at": room.get("closed_at"),
        "contribution_count": int(room.get("contribution_count") or 0),
        "share_token": room.get("share_token"),
        "share_url": share_url(app_base_url, room.get("share_token") or ""),
        "headline": summary.get("headline") or "",
        "email_updates": bool(room.get("email_updates", True)),
    }


def _tokens(text: str) -> List[str]:
    return [w for w in WORD_RE.findall((text or "").lower()) if w not in STOPWORDS]


def extract_trends(posts: List[dict], limit: int = 6) -> List[dict]:
    counts: Counter = Counter()
    for post in posts:
        counts.update(_tokens(post.get("body") or ""))
    if not counts:
        return []
    total = sum(counts.values()) or 1
    out = []
    for label, count in counts.most_common(limit):
        share = round(100.0 * count / total, 1)
        out.append({
            "label": label,
            "count": int(count),
            "share": share,
            "note": f"Came up {count} time{'s' if count != 1 else ''}.",
        })
    return out


def _substantial_posts(posts: List[dict], limit: int = 4) -> List[str]:
    ranked = sorted(
        posts,
        key=lambda p: (len((p.get("body") or "").strip()), p.get("created_at") or ""),
        reverse=True,
    )
    highlights = []
    seen = set()
    for post in ranked:
        body = (post.get("body") or "").strip()
        key = re.sub(r"\s+", " ", body.lower())
        if len(body) < 12 or key in seen:
            continue
        seen.add(key)
        highlights.append(body if len(body) <= 280 else body[:277].rstrip() + "...")
        if len(highlights) >= limit:
            break
    return highlights


def empty_summary(room: dict, posts: Optional[List[dict]] = None) -> dict:
    posts = posts or []
    n = len(posts)
    topic = room.get("topic") or "this discussion"
    if n == 0:
        headline = "No contributions yet."
        overview = f'Share the Unbiassly link. People can weigh in on "{topic}" without names attached.'
        highlights: List[str] = []
    else:
        headline = f"{n} anonymous contribution{'s' if n != 1 else ''} so far."
        overview = f"People are discussing {topic}. Names are not attached to any of it."
        highlights = _substantial_posts(posts)
    return {
        "headline": headline,
        "overview": overview,
        "highlights": highlights,
        "trends": extract_trends(posts),
        "generated_at": _now_iso(),
        "contribution_count": n,
        "source": "fallback",
    }


def fallback_summary(room: dict, posts: List[dict]) -> dict:
    summary = empty_summary(room, posts)
    n = len(posts)
    topic = room.get("topic") or "the topic"
    trends = summary["trends"]
    if n == 0:
        return summary
    if trends:
        top = ", ".join(t["label"] for t in trends[:3])
        summary["overview"] = (
            f'{n} anonymous note{"s" if n != 1 else ""} on "{topic}". '
            f"Recurring language: {top}."
        )
        summary["headline"] = f"{n} voices. Strongest thread: {trends[0]['label']}."
    else:
        summary["overview"] = (
            f'{n} anonymous note{"s" if n != 1 else ""} on "{topic}". '
            "No single phrase dominates yet."
        )
    if n >= 8 and trends:
        summary["highlights"] = (
            [f"'{trends[0]['label']}' is the most repeated idea."]
            + summary["highlights"]
        )[:4]
    return summary


def _parse_llm_json(raw: str) -> Optional[dict]:
    text = (raw or "").strip()
    if not text:
        return None
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I | re.S).strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def _clean_summary(fallback: dict, llm: Optional[dict]) -> dict:
    out = dict(fallback)
    if not llm:
        return out
    out["source"] = "llm"
    headline = _plain(llm.get("headline") or "")
    overview = _plain(llm.get("overview") or "")
    if headline:
        out["headline"] = headline[:220]
    if overview:
        out["overview"] = overview[:900]
    highlights = llm.get("highlights")
    if isinstance(highlights, list):
        cleaned = [_plain(h) for h in highlights if _plain(h)]
        if cleaned:
            out["highlights"] = cleaned[:6]
    trends = llm.get("trends")
    if isinstance(trends, list):
        cleaned_trends = []
        for item in trends[:8]:
            if not isinstance(item, dict):
                continue
            label = _plain(item.get("label") or "")
            if not label:
                continue
            try:
                count = int(item.get("count") or 0)
            except (TypeError, ValueError):
                count = 0
            note = _plain(item.get("note") or "")
            try:
                share = float(item.get("share") or 0)
            except (TypeError, ValueError):
                share = 0.0
            cleaned_trends.append({
                "label": label[:48],
                "count": max(count, 0),
                "share": max(share, 0.0),
                "note": note[:180] or f"Came up {max(count, 1)} time{'s' if count != 1 else ''}.",
            })
        if cleaned_trends:
            out["trends"] = cleaned_trends
    return out


async def generate_summary(room: dict, posts: List[dict]) -> dict:
    fallback = fallback_summary(room, posts)
    if not posts:
        return fallback
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        return fallback
    payload = {
        "topic": room.get("topic"),
        "prompt": room.get("prompt") or None,
        "contributions": [
            {"text": (p.get("body") or "")[:500]}
            for p in posts[-SUMMARY_POST_CAP:]
        ],
    }
    prompt = (
        "Summarize an anonymous discussion for the organizer who created the share link.\n"
        "Never infer names, roles, gender, employer, or who wrote what.\n"
        "Do not invent facts that are not in the notes.\n"
        "Return JSON only with keys: headline (one sentence), overview (2-4 sentences), "
        "highlights (array of short verbatim-or-paraphrase points), "
        "trends (array of {label, count, share, note} for recurring themes).\n"
        "Trends should reflect what people actually said, not the topic title alone.\n"
        f"DATA:\n{json.dumps(payload, ensure_ascii=True)}"
    )
    try:
        from llm import chat_complete

        raw = await chat_complete(
            model="gpt-4o-mini",
            system=(
                "You brief organizers on anonymous Unbiassly discussions. "
                "JSON only. No identities. Prefer ASCII punctuation."
            ),
            user=prompt,
            json_mode=True,
            timeout=18.0,
            api_key=key,
        )
        return _clean_summary(fallback, _parse_llm_json(raw))
    except Exception as exc:
        logging.warning("Unbiassly summary fallback: %s", exc)
        return fallback


def summary_email_html(room: dict, summary: dict, *, app_base_url: str) -> str:
    topic = html.escape(room.get("topic") or "Unbiassly discussion")
    headline = html.escape(summary.get("headline") or "")
    overview = html.escape(summary.get("overview") or "")
    highlights = summary.get("highlights") or []
    trends = summary.get("trends") or []
    n = int(summary.get("contribution_count") or 0)
    hub = html.escape(f"{(app_base_url or '').rstrip('/')}/unbiassly")
    hi_html = "".join(
        f"<li style=\"margin:0 0 8px;\">{html.escape(str(h))}</li>"
        for h in highlights[:6]
    ) or "<li>No highlights yet.</li>"
    tr_html = "".join(
        f"<li style=\"margin:0 0 8px;\"><strong>{html.escape(str(t.get('label') or ''))}</strong>"
        f" ({int(t.get('count') or 0)}) - {html.escape(str(t.get('note') or ''))}</li>"
        for t in trends[:6]
    ) or "<li>No repeating themes yet.</li>"
    return f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background:#f8fafc;">
      <div style="background:#0f766e;padding:28px 24px;color:#fff;">
        <p style="margin:0;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;opacity:0.85;">Unbiassly</p>
        <h1 style="margin:8px 0 0;font-size:22px;">{topic}</h1>
      </div>
      <div style="padding:24px;background:#fff;color:#0f172a;">
        <p style="margin:0 0 12px;font-size:16px;font-weight:600;">{headline}</p>
        <p style="margin:0 0 16px;line-height:1.55;color:#334155;">{overview}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#64748b;">{n} anonymous contribution{"s" if n != 1 else ""}.</p>
        <h2 style="font-size:15px;margin:20px 0 8px;">Highlights</h2>
        <ul style="padding-left:18px;margin:0;">{hi_html}</ul>
        <h2 style="font-size:15px;margin:20px 0 8px;">Trends</h2>
        <ul style="padding-left:18px;margin:0;">{tr_html}</ul>
        <p style="margin:24px 0 0;text-align:center;">
          <a href="{hub}" style="background:#0d9488;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;">Open Unbiassly</a>
        </p>
      </div>
    </div>
    """


def register_unbiassly_routes(
    api_router: APIRouter,
    *,
    db,
    get_current_user: Callable,
    send_email_notification: Callable,
    get_client_ip: Callable,
    app_base_url: str,
    secret_key: str,
):
    """Attach Unbiassly HTTP routes to the shared /api router."""

    async def _room_by_token(token: str) -> dict:
        room = await db.unbiassly_rooms.find_one({"share_token": token}, {"_id": 0})
        if not room:
            raise HTTPException(status_code=404, detail="This Unbiassly link was not found")
        return room

    async def _owned_room(room_id: str, user: dict) -> dict:
        room = await db.unbiassly_rooms.find_one({"id": room_id}, {"_id": 0})
        if not room:
            raise HTTPException(status_code=404, detail="Discussion not found")
        if room.get("organizer_id") != user.get("id"):
            raise HTTPException(status_code=403, detail="Only the organizer can see this")
        return room

    async def _posts_for(room_id: str) -> List[dict]:
        return await db.unbiassly_posts.find(
            {"room_id": room_id},
            {"_id": 0, "ip_hash": 0, "organizer_id": 0},
        ).sort("created_at", 1).to_list(MAX_POSTS_PER_ROOM)

    async def _refresh_summary(room: dict) -> dict:
        posts = await _posts_for(room["id"])
        summary = await generate_summary(room, posts)
        await db.unbiassly_rooms.update_one(
            {"id": room["id"]},
            {"$set": {
                "summary": summary,
                "last_summary_at": summary.get("generated_at"),
                "contribution_count": len(posts),
            }},
        )
        room["summary"] = summary
        room["contribution_count"] = len(posts)
        return summary

    async def _email_summary(room: dict, summary: dict) -> None:
        to_email = (room.get("organizer_email") or "").strip().lower()
        if not to_email:
            return
        topic = room.get("topic") or "your Unbiassly discussion"
        await send_email_notification(
            to_email,
            f"Unbiassly: {topic[:80]}",
            summary_email_html(room, summary, app_base_url=app_base_url),
        )
        await db.unbiassly_rooms.update_one(
            {"id": room["id"]},
            {"$set": {"summary_emailed_at": _now_iso()}},
        )

    @api_router.post("/unbiassly/rooms")
    async def create_room(body: RoomCreate, current_user: dict = Depends(get_current_user)):
        existing = await db.unbiassly_rooms.count_documents({"organizer_id": current_user["id"]})
        if existing >= MAX_ROOMS_PER_USER:
            raise HTTPException(status_code=429, detail="You have a lot of Unbiassly rooms. Close or delete one first.")
        token = new_share_token()
        for _ in range(6):
            clash = await db.unbiassly_rooms.find_one({"share_token": token}, {"_id": 1})
            if not clash:
                break
            token = new_share_token()
        now = _now_iso()
        room = {
            "id": str(uuid.uuid4()),
            "share_token": token,
            "organizer_id": current_user["id"],
            "organizer_email": (current_user.get("email") or "").strip().lower(),
            "topic": body.topic,
            "prompt": body.prompt or "",
            "status": "open",
            "email_updates": bool(body.email_updates if body.email_updates is not None else True),
            "contribution_count": 0,
            "summary": empty_summary({"topic": body.topic, "prompt": body.prompt}, []),
            "created_at": now,
            "closed_at": None,
            "last_summary_at": now,
        }
        await db.unbiassly_rooms.insert_one(room)
        return organizer_room_payload(room, [], app_base_url=app_base_url)

    @api_router.get("/unbiassly/rooms")
    async def list_rooms(current_user: dict = Depends(get_current_user)):
        rooms = await db.unbiassly_rooms.find(
            {"organizer_id": current_user["id"]},
            {"_id": 0, "organizer_email": 0},
        ).sort("created_at", -1).to_list(MAX_ROOMS_PER_USER)
        return {"rooms": [organizer_list_item(r, app_base_url=app_base_url) for r in rooms]}

    @api_router.get("/unbiassly/rooms/{room_id}")
    async def get_room(room_id: str, current_user: dict = Depends(get_current_user)):
        room = await _owned_room(room_id, current_user)
        posts = await _posts_for(room_id)
        return organizer_room_payload(room, posts, app_base_url=app_base_url)

    @api_router.post("/unbiassly/rooms/{room_id}/summary")
    async def refresh_room_summary(room_id: str, current_user: dict = Depends(get_current_user)):
        room = await _owned_room(room_id, current_user)
        summary = await _refresh_summary(room)
        posts = await _posts_for(room_id)
        payload = organizer_room_payload(room, posts, app_base_url=app_base_url)
        payload["summary"] = summary
        return payload

    @api_router.post("/unbiassly/rooms/{room_id}/email-summary")
    async def email_room_summary(
        room_id: str,
        background_tasks: BackgroundTasks,
        current_user: dict = Depends(get_current_user),
    ):
        room = await _owned_room(room_id, current_user)
        summary = room.get("summary") or await _refresh_summary(room)
        if int((summary or {}).get("contribution_count") or room.get("contribution_count") or 0) == 0:
            raise HTTPException(status_code=400, detail="Nothing to email yet")
        background_tasks.add_task(_email_summary, room, summary)
        return {"ok": True, "message": "Summary is on its way to your email."}

    @api_router.post("/unbiassly/rooms/{room_id}/close")
    async def close_room(
        room_id: str,
        background_tasks: BackgroundTasks,
        current_user: dict = Depends(get_current_user),
    ):
        room = await _owned_room(room_id, current_user)
        if room.get("status") == "closed":
            posts = await _posts_for(room_id)
            return organizer_room_payload(room, posts, app_base_url=app_base_url)
        summary = await _refresh_summary(room)
        now = _now_iso()
        await db.unbiassly_rooms.update_one(
            {"id": room_id},
            {"$set": {"status": "closed", "closed_at": now}},
        )
        room["status"] = "closed"
        room["closed_at"] = now
        if room.get("email_updates") and int(room.get("contribution_count") or 0) > 0:
            background_tasks.add_task(_email_summary, room, summary)
        posts = await _posts_for(room_id)
        return organizer_room_payload(room, posts, app_base_url=app_base_url)

    @api_router.delete("/unbiassly/rooms/{room_id}")
    async def delete_room(room_id: str, current_user: dict = Depends(get_current_user)):
        await _owned_room(room_id, current_user)
        await db.unbiassly_posts.delete_many({"room_id": room_id})
        await db.unbiassly_rooms.delete_one({"id": room_id})
        return {"ok": True}

    @api_router.get("/unbiassly/{token}")
    async def public_room(token: str):
        room = await _room_by_token(token)
        posts = await _posts_for(room["id"])
        return public_room_payload(room, posts, app_base_url=app_base_url)

    @api_router.post("/unbiassly/{token}/posts")
    async def contribute(
        token: str,
        body: ContributionCreate,
        request: Request,
        background_tasks: BackgroundTasks,
    ):
        room = await _room_by_token(token)
        if room.get("status") != "open":
            raise HTTPException(status_code=403, detail="This discussion is closed")
        count = int(room.get("contribution_count") or 0)
        if count >= MAX_POSTS_PER_ROOM:
            raise HTTPException(status_code=429, detail="This discussion is full")

        ip = get_client_ip(request)
        ip_fp = hash_ip(ip, salt=f"unbiassly|{secret_key}") or hashlib.sha256(
            f"unbiassly|{secret_key}|unknown".encode()
        ).hexdigest()[:32]
        window_start = (datetime.now(timezone.utc) - timedelta(minutes=POST_WINDOW_MINUTES)).isoformat()
        recent = await db.unbiassly_posts.count_documents({
            "room_id": room["id"],
            "ip_hash": ip_fp,
            "created_at": {"$gte": window_start},
        })
        if recent >= POSTS_PER_WINDOW:
            raise HTTPException(status_code=429, detail="Slow down a little so others can speak too")

        post = {
            "id": str(uuid.uuid4()),
            "room_id": room["id"],
            "body": body.body,
            "created_at": _now_iso(),
            "ip_hash": ip_fp,
        }
        await db.unbiassly_posts.insert_one(post)
        new_count = count + 1
        await db.unbiassly_rooms.update_one(
            {"id": room["id"]},
            {"$set": {"contribution_count": new_count, "last_post_at": post["created_at"]}},
        )
        room["contribution_count"] = new_count

        async def maybe_summarize():
            try:
                await _refresh_summary(room)
            except Exception as exc:
                logging.warning("Unbiassly auto-summary failed: %s", exc)

        background_tasks.add_task(maybe_summarize)
        posts = await _posts_for(room["id"])
        return public_room_payload(room, posts, app_base_url=app_base_url)
