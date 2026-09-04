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
    assert "TskFlowLogo" in src
    assert "Unbiassly, Inc." in src
    assert 'to="/legal"' in src
    assert 'data-testid="landing-toolbar"' in src
    assert 'data-testid="landing-no-account"' in src
    assert "landing-step-kicker" in src
    assert "landing-step-kicker" in (FRONT / "App.css").read_text(encoding="utf-8")
    # recorder is in the chrome; the page tree renders toolbar above the composer
    assert "LandingScreenRecorder" in src
    assert "landing-toolbar-lead" in src
    page_tree = src.split("const LandingPage")[-1]
    assert page_tree.index("landing-toolbar") < page_tree.index("<LaunchPad")
    assert "landing-brand" in page_tree
    assert "LandingScreenRecorder" in page_tree
    assert "LandingScreenRecorder" not in src.split("const LaunchPad")[1].split("const LandingPage")[0]
    assert "LandingPayoff" in src
    assert "LandingFilm" in src
    assert "LandingWeek" not in src
    assert "LandingPileUp" not in src
    assert "LandingLived" not in src
    assert "LandingCost" not in src
    assert "LandingDifference" not in src
    assert "LandingBeforeAfter" not in src
    assert "LandingFounder" in src
    assert "useScroll" in (FRONT / "components" / "LandingPinBeat.js").read_text(encoding="utf-8")
    assert "What needs to get done?" not in src
    assert "Who should own this?" not in src


def test_landing_voice_guide_is_guest_safe():
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    guide = (FRONT / "components" / "LandingVoiceGuide.js").read_text(encoding="utf-8")
    assert "LandingVoiceGuide" not in landing
    assert 'data-testid="landing-voice-guide"' in guide
    assert 'data-testid="landing-voice-mic"' in guide
    assert "/voice/command" not in guide
    assert "GUIDE_OPEN" in guide
    assert "type the ask" in guide.lower()
    assert "who it is for" in guide.lower()


def test_landing_opens_straight_into_a_launch():
    src = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    hero = (FRONT / "components" / "LandingPayoff.js").read_text(encoding="utf-8")
    demo = (FRONT / "lib" / "landingAssignDemo.js").read_text(encoding="utf-8")
    assert 'data-testid="landing-hero"' in hero
    assert 'data-testid="landing-tryit"' in src
    assert 'data-testid="landing-tryit-input"' in src
    assert "distillLandingPrompt" in src
    assert "What needs to get done" in src  # aria-label
    assert 'data-testid="landing-examples"' in src
    assert "LANDING_EXAMPLES" in src
    assert "ai-prompt-placeholder" in src
    assert "pipeline update" in demo
    assert "best deal" in demo
    assert 'data-testid="landing-send-promise"' in src
    assert "The robot delivers" not in src
    assert "/demo/launch" in src
    assert "LandingVoiceGuide" not in src
    assert "landing-step-ask" in src
    assert "landing-step-who" in src
    assert "landing-step-send" in src
    assert "ai-composer-shell" in src
    assert "landing-confirm" in src
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
    assert "ai-composer-shell" in src
    assert "ai-composer-send" in src
    assert "ArrowUp" in src
    assert "{sending ? 'Sending…' : 'Send'}" in src
    assert "Send it" not in src
    assert "No account. No password." in src
    assert "Send this for real" not in src
    assert "See the ask" not in src
    assert "Sending for real takes an account" not in src
    assert "/demo/launch" in src
    assert "LandingScreenRecorder" in src
    assert "GoogleSignInButton" not in src
    assert "navigate('/login')" in src
    assert "navigate('/register')" not in src


def test_landing_record_is_a_walkthrough_of_the_ask():
    """Record sits at the top of the page, labeled, not buried in the composer."""
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    rec = (FRONT / "components" / "LandingScreenRecorder.js").read_text(encoding="utf-8")
    css = (FRONT / "App.css").read_text(encoding="utf-8")
    chrome = landing.split('data-testid="landing-toolbar"')[1].split("</header>")[0]
    composer = landing.split("const LaunchPad")[1].split("const LandingPage")[0]
    assert "landing-brand" in chrome
    assert "LandingScreenRecorder" in chrome
    assert chrome.index("landing-brand") < chrome.index("LandingScreenRecorder")
    assert "LandingScreenRecorder" not in composer
    assert "landing-toolbar-actions" in chrome
    assert "landing-ask-rec" in rec
    assert "'Record'" in rec or '"Record"' in rec
    assert "landing-ask-rec-label" in rec
    assert "landing-loom-rec" in rec
    assert "landing-loom-dot" in rec
    assert "Record a walkthrough" not in rec
    assert "Record screen" not in rec
    assert "Walkthrough ready" not in rec
    assert "prominent ? 'Record'" not in rec
    assert "landing-loom-rec" in css


