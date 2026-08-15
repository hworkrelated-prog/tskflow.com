"""Brand/legal pages must publicly link Unbiassly, Inc. to the TskFlow trade name."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "frontend" / "src"


def _read(*parts: str) -> str:
    return (ROOT.joinpath(*parts)).read_text(encoding="utf-8")


def test_legal_page_states_dba_relationship():
    notice = _read("components", "LegalEntityNotice.js")
    page = _read("pages", "LegalPage.js")
    assert "Unbiassly, Inc." in notice
    assert "TskFlow" in notice
    assert "trade name" in notice.lower()
    assert "LEGAL_ENTITY" in page
    assert "TRADE_NAME" in page
    assert "tskflow.com" in notice.lower()


def test_terms_and_privacy_name_unbiassly():
    terms = _read("pages", "TermsOfService.js")
    privacy = _read("pages", "PrivacyPolicy.js")
    assert "Unbiassly, Inc." in terms
    assert "Unbiassly, Inc." in privacy
    assert "LegalEntityNotice" in terms
    assert "LegalEntityNotice" in privacy


def test_app_exposes_public_legal_route():
    app = _read("App.js")
    assert 'path="/legal"' in app
    assert "LegalPage" in app


def test_landing_footer_links_entity():
    landing = _read("pages", "LandingPage.js")
    assert "Unbiassly, Inc." in landing
    assert 'to="/legal"' in landing
