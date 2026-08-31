"""TskFlow emails lead with the news. Brand is a thin teal accent + footer."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BE = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")


def test_email_from_defaults_to_tskflow_not_jarvis_initial():
    assert 'EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "TskFlow")' in BE
    assert 'os.getenv("EMAIL_FROM_NAME", "Jarvis")' not in BE


def test_email_shell_leads_with_content_not_a_banner():
    start = BE.index("def _jarvis_email_shell")
    end = BE.index("# --- Notification endpoints", start)
    shell = BE[start:end]
    assert "Assign it. See who did it." not in shell
    assert ">TF<" not in shell and ">TF</span>" not in shell
    assert "height:4px;background:#0d9488" in shell
    assert "#0d9488" in shell
    assert "#0f766e" in shell
    assert "TskFlow" in shell
    assert "Manage notifications" in shell
    assert 'font-weight:700;">J</div>' not in shell
    assert "#4F46E5" not in shell
    assert "#7C3AED" not in shell
    assert 'padding:28px 32px;color:#fff;' not in shell


def test_email_templates_drop_purple_brand_for_teal():
    """Purple/indigo email chrome was hard to read; brand is teal now."""
    for bad in ("#4F46E5", "#7C3AED", "#6366F1", "#8B5CF6", "#4338CA", "#E0E7FF"):
        assert bad not in BE, f"leftover purple token {bad}"
    assert "#0d9488" in BE
    assert '"color": "#0d9488"' in BE  # gentle nudge / brand accent
    assert "color: white" in BE or "color:white" in BE or "color:#fff" in BE
