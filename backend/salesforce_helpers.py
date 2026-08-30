"""Motive Salesforce proof + activity write-back.

Tskflow does not become a CRM. Motive (Sales Cloud) stays the system of record.
We match the Tskflow user to a Salesforce User by email, then:

  - Proof: did they actually log the call / touch the opp / move forecast?
  - Write-back: completing a Tskflow sales task stamps a completed Salesforce Task.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx

from brand import SALESFORCE_PRESET, SALESFORCE_PRESET_LABEL

logger = logging.getLogger("tskflow.salesforce")

API_VERSION = "v61.0"
DEFAULT_LOGIN = "https://login.salesforce.com"

KIND_CALL = "call"
KIND_FORECAST = "forecast"
KIND_PIPELINE = "pipeline"
KIND_DEAL = "deal"
KIND_GENERIC = "generic"

_CALL_RE = re.compile(
    r"(?i)\b(log|logged|logging)?\s*(every\s+)?(call|calls|dial|dials|conversation)s?\b|"
    r"\bcall\s+log\b|\bcold[-\s]?call"
)
_FORECAST_RE = re.compile(r"(?i)\bforecast|commit|pipeline\s+commit|this week'?s\s+number")
_PIPELINE_RE = re.compile(
    r"(?i)\bpipeline\s+update|hygiene|next\s+step|stage\s+update|sfdc|salesforce\s+hygiene|"
    r"opportunit(?:y|ies)\s+(?:update|review|hygiene)"
)
_DEAL_RE = re.compile(r"(?i)\bbest\s+deal|closed[-\s]?won|new\s+opportunit|submit.{0,24}deal")

MOTIVE_HINTS = ("motive", "gomotive", "keeptruckin")


def salesforce_configured() -> bool:
    return bool(
        (os.getenv("SALESFORCE_CLIENT_ID") or "").strip()
        and (os.getenv("SALESFORCE_CLIENT_SECRET") or "").strip()
    )


def salesforce_login_url() -> str:
    return (os.getenv("SALESFORCE_LOGIN_URL") or DEFAULT_LOGIN).rstrip("/")


def salesforce_redirect_uri(app_base: str) -> str:
    return f"{app_base.rstrip('/')}/api/integrations/salesforce/oauth/callback"


def oauth_authorize_url(app_base: str, state: str) -> str:
    params = {
        "response_type": "code",
        "client_id": (os.getenv("SALESFORCE_CLIENT_ID") or "").strip(),
        "redirect_uri": salesforce_redirect_uri(app_base),
        "state": state,
        "scope": "api refresh_token id",
        "prompt": "login",
    }
    return f"{salesforce_login_url()}/services/oauth2/authorize?{urlencode(params)}"


def classify_sales_ask(title: str = "", description: str = "") -> str:
    blob = f"{title or ''} {description or ''}"
    if _CALL_RE.search(blob):
        return KIND_CALL
    if _FORECAST_RE.search(blob):
        return KIND_FORECAST
    if _DEAL_RE.search(blob):
        return KIND_DEAL
    if _PIPELINE_RE.search(blob):
        return KIND_PIPELINE
    return KIND_GENERIC


def looks_like_motive(identity: Optional[dict] = None, instance_url: str = "") -> bool:
    blob = f"{instance_url or ''} {identity or ''}".lower()
    return any(h in blob for h in MOTIVE_HINTS)


def soql_escape(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace("'", "\\'")


def _today_soql(now: Optional[datetime] = None) -> str:
    dt = now or datetime.now(timezone.utc)
    return dt.strftime("%Y-%m-%d")


def _datetime_range_soql(now: Optional[datetime] = None) -> tuple:
    """Inclusive start / exclusive end for Salesforce DateTime fields."""
    dt = now or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    start = dt.strftime("%Y-%m-%dT00:00:00Z")
    end = (dt + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00Z")
    return start, end


def proof_soql(kind: str, sf_user_id: str, now: Optional[datetime] = None) -> str:
    """SOQL that proves the Motive work happened today. Standard Sales Cloud."""
    uid = soql_escape(sf_user_id)
    day = _today_soql(now)
    start, end = _datetime_range_soql(now)
    touched = f"LastModifiedDate >= {start} AND LastModifiedDate < {end}"
    if kind == KIND_CALL:
        return (
            "SELECT Id, Subject, ActivityDate, Type, Status, LastModifiedDate "
            "FROM Task WHERE OwnerId = '{uid}' AND ActivityDate = {day} "
            "AND (Type = 'Call' OR Subject LIKE '%Call%') "
            "ORDER BY LastModifiedDate DESC LIMIT 20"
        ).format(uid=uid, day=day)
    if kind == KIND_FORECAST:
        return (
            "SELECT Id, Name, Amount, StageName, ForecastCategoryName, CloseDate, LastModifiedDate "
            "FROM Opportunity WHERE OwnerId = '{uid}' AND {touched} "
            "AND ForecastCategoryName != null "
            "ORDER BY LastModifiedDate DESC LIMIT 20"
        ).format(uid=uid, touched=touched)
    if kind == KIND_DEAL:
        created = f"(CreatedDate >= {start} AND CreatedDate < {end})"
        return (
            "SELECT Id, Name, Amount, StageName, CloseDate, CreatedDate, LastModifiedDate "
            "FROM Opportunity WHERE OwnerId = '{uid}' "
            "AND ({created} OR ({touched})) "
            "ORDER BY LastModifiedDate DESC LIMIT 10"
        ).format(uid=uid, created=created, touched=touched)
    # pipeline + generic: any opp the AE touched today
    return (
        "SELECT Id, Name, Amount, StageName, NextStep, CloseDate, LastModifiedDate "
        "FROM Opportunity WHERE OwnerId = '{uid}' AND {touched} "
        "ORDER BY LastModifiedDate DESC LIMIT 20"
    ).format(uid=uid, touched=touched)


def user_lookup_soql(email: str) -> str:
    return (
        "SELECT Id, Name, Email, IsActive FROM User "
        f"WHERE Email = '{soql_escape(email)}' AND IsActive = true LIMIT 1"
    )


def writeback_task_payload(tskflow_task: dict, sf_user_id: str, kind: str) -> dict:
    title = str((tskflow_task or {}).get("title") or "Tskflow")[:80]
    note = str((tskflow_task or {}).get("completion_note") or (tskflow_task or {}).get("description") or "")[:32000]
    subject = f"Tskflow · {title}"[:255]
    task_type = "Call" if kind == KIND_CALL else "Other"
    return {
        "Subject": subject,
        "Status": "Completed",
        "Priority": "Normal",
        "Type": task_type,
        "OwnerId": sf_user_id,
        "Description": note or f"Closed in Tskflow ({SALESFORCE_PRESET_LABEL}).",
        "TaskSubtype": "Call" if kind == KIND_CALL else "Task",
    }


def summarize_proof(kind: str, records: List[dict]) -> dict:
    found = bool(records)
    return {
        "kind": kind,
        "preset": SALESFORCE_PRESET,
        "preset_label": SALESFORCE_PRESET_LABEL,
        "found": found,
        "count": len(records),
        "records": [
            {
                "id": r.get("Id"),
                "name": r.get("Name") or r.get("Subject"),
                "stage": r.get("StageName"),
                "amount": r.get("Amount"),
                "type": r.get("Type"),
            }
            for r in (records or [])[:8]
        ],
        "auto_complete_eligible": found and kind in (KIND_CALL, KIND_FORECAST, KIND_PIPELINE),
    }


async def exchange_code(code: str, app_base: str) -> dict:
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": (os.getenv("SALESFORCE_CLIENT_ID") or "").strip(),
        "client_secret": (os.getenv("SALESFORCE_CLIENT_SECRET") or "").strip(),
        "redirect_uri": salesforce_redirect_uri(app_base),
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{salesforce_login_url()}/services/oauth2/token", data=data)
    payload = r.json() if r.content else {}
    if r.status_code >= 400 or payload.get("error"):
        raise RuntimeError(payload.get("error_description") or payload.get("error") or "oauth_failed")
    return payload


async def refresh_access_token(refresh_token: str) -> dict:
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": (os.getenv("SALESFORCE_CLIENT_ID") or "").strip(),
        "client_secret": (os.getenv("SALESFORCE_CLIENT_SECRET") or "").strip(),
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{salesforce_login_url()}/services/oauth2/token", data=data)
    payload = r.json() if r.content else {}
    if r.status_code >= 400 or payload.get("error"):
        raise RuntimeError(payload.get("error_description") or payload.get("error") or "refresh_failed")
    return payload


async def sf_get(instance_url: str, access_token: str, path: str, params: Optional[dict] = None) -> dict:
    url = f"{instance_url.rstrip('/')}{path}"
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, headers=headers, params=params)
    if r.status_code >= 400:
        raise RuntimeError(r.text[:400] or f"sf_get {r.status_code}")
    return r.json() if r.content else {}


async def sf_post(instance_url: str, access_token: str, path: str, json_body: dict) -> dict:
    url = f"{instance_url.rstrip('/')}{path}"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, headers=headers, json=json_body)
    if r.status_code >= 400:
        raise RuntimeError(r.text[:400] or f"sf_post {r.status_code}")
    return r.json() if r.content else {}


async def query(instance_url: str, access_token: str, soql: str) -> List[dict]:
    path = f"/services/data/{API_VERSION}/query"
    data = await sf_get(instance_url, access_token, path, params={"q": soql})
    return list(data.get("records") or [])


async def identity(id_url: str, access_token: str) -> dict:
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(id_url, headers=headers)
    if r.status_code >= 400:
        raise RuntimeError(r.text[:400] or "identity_failed")
    return r.json() if r.content else {}
