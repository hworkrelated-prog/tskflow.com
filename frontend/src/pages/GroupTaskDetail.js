import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Trophy, MessageSquare, Send, TrendingUp, TrendingDown, Mail, Zap, AlertCircle, Sparkles } from 'lucide-react';
import { format } from 'date-fns';

// Fuzzy score — lower is better. Rewards exact prefix + substring hits.
const fuzzyScore = (haystack, needle) => {
    const h = (haystack || '').toLowerCase();
    const n = (needle || '').toLowerCase().trim();
    if (!n) return 0;
    if (h.startsWith(n)) return 0;
    const idx = h.indexOf(n);
    if (idx !== -1) return 1 + idx;
    let hi = 0;
    let miss = 0;
    for (const ch of n) {
        const next = h.indexOf(ch, hi);
        if (next === -1) return 999;
        miss += next - hi;
        hi = next + 1;
    }
    return 10 + miss;
};

const PRESETS = [
    { key: 'gentle_nudge', label: '💬 Gentle nudge', hint: 'A friendly reminder to please close the loop' },
    { key: 'urgent_reminder', label: '⚡ Urgent reminder', hint: 'This is well past due and needs immediate attention' },
    { key: 'final_notice', label: '🚨 Final notice', hint: `Last call — escalation next if it's not done today` },
    { key: 'custom', label: '✍️ Custom message', hint: 'Write your own note' },
];

