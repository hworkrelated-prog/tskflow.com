"""Google Sheets daily-metrics sync helpers."""
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]


def extract_spreadsheet_id(url_or_id: str) -> str:
    raw = (url_or_id or "").strip()
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", raw)
    if m:
        return m.group(1)
    if re.fullmatch(r"[a-zA-Z0-9-_]+", raw):
        return raw
    raise ValueError("Invalid Google Sheet URL or ID")


def _col_to_index(col: str) -> int:
    """A -> 0, B -> 1, AA -> 26. Also accepts 0-based numeric strings."""
    col = (col or "").strip().upper()
    if col.isdigit():
        return int(col)
    n = 0
    for ch in col:
        if not ("A" <= ch <= "Z"):
            raise ValueError(f"Invalid column: {col}")
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n - 1


def credentials_from_stored(creds_data: dict) -> Credentials:
    return Credentials(
        token=creds_data.get("token"),
        refresh_token=creds_data.get("refresh_token"),
        token_uri=creds_data.get("token_uri") or "https://oauth2.googleapis.com/token",
        client_id=creds_data.get("client_id"),
        client_secret=creds_data.get("client_secret"),
        scopes=SHEETS_SCOPES,
    )


def fetch_sheet_values(creds_data: dict, spreadsheet_id: str, sheet_name: str = "Sheet1") -> List[List[Any]]:
    creds = credentials_from_stored(creds_data)
    service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    rng = f"'{sheet_name}'!A:ZZ"
    result = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=rng).execute()
    return result.get("values") or []


def _parse_date_cell(val: Any) -> Optional[str]:
    """Return YYYY-MM-DD if parseable."""
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y/%m/%d", "%d-%b-%Y", "%b %d, %Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # Excel serial dates sometimes appear as ints — skip if weird
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    if m:
        return m.group(1)
    return None


def _num(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        return float(str(val).replace(",", "").replace("%", "").strip())
    except Exception:
        return None


def parse_metrics_rows(
    values: List[List[Any]],
    *,
    person_column: str,
    date_column: str,
    metrics: List[dict],
    has_header: bool = True,
) -> List[dict]:
    """Parse sheet rows into {person, date, metrics{key: value}} dicts."""
    if not values:
        return []
    p_idx = _col_to_index(person_column)
    d_idx = _col_to_index(date_column)
    metric_specs = []
    for m in metrics or []:
        key = (m.get("key") or m.get("label") or "").strip().lower().replace(" ", "_")
        if not key or not m.get("column"):
            continue
        metric_specs.append({
            "key": key,
            "label": m.get("label") or key,
            "col": _col_to_index(m["column"]),
            "target": _num(m.get("daily_target")),
        })
    start = 1 if has_header and len(values) > 1 else 0
    out = []
    for row in values[start:]:
        if not row:
            continue
        person = row[p_idx].strip() if p_idx < len(row) and row[p_idx] else ""
        date_raw = row[d_idx] if d_idx < len(row) else None
        day = _parse_date_cell(date_raw)
        if not person or not day:
            continue
        metric_vals = {}
        targets = {}
        for spec in metric_specs:
            v = row[spec["col"]] if spec["col"] < len(row) else None
            n = _num(v)
            if n is not None:
                metric_vals[spec["key"]] = n
            if spec["target"] is not None:
                targets[spec["key"]] = spec["target"]
        out.append({
            "person_name": person,
            "date": day,
            "metrics": metric_vals,
            "targets": targets,
        })
    return out


async def match_person_to_user(db, company_domain: Optional[str], person_name: str) -> Optional[dict]:
    """Best-effort match sheet person name/email to a user in the company."""
    name = (person_name or "").strip()
    if not name:
        return None
    q = {}
    if company_domain:
        q["company_domain"] = company_domain
    if "@" in name:
        u = await db.users.find_one({"email": name.lower(), **q}, {"_id": 0, "id": 1, "name": 1, "email": 1})
        if u:
            return u
    # Exact name (case-insensitive)
    users = await db.users.find(q, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(500)
    low = name.lower()
    for u in users:
        if (u.get("name") or "").strip().lower() == low:
            return u
    # First-name / partial
    for u in users:
        uname = (u.get("name") or "").strip().lower()
        if low in uname or uname in low or (uname and uname.split()[0] == low.split()[0]):
            return u
    return None


async def upsert_daily_metrics(
    db,
    *,
    owner_user_id: str,
    company_domain: Optional[str],
    config_id: str,
    rows: List[dict],
) -> int:
    now = datetime.now(timezone.utc).isoformat()
    count = 0
    for row in rows:
        matched = await match_person_to_user(db, company_domain, row["person_name"])
        filt = {
            "config_id": config_id,
            "date": row["date"],
            "person_name": row["person_name"],
        }
        doc = {
            **filt,
            "id": str(uuid.uuid4()),
            "owner_user_id": owner_user_id,
            "company_domain": company_domain,
            "user_id": (matched or {}).get("id"),
            "person_email": (matched or {}).get("email"),
            "metrics": row.get("metrics") or {},
            "targets": row.get("targets") or {},
            "source": "google_sheets",
            "synced_at": now,
        }
        existing = await db.daily_metrics.find_one(filt, {"_id": 0, "id": 1})
        if existing:
            await db.daily_metrics.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "user_id": doc["user_id"],
                    "person_email": doc["person_email"],
                    "metrics": doc["metrics"],
                    "targets": doc["targets"],
                    "synced_at": now,
                    "company_domain": company_domain,
                }},
            )
        else:
            await db.daily_metrics.insert_one(doc)
        count += 1
    return count


