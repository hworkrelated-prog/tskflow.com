import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';
import { Pencil, Trash2, Users, X } from 'lucide-react';

/**
 * Shared groups manager used by Team Management (Groups tab) and TaskHub modal.
 */
const GroupsManager = ({ onChanged, compact = false }) => {
    const { user } = useAuth();
    const [groups, setGroups] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [groupForm, setGroupForm] = useState({ id: null, name: '', emails: [] });
    const [groupEmailInput, setGroupEmailInput] = useState('');
    const [editingGroupId, setEditingGroupId] = useState(null);
    const [expandedGroup, setExpandedGroup] = useState(null);
    const [groupSaving, setGroupSaving] = useState(false);

    const refresh = async () => {
        if (user?.subscription_tier === 'free') {
            setGroups([]);
            setLoading(false);
            return;
        }
        try {
            const [gRes, uRes] = await Promise.all([
                axios.get(`${API}/groups`),
                axios.get(`${API}/users`).catch(() => ({ data: [] })),
            ]);
            setGroups(Array.isArray(gRes.data) ? gRes.data : []);
            setUsers(Array.isArray(uRes.data) ? uRes.data : []);
            onChanged?.(Array.isArray(gRes.data) ? gRes.data : []);
        } catch (_) {
            setGroups([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, user?.subscription_tier]);

    const addGroupEmail = () => {
        const input = groupEmailInput.trim();
        if (!input) {
            toast.error('Enter an email address');
            return;
        }
        const lines = input.split(/[\n,;]+/).map((line) => line.trim().toLowerCase()).filter(Boolean);
        if (lines.length > 1) {
            const validEmails = lines.filter((email) => email.includes('@'));
            const newEmails = validEmails.filter((email) => !groupForm.emails.includes(email));
            if (newEmails.length === 0) {
                toast.error('All emails are already added');
                return;
            }
            setGroupForm({ ...groupForm, emails: [...groupForm.emails, ...newEmails] });
            setGroupEmailInput('');
            toast.success(`Added ${newEmails.length} email(s)`);
            return;
        }
        const email = input.toLowerCase();
        if (!email.includes('@')) {
            toast.error('Enter a valid email address');
            return;
        }
        if (groupForm.emails.includes(email)) {
            toast.error('Email already added to this group');
            setGroupEmailInput('');
            return;
        }
        setGroupForm({ ...groupForm, emails: [...groupForm.emails, email] });
        setGroupEmailInput('');
    };

    const handleSaveGroup = async () => {
        if (!groupForm.name.trim()) {
            toast.error('Please give your group a name');
            return;
        }
        if (groupForm.emails.length === 0) {
            toast.error('Add at least one email to the group');
            return;
        }
        setGroupSaving(true);
        try {
            if (editingGroupId) {
                await axios.put(`${API}/groups/${editingGroupId}`, {
                    name: groupForm.name.trim(),
                    emails: groupForm.emails,
                });
                toast.success(`Group “${groupForm.name.trim()}” updated`);
                setEditingGroupId(null);
            } else {
                await axios.post(`${API}/groups`, {
                    name: groupForm.name.trim(),
                    emails: groupForm.emails,
                });
                toast.success(`Group “${groupForm.name.trim()}” created`);
            }
            setGroupForm({ id: null, name: '', emails: [] });
            setGroupEmailInput('');
            await refresh();
        } catch (error) {
            toast.error(getErrorMessage(error, editingGroupId ? 'Failed to update group' : 'Failed to create group'));
        } finally {
            setGroupSaving(false);
        }
    };

    const handleEditGroup = (group) => {
        setEditingGroupId(group.id);
        setGroupForm({ id: group.id, name: group.name, emails: [...(group.emails || [])] });
        setExpandedGroup(null);
    };

    const handleCancelEdit = () => {
        setEditingGroupId(null);
        setGroupForm({ id: null, name: '', emails: [] });
        setGroupEmailInput('');
    };

    const handleDeleteGroup = async (groupId) => {
        try {
            await axios.delete(`${API}/groups/${groupId}`);
            toast.success('Group deleted');
            await refresh();
        } catch (_) {
            toast.error('Failed to delete group');
        }
    };

    if (user?.subscription_tier === 'free') {
        return (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-600">
                Groups are available on Pro and Teams.
            </div>
        );
    }

    if (loading) {
        return <div className="text-sm text-slate-500 py-8 text-center">Loading groups…</div>;
    }

    return (
        <div className={compact ? 'space-y-4' : 'space-y-5'} data-testid="groups-manager">
            {groups.length > 0 && (
                <div className="space-y-2">
                    {groups.map((group) => {
                        const isExpanded = expandedGroup === group.id;
                        const emails = group.emails || [];
                        const showAllEmails = isExpanded || emails.length <= 3;
                        const displayEmails = showAllEmails ? emails : emails.slice(0, 3);
                        return (
                            <div key={group.id} data-testid={`group-row-${group.id}`} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                                <div className="flex items-start justify-between gap-3 p-3">
                                    <button
                                        type="button"
                                        onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                                        className="min-w-0 flex-1 text-left"
                                    >
                                        <p className="font-medium text-slate-900">{group.name}</p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            {displayEmails.join(', ') || 'No members yet'}
                                            {!showAllEmails && <span className="text-teal-700 ml-1">+{emails.length - 3} more</span>}
                                        </p>
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => handleEditGroup(group)}
                                            className="text-teal-700 hover:bg-teal-50 rounded-full p-2"
                                            title="Edit group"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        {isExpanded && (
                                            <button
                                                type="button"
                                                data-testid={`delete-group-${group.id}`}
                                                onClick={() => handleDeleteGroup(group.id)}
                                                className="text-red-500 hover:bg-red-50 rounded-full p-2"
                                                title="Delete group"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="space-y-3 pt-2 border-t border-slate-100">
                <p className="text-sm font-medium text-slate-800">{editingGroupId ? 'Edit group' : 'New group'}</p>
                <div className="space-y-2">
                    <Label htmlFor="group-name">Name</Label>
                    <Input
                        id="group-name"
                        data-testid="group-name-input"
                        value={groupForm.name}
                        onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                        placeholder="Sales, Design, Managers…"
                        className="rounded-xl"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="group-user-picker" className="flex items-center gap-2">
                        <Users className="w-4 h-4" /> Teammates
                    </Label>
                    <div className="border rounded-xl bg-white max-h-40 overflow-y-auto divide-y" data-testid="group-user-picker">
                        {(users || []).filter((u) => u.id !== user?.id).length === 0 ? (
                            <div className="p-3 text-xs text-slate-500">No teammates yet - paste emails below.</div>
                        ) : (
                            (users || []).filter((u) => u.id !== user?.id).map((u) => {
                                const already = groupForm.emails.includes(u.email);
                                return (
                                    <label key={u.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${already ? 'bg-teal-50/60' : 'hover:bg-slate-50'}`}>
                                        <input
                                            type="checkbox"
                                            checked={already}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    if (!groupForm.emails.includes(u.email)) {
                                                        setGroupForm({ ...groupForm, emails: [...groupForm.emails, u.email] });
                                                    }
                                                } else {
                                                    setGroupForm({ ...groupForm, emails: groupForm.emails.filter((em) => em !== u.email) });
                                                }
                                            }}
                                            className="accent-teal-600 w-4 h-4"
                                            data-testid={`group-user-checkbox-${u.id}`}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium truncate">{u.name}</p>
                                            <p className="text-xs text-slate-500 truncate">{u.email}</p>
                                        </div>
                                    </label>
                                );
                            })
                        )}
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="group-email">External emails</Label>
                    <div className="flex gap-2">
                        <Textarea
                            id="group-email"
                            data-testid="group-email-input"
                            value={groupEmailInput}
                            onChange={(e) => setGroupEmailInput(e.target.value)}
                            placeholder="external@vendor.com"
                            className="rounded-xl min-h-[60px]"
                        />
                        <Button type="button" variant="outline" data-testid="add-group-email-button" onClick={addGroupEmail} className="rounded-xl shrink-0 self-start">
                            Add
                        </Button>
                    </div>
                    {groupForm.emails.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {groupForm.emails.map((email) => (
                                <div key={email} className="flex items-center gap-1 bg-teal-100 text-teal-800 px-3 py-1.5 rounded-full text-sm">
                                    <span>{email}</span>
                                    <button
                                        type="button"
                                        onClick={() => setGroupForm({ ...groupForm, emails: groupForm.emails.filter((em) => em !== email) })}
                                        className="ml-1 hover:bg-teal-200 rounded-full p-0.5"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button type="button" data-testid="save-group-button" onClick={handleSaveGroup} disabled={groupSaving} className="flex-1 rounded-full">
                        {groupSaving ? 'Saving…' : (editingGroupId ? 'Update' : 'Create')}
                    </Button>
                    {editingGroupId && (
                        <Button type="button" variant="outline" onClick={handleCancelEdit} className="rounded-full">
                            Cancel
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GroupsManager;
