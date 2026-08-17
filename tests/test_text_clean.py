"""Mojibake / curly punctuation never reaches the UI."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from text_clean import clean_display_text, clean_tree  # noqa: E402


def test_repairs_double_encoded_apostrophe():
    garbled = "No progress yet \u00c3\u00a2\u00c2\u20ac\u00c2\u2122 need help?"
    out = clean_display_text(garbled)
    assert "Ã" not in out
    assert "Â" not in out
    assert "'" in out
    assert "need help?" in out


def test_repairs_cp1252_apostrophe_and_dash():
    assert clean_display_text("get the team \u00e2\u20ac\u2122 priority") == "get the team ' priority"
    assert clean_display_text("Due soon \u2014 heads up") == "Due soon - heads up"
    dashy = "No progress yet \u00c3\u00a2\u00c2\u00a0\u00c2\u2551 need help?"
    assert clean_display_text(dashy) == "No progress yet - need help?"


def test_leaves_real_unicode_words_alone():
    assert clean_display_text("café") == "café"
    assert clean_display_text("You're almost out of time") == "You're almost out of time"


def test_clean_tree_skips_secrets_and_cleans_titles():
    data = {
        "title": "No progress yet \u00c3\u00a2\u00c2\u20ac\u00c2\u2122 need help?",
        "token": "Ã¢Â€Â™-secret",
        "nested": [{"body": "Due soon \u2014 heads up"}],
    }
    out = clean_tree(data)
    assert "Ã" not in out["title"]
    assert out["token"] == "Ã¢Â€Â™-secret"
    assert out["nested"][0]["body"] == "Due soon - heads up"


def test_frontend_cleaner_matches_backend():
    script = r"""
import { cleanDisplayText, cleanJsonTree } from './frontend/src/lib/cleanDisplayText.js';
const a = cleanDisplayText('No progress yet \u00c3\u00a2\u00c2\u20ac\u00c2\u2122 need help?');
if (a.includes('\u00c3') || !a.includes("'")) { console.error('apostrophe', a); process.exit(1); }
const b = cleanDisplayText('Due soon \u2014 heads up');
if (b !== 'Due soon - heads up') { console.error('dash', b); process.exit(1); }
const c = cleanJsonTree({ title: 'x \u2019 y', token: '\u00c3\u00a2' });
if (c.title !== "x ' y" || c.token !== '\u00c3\u00a2') { console.error('tree', c); process.exit(1); }
console.log('ok');
"""
    r = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_app_intercepts_and_display_title_cleans():
    app = (ROOT / "frontend" / "src" / "App.js").read_text(encoding="utf-8")
    bell = (ROOT / "frontend" / "src" / "components" / "NotificationBell.js").read_text(encoding="utf-8")
    desc = (ROOT / "frontend" / "src" / "lib" / "taskDescription.js").read_text(encoding="utf-8")
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "cleanJsonTree" in app
    assert "axios.interceptors.response" in app
    assert "cleanDisplayText" in desc
    assert "default_response_class=CleanJSONResponse" in server
    assert "clean_display_text" in server
    assert "bg-teal-50/40" not in bell
