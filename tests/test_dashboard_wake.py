"""Returning to the tab must not spam 'Failed to load dashboard'."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HUB = ROOT / "frontend" / "src" / "pages" / "TaskHub.js"
APP = ROOT / "frontend" / "src" / "App.js"


def test_wake_refresh_is_quiet_and_coalesced():
    hub = HUB.read_text(encoding="utf-8")
    app = APP.read_text(encoding="utf-8")
    assert "quiet = false" in hub
    assert "quiet: true" in hub
    assert "id: 'dashboard-load'" in hub
    assert "scheduleWakeRefresh" in hub
    assert "tskflow:app-wake', scheduleWakeRefresh" in hub
    assert "1600" in hub
    assert "wakeBurst" in app
    vis = app[app.index("Wake from sleep") : app.index("window.addEventListener('online'")]
    assert "dispatchEvent(new CustomEvent('tskflow:app-wake'))" in vis
    assert "if (wakeBurst) return" in vis
