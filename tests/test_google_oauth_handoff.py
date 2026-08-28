"""Google Calendar OAuth must not dump users on a blank SPA route."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_app_registers_google_callback_routes():
    app = _read("App.js")
    assert 'path="/api/auth/google/callback"' in app
    assert 'path="/api/auth/google/sheets/callback"' in app
    assert "GoogleOAuthHandoff" in app
    dock = _read("components", "GlobalAIDock.js")
    assert "/api/auth/google" in dock


def test_handoff_page_replaces_to_backend():
    src = _read("pages", "GoogleOAuthHandoff.js")
    assert "googleCallbackBackendUrl" in src
    assert "window.location.replace" in src
    assert 'data-testid="google-oauth-handoff"' in src
    settings = _read("pages", "SettingsPage.js")
    assert "calendar === 'connected'" in settings
    assert "Google Calendar connected" in settings


def test_backend_url_builder_via_node():
    script = r"""
    import { googleCallbackBackendUrl } from './frontend/src/lib/googleOAuthHandoff.js';
    const cases = [
      googleCallbackBackendUrl({
        backendUrl: 'https://tskflow-backend.onrender.com',
        pathname: '/api/auth/google/callback',
        search: '?code=abc&state=xyz',
        origin: 'https://tskflow.com',
      }),
      googleCallbackBackendUrl({
        backendUrl: 'https://tskflow-backend.onrender.com',
        pathname: '/api/auth/google/sheets/callback',
        search: '?code=s',
        origin: 'https://tskflow.com',
      }),
      googleCallbackBackendUrl({
        backendUrl: 'https://tskflow.com',
        pathname: '/api/auth/google/callback',
        search: '?code=abc',
        origin: 'https://tskflow.com',
      }),
      googleCallbackBackendUrl({
        backendUrl: 'https://tskflow-backend.onrender.com',
        pathname: '/api/auth/google/callback',
        search: '?error=access_denied',
        origin: 'https://tskflow.com',
      }),
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
    assert cases[0] == "https://tskflow-backend.onrender.com/api/auth/google/callback?code=abc&state=xyz"
    assert cases[1] == "https://tskflow-backend.onrender.com/api/auth/google/sheets/callback?code=s"
    assert cases[2] is None
    assert cases[3] is None
