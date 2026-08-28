"""Invite a manager by email when they are not on the team list yet."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_set_manager_accepts_email():
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "manager_email" in server
    assert "pending_manager_email" in server
    assert "named you as their manager" in server
    # New accounts pick up people who named them as manager.
    idx = server.find("pending_manager_email")
    assert idx != -1
    assert server.count("pending_manager_email") >= 3


def test_setup_modal_has_invite_field():
    modal = (ROOT / "frontend" / "src" / "components" / "TeamSetupModal.js").read_text(encoding="utf-8")
    field = (ROOT / "frontend" / "src" / "components" / "InviteManagerField.js").read_text(encoding="utf-8")
    page = (ROOT / "frontend" / "src" / "pages" / "TeamManagementPage.js").read_text(encoding="utf-8")
    assert "InviteManagerField" in modal
    assert "InviteManagerField" in page
    assert 'data-testid={testId}' in field
    assert "team-setup-manager-email" in field
    assert "Invite" in field
    assert "Or invite by email" in field
    assert "/team/set-manager" in field
    assert "manager_email" in field