def test_landing_examples_are_short_manager_asks():
    demo = (FRONT / "lib" / "landingAssignDemo.js").read_text(encoding="utf-8")
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    assert "LANDING_EXAMPLES" in demo
    assert "setInterval" in landing
    assert "ai-prompt-placeholder" in landing
    assert "landing-example-chip" not in landing
    assert "Use this idea" not in landing
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
if (!b.crowd) process.exit(7);
const c = distillLandingPrompt('Ask Maya to send the Q3 forecast by Friday.');
if (c.who !== 'Maya') process.exit(8);
if (c.crowd) process.exit(9);
if (!/q3 forecast/i.test(c.title)) process.exit(10);
const d = distillLandingPrompt('Remind my team to log every call by 5 each day.');
if (!d.crowd) process.exit(11);
const e = distillLandingPrompt('Ask the sales team for their weekly forecasts');
if (!e.crowd) process.exit(12);
if (!/forecast/i.test(e.title)) process.exit(13);
if (/ask the sales team/i.test(e.title)) process.exit(14);
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
    """The ask box uses the in-app rotating overlay, not a second native placeholder."""
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    css = (FRONT / "App.css").read_text(encoding="utf-8")
    assert 'placeholder="Or type your own"' not in landing
    assert "landing-example pointer-events-none" not in landing
    assert "ai-prompt-placeholder" in landing
    overlay = css.split(".landing-page .landing-composer textarea::placeholder")[1].split("{")[1].split("}")[0]
    assert "transparent" in overlay
    assert "textarea::placeholder,\n.landing-page input::placeholder" not in css


def test_prompt_border_is_inset_so_sides_cannot_clip():
    css = (FRONT / "index.css").read_text(encoding="utf-8")
    shell = css.split(".ai-composer-shell {")[1].split(".ai-composer-shell--inset")[0]
    assert "inset 0 0 0 1px" in shell
    assert "overflow: hidden" not in css.split("@media (max-width: 51.99rem)")[-1].split(".ai-prompt-field")[0]
    assert "translateX(-50%)" not in css.split(".ai-bottom-stage")[1].split(".ai-prompt-field")[0]


