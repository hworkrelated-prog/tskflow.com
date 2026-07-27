import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Trophy, MessageSquare, Send } from 'lucide-react';
import { format } from 'date-fns';

// Fuzzy score — lower is better. Rewards exact prefix + substring hits.
const fuzzyScore = (haystack, needle) => {
    const h = (haystack || '').toLowerCase();
    const n = (needle || '').toLowerCase().trim();
    if (!n) return 0;
    if (h.startsWith(n)) return 0;
    const idx = h.indexOf(n);
    if (idx !== -1) return 1 + idx;
    // Fallback: char-by-char subsequence walk
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
    const [pendingMentions, setPendingMentions] = useState([]); // [{userId, marker}]
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
            // Fallback to legacy endpoint
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
        // Look for the last '@' before the caret without a space after it
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
        // Use a stable, single-token handle so we can map it back to a user ID later
        const handle = u.name.replace(/\s+/g, '');
        const marker = `@${handle}`;
        const newVal = `${newComment.slice(0, atIdx)}${marker} ${after}`;
        setNewComment(newVal);
        setPendingMentions((prev) => {
            if (prev.find((p) => p.userId === u.id)) return prev;
            return [...prev, { userId: u.id, marker }];
        });
        setShowUserSuggestions(false);
        // Return focus + place caret after the inserted marker
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

        // Build mentions list from the pending map (only markers still present in text)
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

    return (
        <div className="min-h-screen bg-white">
            <header className="border-b bg-white sticky top-0 z-10">
                <div className="container mx-auto px-6 py-4">
                    <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-2">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Dashboard
                    </Button>
                    <h1 className="text-2xl font-semibold">{group?.title}</h1>
                    <p className="text-sm text-muted-foreground mt-1">{group?.description}</p>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8 max-w-5xl">
                {/* Leaderboard */}
                {leaderboard && (
                    <Card className="mb-6 border-2">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Trophy className="w-5 h-5 text-amber-500" />
                                <h2 className="text-xl font-semibold">Leaderboard</h2>
                            </div>
                            <p className="text-sm text-amber-700 mb-4">{leaderboard.visibility_message}</p>

                            <div className="space-y-2">
                                {leaderboard.leaderboard.map((entry, idx) => (
                                    <div
                                        key={entry.task_id}
                                        className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                                            idx === 0
                                                ? 'bg-amber-50 border-amber-300'
                                                : idx === 1
                                                ? 'bg-gray-50 border-gray-300'
                                                : idx === 2
                                                ? 'bg-orange-50 border-orange-300'
                                                : 'bg-white border-gray-200'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                                                    idx === 0
                                                        ? 'bg-amber-500 text-white'
                                                        : idx === 1
                                                        ? 'bg-gray-400 text-white'
                                                        : idx === 2
                                                        ? 'bg-orange-500 text-white'
                                                        : 'bg-gray-200 text-gray-700'
                                                }`}
                                            >
                                                {entry.rank}
                                            </div>
                                            <div>
                                                <p className="font-semibold">{entry.name}</p>
                                                {entry.completion_hours && (
                                                    <p className="text-sm text-green-600">
                                                        Completed in {entry.completion_hours}h
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <Badge variant={entry.status === 'Completed' ? 'default' : 'outline'}>
                                            {entry.status}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Chatter/Comments */}
                <Card className="border-2">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-4">
                            <MessageSquare className="w-5 h-5 text-indigo-600" />
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
                                                idx === highlightIdx ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-gray-50'
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
            </main>
        </div>
    );
};

export default GroupTaskDetail;
