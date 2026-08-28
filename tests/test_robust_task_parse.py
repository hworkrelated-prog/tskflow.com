"""Screenshot regression: messy speech + follow-up time must not replace the ask."""
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "backend" / "server.py"
FRONT = ROOT / "frontend" / "src"

PROMPT = (
    "Make sure to tell Sophia Sophia SadikiThat sheNeeds to solveDavid one of the "
    "biggest problem which is to have the drivers be able to sendPictures of via three trip"
)

SCREENSHOT_TITLE = "Complete 7 am pst. Assign this"
SCREENSHOT_DESC = "Please 7 am pst. Assign this to Sophia.siddiqui. This is."


def _parse_helpers():
    src = SERVER.read_text(encoding="utf-8")
    start = src.index("def _round_to_quarter")
    end = src.index("async def _resolve_assignee_hints")
    ns = {}
    exec(
        "import re\nfrom datetime import datetime, timedelta\nfrom typing import Optional, List\n"
        + src[start:end],
        ns,
    )
    return ns


def _copy_helpers():
    src = SERVER.read_text(encoding="utf-8")
    start = src.index("_DIRECT_HINTS = ")
    end = src.index("async def _llm_vet_title")
    ns = {}
    exec(
        "import re\nfrom typing import Optional, List\n"
        "def first_name(name, fallback=''):\n"
        "    p = (name or '').strip().split()\n"
        "    return p[0] if p else fallback\n" + src[start:end],
        ns,
    )
    return ns


def test_glued_speech_names_sophia_not_david():
    ns = _parse_helpers()
    names = [n.lower() for n in ns["_name_hints_from_text"](PROMPT)]
    assert names, "should extract an assignee from tell-Sophia speech"
    assert any(n.startswith("sophia") for n in names)
    assert not any(n == "david" or n.startswith("david ") for n in names)
    assert "sadiki" not in names


def test_glued_tokens_split_camel_case():
    ns = _parse_helpers()
    out = ns["_split_glued_tokens"](PROMPT)
    assert "she Needs" in out or "she needs" in out.lower()
    assert "send Pictures" in out or "send pictures" in out.lower()
    assert "Sadiki That" in out or "sadiki that" in out.lower()
    assert "solve David" in out or "solve david" in out.lower()


def test_seven_am_pst_is_time_not_person():
    ns = _parse_helpers()
    assert ns["_looks_like_time_only"]("7 am pst") is True
    assert ns["_looks_like_time_only"]("7am PST") is True
    assert ns["_looks_like_followup_fragment"]("7 am pst") is True
    assert ns["_looks_like_person_name"]("7 am pst") is False
    assert ns["_TIMEISH_ANSWER_RE"].match("7 am pst")
    hints = ns["_hints_from_answers"]({"Who should this be assigned to?": "7 am pst"})
    assert hints == []
    classified = ns["_classify_clarify_answer"]("Who should this be assigned to?", "7 am pst")
    assert classified.get("when") == "7 am pst"
    assert "who" not in classified
    remapped = ns["_remap_clarify_answers"]({"Who should this be assigned to?": "7 am pst"})
    assert remapped.get("When should this be done by?") == "7 am pst"
    assert "Who should this be assigned to?" not in remapped


def test_original_prompt_is_not_a_fragment():
    ns = _parse_helpers()
    assert ns["_looks_like_followup_fragment"](PROMPT) is False
    assert ns["_prompt_names_other_assignee"](PROMPT) is True
    assert ns["_self_assign_hint"](PROMPT) is False


def test_canonicalize_recovers_original_when_followup_is_a_time():
    ns = _copy_helpers()
    history = [
        {"role": "user", "text": PROMPT},
        {"role": "assistant", "text": "Who should this be assigned to?"},
        {"role": "user", "text": "7 am pst"},
    ]
    canon = ns["_canonicalize_task_input"](
        "7 am pst",
        history,
        {"Who should this be assigned to?": "7 am pst"},
    )
    work = (canon.get("text") or "").lower()
    assert "driver" in work or "picture" in work
    assert "7 am" not in work.split("need")[0] or "picture" in work
    assert "complete 7 am" not in work
    answers = canon.get("answers") or {}
    assert answers.get("When should this be done by?") == "7 am pst"
    names = [h.lower() for h in (canon.get("speech_hints") or [])]
    assert any(n.startswith("sophia") for n in names)


