"""Login with Google: a separate identity path that must not touch Calendar OAuth."""
import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"
sys.path.insert(0, str(Path(__file__).resolve().parent))

import live_app  # noqa: E402


def _with_google_env():
    previous = {k: os.environ.get(k) for k in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")}
    os.environ["GOOGLE_CLIENT_ID"] = "test-client-id.apps.googleusercontent.com"
    os.environ["GOOGLE_CLIENT_SECRET"] = "test-client-secret"
    return previous


def _restore(previous):
    for key, value in previous.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


def test_google_login_sends_the_visitor_to_google_with_openid_scopes():
    server = live_app.app_or_skip()
    previous = _with_google_env()

    async def scenario():
        async with live_app.client(server) as api:
            res = await api.get(
                "/api/auth/google/login?next=/env/abc12345&guest_user_id=guest-1",
                follow_redirects=False,
            )
            assert res.status_code in (302, 303, 307), res.text
            location = res.headers["location"]
            assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth")
            query = parse_qs(urlparse(location).query)
            assert query["scope"] == ["openid email profile"]
            assert query["response_type"] == ["code"]
            # Must be the Calendar URI already allowlisted in Google Cloud.
            assert query["redirect_uri"] == ["https://tskflow.test/api/auth/google/callback"]

            state = query["state"][0]
            doc = await server.db.oauth_states.find_one({"state": state}, {"_id": 0})
            assert doc["purpose"] == "google_signin"
            assert doc["next"] == "/env/abc12345"
            assert doc["guest_user_id"] == "guest-1"

    try:
        live_app.run(scenario())
    finally:
        _restore(previous)


def test_missing_google_env_errors_clearly_instead_of_crashing():
    server = live_app.app_or_skip()
    previous = _with_google_env()
    os.environ.pop("GOOGLE_CLIENT_ID", None)
    os.environ.pop("GOOGLE_CLIENT_SECRET", None)

    async def scenario():
        async with live_app.client(server) as api:
            res = await api.get("/api/auth/google/login", follow_redirects=False)
            assert res.status_code in (302, 303, 307)
            assert res.headers["location"].endswith("/login?error=google_not_configured")
            # Calendar OAuth endpoints still exist and still require a session
            calendar = await api.get("/api/auth/google/connect")
            assert calendar.status_code in (401, 403)

    try:
        live_app.run(scenario())
    finally:
        _restore(previous)


def test_login_page_renders_the_google_error_inline():
    """A toast fired on first mount is dropped, so the reason has to be in the markup."""
    login = (ROOT / "frontend" / "src" / "pages" / "LoginPage.js").read_text(encoding="utf-8")
    assert 'data-testid="login-google-error"' in login
    for code in ("google_not_configured", "google_signin_failed", "invalid_state"):
        assert code in login
    assert "GOOGLE_ERRORS[searchParams.get('error')]" in login
    # The backend only ever sends sign-in failures to /login
    server_src = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    for code in ("google_not_configured", "google_signin_failed"):
        assert f"/login?error={code}" in server_src


def test_signin_callback_finds_or_creates_the_user_and_folds_in_the_guest():
    server = live_app.app_or_skip()
    previous = _with_google_env()

    async def fake_identity(code):
        return {"email": "Owner@Googleco.io", "name": "Owner Person", "google_id": "g-123"}

    original = server._google_signin_identity
    server._google_signin_identity = lambda code: fake_identity(code)

    async def scenario():
        async with live_app.client(server) as api:
            launch = await api.post(
                "/api/demo/launch",
                json={"task": "Send the Q3 outreach email by EOD", "assignee_email": "chris@acme.test"},
                headers=live_app.caller_headers("google-merge"),
            )
            data = launch.json()
            guest_id = data["user"]["id"]

            start = await api.get(
                f"/api/auth/google/login?next=/env/{data['task_id']}&guest_user_id={guest_id}",
                follow_redirects=False,
            )
            state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]

            done = await api.get(
                f"/api/auth/google/callback?code=fake-code&state={state}",
                follow_redirects=False,
            )
            assert done.status_code in (302, 303, 307), done.text
            location = done.headers["location"]
            assert location.startswith("https://tskflow.test/auth/google/finish?")
            finish = parse_qs(urlparse(location).query)
            assert finish["next"] == [f"/env/{data['task_id']}"]
            token = finish["token"][0]

            user = await server.db.users.find_one({"email": "owner@googleco.io"}, {"_id": 0})
            assert user["email_verified"] is True
            assert user["auth_provider"] == "google"
            assert user["google_id"] == "g-123"

            # The token is a normal session token
            me = await api.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
            assert me.status_code == 200
            assert me.json()["email"] == "owner@googleco.io"

            # The demo task followed the visitor into the real account
            task = await server.db.tasks.find_one({"id": data["task_id"]}, {"_id": 0})
            assert task["created_by"] == user["id"]

            events = await server.db[server.EVENTS_COLLECTION].find(
                {"user_id": user["id"]}, {"_id": 0}
            ).to_list(10)
            names = {e["event"] for e in events}
            assert "google_signup" in names
            assert "login" in names
            login_row = next(e for e in events if e["event"] == "login")
            assert login_row["meta"]["method"] == "google"

            # Signing in again reuses the same account, no duplicate signup event
            start2 = await api.get("/api/auth/google/login", follow_redirects=False)
            state2 = parse_qs(urlparse(start2.headers["location"]).query)["state"][0]
            await api.get(
                f"/api/auth/google/callback?code=fake-code&state={state2}",
                follow_redirects=False,
            )
            signups = await server.db[server.EVENTS_COLLECTION].count_documents(
                {"event": "google_signup", "user_id": user["id"]}
            )
            assert signups == 1

    try:
        live_app.run(scenario())
    finally:
        server._google_signin_identity = original
        _restore(previous)


