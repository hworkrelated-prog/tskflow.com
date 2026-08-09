import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sparkles, Wand2, X, Users, User as UserIcon, ChevronDown, Check, Loader2, MessageCircleQuestion, Pencil } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import DateTimePicker from '@/components/DateTimePicker';

/*
 * AIQuickCreate — text an assistant, not fill a form.
 * Flow:
 *   1) User types plain English + Enter
 *   2) POST /api/ai/quick-create-preview
 *   3a) If one critical gap → ask ONE clarifying question conversationally
 *   3b) If ready → natural-language summary + one-tap Confirm
 *   4) "Edit details" reveals the full field editor as a fallback
 */
const AIQuickCreate = ({ onCreated, onOpenAdvanced, embedded = false }) => {
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState(null);
    const [answers, setAnswers] = useState({});
    const [sending, setSending] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [answerMode, setAnswerMode] = useState(null);
    const [answerLoading, setAnswerLoading] = useState(false);
    const [clarifyAnswer, setClarifyAnswer] = useState('');
    const [people, setPeople] = useState([]);
    const [peopleSearch, setPeopleSearch] = useState('');
    const [showPeopleDrop, setShowPeopleDrop] = useState(false);
    const inputRef = useRef(null);
    const clarifyRef = useRef(null);
    const nudgeSentRef = useRef(false);

    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editDue, setEditDue] = useState('');
    const [editPriority, setEditPriority] = useState('Medium');
    const [editAssignees, setEditAssignees] = useState([]);
    const [editCriteria, setEditCriteria] = useState('');

    const focusInput = useCallback(() => {
        setTimeout(() => inputRef.current?.focus(), 30);
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
                e.preventDefault();
                focusInput();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [focusInput]);

    useEffect(() => {
        if (embedded) focusInput();
    }, [embedded, focusInput]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await axios.get(`${API}/users`);
                if (!cancelled) setPeople(Array.isArray(res.data) ? res.data : []);
            } catch (_) {
                if (!cancelled) setPeople([]);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const applyPreview = (p) => {
        setPreview(p);
        setEditTitle(p.title || '');
        setEditDesc(p.description || '');
        setEditDue(p.due_date || '');
        setEditPriority(p.priority || 'Medium');
        setEditAssignees(p.assignee_resolution?.resolved || []);
        setEditCriteria(p.success_criteria || '');
        setShowDetails(false);
        setClarifyAnswer('');
        setPeopleSearch('');
        const qs = p.clarifying_questions || [];
        if (qs.length > 0) {
            const isWho = /who|own|assign/i.test(qs[0] || '');
            setShowPeopleDrop(isWho);
            setTimeout(() => clarifyRef.current?.focus(), 50);
            if (!nudgeSentRef.current) {
                nudgeSentRef.current = true;
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('tskflow:nudge-assistant', {
                        detail: { reason: 'Stuck? Ask the assistant.' },
                    }));
                }, 2800);
            }
        } else {
            setShowPeopleDrop(false);
        }
    };

    const runQA = async (question) => {
        setAnswerLoading(true);
        try {
            const res = await axios.post(`${API}/voice/command`, { transcript: question, text: question });
            const reply = res?.data?.reply || res?.data?.answer || 'I can help with that.';
            setAnswerMode({ question, reply });
        } catch (err) {
            setAnswerMode({ question, reply: err?.response?.data?.detail || 'Sorry, I could not answer that right now.' });
        } finally {
            setAnswerLoading(false);
        }
    };

    const runPreview = async (overrideText, overrideAnswers) => {
        const t = (overrideText ?? text).trim();
        if (!t || t.length < 4) {
            toast.error('Type a bit more so I can understand what you need.');
            return;
        }
        const looksLikeQuestion = /^(how|what|where|why|when|can i|do you|is there|does)\b/i.test(t) && /\?$/.test(t);
        if (looksLikeQuestion) {
            setAnswerMode(null);
            setPreview(null);
            await runQA(t);
            return;
        }
        setAnswerMode(null);
        setLoading(true);
        try {
            const res = await axios.post(`${API}/ai/quick-create-preview`, {
                text: t,
                answers: overrideAnswers ?? answers,
            });
            const p = res.data;
            if (p.intent === 'question') {
                await runQA(t);
                return;
            }
            applyPreview(p);
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not parse — try rephrasing');
        } finally {
            setLoading(false);
        }
    };

    const removeAssignee = (idx) => {
        setEditAssignees((prev) => prev.filter((_, i) => i !== idx));
    };

    const answerClarify = (question, value) => {
        const v = (value || '').trim();
        if (!v) return;
        const next = { ...answers, [question]: v };
        setAnswers(next);
        setClarifyAnswer('');
        setPeopleSearch('');
        runPreview(text, next);
    };

    const pickPerson = (person) => {
        const isSelf = person.id === 'self';
        const isEmailOnly = !isSelf && (String(person.id || '').startsWith('email_') || person.is_invited);
        const chip = isSelf
            ? { kind: 'user', id: 'self', name: 'Me' }
            : isEmailOnly
                ? { kind: 'email', email: person.email, name: person.name || person.email }
                : { kind: 'user', id: person.id, name: person.name, email: person.email };
        setEditAssignees((prev) => {
            const key = chip.id || chip.email;
            if (prev.some((a) => (a.id && a.id === key) || (a.email && a.email === key))) return prev;
            return [...prev, chip];
        });
        setPeopleSearch('');
        setShowPeopleDrop(false);
        setClarifyAnswer('');
        setPreview((p) => {
            if (!p) return p;
            const qs = (p.clarifying_questions || []).filter((q) => !/who|own|assign/i.test(q || ''));
            const hasDue = Boolean(p.due_date || editDue);
            if (!hasDue && !qs.some((q) => /when|due|deadline/i.test(q || ''))) {
                qs.push('When should this be done by?');
            }
            return { ...p, clarifying_questions: qs };
        });
        const label = person.name || person.email;
        if (label) {
            const q = (preview?.clarifying_questions || [])[0] || 'Who should own this task?';
            setAnswers((prev) => ({ ...prev, [q]: label }));
        }
    };

    const reset = () => {
        setText('');
        setPreview(null);
        setAnswers({});
        setEditAssignees([]);
        setEditTitle('');
        setEditDesc('');
        setEditDue('');
        setEditPriority('Medium');
        setEditCriteria('');
        setShowDetails(false);
        setClarifyAnswer('');
        setPeopleSearch('');
        setShowPeopleDrop(false);
        nudgeSentRef.current = false;
        focusInput();
    };

    const flattenAssignees = () => {
        const targets = [];
        for (const a of editAssignees) {
            if (a.kind === 'user' || a.id === 'self') targets.push(a.id === 'self' ? 'self' : a.id);
            else if (a.kind === 'email' && a.email) targets.push(a.email);
            else if ((a.kind === 'group' || a.kind === 'team') && Array.isArray(a.members)) {
                for (const m of a.members) targets.push(m);
            } else if (a.kind === 'group' && Array.isArray(a.emails)) {
                for (const e of a.emails) targets.push(e);
            }
        }
        return Array.from(new Set(targets)).filter(Boolean);
    };

    const send = async () => {
        const unique = flattenAssignees();

        if (!editTitle || !editTitle.trim()) {
            toast.error('Please give the task a title');
            setShowDetails(true);
            return;
        }
        if (!editDue) {
            toast.error('Please pick a due date');
            setShowDetails(true);
            return;
        }
        if (unique.length === 0) {
            toast.error('Please pick at least one assignee');
            setShowDetails(true);
            return;
        }

        setSending(true);
        try {
            const rec = preview?.recurring;
            const isRecurring = rec && rec.is_recurring && rec.frequency;
            const criteria = (editCriteria || '').trim() || undefined;
            if (isRecurring) {
                const payloads = unique.map((aid) => ({
                    title: editTitle.trim(),
                    description: editDesc || '',
                    assigned_to: aid,
                    priority: editPriority,
                    frequency: rec.frequency,
                    days_of_week: rec.days_of_week || null,
                    time_of_day: rec.time_of_day || (editDue ? editDue.slice(11, 16) : '09:00'),
                    end_time_of_day: rec.end_time_of_day || null,
                    end_type: rec.end_type || 'never',
                    end_date: rec.end_date || null,
                    end_count: rec.end_count || null,
                    start_date: editDue ? editDue.slice(0, 10) : undefined,
                    is_sales_task: preview?.is_sales_task || false,
                    success_criteria: criteria,
                }));
                await Promise.all(payloads.map((p) => axios.post(`${API}/recurring`, p)));
                toast.success(`Recurring series set up for ${unique.length} ${unique.length === 1 ? 'person' : 'people'}`);
            } else {
                const payload = {
                    title: editTitle.trim(),
                    description: editDesc || '',
                    assigned_to: unique,
                    due_date: editDue,
                    priority: editPriority,
                    is_sales_task: preview?.is_sales_task || false,
                    requires_screen_recording: preview?.requires_screen_recording || false,
                    success_criteria: criteria,
                };
                if (unique.length === 1) {
                    await axios.post(`${API}/tasks`, { ...payload, assigned_to: unique[0] });
                } else {
                    await axios.post(`${API}/tasks/bulk`, payload);
                }
                toast.success(`Task${unique.length > 1 ? 's' : ''} sent to ${unique.length} ${unique.length === 1 ? 'person' : 'people'}`);
            }
            reset();
            onCreated?.();
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to create task');
        } finally {
            setSending(false);
        }
    };

    const swapAlternate = (idx, alt) => {
        setEditAssignees((prev) => prev.map((a, i) => (i === idx ? { ...alt, kind: alt.kind || 'team' } : a)));
    };

    const clarifying = preview?.clarifying_questions || [];
    const ambiguous = preview?.assignee_resolution?.ambiguous || [];
    const unresolved = preview?.assignee_resolution?.unresolved || [];
    const needsAmbiguousPick = ambiguous.length > 0 && editAssignees.length === 0;
    const isWhoClarify = clarifying.length > 0 && /who|own|assign/i.test(clarifying[0] || '');
    const isWhenClarify = clarifying.length > 0 && /when|due|deadline/i.test(clarifying[0] || '');
    const readyToConfirm =
        !!preview &&
        clarifying.length === 0 &&
        !!editDue &&
        editAssignees.length > 0 &&
        !needsAmbiguousPick;
    const peopleQuery = (peopleSearch || '').replace(/^@/, '').trim().toLowerCase();
    const filteredPeople = [
        { id: 'self', name: 'Me', email: '' },
        ...people,
    ].filter((u) => {
        if (!peopleQuery) return true;
        return (u.name || '').toLowerCase().includes(peopleQuery) || (u.email || '').toLowerCase().includes(peopleQuery);
    }).slice(0, 8);

    const formatDue = (iso) => {
        if (!iso) return null;
        try {
            return format(parseISO(iso), "EEE MMM d 'at' h:mm a");
        } catch {
            return iso.replace('T', ' ');
        }
    };

    const assigneeLabel = () => {
        if (editAssignees.length === 0) return 'no one yet';
        const names = editAssignees.map((a) => a.name).filter(Boolean);
        if (names.length <= 2) return names.join(' and ');
        return `${names[0]} + ${names.length - 1} others`;
    };

    const personCount = editAssignees.reduce((n, a) => n + (a.member_count || a.members?.length || 1), 0);

    const priorityColor = {
        Low: 'bg-slate-100 text-slate-700',
        Medium: 'bg-blue-100 text-blue-700',
        High: 'bg-amber-100 text-amber-800',
        Urgent: 'bg-red-100 text-red-700',
    }[editPriority] || 'bg-slate-100 text-slate-700';

    const chipColor = (kind) => ({
        user: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        email: 'bg-slate-100 text-slate-700 border-slate-200',
        group: 'bg-purple-100 text-purple-800 border-purple-200',
        team: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    }[kind] || 'bg-slate-100 text-slate-700');

    return (
        <div className={embedded ? 'w-full' : 'w-full mb-6'} data-testid="ai-quick-create">
            <div className={embedded ? '' : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'}>
                <div className="flex items-start gap-3">
                    {!embedded && (
                        <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        {!embedded && (
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-xs font-semibold text-slate-700">New task</p>
                                <button
                                    onClick={() => onOpenAdvanced?.()}
                                    className="text-xs text-slate-500 hover:text-slate-800"
                                    data-testid="ai-advanced-btn"
                                >
                                    Advanced
                                </button>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <Input
                                ref={inputRef}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        runPreview();
                                    }
                                }}
                                placeholder="What needs to get done?"
                                className={`flex-1 rounded-xl text-sm h-11 focus-visible:ring-slate-400 ${embedded ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200'}`}
                                data-testid="ai-quick-input"
                                disabled={loading || sending || answerLoading}
                            />
                            <Button
                                type="button"
                                onClick={() => runPreview()}
                                disabled={loading || sending || answerLoading || !text.trim()}
                                className="rounded-xl bg-slate-900 hover:bg-slate-800 h-11 px-4 gap-2"
                                data-testid="ai-quick-preview-btn"
                            >
                                {(loading || answerLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                <span className="hidden sm:inline">{loading || answerLoading ? '…' : 'Go'}</span>
                            </Button>
                        </div>
                    </div>
                </div>

                {answerMode && (
                    <div className="mt-4 bg-slate-50 rounded-xl border border-slate-200 p-4" data-testid="ai-qa-answer">
                        <div className="flex items-start gap-2">
                            <Sparkles className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-xs text-slate-500 mb-1">You asked</p>
                                <p className="text-sm font-medium text-slate-800 mb-3">{answerMode.question}</p>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{answerMode.reply}</p>
                                <button
                                    type="button"
                                    onClick={() => { setAnswerMode(null); setText(''); focusInput(); }}
                                    className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2 mt-3"
                                >
                                    Ask another question or create a task
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {preview && (
                    <div className="mt-4 space-y-3" data-testid="ai-preview-card">
                        {/* Conversational thread */}
                        <div className="space-y-2">
                            <div className="flex justify-end">
                                <div className="max-w-[90%] rounded-2xl rounded-br-md bg-slate-900 text-white px-3.5 py-2 text-sm">
                                    {text}
                                </div>
                            </div>

                            {clarifying.length > 0 && (
                                <div className="flex justify-start" data-testid="ai-clarifying">
                                    <div className="w-full max-w-[95%] rounded-2xl rounded-bl-md bg-amber-50 border border-amber-200 px-3.5 py-3 space-y-2">
                                        <div className="flex items-start gap-2">
                                            <MessageCircleQuestion className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                                            <p className="text-sm font-medium text-amber-950">{clarifying[0]}</p>
                                        </div>

                                        {isWhoClarify ? (
                                            <div className="relative ml-6">
                                                <Input
                                                    ref={clarifyRef}
                                                    value={peopleSearch}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setPeopleSearch(v);
                                                        setShowPeopleDrop(true);
                                                    }}
                                                    onFocus={() => setShowPeopleDrop(true)}
                                                    placeholder="Search people or type @name"
                                                    className="h-9 text-sm rounded-lg border-amber-300 bg-white"
                                                    data-testid="clarify-people-search"
                                                    disabled={loading || sending}
                                                    autoComplete="off"
                                                />
                                                {showPeopleDrop && (
                                                    <div className="absolute z-40 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1" data-testid="clarify-people-dropdown">
                                                        {filteredPeople.length === 0 && (
                                                            <p className="px-3 py-2 text-xs text-slate-500">No matches — try an email</p>
                                                        )}
                                                        {filteredPeople.map((u) => (
                                                            <button
                                                                key={u.id || u.email}
                                                                type="button"
                                                                onClick={() => pickPerson(u)}
                                                                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                                                            >
                                                                <UserIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                                                <span className="text-sm text-slate-800 truncate">{u.name}</span>
                                                                {u.email ? <span className="text-xs text-slate-400 truncate ml-auto">{u.email}</span> : null}
                                                            </button>
                                                        ))}
                                                        {peopleSearch.includes('@') && peopleSearch.includes('.') && !filteredPeople.some((u) => (u.email || '').toLowerCase() === peopleSearch.replace(/^@/, '').trim().toLowerCase()) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const email = peopleSearch.replace(/^@/, '').trim();
                                                                    pickPerson({ id: `email_${email}`, name: email.split('@')[0], email, is_invited: true });
                                                                }}
                                                                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm text-slate-700 border-t"
                                                            >
                                                                Assign to {peopleSearch.replace(/^@/, '').trim()}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex gap-2 ml-6">
                                                <Input
                                                    ref={clarifyRef}
                                                    value={clarifyAnswer}
                                                    onChange={(e) => setClarifyAnswer(e.target.value)}
                                                    placeholder={isWhenClarify ? 'e.g. Friday 5pm' : 'Your answer…'}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && clarifyAnswer.trim()) {
                                                            e.preventDefault();
                                                            answerClarify(clarifying[0], clarifyAnswer);
                                                        }
                                                    }}
                                                    className="h-9 text-sm rounded-lg border-amber-300 bg-white"
                                                    data-testid="clarify-answer-0"
                                                    disabled={loading || sending}
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() => answerClarify(clarifying[0], clarifyAnswer)}
                                                    disabled={loading || sending || !clarifyAnswer.trim()}
                                                    className="rounded-lg bg-amber-700 hover:bg-amber-800"
                                                >
                                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reply'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {ambiguous.length > 0 && clarifying.length === 0 && (
                                <div className="flex justify-start">
                                    <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-amber-50 border border-amber-200 px-3.5 py-3 space-y-2">
                                        <p className="text-sm font-medium text-amber-950">I found a few matches — who did you mean?</p>
                                        {ambiguous.map((amb, i) => (
                                            <div key={i} className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-xs text-amber-900 font-medium">{`"${amb.hint}":`}</span>
                                                {amb.candidates.map((c) => (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        onClick={() => setEditAssignees((prev) => [...prev, { kind: 'user', id: c.id, name: c.name, email: c.email }])}
                                                        className="rounded-full bg-white border border-amber-300 hover:bg-amber-100 px-2.5 py-1 text-xs"
                                                    >
                                                        {c.name}
                                                    </button>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {readyToConfirm && (
                                <div className="flex justify-start">
                                    <div className="max-w-[95%] rounded-2xl rounded-bl-md bg-slate-50 border border-slate-200 px-3.5 py-3 space-y-3">
                                        <p className="text-sm text-slate-800 leading-relaxed">
                                            Got it — I&apos;ll assign <span className="font-semibold">&ldquo;{editTitle || 'this task'}&rdquo;</span>
                                            {' '}to <span className="font-semibold">{assigneeLabel()}</span>
                                            {editDue ? <> by <span className="font-semibold">{formatDue(editDue)}</span></> : null}
                                            {' '}(<span className="font-semibold">{editPriority}</span>).
                                        </p>
                                        {editCriteria ? (
                                            <p className="text-sm text-slate-600">
                                                <span className="font-medium text-slate-800">Done well:</span> {editCriteria}
                                            </p>
                                        ) : null}
                                        {(preview.is_sales_task || preview.requires_screen_recording || preview.recurring?.is_recurring) && (
                                            <div className="flex flex-wrap gap-2">
                                                {preview.recurring?.is_recurring && (
                                                    <Badge className="bg-slate-200 text-slate-800">
                                                        Recurring · {preview.recurring.frequency}
                                                    </Badge>
                                                )}
                                                {preview.is_sales_task && (
                                                    <Badge className="bg-emerald-100 text-emerald-800">Sales task</Badge>
                                                )}
                                                {preview.requires_screen_recording && (
                                                    <Badge className="bg-violet-100 text-violet-800">Screen recording required</Badge>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                            <Button
                                                type="button"
                                                onClick={send}
                                                disabled={sending}
                                                className="rounded-full bg-slate-900 hover:bg-slate-800 gap-2"
                                                data-testid="ai-send-btn"
                                            >
                                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                {sending ? 'Sending…' : 'Confirm & send'}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => setShowDetails((v) => !v)}
                                                className="rounded-full gap-1.5"
                                                data-testid="ai-edit-details"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                                {showDetails ? 'Hide details' : 'Edit details'}
                                            </Button>
                                            <button
                                                type="button"
                                                onClick={reset}
                                                className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 px-1"
                                                data-testid="ai-preview-close"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Details editor — fallback, not the default path */}
                        {(showDetails || (!readyToConfirm && clarifying.length === 0)) && (
                            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4" data-testid="ai-details-editor">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold text-slate-800">
                                        {readyToConfirm ? 'Edit details' : 'Fill in what is missing'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={reset}
                                        className="text-slate-400 hover:text-slate-700 rounded-full p-1"
                                        title="Discard"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Task</label>
                                    <Input
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="rounded-lg font-medium border-slate-300"
                                        placeholder="Task title"
                                        data-testid="ai-preview-title"
                                    />
                                    <Textarea
                                        value={editDesc}
                                        onChange={(e) => setEditDesc(e.target.value)}
                                        className="rounded-lg text-sm border-slate-300 min-h-[48px]"
                                        placeholder="What exactly needs to be done? (optional)"
                                        rows={2}
                                        data-testid="ai-preview-desc"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Done well looks like <span className="font-normal normal-case text-slate-400">(optional)</span>
                                    </label>
                                    <Textarea
                                        value={editCriteria}
                                        onChange={(e) => setEditCriteria(e.target.value)}
                                        className="rounded-lg text-sm border-slate-300 min-h-[48px]"
                                        placeholder="e.g. Clean PDF with pricing, sent to the client, CC me"
                                        rows={2}
                                        data-testid="ai-preview-criteria"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Assigned to ({personCount} {personCount === 1 ? 'person' : 'people'})
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {editAssignees.length === 0 && (
                                            <p className="text-xs text-slate-500 italic">No one identified yet. Reply above, or open the advanced form.</p>
                                        )}
                                        {editAssignees.map((a, i) => (
                                            <div
                                                key={`${a.kind}-${a.id || a.email || i}`}
                                                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border ${chipColor(a.kind)}`}
                                            >
                                                {a.kind === 'user' && <UserIcon className="w-3 h-3" />}
                                                {a.kind === 'email' && <UserIcon className="w-3 h-3" />}
                                                {(a.kind === 'group' || a.kind === 'team') && <Users className="w-3 h-3" />}
                                                <span>
                                                    {a.name}
                                                    {(a.kind === 'group' || a.kind === 'team') && a.member_count > 0 && (
                                                        <span className="opacity-70 ml-1">· {a.member_count}</span>
                                                    )}
                                                </span>
                                                {a.kind === 'team' && Array.isArray(a.alternates) && a.alternates.length > 0 && (
                                                    <details className="relative">
                                                        <summary className="list-none cursor-pointer opacity-60 hover:opacity-100 flex items-center">
                                                            <ChevronDown className="w-3 h-3" />
                                                        </summary>
                                                        <div className="absolute z-30 mt-1 right-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[220px]">
                                                            {a.alternates.map((alt) => (
                                                                <button
                                                                    key={alt.id}
                                                                    type="button"
                                                                    onClick={(e) => { e.preventDefault(); swapAlternate(i, alt); e.currentTarget.closest('details').open = false; }}
                                                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 text-slate-700"
                                                                >
                                                                    {alt.name}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </details>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => removeAssignee(i)}
                                                    className="ml-1 opacity-60 hover:opacity-100"
                                                    aria-label="Remove"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    {unresolved.length > 0 && (
                                        <p className="text-xs text-slate-500 italic">
                                            {`Couldn't identify: ${unresolved.join(', ')}. Add via the advanced form.`}
                                        </p>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">Due</label>
                                        <DateTimePicker
                                            value={editDue}
                                            onChange={(v) => setEditDue(v)}
                                            data-testid="ai-preview-due"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">Priority</label>
                                        <Select value={editPriority} onValueChange={setEditPriority}>
                                            <SelectTrigger className={`rounded-lg ${priorityColor}`} data-testid="ai-preview-priority">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Low">Low</SelectItem>
                                                <SelectItem value="Medium">Medium</SelectItem>
                                                <SelectItem value="High">High</SelectItem>
                                                <SelectItem value="Urgent">Urgent</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {!readyToConfirm && (
                                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                                        <button
                                            type="button"
                                            onClick={() => onOpenAdvanced?.({
                                                title: editTitle,
                                                description: editDesc,
                                                due_date: editDue,
                                                priority: editPriority,
                                                is_sales_task: preview.is_sales_task,
                                                success_criteria: editCriteria,
                                            })}
                                            className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
                                            data-testid="ai-open-advanced"
                                        >
                                            Open advanced form
                                        </button>
                                        <Button
                                            type="button"
                                            onClick={send}
                                            disabled={sending || editAssignees.length === 0 || !editDue || !editTitle}
                                            className="rounded-full bg-slate-900 hover:bg-slate-800 gap-2"
                                            data-testid="ai-send-btn-details"
                                        >
                                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                            {sending ? 'Sending…' : 'Send task'}
                                        </Button>
                                    </div>
                                )}

                                {readyToConfirm && (
                                    <div className="flex justify-end pt-1 border-t border-slate-100">
                                        <button
                                            type="button"
                                            onClick={() => onOpenAdvanced?.({
                                                title: editTitle,
                                                description: editDesc,
                                                due_date: editDue,
                                                priority: editPriority,
                                                is_sales_task: preview.is_sales_task,
                                                success_criteria: editCriteria,
                                            })}
                                            className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
                                            data-testid="ai-open-advanced"
                                        >
                                            Open advanced form for attachments & notes
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {embedded && !preview && !answerMode && (
                    <div className="mt-2 flex justify-end">
                        <button
                            type="button"
                            onClick={() => onOpenAdvanced?.()}
                            className="text-xs text-slate-500 hover:text-slate-800"
                            data-testid="ai-advanced-btn-embedded"
                        >
                            Advanced
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIQuickCreate;