def test_landing_story_is_shown_not_told():
    """Short visual film: meet + emojis, the catch, then TskFlow — then the composer."""
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    hero = (FRONT / "components" / "LandingPayoff.js").read_text(encoding="utf-8")
    film = (FRONT / "components" / "LandingFilm.js").read_text(encoding="utf-8")
    css = (FRONT / "App.css").read_text(encoding="utf-8")
    pin = (FRONT / "components" / "LandingPinBeat.js").read_text(encoding="utf-8")
    founder = (FRONT / "components" / "LandingFounder.js").read_text(encoding="utf-8")
    unbiassly = (FRONT / "components" / "LandingUnbiassly.js").read_text(encoding="utf-8")

    assert "Hand the dirty work to TskFlow." in hero
    assert "Cuts the chase. The frustration. The endless back and forth." in hero
    assert "Your relationship with the team stays intact." in hero
    assert "Stop being the chase." in hero
    assert "See how it works" in hero
    assert 'data-testid="landing-point"' in hero
    assert 'data-testid="landing-pain-more"' in hero
    assert 'data-testid="landing-how"' not in landing
    assert "Assign the work in one sentence." not in landing
    assert "They accept. It lands on their calendar." not in landing
    assert "If they go quiet, TskFlow follows up." not in landing
    assert "Stop chasing." not in landing
    assert "They already own it." not in landing
    assert "Get to Know the Founder" in landing
    assert 'data-testid="landing-tab-story"' not in landing
    assert "navigate('/unbiassly')" not in landing
    assert "setTab('unbiassly')" in landing
    assert "LandingUnbiassly" in landing
    assert "People hold back their honest thoughts" in unbiassly
    assert "unbiassly-topic-bar" in unbiassly or "UnbiasslyTopicBar" in unbiassly
    assert "unbiassly-office-hours" not in unbiassly
    assert "Tuesday and Thursday" not in unbiassly
    assert "Book a meeting" not in unbiassly
    assert "Hashim" not in unbiassly
    assert "calendly" not in unbiassly.lower()
    assert "unbiassly-expires" not in unbiassly
    assert "A topic for discussion or collecting feedback" in (FRONT / "components" / "UnbiasslyTopicBar.js").read_text(encoding="utf-8")
    assert "unbiassly-topic-bar" in css
    assert "landing-unbiassly-hours" not in css
    assert "Try it." in landing
    assert "Your email. To try it." in landing
    assert "Stop being the reminder system." in landing
    assert "One person or a 30+ team" in landing
    assert "landing-who-input" in css
    assert "landing-pin-frame" in css
    assert "landing-pin-caption" in css
    assert "position: sticky" in css
    assert "landing-cta-ghost" in css
    assert "landing-payoff-hero" in css
    assert "gmeet" in css and "slack-side" in css and "gmail-read" in css
    assert "landing-film" in css
    assert "landing-app" in css
    assert "useScroll" in pin
    assert "useReducedMotion" in pin
    assert "caption" in pin
    assert "Google Meet" in film
    assert "Yep, I'll have this done by Friday." in film
    assert "# q3-forecast" in film
    assert "Gmail" in film
    assert "Hey - quick update on this?" in film
    assert 'who="alex"' in film
    assert "Maya Chen" in film
    assert "save 78" not in landing.lower()
    assert "Did you get this?" in film
    assert "There is no clear way to hold people accountable." in film
    assert "Record the 1:1" in film
    assert "Screenshot Slack" in film
    assert "Hope HR can use it" in film
    assert "Team performance" in film
    assert "Leaders see who follows through. HR already has the record." in film
    assert "AccountabilityScore" in film
    assert "Capture" in film and "Schedule" in film and "Follow up" in film and "Verify" in film
    assert "TskFlow joins your meet." in film
    assert "Leaves with every task." in film
    assert "Gets after the assignees." in film
    assert "Meeting ended" in film
    assert "No chasing. No Slack archaeology. No guessing." not in film
    assert "Imagine not having to ask." not in hero
    assert "managing reminders" not in hero
    tree = landing.split("const LandingPage")[-1]
    assert tree.index("LandingPayoff") < tree.index("LandingFilm")
    assert tree.index("LandingFilm") < tree.index("<LaunchPad")
    assert "You send it. We run after them until it is done." not in landing
    assert "We email first, then run after them." not in landing
    assert "landing-send-visual" in landing
    assert "prefers-reduced-motion" in css
    assert "Asks bounce around Slack." not in landing
    assert "The robot delivers" not in landing
    assert "Hashim Mahmood" in founder
    assert "/founder.jpg" in founder
    assert "landing-founder-linkedin" in founder
    assert "landing-founder-book" in founder
    assert "almost a decade in sales" in founder
    assert "Regional Director" in founder
    assert "~10 yrs in sales" in founder
    assert "5 years leading sales teams" not in founder
    assert "IC + Manager" not in founder
    assert "5 yrs leading" not in founder
    assert "tired of chasing my own team" in founder
    assert "AEs + managers" in founder
    assert "His own problem" in founder
    assert 'data-testid="landing-tab-founder"' in landing
    assert "Ask engineering to record a demo of the fix by tomorrow" not in landing
    assert "task management platform" not in landing.lower()
    assert "ai productivity platform" not in hero.lower()


def test_landing_film_is_three_slow_chapters():
    """The story is three held pins, not one 12-scene flash."""
    film = (FRONT / "components" / "LandingFilm.js").read_text(encoding="utf-8")
    pin = (FRONT / "components" / "LandingPinBeat.js").read_text(encoding="utf-8")
    hero = (FRONT / "components" / "LandingPayoff.js").read_text(encoding="utf-8")
    assert film.count("<LandingPinBeat") >= 3
    assert "step={1}" in film and "step={2}" in film and "step={3}" in film
    assert "The meeting" in film
    assert "You chase" in film
    assert "TskFlow takes it" in film
    assert "spans={6.4}" in film
    assert "spans={7.6}" in film
    assert "spans={6.8}" in film
    assert "{step} of {totalSteps}" in pin
    assert "navLabel" in film
    assert "blur(" not in pin
    assert "frameBlur" not in pin
    assert "dur: 4.8" in hero
    assert "A meeting starts." in hero
    assert "Scroll to watch it happen" in hero


def test_landing_says_the_point_in_plain_english():
    """A stranger can read the point on the first screen without decoding jargon."""
    hero = (FRONT / "components" / "LandingPayoff.js").read_text(encoding="utf-8")
    film = (FRONT / "components" / "LandingFilm.js").read_text(encoding="utf-8")
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    assert "TskFlow follows up so you do not have to." in hero
    assert "They say yes" in hero
    assert "You chase them" in hero
    assert "TskFlow chases them" in hero
    assert 'data-testid="landing-hero-plot"' in hero
    assert "They said yes. Then the meeting ended." in film
    assert "After yes, you become the reminder system." in film
    assert "TskFlow does the reminding so you do not." in film
    assert 'data-testid="landing-final-plot"' in landing
    assert "landing-prompt-readback" in landing
    assert "DEMO_PEOPLE.length" in landing
    assert "ai-prompt-placeholder" in landing
    assert "landing-example-chip" not in landing
    assert "ai-prompt-placeholder" in landing
    assert "DEMO_PEOPLE.length" in landing
    # Locked phrases still live in the files even if they are no longer the headline.
    assert "Hand the dirty work to TskFlow." in hero
    assert "A group of people." in film
    assert "Catch people." in film
    assert "TskFlow joins your meet." in film


