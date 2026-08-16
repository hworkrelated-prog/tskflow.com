import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { X } from 'lucide-react';
import { useAuth, API } from '@/App';
import AIQuickCreate from '@/components/AIQuickCreate';

const HIDDEN = ['/login', '/register', '/verify-email', '/forgot-password'];
const LANDINGish = ['/', '/privacy', '/terms', '/contact'];

/**
 * Minimal app-wide command bar — create, search, navigate, ask.
 */
const GlobalAIDock = () => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [active, setActive] = useState(false);
    const [focused, setFocused] = useState(false);
    const [pendingAttachments, setPendingAttachments] = useState([]);
    const [recordingPending, setRecordingPending] = useState(false);
    const snapRef = useRef(null);
    const attachHandlerRef = useRef(null);

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
        window.addEventListener('tskflow:open-ai-create', focusPrompt);
        window.addEventListener('tskflow:focus-ai-prompt', markActive);
        window.addEventListener('tskflow:attach-to-ai-create', onAttach);
        window.addEventListener('tskflow:start-task-from-recording', onRecordingTask);
        window.addEventListener('tskflow:resume-ai-draft', focusPrompt);
        return () => {
            window.removeEventListener('tskflow:open-ai-create', focusPrompt);
            window.removeEventListener('tskflow:focus-ai-prompt', markActive);
            window.removeEventListener('tskflow:attach-to-ai-create', onAttach);
            window.removeEventListener('tskflow:start-task-from-recording', onRecordingTask);
            window.removeEventListener('tskflow:resume-ai-draft', focusPrompt);
        };
    }, []);

    const persistDraftFromSnap = useCallback(async (snap) => {
        const raw = (snap?.text || '').trim();
        if (!raw || snap?.sending) return;
        try {
            const first = raw.split('\n')[0].replace(/^#+\s*/, '').trim();
            await axios.post(`${API}/tasks/drafts`, {
                title: (snap.editTitle || first || 'Untitled draft').slice(0, 80),
                description: snap.editDesc || raw,
                due_date: snap.editDue || '',
                priority: snap.editPriority || 'Medium',
                assigned_to: snap.editAssignees?.[0]?.id || snap.editAssignees?.[0]?.email || '',
            });
            window.dispatchEvent(new CustomEvent('tskflow:drafts-changed'));
        } catch {
            /* draft save is best-effort */
        }
    }, []);

    const clearFlow = useCallback(() => {
        const snap = snapRef.current;
        persistDraftFromSnap(snap);
        setActive(false);
        setFocused(false);
        setPendingAttachments([]);
        setRecordingPending(false);
        snapRef.current = null;
        window.dispatchEvent(new CustomEvent('tskflow:ai-dock-reset'));
    }, [persistDraftFromSnap]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape' && (active || focused)) {
                e.preventDefault();
                if (active) {
                    clearFlow();
                } else {
                    setFocused(false);
                    if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                    }
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [active, focused, clearFlow]);

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

    const open = active || focused || recordingPending;

    return (
        <div
            className={`ai-command-dock fixed left-1/2 z-40 w-[min(96vw,40rem)] bottom-4${open ? ' is-open' : ''}`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            data-testid="ai-command-dock"
        >
            <div className={`ai-dock-panel relative max-h-[min(78dvh,720px)] clean-scroll${active ? ' is-active' : ''}`}>
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
                        if (snap?.preview || snap?.text?.trim() || snap?.answerMode || (snap?.attachments || []).length) {
                            setActive(true);
                        } else if (!recordingPending) {
                            setActive(false);
                        }
                    }}
                    onCreated={() => {
                        snapRef.current = null;
                        setActive(false);
                        setFocused(false);
                        setPendingAttachments([]);
                        setRecordingPending(false);
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
