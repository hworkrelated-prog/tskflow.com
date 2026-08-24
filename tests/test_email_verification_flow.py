"""Email verification: normalize codes, keep email across refresh/deep links."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "backend" / "server.py"
VERIFY = ROOT / "frontend" / "src" / "pages" / "VerifyEmailPage.js"
REGISTER = ROOT / "frontend" / "src" / "pages" / "RegistrationPage.js"


def test_backend_normalizes_verify_code_and_email():
    src = SERVER.read_text(encoding="utf-8")
    assert "def normalize_verification_code" in src
    assert "async def find_user_by_email" in src
    assert 'email_norm = str(user.email).strip().lower()' in src
    assert "verify-email?email=" in src
    assert "No verification code on file" in src
    assert "Invalid verification code. Check the latest email" in src
    # Avoid KeyError 500 when verification_code missing
    assert 'user.get("verification_code")' in src.split("async def verify_email")[1].split("async def resend_verification")[0]


def test_verify_page_does_not_use_000000_placeholder():
    src = VERIFY.read_text(encoding="utf-8")
    assert 'placeholder="Enter 6-digit code"' in src
    assert 'placeholder="000000"' not in src
    assert "searchParams.get('email')" in src
    assert "tskflow_pending_verify_email" in src
    assert "replace(/\\D/g" in src or "replace(/\\D/g," in src
    assert "Use the code from your email" in src
    assert "localStorage.setItem(EMAIL_KEY" in src or "localStorage.setItem('tskflow_pending_verify_email'" in REGISTER.read_text(encoding="utf-8")


def test_registration_persists_pending_verify_email():
    src = REGISTER.read_text(encoding="utf-8")
    assert "tskflow_pending_verify_email" in src
