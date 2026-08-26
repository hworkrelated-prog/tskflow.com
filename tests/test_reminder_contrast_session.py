"""Reminder contrast, channel badges, email counts, session + PWA boot."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BE = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
FE = (ROOT / "frontend" / "src" / "pages" / "TaskDetail.js").read_text(encoding="utf-8")
APP_JS = (ROOT / "frontend" / "src" / "App.js").read_text(encoding="utf-8")
CSS = (ROOT / "frontend" / "src" / "App.css").read_text(encoding="utf-8")
INDEX = (ROOT / "frontend" / "public" / "index.html").read_text(encoding="utf-8")
MANIFEST = (ROOT / "frontend" / "public" / "manifest.json").read_text(encoding="utf-8")


def test_jwt_ttl_is_thirty_days():
    assert "ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30" in BE
    assert "ACCESS_TOKEN_EXPIRE_MINUTES = 1440\n" not in BE


def test_auth_me_only_logs_out_on_401():
    assert "status === 401 || status === 403" in APP_JS
    # Must not blanket-logout on every fetchCurrentUser failure
    fetch_block = APP_JS.split("const fetchCurrentUser = async () => {")[1].split("const login")[0]
    assert "logout();" in fetch_block
    assert "status === 401" in fetch_block
    assert fetch_block.index("status === 401") < fetch_block.index("logout();")


def test_reminder_tone_classes_are_high_contrast():
    for cls in (
        "reminder-tone-overdue",
        "reminder-tone-soon",
        "reminder-tone-nudge",
        "reminder-tone-email",
        "reminder-tone-slack",
        "reminder-tone-default",
        "reminder-channel-in_app",
        "reminder-channel-email",
        "reminder-channel-slack",
    ):
        assert f".{cls}" in CSS
        assert f'[data-theme="dark"] .{cls}' in CSS
    assert "reminder-tone-overdue" in FE
    assert "border-left-width: 3px" in CSS
    # Full-card pops (rose/amber/navy fills) must not come back
    assert "background: #fff1f2 !important" not in CSS
    assert "background: #fffbeb !important" not in CSS
    assert "background: #4c0519 !important" not in CSS
    assert "background: #451a03 !important" not in CSS
    assert "bg-rose-50" not in FE or "reminder-tone" in FE


def test_activity_api_scrubs_slack_and_counts_email():
    assert 'email_count' in BE
    assert "slack_ok" in BE.split("async def get_task_activity")[1].split("async def list_org_activity")[0]
    block = BE.split("async def get_task_activity")[1].split("async def list_org_activity")[0]
    assert 'key == "slack" and not slack_ok' in block
    assert '"email_count": email_count' in block


def test_frontend_hides_slack_unless_connected():
    assert "slackConnected" in FE
    assert "reminderChannels" in FE
    assert "channels.filter((c) => c !== 'slack')" in FE
    assert "emailCount" in FE
    assert "In-app" in FE
    assert "Email" in FE


def test_pwa_boot_splash_not_blank():
    assert "#root:empty" in INDEX
    assert "TskFlow" in INDEX
    assert '"start_url": "/?source=pwa"' in MANIFEST
    assert '"background_color": "#0f172a"' in MANIFEST
    assert "app-boot-splash" in APP_JS