def test_landing_founder_is_a_one_screen_profile():
    founder = (FRONT / "components" / "LandingFounder.js").read_text(encoding="utf-8")
    css = (FRONT / "App.css").read_text(encoding="utf-8")
    assert "landing-founder-cred" in founder
    assert "landing-founder-origin" in founder
    assert "Book a meeting" in founder
    assert "calendly.com/hashim-tskflow" in founder
    assert 'to="/contact"' not in founder
    assert "linkedin.com/in/hashim-mahmood" in founder
    assert "almost a decade in sales" in founder
    assert "Regional Director" in founder
    assert "landing-founder-photo" in css
    assert "100svh" in css.split(".landing-founder {")[1].split(".landing-founder-photo")[0]
    assert "landing-founder-cred li" in css


def test_landing_story_cast_is_sales_and_consistent():
    cast = (FRONT / "lib" / "landingCast.js").read_text(encoding="utf-8")
    film = (FRONT / "components" / "LandingFilm.js").read_text(encoding="utf-8")
    assert "Send the Q3 forecast" in cast
    assert "Send proposal to Acme" in cast
    assert "Update Salesforce stage" in cast
    assert "Q3 forecast" in film
    assert "who: 'alex'" in film
    assert "Maya Chen" in film
    assert "/avatars/maya.svg" in cast
    assert "Alex Rivera" in cast
    assert "TASKS" in film
    assert "hashim" in cast and "maya" in cast and "chris" in cast and "priya" in cast
    assert "CAST.alex" in film
    assert 'who="alex"' in film
    assert 'who="hashim"' not in film
    mark = (FRONT / "components" / "LandingCastMark.js").read_text(encoding="utf-8")
    assert "LandingFace" in mark
    assert "person.photo" in mark
    assert "QA signoff" not in film
    assert "record a demo of the fix" not in film



def test_tskflow_logo_is_a_lockup_not_plain_type():
    """Mark + Tsk/Flow wordmark, reused on splash, landing, and chrome."""
    logo = (FRONT / "components" / "TskFlowLogo.js").read_text(encoding="utf-8")
    css = (FRONT / "index.css").read_text(encoding="utf-8")
    splash = (ROOT / "frontend" / "public" / "index.html").read_text(encoding="utf-8")
    mark = (ROOT / "frontend" / "public" / "favicon.svg").read_text(encoding="utf-8")
    lockup = (ROOT / "frontend" / "public" / "logo.svg").read_text(encoding="utf-8")
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    hub = (FRONT / "pages" / "TaskHub.js").read_text(encoding="utf-8")
    login = (FRONT / "pages" / "LoginPage.js").read_text(encoding="utf-8")
    assert "tskflow-logo-flow" in logo
    assert "TskFlowMark" in logo
    assert "M8 16.7" in logo
    assert "M8 16.7" in mark
    assert "logo.svg" in splash
    assert 'content: "TskFlow"' not in splash
    assert "tskflow-logo--dark" in css
    assert "TskFlowLogo" in landing
    assert "TskFlowLogo" in hub
    assert "TskFlowLogo" in login
    assert "Tsk" in lockup and "Flow" in lockup


def test_landing_tryit_is_the_app_prompt_bar():
    """Try-it is the in-app composer: type English, it names who — one person or the team."""
    landing = (FRONT / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    css = (FRONT / "App.css").read_text(encoding="utf-8")
    composer = landing.split("const LaunchPad")[1].split("const LandingPage")[0]
    assert "ai-composer-shell" in composer
    assert "ai-prompt-placeholder" in composer
    assert "ai-composer-send" in composer
    assert "landing-example-chip" not in landing
    assert "idea.chip" not in landing
    assert "DEMO_PEOPLE.length" in composer
    assert "isLargeTeamPrompt" in composer
    assert "preview?.crowd" in composer or "preview.crowd" in composer
    assert "landing-prompt-readback" in composer
    assert "One person or a 30+ team" in composer
    assert "landing-prompt-tools.is-open" in css
    assert "color: transparent" in css.split(".landing-page .landing-composer textarea::placeholder")[1].split("}")[0]
    hero = (FRONT / "components" / "LandingPayoff.js").read_text(encoding="utf-8")
    assert "max-width: 18ch" not in css.split(".landing-payoff-title")[1].split("}")[0]
    assert "dur: 4.8" in hero