def test_google_buttons_exist_on_login_and_register_not_landing():
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    login = (FRONT / "pages" / "LoginPage.js").read_text(encoding="utf-8")
    register = (FRONT / "pages" / "RegistrationPage.js").read_text(encoding="utf-8")
    button = (FRONT / "components" / "GoogleSignInButton.js").read_text(encoding="utf-8")
    app = (FRONT / "App.js").read_text(encoding="utf-8")

    assert "GoogleSignInButton" not in landing
    assert 'testId="landing-google-signin"' not in landing
    assert 'data-testid="landing-sign-in"' in landing
    assert "navigate('/login')" in landing
    assert 'testId="login-google-signin"' in login
    assert 'testId="register-google-signin"' in register
    assert "GoogleSignInButton" in login and "GoogleSignInButton" in register
    assert "data-testid={testId}" in button
    assert "auth/google/login" in button
    assert "guest_user_id" in button  # the demo room survives the upgrade
    assert 'path="/auth/google/finish"' in app
    assert 'path="/api/auth/google/callback"' in app
    assert 'path="/api/auth/google/sheets/callback"' in app
    assert "google_not_configured" in login
    server_src = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert '_google_signin_redirect_uri' in server_src
    assert 'return f"{APP_BASE_URL}/api/auth/google/callback"' in server_src
    assert "/api/auth/google/login/callback" not in server_src.split("def _google_signin_redirect_uri")[1].split("def _safe_signin_next")[0]


def test_handoff_still_forwards_the_registered_google_callback():
    script = r"""
import { googleCallbackApiPath, googleCallbackBackendUrl } from './frontend/src/lib/googleOAuthHandoff.js';
console.log(JSON.stringify([
  googleCallbackApiPath('/api/auth/google/callback'),
  googleCallbackApiPath('/api/auth/google/sheets/callback'),
  googleCallbackBackendUrl({
    backendUrl: 'https://tskflow-backend.onrender.com',
    pathname: '/api/auth/google/callback',
    search: '?code=abc&state=xyz',
    origin: 'https://tskflow.com',
  }),
]));
"""
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    paths = json.loads(proc.stdout)
    assert paths[0] == "/api/auth/google/callback"
    assert paths[1] == "/api/auth/google/sheets/callback"
    assert paths[2] == "https://tskflow-backend.onrender.com/api/auth/google/callback?code=abc&state=xyz"