const NudgeModal = ({ open, onClose, taskId, initialAssignees = [], onSent }) => {
    const [selected, setSelected] = useState([]);
    const [preset, setPreset] = useState('gentle_nudge');
    const [customSubject, setCustomSubject] = useState('');
    const [customMessage, setCustomMessage] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (open) {
            setSelected(initialAssignees.map((a) => a.assignee_id || a.id).filter(Boolean));
            setPreset('gentle_nudge');
            setCustomSubject('');
            setCustomMessage('');
        }
    }, [open, initialAssignees]);

    const toggle = (id) => {
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const send = async () => {
        if (selected.length === 0) {
            toast.error('Pick at least one person');
            return;
        }
        setSending(true);
        try {
            const payload = {
                assignee_ids: selected,
                preset,
                ...(preset === 'custom' ? { custom_subject: customSubject || undefined, custom_message: customMessage || undefined } : {}),
            };
            const res = await axios.post(`${API}/tasks/${taskId}/nudge`, payload);
            toast.success(`Sent to ${res.data.sent} ${res.data.sent === 1 ? 'person' : 'people'} ✅`);
            onSent?.();
            onClose?.();
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to send nudge');
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="rounded-2xl max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5 text-teal-600" />
                        Send a nudge
                    </DialogTitle>
                    <DialogDescription>{`Give people a friendly (or firm) push. They'll get an in-app notification and an email with a direct link to the task.`}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    {/* Recipients */}
                    <div>
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">Recipients ({selected.length})</label>
                        <div className="flex flex-wrap gap-2">
                            {initialAssignees.map((a) => {
                                const id = a.assignee_id || a.id;
                                const active = selected.includes(id);
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => toggle(id)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border ${active ? 'bg-teal-100 border-teal-300 text-teal-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                        data-testid={`nudge-recipient-${id}`}
                                    >
                                        {active ? '✓ ' : '+ '}{a.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Preset */}
                    <div>
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-2">Tone</label>
                        <div className="grid grid-cols-2 gap-2">
                            {PRESETS.map((p) => (
                                <button
                                    key={p.key}
                                    type="button"
                                    onClick={() => setPreset(p.key)}
                                    className={`text-left p-3 rounded-xl border-2 text-xs ${preset === p.key ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                    data-testid={`nudge-preset-${p.key}`}
                                >
                                    <p className="font-semibold text-sm mb-0.5">{p.label}</p>
                                    <p className="text-[11px] text-slate-500 leading-snug">{p.hint}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Custom fields */}
                    {preset === 'custom' && (
                        <div className="space-y-2">
                            <Input
                                placeholder="Subject (optional)"
                                value={customSubject}
                                onChange={(e) => setCustomSubject(e.target.value)}
                                className="rounded-lg"
                                data-testid="nudge-custom-subject"
                            />
                            <Textarea
                                placeholder="Write your message… keep it short and clear about what you need."
                                value={customMessage}
                                onChange={(e) => setCustomMessage(e.target.value)}
                                rows={4}
                                className="rounded-lg"
                                data-testid="nudge-custom-message"
                            />
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button variant="outline" onClick={onClose} disabled={sending} className="rounded-full">Cancel</Button>
                        <Button onClick={send} disabled={sending || selected.length === 0} className="rounded-full bg-teal-600 hover:bg-teal-700 gap-2" data-testid="nudge-send">
                            <Send className="w-4 h-4" />
                            {sending ? 'Sending…' : `Send to ${selected.length}`}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};


const LeaderboardRow = ({ entry, rank, onNudge, showNudge, tone = 'default' }) => {
    const status = entry.status || 'Pending';
    const isCompleted = status === 'Completed';
    const isReview = status === 'Review Pending' || status === 'Review';

    const border =
        tone === 'top' ? 'border-emerald-200 bg-emerald-50/50' :
        tone === 'bottom' ? 'border-red-200 bg-red-50/50' :
        rank === 1 ? 'bg-amber-50 border-amber-300' :
        rank === 2 ? 'bg-gray-50 border-gray-300' :
        rank === 3 ? 'bg-orange-50 border-orange-300' :
        'bg-white border-gray-200';

    const badgeColor =
        tone === 'top' ? 'bg-emerald-500 text-white' :
        tone === 'bottom' ? 'bg-red-500 text-white' :
        rank === 1 ? 'bg-amber-500 text-white' :
        rank === 2 ? 'bg-gray-400 text-white' :
        rank === 3 ? 'bg-orange-500 text-white' :
        'bg-gray-200 text-gray-700';

    return (
        <div className={`flex items-center justify-between p-3 rounded-lg border-2 ${border}`} data-testid={`lb-row-${entry.assignee_id}`}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${badgeColor}`}>
                    {rank}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{entry.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        {isCompleted && entry.completion_hours != null && (
                            <span className="text-xs text-emerald-700 font-medium">✓ Done in {entry.completion_hours}h</span>
                        )}
                        {!isCompleted && !isReview && (
                            <span className="text-xs text-slate-500">Score {entry.engagement_score}</span>
                        )}
                        {isReview && <span className="text-xs text-amber-700">Awaiting review</span>}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <Badge variant={isCompleted ? 'default' : 'outline'} className="text-[10px]">
                    {status}
                </Badge>
                {showNudge && !isCompleted && (
                    <Button size="sm" variant="outline" onClick={() => onNudge(entry)} className="h-7 px-2 text-xs rounded-full border-teal-200 text-teal-700 hover:bg-teal-50" data-testid={`nudge-btn-${entry.assignee_id}`}>
                        <Zap className="w-3 h-3 mr-1" />
                        Nudge
                    </Button>
                )}
            </div>
        </div>
    );
};


const GroupTaskDetail = () => {
    const { groupId } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [group, setGroup] = useState(null);
    const [leaderboard, setLeaderboard] = useState(null);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [showUserSuggestions, setShowUserSuggestions] = useState(false);
    const [mentionSearch, setMentionSearch] = useState('');
    const [highlightIdx, setHighlightIdx] = useState(0);
    const [pendingMentions, setPendingMentions] = useState([]);
    const [showNudgeModal, setShowNudgeModal] = useState(false);
    const [nudgeAssignees, setNudgeAssignees] = useState([]);
    const textareaRef = useRef(null);

    useEffect(() => {
        fetchGroupDetails();
        fetchLeaderboard();
        fetchComments();
        fetchUsers();
    }, [groupId]);

    const fetchGroupDetails = async () => {
        try {
            const response = await axios.get(`${API}/tasks/${groupId}`);
            setGroup(response.data);
        } catch (error) {
            toast.error('Failed to load group task');
            navigate('/dashboard');
        } finally {
            setLoading(false);
        }
    };

    const fetchLeaderboard = async () => {
        try {
            const response = await axios.get(`${API}/tasks/${groupId}/leaderboard`);
            setLeaderboard(response.data);
        } catch (error) {
            /* silent */
        }
    };

    const fetchComments = async () => {
        try {
            const response = await axios.get(`${API}/tasks/${groupId}/comments`);
            setComments(response.data.comments || []);
        } catch (error) {
            /* silent */
        }
    };

    const fetchUsers = async () => {
        try {
            const response = await axios.get(`${API}/users/mentionable`);
            setUsers(response.data);
        } catch (error) {
            try {
                const legacy = await axios.get(`${API}/users`);
                setUsers(legacy.data);
            } catch (_) { /* silent */ }
        }
    };

    const handleCommentChange = (e) => {
        const value = e.target.value;
        setNewComment(value);

        const caret = e.target.selectionStart ?? value.length;
        const before = value.slice(0, caret);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1) {
            setShowUserSuggestions(false);
            return;
        }
        const between = before.slice(atIdx + 1);
        if (/\s/.test(between)) {
            setShowUserSuggestions(false);
            return;
        }
        setMentionSearch(between.toLowerCase());
        setShowUserSuggestions(true);
        setHighlightIdx(0);
    };

    const selectUser = (u) => {
        const caret = textareaRef.current?.selectionStart ?? newComment.length;
        const before = newComment.slice(0, caret);
        const after = newComment.slice(caret);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1) return;
        const handle = u.name.replace(/\s+/g, '');
        const marker = `@${handle}`;
        const newVal = `${newComment.slice(0, atIdx)}${marker} ${after}`;
        setNewComment(newVal);
        setPendingMentions((prev) => {
            if (prev.find((p) => p.userId === u.id)) return prev;
            return [...prev, { userId: u.id, marker }];
        });
        setShowUserSuggestions(false);
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            const pos = atIdx + marker.length + 1;
            el.focus();
            try {
                el.setSelectionRange(pos, pos);
            } catch (_) { /* noop */ }
        });
    };

    const handleKeyDown = (e) => {
        if (!showUserSuggestions || filteredUsers.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIdx((i) => Math.min(i + 1, filteredUsers.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            selectUser(filteredUsers[highlightIdx]);
        } else if (e.key === 'Escape') {
            setShowUserSuggestions(false);
        }
    };

    const handlePostComment = async () => {
        if (!newComment.trim()) return;
        const mentions = pendingMentions
            .filter((m) => newComment.includes(m.marker))
            .map((m) => m.userId);
        try {
            await axios.post(`${API}/tasks/${groupId}/comments`, {
                content: newComment,
                mentions,
            });
            setNewComment('');
            setPendingMentions([]);
            fetchComments();
            toast.success('Comment posted');
        } catch (error) {
            toast.error('Failed to post comment');
        }
    };

    const openNudge = (entries) => {
        // entries: single or array
        const list = Array.isArray(entries) ? entries : [entries];
        setNudgeAssignees(list);
        setShowNudgeModal(true);
    };

    const filteredUsers = users
        .map((u) => ({
            u,
            score: Math.min(
                fuzzyScore(u.name, mentionSearch),
                fuzzyScore((u.email || '').split('@')[0], mentionSearch)
            ),
        }))
        .filter((x) => x.score < 999)
        .sort((a, b) => a.score - b.score)
        .slice(0, 6)
        .map((x) => x.u);

    if (loading) return <div className="min-h-screen bg-white flex items-center justify-center">Loading...</div>;

    const isCreator = group && user && (group.created_by === user.id);
    const all = leaderboard?.leaderboard || [];
    const activeOnly = all.filter((e) => e.status !== 'Completed');
    const completedOnly = all.filter((e) => e.status === 'Completed');
    // Adaptive Top/Bottom split: show for 4+ people. Sizes shrink for small groups.
    const showTopBottomSplit = all.length >= 4;
    const splitSize = all.length >= 10 ? 5 : Math.max(2, Math.floor(all.length / 2));
    const top5 = all.slice(0, splitSize);
    const bottom5 = [...all].reverse().slice(0, splitSize);

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b bg-white sticky top-0 z-10">
                <div className="container mx-auto px-6 py-4">
                    <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-2">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Dashboard
                    </Button>
                    <h1 className="text-2xl font-semibold">{group?.title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{group?.description}</p>
                    {group && (
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span>👥 {all.length} assignees</span>
                            <span>✓ {completedOnly.length} completed</span>
                            <span>⏳ {activeOnly.length} pending</span>
                        </div>
                    )}
                </div>
            </header>

            <main className="container mx-auto px-6 py-8 max-w-5xl">
                {/* Full Leaderboard */}
                {leaderboard && all.length > 0 && (
                    <Card className="mb-6 border-2">
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Trophy className="w-5 h-5 text-amber-500" />
                                    <h2 className="text-xl font-semibold">Leaderboard — {all.length} assignees</h2>
                                </div>
                                {isCreator && activeOnly.length > 0 && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openNudge(activeOnly)}
                                        className="rounded-full gap-1 border-teal-200 text-teal-700 hover:bg-teal-50"
                                        data-testid="nudge-all-btn"
                                    >
                                        <Zap className="w-3.5 h-3.5" />
                                        Nudge all pending ({activeOnly.length})
                                    </Button>
                                )}
                            </div>
                            {leaderboard.visibility_message && (
                                <p className="text-sm text-amber-700 mb-4">{leaderboard.visibility_message}</p>
                            )}

                            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                                {all.map((entry) => (
                                    <LeaderboardRow
                                        key={entry.task_id}
                                        entry={entry}
                                        rank={entry.rank}
                                        onNudge={(e) => openNudge(e)}
                                        showNudge={isCreator}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Chatter/Comments */}
                <Card className="border-2 mb-6">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-4">
                            <MessageSquare className="w-5 h-5 text-teal-600" />
                            <h2 className="text-xl font-semibold">Chatter</h2>
                        </div>

                        <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                            {comments.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No comments yet. Start the conversation!</p>
                            ) : (
                                comments.map((comment) => (
                                    <div key={comment.id} className="bg-gray-50 p-3 rounded-lg">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-semibold text-sm">{comment.user_name}</span>
                                            <span className="text-xs text-gray-500">
                                                {comment.created_at &&
                                                    format(new Date(comment.created_at), 'MMM dd, h:mm a')}
                                            </span>
                                        </div>
                                        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="relative">
                            <Textarea
                                ref={textareaRef}
                                placeholder="Type @ to mention someone..."
                                value={newComment}
                                onChange={handleCommentChange}
                                onKeyDown={handleKeyDown}
                                rows={3}
                                className="rounded-lg"
                            />

                            {showUserSuggestions && filteredUsers.length > 0 && (
                                <div className="absolute bottom-full mb-2 w-full max-w-md bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto z-20">
                                    {filteredUsers.map((u, idx) => (
                                        <button
                                            key={u.id}
                                            onMouseDown={(e) => { e.preventDefault(); selectUser(u); }}
                                            onMouseEnter={() => setHighlightIdx(idx)}
                                            className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                                                idx === highlightIdx ? 'bg-teal-50 text-teal-900' : 'hover:bg-gray-50'
                                            }`}
                                        >
                                            <span className="font-medium">{u.name}</span>
                                            <span className="text-xs text-gray-500">{u.email}</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="flex justify-end mt-2">
                                <Button onClick={handlePostComment} disabled={!newComment.trim()}>
                                    <Send className="w-4 h-4 mr-2" />
                                    Post Comment
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Top 5 / Bottom 5 — visible when the group is big enough */}
                {showTopBottomSplit && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="border-2 border-emerald-200">
                            <CardContent className="pt-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                                    <h3 className="text-lg font-semibold text-emerald-900">Top {splitSize} performers</h3>
                                </div>
                                <p className="text-xs text-emerald-700 mb-3">Fastest and most engaged on this task.</p>
                                <div className="space-y-2">
                                    {top5.map((entry) => (
                                        <LeaderboardRow
                                            key={entry.task_id}
                                            entry={entry}
                                            rank={entry.rank}
                                            onNudge={() => {}}
                                            showNudge={false}
                                            tone="top"
                                        />
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-2 border-red-200">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <TrendingDown className="w-5 h-5 text-red-600" />
                                        <h3 className="text-lg font-semibold text-red-900">Bottom {splitSize} performers</h3>
                                    </div>
                                    {isCreator && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openNudge(bottom5.filter((e) => e.status !== 'Completed'))}
                                            className="rounded-full text-xs border-red-200 text-red-700 hover:bg-red-50 gap-1"
                                            data-testid="nudge-bottom5-btn"
                                        >
                                            <Zap className="w-3 h-3" />
                                            Nudge all
                                        </Button>
                                    )}
                                </div>
                                <p className="text-xs text-red-700 mb-3">Need a push to close things out.</p>
                                <div className="space-y-2">
                                    {bottom5.map((entry) => (
                                        <LeaderboardRow
                                            key={entry.task_id}
                                            entry={entry}
                                            rank={entry.rank}
                                            onNudge={(e) => openNudge(e)}
                                            showNudge={isCreator}
                                            tone="bottom"
                                        />
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </main>

            <NudgeModal
                open={showNudgeModal}
                onClose={() => setShowNudgeModal(false)}
                taskId={groupId}
                initialAssignees={nudgeAssignees}
                onSent={fetchLeaderboard}
            />
        </div>
    );
};

export default GroupTaskDetail;
