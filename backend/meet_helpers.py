"""Google Meet transcript → meeting session.

Organizer + co-hosts edit the ask list. Only the organizer publishes it.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

logger = logging.getLogger("tskflow.meet")

MEET_SCOPES = [
    "https://www.googleapis.com/auth/meetings.space.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

ROLE_ORGANIZER = "organizer"
ROLE_COHOST = "cohost"
STATUS_PENDING = "pending_review"
STATUS_PUBLISHED = "published"

MEET_API = "https://meet.googleapis.com/v2"


def meet_credentials(creds_data: dict) -> Credentials:
    return Credentials(
        token=creds_data.get("token"),
        refresh_token=creds_data.get("refresh_token"),
        token_uri=creds_data.get("token_uri") or "https://oauth2.googleapis.com/token",
        client_id=creds_data.get("client_id"),
        client_secret=creds_data.get("client_secret"),
        scopes=MEET_SCOPES,
    )


def meeting_code_from_event(event: dict) -> Optional[str]:
    data = (event or {}).get("conferenceData") or {}
    code = data.get("conferenceId") or ""
    if code:
        return str(code)
    hangout = (event or {}).get("hangoutLink") or ""
    m = re.search(r"meet\.google\.com/([a-z0-9-]+)", hangout, re.I)
    return m.group(1) if m else None


def event_organizer_email(event: dict) -> str:
    org = (event or {}).get("organizer") or {}
    return str(org.get("email") or "").strip().lower()


def event_attendee_emails(event: dict) -> List[str]:
    out: List[str] = []
    for a in (event or {}).get("attendees") or []:
        email = str(a.get("email") or "").strip().lower()
        if email and email not in out:
            out.append(email)
    return out


def event_cohost_emails(event: dict) -> List[str]:
    """Calendar guests marked as extra organizers. Empty → session_roles falls back to attendees."""
    org = event_organizer_email(event)
    out: List[str] = []
    for a in (event or {}).get("attendees") or []:
        email = str(a.get("email") or "").strip().lower()
        if not email or email == org or a.get("resource"):
            continue
        if a.get("organizer") and email not in out:
            out.append(email)
    return out


def event_has_ended(event: dict, now: Optional[datetime] = None) -> bool:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    end = (event or {}).get("end") or {}
    raw = end.get("dateTime") or end.get("date") or ""
    if not raw:
        return False
    try:
        if len(raw) <= 10:
            end_dt = datetime.fromisoformat(raw).replace(tzinfo=timezone.utc) + timedelta(days=1)
        else:
            end_dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)
        return end_dt <= now
    except Exception:
        return False


def session_roles(organizer_email: str, cohost_emails: List[str], attendee_emails: List[str]) -> dict:
    org = (organizer_email or "").strip().lower()
    cohosts = sorted({e.strip().lower() for e in (cohost_emails or []) if e and e.strip().lower() != org})
    attendees = sorted({e.strip().lower() for e in (attendee_emails or []) if e})
    return {
        "organizer_email": org,
        "cohost_emails": cohosts,
        "attendee_emails": attendees,
        "editor_emails": sorted({org, *cohosts} if cohosts else {org, *attendees}),
    }


def can_edit_session(session: dict, user_email: str) -> bool:
    email = (user_email or "").strip().lower()
    if not email or not session:
        return False
    if session.get("status") == STATUS_PUBLISHED:
        return False
    editors = [e.lower() for e in (session.get("editor_emails") or [])]
    if email in editors:
        return True
    return email == str(session.get("organizer_email") or "").lower()


def can_publish_session(session: dict, user_email: str) -> bool:
    email = (user_email or "").strip().lower()
    if not email or not session:
        return False
    if session.get("status") == STATUS_PUBLISHED:
        return False
    return email == str(session.get("organizer_email") or "").lower()


def apply_draft_vote(session: dict, user_email: str, draft_id: str, keep: bool) -> dict:
    """Cohost/organizer keep-or-drop a draft. Does not publish."""
    next_session = dict(session)
    votes = dict(next_session.get("votes") or {})
    person = dict(votes.get(user_email) or {})
    person[draft_id] = "keep" if keep else "drop"
    votes[user_email] = person
    next_session["votes"] = votes
    drafts = []
    for d in list(next_session.get("drafts") or []):
        row = dict(d)
        if str(row.get("id")) == str(draft_id) and not keep:
            row["dropped"] = True
        if str(row.get("id")) == str(draft_id) and keep:
            row["dropped"] = False
        drafts.append(row)
    next_session["drafts"] = drafts
    return next_session


def kept_drafts(session: dict) -> List[dict]:
    return [d for d in (session.get("drafts") or []) if not d.get("dropped")]


def entries_to_transcript(entries: List[dict]) -> str:
    lines = []
    for e in entries or []:
        speaker = (
            ((e.get("participant") or {}).get("displayName"))
            or e.get("participantName")
            or ""
        )
        text = (e.get("text") or "").strip()
        if not text:
            continue
        if speaker:
            lines.append(f"{speaker}: {text}")
        else:
            lines.append(text)
    return "\n".join(lines)


def list_ended_meet_events(creds_data: dict, now: Optional[datetime] = None, hours: int = 6) -> List[dict]:
    """Calendar events that had a Meet and just ended."""
    now = now or datetime.now(timezone.utc)
    start = (now - timedelta(hours=hours)).isoformat()
    end = now.isoformat()
    creds = meet_credentials(creds_data)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    result = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=start,
            timeMax=end,
            singleEvents=True,
            orderBy="startTime",
            maxResults=40,
        )
        .execute()
    )
    out = []
    for ev in result.get("items") or []:
        if meeting_code_from_event(ev) and event_has_ended(ev, now):
            out.append(ev)
    return out


def access_token(creds_data: dict) -> str:
    creds = meet_credentials(creds_data)
    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request

        creds.refresh(Request())
    return creds.token or ""


async def fetch_transcript_via_meet_api(creds_data: dict, meeting_code: str) -> str:
    """Pull speaker lines from Meet conferenceRecords. Empty if Meet API is off."""
    import httpx

    token = access_token(creds_data)
    if not token or not meeting_code:
        return ""
    headers = {"Authorization": f"Bearer {token}"}
    code = str(meeting_code).replace('"', "")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            listed = await client.get(
                f"{MEET_API}/conferenceRecords",
                headers=headers,
                params={"filter": f'space.meeting_code = "{code}"', "pageSize": 5},
            )
            if listed.status_code >= 400:
                return ""
            records = (listed.json() or {}).get("conferenceRecords") or []
            if not records:
                return ""
            name = records[0].get("name") or ""
            if not name:
                return ""
            tr = await client.get(
                f"{MEET_API}/{name}/transcripts",
                headers=headers,
                params={"pageSize": 5},
            )
            if tr.status_code >= 400:
                return ""
            transcripts = (tr.json() or {}).get("transcripts") or []
            if not transcripts:
                return ""
            tname = transcripts[0].get("name") or ""
            entries: List[dict] = []
            page_token = ""
            while True:
                params = {"pageSize": 100}
                if page_token:
                    params["pageToken"] = page_token
                er = await client.get(
                    f"{MEET_API}/{tname}/entries",
                    headers=headers,
                    params=params,
                )
                if er.status_code >= 400:
                    break
                body = er.json() or {}
                entries.extend(body.get("transcriptEntries") or [])
                page_token = body.get("nextPageToken") or ""
                if not page_token:
                    break
            return entries_to_transcript(entries)
    except Exception as e:
        logger.warning("Meet API transcript failed: %s", e)
        return ""


def fetch_transcript_via_drive(creds_data: dict, title_hint: str = "") -> str:
    files = drive_transcript_docs(creds_data, title_hint=title_hint)
    if not files:
        return ""
    creds = meet_credentials(creds_data)
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    file_id = files[0].get("id")
    try:
        data = service.files().export(fileId=file_id, mimeType="text/plain").execute()
        if isinstance(data, bytes):
            return data.decode("utf-8", errors="ignore")
        return str(data or "")
    except Exception as e:
        logger.warning("Drive transcript export failed: %s", e)
        return ""


def drive_transcript_docs(creds_data: dict, title_hint: str = "", hours: int = 8) -> List[dict]:
    """Meet often drops a Google Doc named '{meeting} - Transcript'."""
    creds = meet_credentials(creds_data)
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    after = (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
    q = (
        "mimeType = 'application/vnd.google-apps.document' "
        "and trashed = false "
        f"and modifiedTime > '{after}' "
        "and name contains 'Transcript'"
    )
    hint = (title_hint or "").strip()
    if hint:
        safe = hint.replace("'", "\\'")[:80]
        q = f"({q}) and name contains '{safe}'"
    result = (
        service.files()
        .list(q=q, pageSize=10, fields="files(id,name,modifiedTime,webViewLink)")
        .execute()
    )
    return list(result.get("files") or [])
