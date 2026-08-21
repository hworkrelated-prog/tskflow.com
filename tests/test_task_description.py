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
  parseDescriptionBlocks,
  displayTaskTitle,
  fallbackTaskTitle,
  rewriteSelfAssignCopy,
  assigneesAreSelf,
  sentTaskFollowupMessage,
} from './frontend/src/lib/taskDescription.js';

const laid = layoutTaskDescription('Our 1:1. Next steps: 1. Complete the 2. Reply with a brief update when you are done.');
if (!laid.includes('\n1. ') || !laid.includes('\n2. ') || !laid.includes('Next steps:')) {
  console.error('layout failed', JSON.stringify(laid));
  process.exit(1);
}

const illogical = layoutTaskDescription('Today, please benjamin needs to review and clear all redundant open opportunities.\n\nNext steps:\n1. Review the material.');
if (/benjamin needs to/i.test(illogical) || /please needs to/i.test(illogical)) {
  console.error('illogical ask not cleaned', JSON.stringify(illogical));
  process.exit(1);
}
if (!/^Today, please review/i.test(illogical)) {
  console.error('expected logical today ask', JSON.stringify(illogical));
  process.exit(1);
}

const screenAsk = layoutTaskDescription(
  "Please review and respond with a screen recording with their understanding of the work that's been assigned. Additional info: When should this be done by?: ASAP. Assign to ASAP."
);
if (/with their/i.test(screenAsk) || /Additional info/i.test(screenAsk) || /Assign to ASAP/i.test(screenAsk)) {
  console.error('screen recording ask not cleaned', JSON.stringify(screenAsk));
  process.exit(1);
}
if (!/your understanding/i.test(screenAsk)) {
  console.error('expected your understanding', JSON.stringify(screenAsk));
  process.exit(1);
}

const html = layoutTaskDescription('<p>This is a reminder for myself to make sure I for all deals I steps: 1. Complete the 2. Reply with a brief update when you are done.</p>');
if (!html.includes('Steps:') || !html.includes('\n1. ') || !html.includes('\n2. ')) {
  console.error('html layout failed', JSON.stringify(html));
  process.exit(1);
}

const blocks = parseDescriptionBlocks(html);
const list = blocks.find((b) => b.type === 'ol');
if (!list || list.items.length < 2) {
  console.error('blocks failed', JSON.stringify(blocks));
  process.exit(1);
}

if (displayTaskTitle('Complete This is a reminder for myself') !== 'This is a reminder for myself') {
  console.error('display title failed', displayTaskTitle('Complete This is a reminder for myself'));
  process.exit(1);
}
if (displayTaskTitle('Complete This is a reminder for myself to review deals') !== 'Review deals') {
  console.error('reminder wrapper title failed', displayTaskTitle('Complete This is a reminder for myself to review deals'));
  process.exit(1);
}
if (rewriteSelfAssignCopy('1. Complete the ask above.\n2. Reply with a brief update when you are done.') !== '1. Do the work.\n2. Mark this done when I finish.') {
  console.error('self steps rewrite failed', rewriteSelfAssignCopy('1. Complete the ask above.\n2. Reply with a brief update when you are done.'));
  process.exit(1);
}

const fb = fallbackTaskTitle('This is a reminder for myself to follow up');
if (fb.startsWith('Complete ')) {
  console.error('fallback prefixed a sentence', fb);
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


def test_named_owner_needs_to_is_not_self_assign():
    script = r"""
import {
  nameHintsFromText,
  promptNamesSomeoneElse,
  promptMeansSelfAssign,
  matchAssigneesFromPeople,
} from './frontend/src/lib/selfAssign.js';

const prompt = 'Benjamin needs to review and clear all redundant open opportunities by 1 pm PST today.';
const hints = nameHintsFromText(prompt);
if (!hints.some((n) => n.toLowerCase() === 'benjamin')) {
  console.error('hint failed', hints);
  process.exit(1);
}
if (!promptNamesSomeoneElse(prompt) || promptMeansSelfAssign(prompt)) {
  console.error('owner treated as self');
  process.exit(1);
}
const chips = matchAssigneesFromPeople(prompt, [
  { id: 'u1', name: 'Benjamin White', email: 'ben@acme.com' },
  { id: 'u2', name: 'Alice Chen', email: 'alice@acme.com' },
]);
if (chips.length !== 1 || chips[0].id !== 'u1') {
  console.error('people match failed', chips);
  process.exit(1);
}
if (nameHintsFromText('He should close lost opportunities').length) {
  console.error('pronoun leaked', nameHintsFromText('He should close lost opportunities'));
  process.exit(1);
}
const longPrompt = 'Benjamin needs to review and clear all redundant open opportunities by 1 pm PST today. He should either close lost them, or move them to September or October on their close dates.';
const longHints = nameHintsFromText(longPrompt);
if (longHints.length !== 1 || longHints[0].toLowerCase() !== 'benjamin') {
  console.error('extra hints', longHints);
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
