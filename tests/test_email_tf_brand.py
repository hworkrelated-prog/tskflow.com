"""TskFlow email chrome uses a teal TF mark — not a yellow/purple Jarvis J."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BE = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")


def test_email_from_defaults_to_tskflow_not_jarvis_initial():
    assert 'EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "TskFlow")' in BE
    assert 'os.getenv("EMAIL_FROM_NAME", "Jarvis")' not in BE


def test_email_shell_uses_teal_tf_mark():
    start = BE.index("def _jarvis_email_shell")
    end = BE.index("# --- Notification endpoints", start)
    shell = BE[start:end]
    assert ">TF<" in shell or ">TF</span>" in shell
    assert "#0d9488" in shell or "#14b8a6" in shell
    assert "#0f766e" in shell
    assert 'font-weight:700;">J</div>' not in shell
    assert "#4F46E5" not in shell
    assert "#7C3AED" not in shell
    assert "TskFlow" in shell
