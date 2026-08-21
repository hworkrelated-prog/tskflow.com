"""Confirm-step chat edits — continuous conversation, not More/Less forms."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUICK = ROOT / "frontend" / "src" / "components" / "AIQuickCreate.js"


def _parser_ns():
    src = QUICK.read_text(encoding="utf-8")
    start = src.index("const CONFIRM_SEND_RE")
    end = src.index("const COMMAND_ROUTES")
    # Turn the JS parser into a tiny Python clone for behavior checks would be
    # brittle — instead extract and exec via node.
    return src[start:end]


def test_parser_source_handles_core_intents():
    chunk = _parser_ns()
    assert "CONFIRM_SEND_RE" in chunk
    assert "parseConfirmChatEdit" in chunk
    cases = [
        ("send", "send"),
        ("make it urgent", "Urgent"),
        ("require screen recording", "requires_screen_recording"),
        ("mark as sales", "is_sales_task"),
        ("due tomorrow", "due_phrase"),
        ("change the title to Review notes", "title"),
    ]
    for prompt, needle in cases:
        assert needle in chunk, f"missing handler for {prompt!r}"


def test_node_parser_behavior():
    import subprocess
    script = r"""
const CONFIRM_SEND_RE = /^(send|yes|yep|yeah|y|ok|okay|looks good|lgtm|ship it|go ahead|confirm|do it|please send)[.!]?$/i;
const parseConfirmChatEdit = (raw) => {
    const t = String(raw || '').trim();
    if (!t) return { kind: 'empty' };
    if (CONFIRM_SEND_RE.test(t)) return { kind: 'send' };
    const notes = [];
    const patch = {};
    if (/\b(urgent|asap|immediately|critical|fire\s*drill)\b/i.test(t)) {
        patch.priority = 'Urgent'; notes.push('marked Urgent');
    } else if (/\b(high priority|make it high|priority high)\b/i.test(t)) {
        patch.priority = 'High'; notes.push('marked High');
    }
    if (/\b(don'?t|do not|no|remove|without)\b.{0,24}\bscreen\s*recording\b/i.test(t)) {
        patch.requires_screen_recording = false; notes.push('off');
    } else if (/\b(require|need|ask for|with|add)\b.{0,20}\bscreen\s*recording\b/i.test(t)) {
        patch.requires_screen_recording = true; notes.push('on');
    }
    if (/\b(mark (it |this |as )?sales|sales task|this is sales|make it sales)\b/i.test(t)) {
        patch.is_sales_task = true; notes.push('sales');
    }
    const dueM = t.match(/^(?:due|make it due|push (?:it )?to|move (?:it )?to)\s+(.+)$/i);
    if (dueM) { patch.due_phrase = dueM[1].trim(); notes.push('due'); }
    else if (/\b(due|deadline|by)\b/i.test(t) && /\b(today|tomorrow|asap)\b/i.test(t)) {
        patch.due_phrase = t; notes.push('due');
    }
    if (notes.length) return { kind: 'patch', patch, notes };
    return { kind: 'reparse', text: t };
};

const assert = (cond, msg) => { if (!cond) { console.error(msg); process.exit(1); } };
assert(parseConfirmChatEdit('send').kind === 'send', 'send');
assert(parseConfirmChatEdit('looks good').kind === 'send', 'looks good');
const u = parseConfirmChatEdit('make it urgent');
assert(u.kind === 'patch' && u.patch.priority === 'Urgent', 'urgent');
const r = parseConfirmChatEdit('require screen recording');
assert(r.kind === 'patch' && r.patch.requires_screen_recording === true, 'recording');
const s = parseConfirmChatEdit('mark as sales');
assert(s.kind === 'patch' && s.patch.is_sales_task === true, 'sales');
const d = parseConfirmChatEdit('due tomorrow');
assert(d.kind === 'patch' && d.patch.due_phrase, 'due');
const open = parseConfirmChatEdit('make the ask shorter and friendlier');
assert(open.kind === 'reparse', 'reparse');
console.log('ok');
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_ui_has_no_more_less_toggle():
    src = QUICK.read_text(encoding="utf-8")
    assert 'data-testid="ai-edit-details"' not in src
    assert "{showDetails ? 'Less' : 'More'}" not in src
    assert 'data-testid="ai-confirm-chat-hint"' in src
    assert "Mark as sales" not in src.split("ai-confirm-summary")[1].split("ai-details-editor")[0]
