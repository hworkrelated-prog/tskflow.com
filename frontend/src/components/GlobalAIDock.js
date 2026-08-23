import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, X } from 'lucide-react';
import { useAuth, API } from '@/App';
import AIQuickCreate from '@/components/AIQuickCreate';

const HIDDEN = ['/login', '/register', '/verify-email', '/forgot-password'];
const LANDINGish = ['/', '/privacy', '/terms', '/contact'];

const draftPayloadFromSnap = (snap) => {
    if (!snap || snap.sending) return null;
    const prompt = String(snap.activePrompt || '').trim();
    const typed = String(snap.text || '').trim();
    const threadBlob = Array.isArray(snap.threadTexts)
        ? snap.threadTexts.map((t) => String(t || '').trim()).filter(Boolean).join('\n')
        : '';
    const body = String(snap.editDesc || prompt || typed || threadBlob || '').trim();
    const started = Boolean(
        snap.preview
        || (snap.thread || 0) > 0
        || prompt
        || (snap.attachments || []).length
    );
    // Save as soon as a conversation has started (first send), or while typing a prompt.
    if (!started && !typed) return null;
    if (!body && !typed) return null;
    const seed = String(snap.editTitle || prompt || typed || body).split('\n')[0].replace(/^#+\s*/, '').trim();
    return {
        title: (seed || 'Untitled draft').slice(0, 80),
        description: body || typed,
        due_date: snap.editDue || '',
        priority: snap.editPriority || 'Medium',
        assigned_to: snap.editAssignees?.[0]?.id || snap.editAssignees?.[0]?.email || '',
    };
};

/**
 * Minimal app-wide command bar — create, search, navigate, ask.
 */
const GlobalAIDock = () => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [active, setActive] = useState(false);
    const [focused, setFocused] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [pendingAttachments, setPendingAttachments] = useState([]);
    const [recordingPending, setRecordingPending] = useState(false);
    const snapRef = useRef(null);
    const attachHandlerRef = useRef(null);
    const dockRef = useRef(null);
    const draftIdRef = useRef(null);
    const draftTimerRef = useRef(null);
    const lastDraftSigRef = useRef('');
    const hoverLeaveTimerRef = useRef(null);

    const visible =
        !!user
        && !HIDDEN.includes(location.pathname)
        && !LANDINGish.includes(location.pathname)
        && !location.pathname.startsWith('/recording/controls');

    useEffect(() => {
        if (!visible) return undefined;
        document.body.classList.add('has-ai-dock');
        return () => document.body.classList.remove('has-ai-dock');
    }, [visible]);

    const upsertDraftFromSnap = useCallback(async (snap, { force = false } = {}) => {
        const payload = draftPayloadFromSnap(snap);
        if (!payload) return null;
        const sig = JSON.stringify(payload);
        if (!force && draftIdRef.current && sig === lastDraftSigRef.current) {
            return draftIdRef.current;
        }
        try {
            if (draftIdRef.current) {
                await axios.put(`${API}/tasks/drafts/${draftIdRef.current}`, payload);
            } else {
                const res = await axios.post(`${API}/tasks/drafts`, payload);
                draftIdRef.current = res?.data?.id || null;
            }
            lastDraftSigRef.current = sig;
            window.dispatchEvent(new CustomEvent('tskflow:drafts-changed'));
            return draftIdRef.current;
        } catch {
            /* draft save is best-effort */
            return draftIdRef.current;
        }
    }, []);

    const scheduleDraftSave = useCallback((snap, { immediate = false } = {}) => {
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        if (immediate || !draftIdRef.current) {
            draftTimerRef.current = null;
            upsertDraftFromSnap(snap);
            return;
        }
        draftTimerRef.current = setTimeout(() => {
            upsertDraftFromSnap(snap);
        }, 350);
    }, [upsertDraftFromSnap]);

    const discardDraft = useCallback(async () => {
        if (draftTimerRef.current) {
            clearTimeout(draftTimerRef.current);
            draftTimerRef.current = null;
        }
        const id = draftIdRef.current;
        draftIdRef.current = null;
        lastDraftSigRef.current = '';
        if (!id) return;
        try {
            await axios.delete(`${API}/tasks/drafts/${id}`);
            window.dispatchEvent(new CustomEvent('tskflow:drafts-changed'));
        } catch { /* noop */ }
    }, []);

    useEffect(() => {
        const markActive = () => setActive(true);
        const focusPrompt = () => {
            setActive(true);
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('tskflow:focus-ai-prompt'));
                const dock = document.querySelector('[data-testid="ai-command-dock"]');
                dock?.classList?.add('ai-dock-pulse');
                setTimeout(() => dock?.classList?.remove('ai-dock-pulse'), 900);
            }, 40);
        };
        const onAttach = (e) => {
            const refs = e?.detail?.attachments;
            if (Array.isArray(refs) && refs.length) {
                setPendingAttachments((prev) => {
                    const ids = new Set(prev.map((a) => a.id || a.storage_path));
                    const next = [...prev];
                    refs.forEach((r) => {
                        const key = r.id || r.storage_path;
                        if (key && !ids.has(key)) next.push(r);
                    });
                    return next;
                });
                setRecordingPending(false);
                focusPrompt();
            }
        };
        const onRecordingTask = () => {
            setRecordingPending(true);
            focusPrompt();
        };
        const onResumeDraft = (e) => {
            const id = e?.detail?.id;
            if (id) {
                draftIdRef.current = id;
                lastDraftSigRef.current = '';
            }
            focusPrompt();
        };
        window.addEventListener('tskflow:open-ai-create', focusPrompt);
        window.addEventListener('tskflow:focus-ai-prompt', markActive);
        window.addEventListener('tskflow:attach-to-ai-create', onAttach);
        window.addEventListener('tskflow:start-task-from-recording', onRecordingTask);
        window.addEventListener('tskflow:resume-ai-draft', onResumeDraft);
        return () => {
            window.removeEventListener('tskflow:open-ai-create', focusPrompt);
            window.removeEventListener('tskflow:focus-ai-prompt', markActive);
            window.removeEventListener('tskflow:attach-to-ai-create', onAttach);
            window.removeEventListener('tskflow:start-task-from-recording', onRecordingTask);
            window.removeEventListener('tskflow:resume-ai-draft', onResumeDraft);
            if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
            if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current);
        };
    }, []);

    const clearHoverLeaveTimer = useCallback(() => {
        if (hoverLeaveTimerRef.current) {
            clearTimeout(hoverLeaveTimerRef.current);
            hoverLeaveTimerRef.current = null;
        }
    }, []);

    const handleDockPointerEnter = useCallback(() => {
        clearHoverLeaveTimer();
        setHovered(true);
    }, [clearHoverLeaveTimer]);

    const handleDockPointerLeave = useCallback(() => {
        // Delay collapse so the FAB→panel morph (opacity / pointer-events swap)
        // cannot drop a hit-test frame and flicker open/closed under the cursor.
        clearHoverLeaveTimer();
        hoverLeaveTimerRef.current = setTimeout(() => {
            hoverLeaveTimerRef.current = null;
            setHovered(false);
        }, 180);
    }, [clearHoverLeaveTimer]);

    const clearFlow = useCallback(() => {
        const snap = snapRef.current;
        if (draftTimerRef.current) {
            clearTimeout(draftTimerRef.current);
            draftTimerRef.current = null;
        }
        clearHoverLeaveTimer();
        // Keep the unfinished draft in the header list; wait for the write so we
        // don't clear draftId mid-flight and orphan a second create.
        Promise.resolve(upsertDraftFromSnap(snap, { force: true })).finally(() => {
            draftIdRef.current = null;
            lastDraftSigRef.current = '';
        });
        setActive(false);
        setFocused(false);
        setHovered(false);
        setPendingAttachments([]);
        setRecordingPending(false);
        snapRef.current = null;
        window.dispatchEvent(new CustomEvent('tskflow:ai-dock-reset'));
    }, [upsertDraftFromSnap, clearHoverLeaveTimer]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape' && (active || focused || hovered)) {
                e.preventDefault();
                clearHoverLeaveTimer();
                if (active) {
                    clearFlow();
                } else {
                    setFocused(false);
                    setHovered(false);
                    if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                    }
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [active, focused, hovered, clearFlow, clearHoverLeaveTimer]);

    const openManual = (prefill) => {
        try {
            if (prefill) sessionStorage.setItem('tsk_manual_prefill', JSON.stringify(prefill));
        } catch { /* noop */ }
        window.dispatchEvent(new CustomEvent('tskflow:open-advanced-create', { detail: prefill || null }));
        if (location.pathname !== '/dashboard') {
            navigate('/dashboard?create=advanced');
        }
    };

    if (!visible) return null;

    const lockedOpen = active || focused || recordingPending;
    const open = lockedOpen || hovered;

    const expandFromFab = () => {
        clearHoverLeaveTimer();
        setHovered(true);
        setFocused(true);
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('tskflow:focus-ai-prompt'));
            const dock = document.querySelector('[data-testid="ai-command-dock"]');
            dock?.classList?.add('ai-dock-pulse');
            setTimeout(() => dock?.classList?.remove('ai-dock-pulse'), 900);
        }, 40);
    };

    return (
        <div
            ref={dockRef}
            className={`ai-command-dock${open ? ' is-open' : ' is-collapsed'}${focused ? ' is-focused' : ''}${lockedOpen ? ' is-locked' : ''}`}
            data-testid="ai-command-dock"
            onMouseEnter={handleDockPointerEnter}
            onPointerEnter={handleDockPointerEnter}
            onMouseLeave={() => { if (!lockedOpen) handleDockPointerLeave(); }}
            onPointerLeave={() => { if (!lockedOpen) handleDockPointerLeave(); }}
        >
            <button
                type="button"
                className="ai-dock-fab"
                data-testid="ai-dock-fab"
                title="Create with AI"
                aria-label="Create a task"
                aria-expanded={open}
                tabIndex={open ? -1 : 0}
                aria-hidden={open}
                onClick={expandFromFab}
            >
                <Plus className="ai-dock-fab-plus" strokeWidth={2.25} />
            </button>
            <div
                className={`ai-dock-panel relative max-h-[min(78dvh,720px)] clean-scroll${active ? ' is-active' : ''}`}
                inert={!open ? true : undefined}
                aria-hidden={!open}
            >
                <button
                    type="button"
                    onClick={clearFlow}
                    className={`ai-dock-exit absolute top-2 right-2 z-10 h-7 w-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center${active ? ' is-visible' : ''}`}
                    data-testid="ai-dock-exit"
                    title="Clear (Esc)"
                    aria-label="Clear"
                    tabIndex={active ? 0 : -1}
                    aria-hidden={!active}
                >
                    <X className="w-3.5 h-3.5" />
                </button>

                {recordingPending && (
                    <p className="text-[11px] text-teal-800 bg-teal-50 border border-teal-100 rounded-xl px-2.5 py-1.5 mb-2" data-testid="ai-dock-recording-pending">
                        Recording in progress — it will attach here when you stop.
                    </p>
                )}

                <AIQuickCreate
                    embedded
                    externalAttachments={pendingAttachments}
                    onExternalAttachmentsConsumed={() => setPendingAttachments([])}
                    registerAttachHandler={(fn) => { attachHandlerRef.current = fn; }}
                    onSnapshot={(snap) => {
                        snapRef.current = snap;
                        setFocused(!!snap?.focused);
                        const hasConversation = Boolean(
                            snap?.preview
                            || snap?.thread > 0
                            || snap?.answerMode
                            || (snap?.activePrompt || '').trim()
                            || snap?.text?.trim()
                            || (snap?.attachments || []).length
                        );
                        if (hasConversation) {
                            setActive(true);
                        } else if (!recordingPending) {
                            setActive(false);
                        }
                        // The moment a conversation starts (first send → thread/activePrompt),
                        // persist a draft so it shows in Unfinished Drafts immediately.
                        const conversationStarted = Boolean(
                            snap?.preview
                            || snap?.thread > 0
                            || (snap?.activePrompt || '').trim()
                        );
                        if (conversationStarted && !snap?.sending) {
                            scheduleDraftSave(snap, { immediate: !draftIdRef.current });
                        }
                    }}
                    onCreated={() => {
                        setPendingAttachments([]);
                        setRecordingPending(false);
                        discardDraft();
                        window.dispatchEvent(new CustomEvent('tskflow:task-created'));
                    }}
                    onOpenAdvanced={(prefill) => openManual(prefill)}
                    onRequestExit={clearFlow}
                />
            </div>
        </div>
    );
};

export default GlobalAIDock;
