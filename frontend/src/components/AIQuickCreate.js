import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sparkles, Wand2, X, Users, User as UserIcon, Calendar, Zap, ChevronDown, ChevronUp, Check, Loader2, MessageCircleQuestion } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import DateTimePicker from '@/components/DateTimePicker';

/*
 * AIQuickCreate — one-sentence-in, perfect-task-out.
 * Flow:
 *   1) User types a natural-language sentence + Enter
 *   2) Component calls POST /api/ai/quick-create-preview
 *   3) Shows a compact preview card:
 *       - Title, description (editable)
 *       - Assignees (chips) — user, group, team
 *       - Due date + priority (editable)
 *       - Clarifying questions (with quick answer chips or free text)
 *   4) User taps Send → bulk create task via existing /api/tasks/bulk
 */
const AIQuickCreate = ({ onCreated, onOpenAdvanced }) => {
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState(null);
    const [answers, setAnswers] = useState({});
    const [sending, setSending] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const inputRef = useRef(null);

    // Preview edits
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editDue, setEditDue] = useState('');
    const [editPriority, setEditPriority] = useState('Medium');
    const [editAssignees, setEditAssignees] = useState([]); // [{kind,id?,name,email?,members?}]

    const focusInput = useCallback(() => {
        setTimeout(() => inputRef.current?.focus(), 30);
    }, []);

    useEffect(() => {
        // Global shortcut: press "/" to focus AI input (when not typing in another field)
        const onKey = (e) => {
            if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
                e.preventDefault();
                focusInput();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [focusInput]);

    const runPreview = async (overrideText, overrideAnswers) => {
        const t = (overrideText ?? text).trim();
        if (!t || t.length < 4) {
            toast.error('Type a bit more so I can understand what you need.');
            return;
        }
        setLoading(true);
        try {
            const res = await axios.post(`${API}/ai/quick-create-preview`, {
                text: t,
                answers: overrideAnswers ?? answers,
            });
            const p = res.data;
            setPreview(p);
            setEditTitle(p.title || '');
            setEditDesc(p.description || '');
            setEditDue(p.due_date || '');
            setEditPriority(p.priority || 'Medium');
            const resolved = p.assignee_resolution?.resolved || [];
            setEditAssignees(resolved);
            setExpanded(true);
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
        const next = { ...answers, [question]: value };
        setAnswers(next);
        // Re-run preview with the answers folded in
        runPreview(text, next);
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
        setExpanded(false);
    };

    const send = async () => {
        // Flatten assignees to a list of user IDs or emails
        const targets = [];
        for (const a of editAssignees) {
            if (a.kind === 'user') targets.push(a.id);
            else if (a.kind === 'email' && a.email) targets.push(a.email);
            else if ((a.kind === 'group' || a.kind === 'team') && Array.isArray(a.members)) {
                for (const m of a.members) targets.push(m);
            } else if ((a.kind === 'group') && Array.isArray(a.emails)) {
                for (const e of a.emails) targets.push(e);
            }
        }
        // Deduplicate
        const unique = Array.from(new Set(targets)).filter(Boolean);

        if (!editTitle || !editTitle.trim()) {
            toast.error('Please give the task a title');
            return;
        }
        if (!editDue) {
            toast.error('Please pick a due date');
            return;
        }
        if (unique.length === 0) {
            toast.error('Please pick at least one assignee');
            return;
        }

        setSending(true);
        try {
            const payload = {
                title: editTitle.trim(),
                description: editDesc || '',
                assigned_to: unique,
                due_date: editDue,
                priority: editPriority,
                is_sales_task: preview?.is_sales_task || false,
                requires_screen_recording: preview?.requires_screen_recording || false,
            };
            if (unique.length === 1) {
                // Single task
                await axios.post(`${API}/tasks`, { ...payload, assigned_to: unique[0] });
            } else {
                await axios.post(`${API}/tasks/bulk`, payload);
            }
            toast.success(`Task${unique.length > 1 ? 's' : ''} sent to ${unique.length} ${unique.length === 1 ? 'person' : 'people'} ✨`);
            reset();
            onCreated?.();
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to create task');
        } finally {
            setSending(false);
        }
    };

    const clarifying = preview?.clarifying_questions || [];
    const ambiguous = preview?.assignee_resolution?.ambiguous || [];
    const unresolved = preview?.assignee_resolution?.unresolved || [];

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
        <div className="w-full mb-6" data-testid="ai-quick-create">
            <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-md">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Quick create with AI</p>
                            <button
                                onClick={() => onOpenAdvanced?.()}
                                className="text-xs text-indigo-600 hover:text-indigo-900 underline underline-offset-2"
                                data-testid="ai-advanced-btn"
                            >
                                Prefer the full form?
                            </button>
                        </div>
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
                                placeholder='e.g., "Tell my team to submit their MEAs by 12 PST — urgently"'
                                className="flex-1 bg-white/90 border-indigo-200 rounded-xl text-sm h-11 focus-visible:ring-indigo-400"
                                data-testid="ai-quick-input"
                                disabled={loading || sending}
                            />
                            <Button
                                type="button"
                                onClick={() => runPreview()}
                                disabled={loading || sending || !text.trim()}
                                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 h-11 px-4 gap-2"
                                data-testid="ai-quick-preview-btn"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                <span className="hidden sm:inline">{loading ? 'Reading…' : 'Preview'}</span>
                            </Button>
                        </div>
                        <p className="text-[11px] text-indigo-500/80 mt-1.5">
                            One sentence in, perfect task out. Press <kbd className="px-1 py-0.5 bg-white/70 rounded border border-indigo-200 font-mono text-[10px]">/</kbd> anywhere to focus.
                        </p>
                    </div>
                </div>

                {/* Preview card */}
                {preview && expanded && (
                    <div className="mt-4 bg-white rounded-xl border-2 border-indigo-100 shadow-inner p-4 space-y-4" data-testid="ai-preview-card">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Wand2 className="w-4 h-4 text-indigo-600" />
                                <span className="text-sm font-semibold text-slate-800">Preview — edit anything before sending</span>
                            </div>
                            <button
                                type="button"
                                onClick={reset}
                                className="text-slate-400 hover:text-slate-700 rounded-full p-1"
                                title="Discard"
                                data-testid="ai-preview-close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Clarifying questions */}
                        {clarifying.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3" data-testid="ai-clarifying">
                                {clarifying.map((q, i) => (
                                    <div key={i}>
                                        <div className="flex items-start gap-2 mb-2">
                                            <MessageCircleQuestion className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                                            <p className="text-sm font-medium text-amber-900">{q}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2 ml-6">
                                            <Input
                                                placeholder="Type your answer…"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                        answerClarify(q, e.currentTarget.value.trim());
                                                        e.currentTarget.value = '';
                                                    }
                                                }}
                                                className="max-w-md h-8 text-xs rounded-lg border-amber-300 bg-white"
                                                data-testid={`clarify-answer-${i}`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Title + description */}
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

                        {/* Assignees */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                Assigned to ({editAssignees.reduce((n, a) => n + (a.member_count || (a.members?.length) || 1), 0)} {editAssignees.reduce((n, a) => n + (a.member_count || (a.members?.length) || 1), 0) === 1 ? 'person' : 'people'})
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {editAssignees.length === 0 && (
                                    <p className="text-xs text-slate-500 italic">{'No one identified. Add via the full form or reword your prompt (e.g. "@Alice", "Sales team").'}</p>
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
                            {ambiguous.length > 0 && (
                                <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                    <p className="font-semibold mb-1">Multiple matches for:</p>
                                    {ambiguous.map((amb, i) => (
                                        <div key={i} className="flex flex-wrap items-center gap-1.5 mb-1">
                                            <span className="text-amber-900 font-medium">{`"${amb.hint}":`}</span>
                                            {amb.candidates.map((c) => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => setEditAssignees((prev) => [...prev, { kind: 'user', id: c.id, name: c.name, email: c.email }])}
                                                    className="rounded-full bg-white border border-amber-300 hover:bg-amber-100 px-2 py-0.5 text-[11px]"
                                                >
                                                    + {c.name}
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {unresolved.length > 0 && (
                                <p className="text-xs text-slate-500 italic">
                                    {`Couldn't identify: ${unresolved.join(', ')}. Add via the full form.`}
                                </p>
                            )}
                        </div>

                        {/* Due date + priority */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">Due</label>
                                <DateTimePicker
                                    value={editDue}
                                    onChange={(v) => setEditDue(v)}
                                    data-testid="ai-preview-due"
                                />
                                {preview.due_date_expression && (
                                    <p className="text-[11px] text-slate-500 mt-1">{`Detected from: "${preview.due_date_expression}"`}</p>
                                )}
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

                        {/* Tags */}
                        {(preview.is_sales_task || preview.requires_screen_recording) && (
                            <div className="flex flex-wrap gap-2">
                                {preview.is_sales_task && (
                                    <Badge className="bg-emerald-100 text-emerald-800">💰 Sales task</Badge>
                                )}
                                {preview.requires_screen_recording && (
                                    <Badge className="bg-purple-100 text-purple-800">🎥 Screen recording required</Badge>
                                )}
                            </div>
                        )}

                        {/* Send + advanced */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => onOpenAdvanced?.({ title: editTitle, description: editDesc, due_date: editDue, priority: editPriority, is_sales_task: preview.is_sales_task })}
                                className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
                                data-testid="ai-open-advanced"
                            >
                                Open full form to add attachments, notes, or recording
                            </button>
                            <div className="flex items-center gap-2">
                                <Button type="button" variant="outline" onClick={reset} className="rounded-full" disabled={sending}>
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    onClick={send}
                                    disabled={sending || editAssignees.length === 0 || !editDue || !editTitle}
                                    className="rounded-full bg-indigo-600 hover:bg-indigo-700 gap-2"
                                    data-testid="ai-send-btn"
                                >
                                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    {sending ? 'Sending…' : 'Send task'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIQuickCreate;
