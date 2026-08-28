"""No em/en dashes in product copy; respectful mail Yes/No; AI sense-input."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from no_ai_dash import first_name, strip_ai_dashes  # noqa: E402
from sense_human import extract_emails  # noqa: E402
from text_clean import clean_display_text  # noqa: E402

FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_strip_ai_dashes_flattens_em_and_en():
    assert "\u2014" not in strip_ai_dashes("Monthly \u2014 typical")
    assert "\u2013" not in strip_ai_dashes("1\u20133 days")
    assert strip_ai_dashes("Due soon \u2014 heads up") == "Due soon - heads up"
    assert first_name("Henrik Morgan") == "Henrik"


def test_clean_display_text_never_keeps_emdash():
    out = clean_display_text("Due soon \u2014 heads up")
    assert "\u2014" not in out
    assert out == "Due soon - heads up"


def test_settings_reporting_line_has_plain_labels():
    src = _read("pages", "SettingsPage.js")
    assert 'data-testid="hierarchy-review-frequency"' in src
    assert ">Monthly<" in src
    assert "Monthly \u2014" not in src
    assert "typical" not in src.lower()
    assert "How often does your reporting line change?" not in src


def test_mail_claim_page_is_yes_no_only():
    src = _read("pages", "MailClaimPage.js")
    assert 'data-testid="mail-claim-yes"' in src
    assert 'data-testid="mail-claim-no"' in src
    assert "send('yes')" in src
    assert "send('no')" in src
    assert "Dispute" not in src
    assert "Ignore" not in src
    app = _read("App.js")
    assert 'path="/mail/claim"' in app
    assert "MailClaimPage" in app


def test_team_claims_inbox_yes_no():
    src = _read("components", "TeamClaimsInbox.js")
    assert "Yes" in src and "No" in src
    assert "claim-ignore-" in src
    assert "Dispute" not in src


def test_email_picker_runs_sense_input():
    picker = _read("components", "TeamPeoplePicker.js")
    helper = _read("lib", "senseHumanInput.js")
    assert "senseHumanInput" in picker
    assert "kind: 'emails'" in picker or 'kind: "emails"' in picker or "senseHumanInput(input, 'emails')" in picker
    assert "/ai/sense-input" in helper


def test_extract_emails_from_messy_paste():
    text = "please add Alex (alex@acme.com) and  bob@acme.com , cc: Pat <pat@acme.com>"
    assert extract_emails(text) == ["alex@acme.com", "bob@acme.com", "pat@acme.com"]


def test_server_mail_claim_is_post_not_get():
    be = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert '@api_router.post("/mail/claim")' in be
    assert '@api_router.get("/mail/claim")' not in be
    assert "Accept if" not in be
    assert "take appropriate action" not in be
    assert "SMART_PARSE_SYSTEM = strip_ai_dashes(SMART_PARSE_SYSTEM)" in be
    assert "extra_buttons" in be
    assert '"/ai/sense-input"' in be
    assert "Either answer is respected" in be


def test_ui_source_has_no_em_or_en_dashes():
    bad = []
    for p in FRONT.rglob("*"):
        if p.suffix.lower() not in {".js", ".jsx", ".css"}:
            continue
        text = p.read_text(encoding="utf-8")
        if "\u2014" in text or "\u2013" in text or "\u2212" in text:
            bad.append(str(p.relative_to(FRONT)))
    assert bad == []