def format_metrics_line(row: dict) -> str:
    metrics = row.get("metrics") or {}
    targets = row.get("targets") or {}
    bits = []
    for k, v in metrics.items():
        t = targets.get(k)
        if t is not None:
            pct = int(round((v / t) * 100)) if t else 0
            bits.append(f"{k}: {v:g}/{t:g} ({pct}%)")
        else:
            bits.append(f"{k}: {v:g}")
    return ", ".join(bits) if bits else "(no metric values)"


async def build_sheet_metrics_eod_section(
    db,
    u: dict,
    now,
    *,
    include_self: bool = True,
    include_team: bool = True,
) -> Tuple[str, str, dict]:
    """HTML + Slack text for today's synced sheet metrics."""
    day = now.strftime("%Y-%m-%d")
    domain = u.get("company_domain")
    own = []
    team = []
    if include_self:
        own = await db.daily_metrics.find({
            "date": day,
            "$or": [{"user_id": u["id"]}, {"owner_user_id": u["id"], "person_name": u.get("name")}],
        }, {"_id": 0}).to_list(20)
    if include_team and domain:
        # Direct reports + anyone in domain the manager owns a sync for
        reports = await db.users.find({"reports_to": u["id"]}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
        report_ids = [r["id"] for r in reports]
        q = {"date": day, "company_domain": domain}
        if report_ids:
            q = {
                "date": day,
                "$or": [
                    {"user_id": {"$in": report_ids}},
                    {"owner_user_id": u["id"]},
                ],
            }
        else:
            q = {"date": day, "owner_user_id": u["id"]}
        team = await db.daily_metrics.find(q, {"_id": 0}).to_list(200)
        # Dedupe by person+date
        seen = set()
        deduped = []
        for r in team:
            key = (r.get("person_name"), r.get("date"))
            if key in seen:
                continue
            seen.add(key)
            # skip self duplicates in team list
            if r.get("user_id") == u["id"]:
                continue
            deduped.append(r)
        team = deduped

    if not own and not team:
        return "", "", {}

    html_parts = ['<h3 style="font-size:16px;margin:24px 0 8px;">Daily activity metrics (Google Sheets)</h3><ul style="padding-left:20px;margin:0;">']
    slack_parts = ["*Daily activity metrics (Sheets)*"]
    for r in own:
        line = format_metrics_line(r)
        html_parts.append(f"<li><strong>You</strong> — {line}</li>")
        slack_parts.append(f"You — {line}")
    for r in team[:30]:
        line = format_metrics_line(r)
        name = r.get("person_name") or "Teammate"
        html_parts.append(f"<li><strong>{name}</strong> — {line}</li>")
        slack_parts.append(f"{name} — {line}")
    html_parts.append("</ul>")
    return "".join(html_parts), "\n".join(slack_parts), {"sheet_metric_rows": len(own) + len(team)}


async def find_person_metrics(
    db,
    manager: dict,
    person_query: str,
    *,
    date: Optional[str] = None,
    limit: int = 10,
) -> List[dict]:
    """Lookup metrics for a named person (manager Q&A / voice)."""
    qname = (person_query or "").strip().lower()
    if not qname:
        return []
    day = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    domain = manager.get("company_domain")
    filt: Dict[str, Any] = {"date": day}
    if domain:
        filt["company_domain"] = domain
    else:
        filt["owner_user_id"] = manager["id"]
    rows = await db.daily_metrics.find(filt, {"_id": 0}).to_list(500)
    hits = []
    for r in rows:
        pn = (r.get("person_name") or "").lower()
        pe = (r.get("person_email") or "").lower()
        if qname in pn or qname in pe or pn in qname:
            hits.append(r)
    if not hits:
        # looser: first token
        token = qname.split()[0]
        for r in rows:
            pn = (r.get("person_name") or "").lower()
            if token and token in pn:
                hits.append(r)
    return hits[:limit]
