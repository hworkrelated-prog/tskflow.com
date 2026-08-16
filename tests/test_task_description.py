"""Task description layout, self-assign copy, Slack follow-up wording, hover border."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_prompt_has_no_jarvis_button():
    src = _read("components", "AIQuickCreate.js")
    assert 'data-testid="ai-jarvis-mark"' not in src
    assert "JarvisIcon" not in src
    assert 'data-testid="ai-plus-btn"' in src
    assert 'data-testid="ai-prompt-voice-btn"' in src
    assert "sentTaskFollowupMessage" in src
    assert "rewriteSelfAssignCopy" in src
    assert "layoutTaskDescription" in src
    assert "I&apos;ll remind you" in src
    apply = src[src.index("const applyPreview") : src.index("const runQA")]
    assert ".replace(/\\s+/g, ' ')" not in apply


def test_task_card_keeps_border_on_hover():
    css = _read("App.css")
    hover = css.split(".task-card:hover")[1].split(".status-badge-pending")[0]
    assert "translateY" not in hover
    assert "border-color: hsl(var(--border))" in hover
    assert "overflow: visible" in css.split(".task-card")[1].split(".task-card:hover")[0]
    src = _read("components", "TaskCard.js")
    assert "overflow-hidden" not in src
    assert "layoutTaskDescription" in src
    assert "whitespace-pre-wrap" in src
    hub = _read("pages", "TaskHub.js")
    assert "pt-2" in hub


def test_settings_slack_is_admin_only():
    src = _read("pages", "SettingsPage.js")
    assert "canManageSlack" in src
    assert "Only your Teams admin can connect Slack" in src
    assert 'data-testid="slack-settings-member"' in src
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "Only the Teams admin can connect or change the Slack webhook." in server


def test_description_helpers_via_node():
    script = r"""
import {
  layoutTaskDescription,
  rewriteSelfAssignCopy,
  assigneesAreSelf,
  sentTaskFollowupMessage,
} from './frontend/src/lib/taskDescription.js';

const laid = layoutTaskDescription('Our 1:1. Next steps: 1. Complete the 2. Reply with a brief update when you are done.');
if (!laid.includes('\n1. ') || !laid.includes('\n2. ') || !laid.includes('Next steps:')) {
  console.error('layout failed', JSON.stringify(laid));
  process.exit(1);
}

const rewritten = rewriteSelfAssignCopy('Prepare for our 1:1');
if (rewritten !== 'Prepare for my 1:1') {
  console.error('rewrite failed', rewritten);
  process.exit(1);
}

if (!assigneesAreSelf([{ id: 'self', name: 'Me' }], 'u1')) {
  console.error('self chip failed');
  process.exit(1);
}
if (!assigneesAreSelf([{ id: 'u1', name: 'Henrik' }], 'u1')) {
  console.error('own user chip failed');
  process.exit(1);
}

const selfMsg = sentTaskFollowupMessage({ isSelf: true, slackConnected: true, canManageSlack: true, names: 'Me' });
if (selfMsg.includes('Slack') || selfMsg.toLowerCase().includes('them')) {
  console.error('self followup leaked slack', selfMsg);
  process.exit(1);
}

const adminOff = sentTaskFollowupMessage({ isSelf: false, names: 'Alice', slackConnected: false, canManageSlack: true });
if (!adminOff.includes('Connect Slack in Settings (admins only)')) {
  console.error('admin slack notice failed', adminOff);
  process.exit(1);
}

const memberOff = sentTaskFollowupMessage({ isSelf: false, names: 'Alice', slackConnected: false, canManageSlack: false });
if (!memberOff.includes('Your admin can connect Slack')) {
  console.error('member slack notice failed', memberOff);
  process.exit(1);
}

const connected = sentTaskFollowupMessage({ isSelf: false, names: 'Alice', slackConnected: true, canManageSlack: false });
if (!connected.includes('Slack them')) {
  console.error('connected slack copy failed', connected);
  process.exit(1);
}

console.log('ok');
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "ok" in result.stdout
