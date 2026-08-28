"""Teams signup should start Google Calendar OAuth automatically."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "backend" / "server.py"
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def _load_safe_oauth_next():
    src = SERVER.read_text(encoding="utf-8")
    start = src.index("def _safe_oauth_next")
    end = src.index('@api_router.get("/auth/google/connect")', start)
    ns = {}
    exec(src[start:end], ns, ns)
    return ns["_safe_oauth_next"]


def test_backend_stores_next_and_login_hint():
    src = SERVER.read_text(encoding="utf-8")
    connect = src.split("async def google_calendar_connect")[1].split("async def google_calendar_callback")[0]
    callback = src.split("async def google_calendar_callback")[1].split("async def google_calendar_disconnect")[0]
    status = src.split("async def get_payment_status")[1].split("async def create_portal_session")[0]

    assert "login_hint" in connect
    assert 'http_request.query_params.get("next")' in connect
    assert '"next": next_path' in connect
    assert "already_connected" in connect
    assert "_safe_oauth_next" in connect

    assert 'calendar=connected' in callback
    assert "/settings?calendar=connected" not in callback or "next_path" in callback
    assert "next_path}?calendar=connected" in callback or '{next_path}?calendar=connected' in callback
    assert "next_path}?error=oauth_failed" in callback or '{next_path}?error=oauth_failed' in callback

    assert '"package": transaction.get("package")' in status
    assert '"package": transaction.get("package"),' in status


def test_safe_oauth_next_allowlist():
    fn = _load_safe_oauth_next()
    assert fn("/dashboard") == "/dashboard"
    assert fn("/settings") == "/settings"
    assert fn(None) == "/dashboard"
    assert fn("") == "/dashboard"
    assert fn("/connect-calendar") == "/dashboard"
    assert fn("/api/auth/google/callback") == "/dashboard"
    assert fn("https://evil.example/phish") == "/dashboard"
    assert fn("//evil.example") == "/dashboard"
    assert fn("/settings?next=https://evil.example") == "/settings"
    assert fn("/dashboard#hash") == "/dashboard"
    assert fn("dashboard") == "/dashboard"


def test_frontend_signup_routes_to_connect_calendar():
    app = _read("App.js")
    assert 'path="/connect-calendar"' in app
    assert "ConnectCalendarPage" in app

    verify = _read("pages", "VerifyEmailPage.js")
    assert "shouldConnectCalendarOnSignup" in verify
    assert "/connect-calendar" in verify

    pay = _read("pages", "PaymentSuccessPage.js")
    assert "response.data.package" in pay
    assert "/connect-calendar" in pay

    login = _read("pages", "LoginPage.js")
    assert "navigate('/dashboard')" in login
    assert "/connect-calendar" not in login

    connect = _read("pages", "ConnectCalendarPage.js")
    assert 'data-testid="connect-calendar-page"' in connect
    assert "startGoogleCalendarConnect" in connect
    assert "next: '/dashboard'" in connect
    assert 'data-testid="connect-calendar-skip"' in connect

    settings = _read("pages", "SettingsPage.js")
    assert "startGoogleCalendarConnect" in settings
    assert "next: '/settings'" in settings

    hub = _read("pages", "TaskHub.js")
    assert "calendar === 'connected'" in hub
    assert "Google Calendar connected" in hub

    handoff = _read("pages", "GoogleOAuthHandoff.js")
    assert "peekCalendarOAuthNext" in handoff


def test_google_calendar_helpers_via_node():
    src = _read("lib", "googleCalendar.js")
    start = src.index("export const CALENDAR_OAUTH_NEXT_KEY")
    end = src.index("export function rememberCalendarOAuthNext")
    helpers = src[start:end].replace("export ", "")
    script = helpers + r"""
const cases = [
  shouldConnectCalendarOnSignup({ subscription_tier: 'teams', google_calendar_connected: false }),
  shouldConnectCalendarOnSignup({ subscription_tier: 'teams', google_calendar_connected: true }),
  shouldConnectCalendarOnSignup({ subscription_tier: 'pro', google_calendar_connected: false }),
  shouldConnectCalendarOnSignup({ subscription_tier: 'free' }),
  shouldConnectCalendarOnSignup(null),
  safeCalendarOAuthNext('/settings'),
  safeCalendarOAuthNext('/connect-calendar'),
  safeCalendarOAuthNext('https://evil.example/phish'),
  safeCalendarOAuthNext('//evil.example'),
  safeCalendarOAuthNext('/dashboard?x=1'),
  safeCalendarOAuthNext('/settings#frag'),
];
console.log(JSON.stringify(cases));
"""
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert proc.returncode == 0, proc.stderr
    cases = json.loads(proc.stdout)
    assert cases == [
        True,
        False,
        False,
        False,
        False,
        "/settings",
        "/dashboard",
        "/dashboard",
        "/dashboard",
        "/dashboard",
        "/settings",
    ]


def test_connect_helper_calls_google_with_next():
    src = _read("lib", "googleCalendar.js")
    assert "/auth/google/connect" in src
    assert "params: { next: dest }" in src
    assert "already_connected" in src
    assert "window.location.assign" in src
