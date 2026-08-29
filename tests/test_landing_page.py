"""Landing page: a tool you land in, not a pitch you scroll."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def test_landing_is_a_tool_not_a_pitch():
    src = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    assert "not another board" not in src.lower()
    assert "Not just a board" not in src
    assert "Feel the difference" not in src
    assert "Get started" not in src
    assert "Simple pricing" not in src
    assert "Still hunting for the work you already assigned" not in src
    assert "Stop chasing work in chat" not in src
    assert "Thread archaeology" not in src
    assert "ownership evaporates" not in src
    assert 'data-testid="landing-pain"' not in src
    assert 'data-testid="landing-sim"' not in src
    assert 'data-testid="landing-brand"' in src
    assert "Unbiassly, Inc." in src
    assert 'to="/legal"' in src
    assert 'data-testid="landing-toolbar"' in src
    assert 'data-testid="landing-no-account"' in src
    # recorder is in the chrome; the page tree renders toolbar above the composer
    assert "LandingScreenRecorder" in src
    page_tree = src.split("const LandingPage")[-1]
    assert page_tree.index("landing-toolbar") < page_tree.index("<LaunchPad")


def test_landing_opens_straight_into_a_launch():
    src = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    assert 'data-testid="landing-tryit"' in src
    assert 'data-testid="landing-tryit-input"' in src
    assert "distillLandingPrompt" in src
    assert "autoFocus" in src
    assert "/demo/launch" in src
    assert 'data-testid="landing-send-it"' in src
    assert 'data-testid="landing-assignee-email"' in src
    assert 'data-testid="landing-channel-slack"' in src


def test_landing_tryit_sends_for_real_instead_of_pushing_to_register():
    """The composer launches a guest robot room - no account, no password."""
    src = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    assert 'data-testid="landing-send-it"' in src
    assert 'data-testid="landing-assignee-email"' in src
    assert 'data-testid="landing-channel-email"' in src
    assert 'data-testid="landing-channel-slack"' in src
    assert "Send it" in src
    assert "No account. No password." in src
    assert "Send this for real" not in src
    assert "See the ask" not in src
    assert "Sending for real takes an account" not in src
    assert "/demo/launch" in src
    assert "LandingScreenRecorder" in src
    assert "GoogleSignInButton" in src
    assert "navigate('/register')" not in src


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


def test_landing_tryit_color_codes_assign_prompt():
    """Composer sample prompt highlights who / work / when, not flat gray."""
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    demo = (FRONT / "lib" / "landingAssignDemo.js").read_text(encoding="utf-8")
    assert "colorizeAssignPrompt" in demo
    assert "PROMPT_SEGMENT_CLASS" in demo
    assert "text-teal-300" in demo
    assert "text-amber-300" in demo
    assert "landing-tryit-colorized" in landing
    assert "ColorCodedPrompt" in landing
    script = r"""
import { colorizeAssignPrompt } from './frontend/src/lib/landingAssignDemo.js';
const parts = colorizeAssignPrompt('Assign East Coast sales to send the Q3 outreach email by EOD.');
const kinds = parts.map((p) => p.kind).join(',');
if (!kinds.includes('who') || !kinds.includes('work') || !kinds.includes('when')) process.exit(1);
const who = parts.find((p) => p.kind === 'who');
if (!/east coast sales/i.test(who.text)) process.exit(2);
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


def test_create_task_advanced_options_color_coded_icons():
    hub = (FRONT / "pages" / "TaskHub.js").read_text(encoding="utf-8")
    rec = (FRONT / "components" / "RecurrenceEditor.js").read_text(encoding="utf-8")
    css = (FRONT / "App.css").read_text(encoding="utf-8")
    assert 'data-testid="advanced-options"' in hub
    assert 'bg-muted/40' in hub
    assert "text-violet-600" in hub
    assert "Video" in hub
    assert "text-emerald-600" in hub  # sales dollar
    assert "text-violet-600" in rec
    assert "[data-theme=\"dark\"] .text-violet-600" in css
    assert "[data-theme=\"dark\"] .text-emerald-600" in css
    assert "bg-gray-50/50" not in hub.split('data-testid="advanced-options"')[0][-80:]


def test_landing_ignores_app_theme_preference():
    """App light/dark must not bleach the landing workspace."""
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    theme = (FRONT / "lib" / "theme.js").read_text(encoding="utf-8")
    css = (FRONT / "App.css").read_text(encoding="utf-8")
    assert "pinDocumentTheme('dark')" in landing
    assert "restoreDocumentTheme" in landing
    assert "landing-page" in landing
    assert "landing-active" in landing
    assert "pinDocumentTheme" in theme
    assert "restoreDocumentTheme" in theme
    assert "localStorage.setItem" not in theme.split("pinDocumentTheme")[1].split("restoreDocumentTheme")[0]
    assert "body.landing-active" in css
    assert ".min-h-screen:not(.landing-page)" in css
    assert "[data-theme=\"light\"] .landing-page" in css


def test_prompt_border_is_inset_so_sides_cannot_clip():
    css = (FRONT / "index.css").read_text(encoding="utf-8")
    shell = css.split(".ai-composer-shell {")[1].split(".ai-composer-shell--inset")[0]
    assert "inset 0 0 0 1px" in shell
    assert "overflow: hidden" not in css.split("@media (max-width: 51.99rem)")[-1].split(".ai-prompt-field")[0]
    assert "translateX(-50%)" not in css.split(".ai-bottom-stage")[1].split(".ai-prompt-field")[0]
