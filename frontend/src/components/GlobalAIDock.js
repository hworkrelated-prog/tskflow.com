import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, X, ListChecks } from 'lucide-react';
import { useAuth } from '@/App';
import AIQuickCreate from '@/components/AIQuickCreate';

const HIDDEN = ['/login', '/register', '/verify-email', '/forgot-password'];
const LANDINGish = ['/', '/privacy', '/terms', '/contact'];

/**
 * App-wide floating AI create bar (replaces per-page New Task FABs).
 * Jarvis sits beside the bar chrome; Escape / Clear exits an in-progress draft.
 */
const GlobalAIDock = () => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [active, setActive] = useState(false);
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
            setTimeout(() => window.dispatchEvent(new CustomEvent('tskflow:focus-ai-prompt')), 40);
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
        return () => {
            window.removeEventListener('tskflow:open-ai-create', focusPrompt);
            window.removeEventListener('tskflow:focus-ai-prompt', markActive);
            window.removeEventListener('tskflow:attach-to-ai-create', onAttach);
            window.removeEventListener('tskflow:start-task-from-recording', onRecordingTask);
        };
    }, []);

    const clearFlow = useCallback(() => {
        setActive(false);
        setPendingAttachments([]);
        setRecordingPending(false);
        snapRef.current = null;
        window.dispatchEvent(new CustomEvent('tskflow:ai-dock-reset'));
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape' && active) {
                e.preventDefault();
                clearFlow();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [active, clearFlow]);

    const openJarvis = () => {
        window.dispatchEvent(new CustomEvent('tskflow:open-assistant'));
    };

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

    return (
        <div
            className="fixed left-1/2 -translate-x-1/2 z-40 w-[min(96vw,42rem)] bottom-3"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            data-testid="ai-command-dock"
        >
            <div className="rounded-2xl sm:rounded-3xl border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xl shadow-slate-900/15 p-3 sm:p-4 max-h-[min(78dvh,720px)] overflow-y-auto clean-scroll">
                <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
                    <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5" style={{ fontFamily: 'Outfit' }}>
                        <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                        Create a task
                    </p>
                    <div className="flex items-center gap-1.5">
                        {active && (
                            <button
                                type="button"
                                onClick={clearFlow}
                                className="text-[11px] text-slate-400 hover:text-slate-700 inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-slate-100"
                                data-testid="ai-dock-exit"
                                title="Clear and exit (Esc)"
                            >
                                <X className="w-3 h-3" />
                                Clear
                            </button>
                        )}
                        <button
                            type="button"
                            className="text-[11px] text-slate-400 hover:text-slate-700 px-2 py-1 rounded-full hover:bg-slate-100 inline-flex items-center gap-1"
                            onClick={() => openManual()}
                            data-testid="ai-dock-manual-form"
                        >
                            <ListChecks className="w-3 h-3" />
                            Manual form
                        </button>
                        <button
                            type="button"
                            onClick={openJarvis}
                            className="group relative h-8 pl-1.5 pr-2.5 rounded-full bg-slate-900 text-white inline-flex items-center gap-1.5 shadow-sm hover:bg-slate-800 transition-colors"
                            data-testid="ai-dock-jarvis"
                            title="Ask Jarvis"
                            aria-label="Ask Jarvis"
                        >
                            <span
                                className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold"
                                style={{
                                    fontFamily: 'Outfit, sans-serif',
                                    background: 'linear-gradient(145deg,#0f766e,#134e4a)',
                                }}
                            >
                                J
                            </span>
                            <span className="text-[11px] font-semibold tracking-tight">Jarvis</span>
                        </button>
                    </div>
                </div>

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
                        if (snap?.preview || snap?.text?.trim() || snap?.answerMode || (snap?.attachments || []).length) {
                            setActive(true);
                        } else if (!recordingPending) {
                            setActive(false);
                        }
                    }}
                    onCreated={() => {
                        snapRef.current = null;
                        setActive(false);
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
