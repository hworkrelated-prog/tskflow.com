"""Landing page: pain points, simulation, and a no-login try-it demo."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def test_landing_hits_pain_points_not_board_slogan():
    src = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    assert "not another board" not in src.lower()
    assert "Not just a board" not in src
    assert "Stop chasing work in chat" in src
    assert "You assign it. They accept it." in src
    assert "Work you assign does not disappear" in src
    assert "Follow-up is automatic" in src
    assert "Unbiassly, Inc." in src
    assert 'to="/legal"' in src


def test_landing_has_simulation_and_tryit():
    src = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    assert 'data-testid="landing-sim"' in src
    assert 'data-testid="landing-tryit"' in src
    assert 'data-testid="landing-tryit-input"' in src
    assert "distillLandingPrompt" in src
    assert "Send this for real" in src
    assert "Pinged twice" in src
    assert "landing-sim-slack" in src
    assert "36 people" in src or "30–40" in src
    assert "Slack thread" in src


def test_landing_demo_assigns_thirty_to_forty_people():
    demo = (FRONT / "lib" / "landingAssignDemo.js").read_text(encoding="utf-8")
    assert "DEMO_PROMPT" in demo
    assert "East Coast" in demo
    import re
    block = demo.split("export const DEMO_PEOPLE")[1].split("export const DEMO_ROLLUP")[0]
    people = re.findall(r"'([^']+)'", block)
    assert 30 <= len(people) <= 40, people
    assert "Chris Park" in people
    assert "pingedTwice" in demo
    assert "On it after standup" in demo


def test_demo_distill_turns_manager_voice_into_an_ask():
    script = r"""
import { distillLandingPrompt } from './frontend/src/lib/demoDistill.js';
const a = distillLandingPrompt('Tell my team to finish outreach training on Monday');
if (!a || !/outreach/i.test(a.title)) process.exit(1);
if (/tell my team/i.test(a.ask)) process.exit(2);
if (!/please/i.test(a.ask)) process.exit(3);
if (!a.who) process.exit(4);
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


def test_demo_distill_handles_east_coast_assign():
    script = r"""
import { distillLandingPrompt } from './frontend/src/lib/demoDistill.js';
const a = distillLandingPrompt('Assign East Coast sales to send the Q3 outreach email by EOD.');
if (!a || !/outreach/i.test(a.title)) process.exit(1);
if (!/east coast/i.test(a.who)) process.exit(2);
if (!/eod/i.test(a.when) && !/eod/i.test(a.ask)) process.exit(3);
if (/assign east coast/i.test(a.ask)) process.exit(4);
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


def test_prompt_border_is_inset_so_sides_cannot_clip():
    css = (FRONT / "index.css").read_text(encoding="utf-8")
    shell = css.split(".ai-composer-shell {")[1].split(".ai-composer-shell--inset")[0]
    assert "inset 0 0 0 1px" in shell
    assert "overflow: hidden" not in css.split("@media (max-width: 51.99rem)")[-1].split(".ai-prompt-field")[0]
    assert "translateX(-50%)" not in css.split(".ai-bottom-stage")[1].split(".ai-prompt-field")[0]
