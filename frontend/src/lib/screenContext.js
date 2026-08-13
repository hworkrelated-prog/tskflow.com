/**
 * Fast, permission-free snapshot of what the user is looking at in the app.
 * Used when Jarvis "Need a hand?" is tapped so help can be grounded in the UI.
 */

const MAX_TEXT = 4500;

const isVisible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
};

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function captureVisibleScreenContext() {
    const path = window.location.pathname + window.location.search;
    const title = document.title || '';

    const headings = [...document.querySelectorAll('h1, h2, h3, [role="heading"]')]
        .filter(isVisible)
        .slice(0, 12)
        .map((el) => clean(el.textContent))
        .filter(Boolean);

    const dialogs = [...document.querySelectorAll('[role="dialog"], [data-state="open"]')]
        .filter(isVisible)
        .slice(0, 6)
        .map((el) => {
            const heading = clean(el.querySelector('h1, h2, h3, [class*="DialogTitle"]')?.textContent);
            const body = clean(el.innerText).slice(0, 800);
            return { heading, body };
        })
        .filter((d) => d.body);

    const labels = [...document.querySelectorAll('label, [data-testid]')]
        .filter(isVisible)
        .slice(0, 40)
        .map((el) => {
            const testId = el.getAttribute('data-testid');
            const text = clean(el.textContent).slice(0, 120);
            if (!text && !testId) return null;
            return testId ? `${testId}: ${text}` : text;
        })
        .filter(Boolean);

    // Prefer the main app surface; fall back to body
    const root =
        document.querySelector('[data-testid="ai-command-dock"]')?.closest('body') ||
        document.querySelector('main') ||
        document.body;
    let visibleText = '';
    try {
        visibleText = clean(root?.innerText || document.body?.innerText || '').slice(0, MAX_TEXT);
    } catch {
        visibleText = '';
    }

    // Highlight likely stuck states from the AI task bar / clarify UI
    const clarify = clean(
        document.querySelector('[data-testid="ai-clarify-question"], [data-testid="ai-quick-clarify"]')?.textContent
    );
    const previewTitle = clean(
        document.querySelector('[data-testid="ai-chip-title"], [data-testid="ai-inline-title"]')?.value
        || document.querySelector('[data-testid="ai-chip-title"], [data-testid="ai-inline-title"]')?.textContent
    );
    const composer = clean(document.querySelector('[data-testid="ai-quick-input"]')?.value);

    const errors = [...document.querySelectorAll('[role="alert"], .text-red-600, .text-rose-600')]
        .filter(isVisible)
        .slice(0, 8)
        .map((el) => clean(el.textContent))
        .filter((t) => t && t.length < 200);

    return {
        path,
        title,
        headings,
        dialogs,
        labels: labels.slice(0, 25),
        visible_text: visibleText,
        ai_composer: composer || null,
        ai_preview_title: previewTitle || null,
        clarifying_question: clarify || null,
        errors,
        captured_at: new Date().toISOString(),
    };
}
