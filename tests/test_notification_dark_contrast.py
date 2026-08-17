"""Unread notification rows stay readable in dark theme."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"
sys.path.insert(0, str(ROOT / "backend"))


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_unread_rows_use_dedicated_dark_surface():
    bell = _read("components", "NotificationBell.js")
    css = _read("App.css")
    assert "bg-teal-50/40" not in bell
    assert "bg-white" not in bell
    assert "notif-unread" in bell
    assert "notif-catch-up" in bell
    assert "notif-whats-new" in bell
    assert 'data-testid="notification-panel"' in bell
    assert "text-foreground" in bell
    assert "text-muted-foreground" in bell
    assert '[data-theme="dark"] .notif-unread' in css
    assert "rgba(45, 212, 191, 0.12)" in css
    dark_unread = css.split('[data-theme="dark"] .notif-unread')[1].split("}")[0]
    assert "hsl(var(--foreground))" in dark_unread
    dark_catch = css.split('[data-theme="dark"] .notif-catch-up')[1].split("}")[0]
    assert "#3f1d24" in dark_catch
    assert "#fecdd3" in dark_catch
    dark_new = css.split('[data-theme="dark"] .notif-whats-new')[1].split("}")[0]
    assert "#12332f" in dark_new
    assert "#99f6e4" in dark_new


def test_notify_text_repairs_mojibake_dashes():
    from server import _notify_text

    garbled = "No progress yet \u00c3\u00a2\u00c2\u00a0\u00c2\u2551 need help?"
    assert _notify_text(garbled) == "No progress yet - need help?"
    assert _notify_text("Due soon \u2014 heads up") == "Due soon - heads up"
    latin1_dash = "\u00e2\u20ac\u201d"
    assert _notify_text(f"get the team {latin1_dash} priority Urgent") == "get the team - priority Urgent"
