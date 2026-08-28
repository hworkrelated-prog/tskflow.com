"""Settings: Slack is an integration; plans are for upgrades only."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SETTINGS = (ROOT / "frontend" / "src" / "pages" / "SettingsPage.js").read_text(encoding="utf-8")
SERVER = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")


def test_teams_users_do_not_see_pricing_cards():
    assert 'subscription_tier !== \'teams\'' in SETTINGS
    assert 'data-testid="settings-plans"' in SETTINGS
    assert "Create New App" not in SETTINGS
    assert "api.slack.com/apps?new_app=1" not in SETTINGS


def test_slack_connect_is_add_to_slack_or_incoming_webhook():
    assert "Add to Slack" in SETTINGS
    assert "A0F7XDUAZ-incoming-webhooks" in SETTINGS
    assert "Pick a channel, copy the URL, paste it here." in SETTINGS
    assert "/integrations/slack/connect" in SETTINGS
    assert "incoming-webhook" in SERVER
    assert "oauth.v2.access" in SERVER
    assert '"oauth": _slack_oauth_configured()' in SERVER
