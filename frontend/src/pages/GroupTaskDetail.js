import React, { useState, useEffect } from 'react';
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
            console.error('Failed to load leaderboard');
        }
    };

    const fetchComments = async () => {
        try {
            const response = await axios.get(`${API}/tasks/${groupId}/comments`);
            setComments(response.data.comments || []);
        } catch (error) {
            console.error('Failed to load comments');
        }
    };

    const fetchUsers = async () => {
        try {
            const response = await axios.get(`${API}/users`);
            setUsers(response.data);
        } catch (error) {
            console.error('Failed to load users');
        }
    };

    const handleCommentChange = (e) => {
        const value = e.target.value;
        setNewComment(value);
        
        // Check for @ mention
        const lastAtIndex = value.lastIndexOf('@');
        if (lastAtIndex !== -1) {
            const afterAt = value.slice(lastAtIndex + 1);
            if (afterAt && !afterAt.includes(' ')) {
                setMentionSearch(afterAt.toLowerCase());
                setShowUserSuggestions(true);
            } else if (!afterAt) {
                setMentionSearch('');
                setShowUserSuggestions(true);
            } else {
                setShowUserSuggestions(false);
            }
        } else {
            setShowUserSuggestions(false);
        }
    };

    const selectUser = (userName) => {
        const lastAtIndex = newComment.lastIndexOf('@');
        const beforeAt = newComment.slice(0, lastAtIndex);
        setNewComment(`${beforeAt}@${userName} `);
        setShowUserSuggestions(false);
    };

    const handlePostComment = async () => {
        if (!newComment.trim()) return;
        
        // Extract mentioned user IDs
        const mentionRegex = /@(\w+)/g;
        const mentions = [];
        let match;
        while ((match = mentionRegex.exec(newComment)) !== null) {
            const userName = match[1];
            const user = users.find(u => u.name.toLowerCase().includes(userName.toLowerCase()));
            if (user) mentions.push(user.id);
        }
        
        try {
            await axios.post(`${API}/tasks/${groupId}/comments`, {
                content: newComment,
                mentions
            });
            setNewComment('');
            fetchComments();
            toast.success('Comment posted');
        } catch (error) {
            toast.error('Failed to post comment');
        }
    };

    const filteredUsers = users.filter(u => 
        u.name.toLowerCase().includes(mentionSearch)
    ).slice(0, 5);

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
                                            idx === 0 ? 'bg-amber-50 border-amber-300' :
                                            idx === 1 ? 'bg-gray-50 border-gray-300' :
                                            idx === 2 ? 'bg-orange-50 border-orange-300' :
                                            'bg-white border-gray-200'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                                                idx === 0 ? 'bg-amber-500 text-white' :
                                                idx === 1 ? 'bg-gray-400 text-white' :
                                                idx === 2 ? 'bg-orange-500 text-white' :
                                                'bg-gray-200 text-gray-700'
                                            }`}>
                                                {entry.rank}
                                            </div>
                                            <div>
                                                <p className="font-semibold">{entry.name}</p>
                                                {entry.completion_hours && (
                                                    <p className="text-sm text-green-600">Completed in {entry.completion_hours}h</p>
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
                                comments.map(comment => (
                                    <div key={comment.id} className="bg-gray-50 p-3 rounded-lg">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-semibold text-sm">{comment.user_name}</span>
                                            <span className="text-xs text-gray-500">
                                                {comment.created_at && format(new Date(comment.created_at), 'MMM dd, h:mm a')}
                                            </span>
                                        </div>
                                        <p className="text-sm">{comment.content}</p>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="relative">
                            <Textarea
                                placeholder="Type @ to mention someone..."
                                value={newComment}
                                onChange={handleCommentChange}
                                rows={3}
                                className="rounded-lg"
                            />
                            
                            {showUserSuggestions && filteredUsers.length > 0 && (
                                <div className="absolute bottom-full mb-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto z-20">
                                    {filteredUsers.map(u => (
                                        <button
                                            key={u.id}
                                            onClick={() => selectUser(u.name)}
                                            className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                                        >
                                            {u.name} <span className="text-gray-500">({u.email})</span>
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
