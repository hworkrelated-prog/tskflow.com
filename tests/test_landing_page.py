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


def test_landing_voice_guide_is_guest_safe():
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    guide = (FRONT / "components" / "LandingVoiceGuide.js").read_text(encoding="utf-8")
    assert "LandingVoiceGuide" in landing
    assert 'data-testid="landing-voice-guide"' in guide
    assert 'data-testid="landing-voice-mic"' in guide
    assert "/voice/command" not in guide
    assert "GUIDE_OPEN" in guide
    assert "who, what, and when" in guide.lower()


def test_landing_opens_straight_into_a_launch():
    src = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    demo = (FRONT / "lib" / "landingAssignDemo.js").read_text(encoding="utf-8")
    assert 'data-testid="landing-tryit"' in src
    assert 'data-testid="landing-tryit-input"' in src
    assert "distillLandingPrompt" in src
    assert "autoFocus" in src
    assert "What needs to get done" in src  # aria-label
    assert 'data-testid="landing-examples"' in src
    assert "LANDING_EXAMPLES" in src
    assert "pipeline update" in demo
    assert "best deal" in demo
    assert 'data-testid="landing-send-promise"' in src
    assert "The robot delivers" not in src
    assert "/demo/launch" in src
    assert 'data-testid="landing-voice"' in (FRONT / "components" / "LandingVoiceGuide.js").read_text(encoding="utf-8")
    assert "LandingVoiceGuide" in src
    assert "landing-step-ask" in src
    assert "landing-step-who" in src
    assert "landing-step-send" in src
    assert 'data-testid="landing-send-it"' in src
    assert 'data-testid="landing-assignee-email"' in src
    assert 'data-testid="landing-channel-slack"' in src


def test_landing_tryit_sends_for_real_instead_of_pushing_to_register():
    """The composer launches a guest task - no account, no password."""
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
    assert "GoogleSignInButton" not in src
    assert "navigate('/login')" in src
    assert "navigate('/register')" not in src


def test_landing_examples_are_short_manager_asks():
    demo = (FRONT / "lib" / "landingAssignDemo.js").read_text(encoding="utf-8")
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    assert "LANDING_EXAMPLES" in demo
    assert "landing-example-${idea.id}" in landing
    assert "setInterval" in landing
    assert "Use this idea" in landing
    assert "Try one" not in landing
    assert "id: 'pipeline'" in demo
    assert "id: 'walkthrough'" in demo
    assert "id: 'best-deal'" in demo
    assert "Use a sample" not in landing
    script = r"""
import { LANDING_EXAMPLES, colorizeAssignPrompt } from './frontend/src/lib/landingAssignDemo.js';
if (LANDING_EXAMPLES.length < 5 || LANDING_EXAMPLES.length > 8) process.exit(1);
for (const ex of LANDING_EXAMPLES) {
  if (ex.text.length > 110) process.exit(2);
  const kinds = colorizeAssignPrompt(ex.text).map((p) => p.kind);
  if (!kinds.includes('who') || !kinds.includes('work')) process.exit(3);
}
const pipeline = colorizeAssignPrompt(LANDING_EXAMPLES[0].text);
if (!/manager/i.test(pipeline.find((p) => p.kind === 'who').text)) process.exit(4);
if (!/every day at 9/i.test(pipeline.find((p) => p.kind === 'when')?.text || '')) process.exit(5);
const joined = pipeline.map((p) => p.text).join('');
if ((joined.match(/every day at 9/gi) || []).length !== 1) process.exit(6);
if (!joined.endsWith('.')) process.exit(7);
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


def test_landing_demo_assigns_thirty_to_forty_people():
    demo = (FRONT / "lib" / "landingAssignDemo.js").read_text(encoding="utf-8")
    assert "DEMO_PROMPT" in demo
    assert "DEMO_PEOPLE" in demo
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


def test_demo_distill_handles_manager_and_org_asks():
    script = r"""
import { distillLandingPrompt } from './frontend/src/lib/demoDistill.js';
const a = distillLandingPrompt('Tell my manager to send a pipeline update every day at 9.');
if (!a || a.who !== 'Your manager') process.exit(1);
if (!/pipeline/i.test(a.title)) process.exit(2);
if (!/every day at 9/i.test(a.when)) process.exit(3);
if (/tell my manager/i.test(a.ask)) process.exit(4);
const b = distillLandingPrompt('Ask the org to submit their best deal, with all the details.');
if (b.who !== 'Your org') process.exit(5);
if (!/best deal/i.test(b.title)) process.exit(6);
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
const b = colorizeAssignPrompt('Tell my manager to send a pipeline update every day at 9.');
const bKinds = b.map((p) => p.kind);
if (!bKinds.includes('who') || !bKinds.includes('work') || !bKinds.includes('when')) process.exit(3);
if (!/manager/i.test(b.find((p) => p.kind === 'who').text)) process.exit(4);
if (!/every day at 9/i.test(b.find((p) => p.kind === 'when').text)) process.exit(5);
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


def test_landing_rotating_idea_does_not_stack_on_placeholder():
    """The ask box shows one rotating idea, not 'Or type your own' under it."""
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    css = (FRONT / "App.css").read_text(encoding="utf-8")
    assert 'placeholder="Or type your own"' not in landing
    textarea_ph = css.split(".landing-page textarea::placeholder")[1].split(".landing-page input::placeholder")[0]
    assert "transparent" in textarea_ph
    assert "0.28" not in textarea_ph
    assert "textarea::placeholder,\n.landing-page input::placeholder" not in css


def test_prompt_border_is_inset_so_sides_cannot_clip():
    css = (FRONT / "index.css").read_text(encoding="utf-8")
    shell = css.split(".ai-composer-shell {")[1].split(".ai-composer-shell--inset")[0]
    assert "inset 0 0 0 1px" in shell
    assert "overflow: hidden" not in css.split("@media (max-width: 51.99rem)")[-1].split(".ai-prompt-field")[0]
    assert "translateX(-50%)" not in css.split(".ai-bottom-stage")[1].split(".ai-prompt-field")[0]