def test_screenshot_output_is_rejected_as_illogical():
    ns = _copy_helpers()
    assert ns["_title_is_time_or_routing"](SCREENSHOT_TITLE)
    assert ns["_copy_looks_illogical"](SCREENSHOT_TITLE, SCREENSHOT_DESC)
    assert ns["_copy_drops_prompt_facts"](PROMPT, SCREENSHOT_TITLE, SCREENSHOT_DESC)
    cleaned = ns["_strip_clarify_leakage"](SCREENSHOT_DESC)
    assert "assign this to" not in cleaned.lower()
    assert "this is." not in cleaned.lower()


def test_enrich_keeps_driver_picture_work_not_the_clock():
    ns = _copy_helpers()
    parsed = {
        "title": SCREENSHOT_TITLE,
        "description": SCREENSHOT_DESC,
        "action_items": [],
        "assignee_hints": ["Sophia"],
    }
    ns["_enrich_parse_title_description"](parsed, PROMPT, manager_name="Henrik")
    title = (parsed.get("title") or "").lower()
    desc = (parsed.get("description") or "").lower()
    assert "7 am" not in title
    assert "assign this" not in title
    assert "driver" in title and "picture" in title
    assert "driver" in desc and "picture" in desc
    assert "complete the ask above" not in desc
    assert "please 7 am" not in desc
    assert "assign this to" not in desc
    assert "this is." not in desc


def test_title_from_work_does_not_complete_a_clock():
    ns = _copy_helpers()
    assert ns["_title_from_work_text"]("7 am pst") == ""
    title = ns["_title_from_work_text"](PROMPT).lower()
    assert "7 am" not in title
    assert "picture" in title or "driver" in title or "send" in title


def test_due_parser_still_reads_seven_am_pst():
    ns = _parse_helpers()
    now = datetime(2026, 8, 28, 2, 40, 0)
    got = ns["_fallback_parse_date_expression"]("7 am pst", now)
    assert got is not None
    assert got.endswith("T07:00")


def test_frontend_repairs_and_classifies_the_screenshot():
    script = r"""
import { repairMessyPrompt, nameHintsFromText, looksLikeTimeOnly, looksLikeFollowupFragment, classifyClarifyAnswer, promptNamesSomeoneElse, promptMeansSelfAssign } from './frontend/src/lib/selfAssign.js';
import { fallbackTaskTitle, layoutTaskDescription, displayTaskTitle } from './frontend/src/lib/taskDescription.js';
const p = "Make sure to tell Sophia Sophia SadikiThat sheNeeds to solveDavid one of the biggest problem which is to have the drivers be able to sendPictures of via three trip";
const repaired = repairMessyPrompt(p);
if (!/she Needs/i.test(repaired) || !/send Pictures/i.test(repaired)) { console.error('repair', repaired); process.exit(2); }
const names = nameHintsFromText(p).map((n) => n.toLowerCase());
if (!names.some((n) => n.startsWith('sophia'))) { console.error('names', names); process.exit(3); }
if (names.some((n) => n === 'david' || n.startsWith('david '))) { console.error('david', names); process.exit(4); }
if (!promptNamesSomeoneElse(p) || promptMeansSelfAssign(p)) process.exit(5);
if (!looksLikeTimeOnly('7 am pst') || !looksLikeFollowupFragment('7 am pst')) process.exit(6);
const c = classifyClarifyAnswer('Who should this be assigned to?', '7 am pst');
if (c.when !== '7 am pst' || c.who) { console.error('classify', c); process.exit(7); }
if (fallbackTaskTitle('7 am pst. Assign this')) { console.error('fallback'); process.exit(8); }
const laid = layoutTaskDescription('Please 7 am pst. Assign this to Sophia.siddiqui. This is.');
if (/assign this to/i.test(laid) || /this is\./i.test(laid)) { console.error('layout', laid); process.exit(9); }
const dt = displayTaskTitle('Complete 7 am pst. Assign this');
if (/7 am/i.test(dt) && /complete/i.test(dt)) { console.error('display', dt); process.exit(10); }
console.log('ok');
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    assert "ok" in result.stdout


def test_composer_keeps_original_seed_on_clarify():
    src = (FRONT / "components" / "AIQuickCreate.js").read_text(encoding="utf-8")
    assert "Keep the original ask. This turn is an answer, not a new task." in src
    assert "classifyClarifyAnswer" in src
    assert "looksLikeFollowupFragment" in src
    assert "repairMessyPrompt" in src
    run = src.split("const runPreview = async")[1].split("runPreviewRef.current")[0]
    # Must not stamp the follow-up over the seed before answering a pending question.
    clarify_block = run.split("pendingQs.length > 0")[1].split("return;")[0]
    assert "Keep the original ask" in clarify_block
    assert "setActivePrompt(t)" not in clarify_block
    assert "answerClarify" in clarify_block
