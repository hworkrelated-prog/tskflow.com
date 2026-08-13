import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Plus, LogOut, BarChart3, Settings, HelpCircle, Crown, X, Users, User, Calendar, ChevronDown, AlertCircle, CheckCircle2, Trash2, MoreHorizontal, RotateCcw, CheckSquare, Search, Pencil, Sparkles, Trophy, FileText, DollarSign, Library, Repeat, Wand2, ScrollText } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import TaskCard from '@/components/TaskCard';
import { motion, AnimatePresence } from 'framer-motion';
import { getErrorMessage } from '@/lib/utils';
import OnboardingPopup, { useOnboarding } from '@/components/OnboardingPopup';
import DateTimePicker from '@/components/DateTimePicker';
import ParentTaskGroup from '@/components/ParentTaskGroup';
import AttachmentPicker from '@/components/AttachmentPicker';
import RichTextEditor from '@/components/RichTextEditor';
import StandaloneRecorder from '@/components/StandaloneRecorder';
import ScreenRecorder from '@/components/ScreenRecorder';
import RecurrenceEditor from '@/components/RecurrenceEditor';
import AIQuickCreate from '@/components/AIQuickCreate';
import GroupsManager from '@/components/GroupsManager';
import { registerPush } from '@/lib/push';
import { attachOnlineFlusher, enqueue } from '@/lib/draftStore';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, addMonths, isBefore, parseISO } from 'date-fns';

const TaskHub = () => {
    const { user, logout } = useAuth();
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [drafts, setDrafts] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [users, setUsers] = useState([]);
    const [taskForm, setTaskForm] = useState({
        title: '',
        description: '',
        due_date: '',
        priority: 'Medium',
        is_sales_task: false,
        success_criteria: '',
    });
    const [recurrence, setRecurrence] = useState({ enabled: false, frequency: 'weekly', interval: 1, end_type: 'never', end_date: '', end_count: 5 });
    const [smartParsing, setSmartParsing] = useState(false);
    const [draftInModal, setDraftInModal] = useState({ id: null, status: '' }); // status: 'idle'|'saving'|'saved'|'error'
    const draftSaveTimer = useRef(null);
    const [selectedAssignees, setSelectedAssignees] = useState([]);
    const [attachments, setAttachments] = useState([]);
    const [emailInput, setEmailInput] = useState('');
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    // User groups (Pro & Teams)
    const [groups, setGroups] = useState([]);
    const [parentGroups, setParentGroups] = useState([]);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [groupForm, setGroupForm] = useState({ id: null, name: '', emails: [] });
    const [groupEmailInput, setGroupEmailInput] = useState('');
    const [groupSaving, setGroupSaving] = useState(false);
    const [editingGroupId, setEditingGroupId] = useState(null);
    const [expandedGroup, setExpandedGroup] = useState(null);
    const [aiSummary, setAiSummary] = useState(null);
    const [loadingAiSummary, setLoadingAiSummary] = useState(false);
    const [bulkApproving, setBulkApproving] = useState(false);
    
    const { showOnboarding, closeOnboarding, reopenOnboarding } = useOnboarding('dashboard');

    const [viewMode, setViewMode] = useState('active');
    const [dateFilter, setDateFilter] = useState('today_overdue');
    const [customDateRange, setCustomDateRange] = useState({ from: null, to: null });
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showMoreFilters, setShowMoreFilters] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const searchInputRef = React.useRef(null);
    const [salesOnly, setSalesOnly] = useState(false);
    const [aiSummaryStats, setAiSummaryStats] = useState(null);

    // Multi-select delete state
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedTasks, setSelectedTasks] = useState(new Set());
    const [deleteLoading, setDeleteLoading] = useState(false);

    // AI Command Center dialog (primary flow for + New Task)
    const [showAIDialog, setShowAIDialog] = useState(false);
    const aiQuickSnapRef = useRef(null);

    // Recently deleted
    const [deletedTasks, setDeletedTasks] = useState([]);
    const [showDeleted, setShowDeleted] = useState(false);

    // Upgrade nudges
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [upgradeModalShown, setUpgradeModalShown] = useState(() => localStorage.getItem('upgradeModalShown') === 'true');

    const getActiveTaskCount = () => {
        if (!dashboard) return 0;
        return (dashboard.assigned_to_me?.length || 0) + (dashboard.self_assigned?.length || 0) + (dashboard.assigned_by_me?.length || 0);
    };

    const activeTaskCount = getActiveTaskCount();
    const isFreeUser = user?.subscription_tier === 'free';
    const showLightBanner = isFreeUser && activeTaskCount >= 10;
    const showPersistentBanner = isFreeUser && activeTaskCount >= 30;

    React.useEffect(() => {
        if (isFreeUser && activeTaskCount >= 20 && !upgradeModalShown) {
            setShowUpgradeModal(true);
            setUpgradeModalShown(true);
            localStorage.setItem('upgradeModalShown', 'true');
        }
    }, [activeTaskCount, isFreeUser, upgradeModalShown]);

    const getDateRange = (filter) => {
        const now = new Date();
        const today = startOfDay(now);
        
        switch (filter) {
            case 'today':
                return { from: format(today, "yyyy-MM-dd'T'00:00"), to: format(endOfDay(today), "yyyy-MM-dd'T'23:59") };
            case 'this_week':
                return { from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd'T'00:00"), to: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd'T'23:59") };
            case 'next_week':
                const nextWeekStart = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), 1);
                return { from: format(nextWeekStart, "yyyy-MM-dd'T'00:00"), to: format(endOfWeek(nextWeekStart, { weekStartsOn: 1 }), "yyyy-MM-dd'T'23:59") };
            case 'this_month':
                return { from: format(startOfMonth(today), "yyyy-MM-dd'T'00:00"), to: format(endOfMonth(today), "yyyy-MM-dd'T'23:59") };
            case 'next_month':
                const nextMonthStart = addMonths(startOfMonth(today), 1);
                return { from: format(nextMonthStart, "yyyy-MM-dd'T'00:00"), to: format(endOfMonth(nextMonthStart), "yyyy-MM-dd'T'23:59") };
            case 'custom':
                if (customDateRange.from && customDateRange.to) {
                    return { 
                        from: format(customDateRange.from, "yyyy-MM-dd'T'00:00"), 
                        to: format(customDateRange.to, "yyyy-MM-dd'T'23:59") 
                    };
                }
                return { from: null, to: null };
            default:
                return { from: null, to: null };
        }
    };

    useEffect(() => {
        fetchDashboard();
        fetchUsers();
        fetchDeletedTasks();
        fetchGroups();
        fetchParentGroups();
        fetchDrafts();
    }, [viewMode, dateFilter, customDateRange]);

    // Register background push notifications once on mount
    useEffect(() => {
        registerPush();
    }, []);

    // Listen for the Global FAB / deep-link to open AI create (advanced form is fallback only)
    useEffect(() => {
        const openAI = () => setShowAIDialog(true);
        const openAdvanced = () => setShowCreateModal(true);
        window.addEventListener('tskflow:open-ai-create', openAI);
        // Backward-compat: old event name now opens AI create too
        window.addEventListener('tskflow:open-create-task', openAI);
        window.addEventListener('tskflow:open-advanced-create', openAdvanced);
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('create') === '1') setShowAIDialog(true);
            if (params.get('create') === 'advanced') setShowCreateModal(true);
        } catch (_) { /* noop */ }
        return () => {
            window.removeEventListener('tskflow:open-ai-create', openAI);
            window.removeEventListener('tskflow:open-create-task', openAI);
            window.removeEventListener('tskflow:open-advanced-create', openAdvanced);
        };
    }, []);

    // Flush offline draft queue when we come back online
    useEffect(() => {
        const detach = attachOnlineFlusher(API, ({ flushed }) => {
            if (flushed) {
                toast.success(`Synced ${flushed} offline draft change${flushed === 1 ? '' : 's'}`);
                fetchDrafts();
            }
        });
        return detach;
    }, []);

    // Voice-executed side effects (create/update task) — refresh
    useEffect(() => {
        const handler = () => { fetchDashboard(); fetchParentGroups(); fetchDrafts(); };
        window.addEventListener('tskflow:voice-executed', handler);
        return () => window.removeEventListener('tskflow:voice-executed', handler);
    }, []);

    // Auto-save draft inside the create modal (debounced)
    useEffect(() => {
        if (!showCreateModal) return; // only when modal is open
        // Only start a draft when the user has typed something meaningful
        const hasContent = !!(taskForm.title || taskForm.description || selectedAssignees.length || taskForm.due_date);
        if (!hasContent) return;
        // Debounce
        if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
        setDraftInModal((d) => ({ ...d, status: 'saving' }));
        draftSaveTimer.current = setTimeout(async () => {
            const payload = {
                title: taskForm.title || '',
                description: taskForm.description || '',
                assigned_to: selectedAssignees[0]?.email || selectedAssignees[0]?.id || (selectedAssignees[0]?.type === 'self' ? 'self' : ''),
                due_date: taskForm.due_date || '',
                priority: taskForm.priority || 'Medium',
                attachments: attachments || null,
                auto_reminder: taskForm.auto_reminder || false,
                success_criteria: taskForm.success_criteria || '',
            };
            try {
                if (!navigator.onLine) {
                    // Queue for later
                    if (draftInModal.id) enqueue({ kind: 'update', id: draftInModal.id, payload });
                    else enqueue({ kind: 'create', payload });
                    setDraftInModal((d) => ({ ...d, status: 'saved' }));
                    return;
                }
                if (draftInModal.id) {
                    await axios.put(`${API}/tasks/drafts/${draftInModal.id}`, payload);
                } else {
                    const res = await axios.post(`${API}/tasks/drafts`, payload);
                    setDraftInModal({ id: res.data.id, status: 'saved' });
                    fetchDrafts();
                    return;
                }
                setDraftInModal((d) => ({ ...d, status: 'saved' }));
            } catch (e) {
                setDraftInModal((d) => ({ ...d, status: 'error' }));
            }
        }, 900);
        return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskForm, selectedAssignees, attachments, showCreateModal]);

    // Smart Task Creation — infer fields from description on debounce (only if title empty)
    useEffect(() => {
        if (!showCreateModal) return;
        const desc = (taskForm.description || '').replace(/<[^>]+>/g, '').trim();
        if (desc.length < 25) return;
        // Skip if user already filled in title AND due date
        if (taskForm.title && taskForm.due_date) return;
        const timer = setTimeout(async () => {
            try {
                setSmartParsing(true);
                const res = await axios.post(`${API}/ai/parse-task`, { text: desc });
                const p = res.data || {};
                const salesHint = /\b(sales?|selling|prospect|pipeline|deal|demo|proposal|quote|crm|lead|sdr|bdr|outbound|renewal|customer|client)\b/i.test(
                    `${desc} ${p.title || ''} ${p.description || ''} ${p.category || ''}`
                );
                setTaskForm((f) => {
                    const sales = f.is_sales_task || !!p.is_sales_task || salesHint;
                    return {
                        ...f,
                        title: f.title || p.title || '',
                        due_date: f.due_date || p.due_date || '',
                        priority: f.priority && f.priority !== 'Medium' ? f.priority : (p.priority || 'Medium'),
                        is_sales_task: sales,
                        requires_screen_recording: f.requires_screen_recording || !!p.requires_screen_recording,
                        category: f.category || p.category || (sales ? 'Sales' : ''),
                    };
                });
            } catch (_) { /* silent */ }
            finally { setSmartParsing(false); }
        }, 1500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskForm.description, showCreateModal]);

    // Delete draft
    const deleteDraft = async (id, e) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        if (!window.confirm('Delete this draft?')) return;
        try {
            if (!navigator.onLine) {
                enqueue({ kind: 'delete', id });
                toast('Queued for deletion when back online');
                setDrafts((d) => d.filter(x => x.id !== id));
                return;
            }
            await axios.delete(`${API}/tasks/drafts/${id}`);
            setDrafts((d) => d.filter(x => x.id !== id));
            toast.success('Draft deleted');
        } catch (err) {
            toast.error('Failed to delete draft');
        }
    };

    // Resume a draft — open modal and populate
    const resumeDraft = async (draft) => {
        setShowCreateModal(true);
        setDraftInModal({ id: draft.id, status: 'saved' });
        setTaskForm({
            title: draft.title || '',
            description: draft.description || '',
            due_date: draft.due_date || '',
            priority: draft.priority || 'Medium',
            is_sales_task: draft.is_sales_task || false,
            requires_screen_recording: draft.requires_screen_recording || false,
            success_criteria: draft.success_criteria || '',
        });
        setAttachments(draft.attachments || []);
        // Best-effort restore of assignee
        if (draft.assigned_to === 'self') setSelectedAssignees([{ type: 'self' }]);
        else if (draft.assigned_to && draft.assigned_to.includes('@')) setSelectedAssignees([{ type: 'email', email: draft.assigned_to }]);
        else if (draft.assigned_to) setSelectedAssignees([{ type: 'user', id: draft.assigned_to, name: draft.assigned_to_email || 'User', email: draft.assigned_to_email || '' }]);
    };

    // Auto-refresh polling with sound notification for new tasks
    const lastTaskCountRef = useRef(null);
    useEffect(() => {
        // Initialize count when dashboard loads
        if (dashboard && lastTaskCountRef.current === null) {
            lastTaskCountRef.current = (dashboard.assigned_to_me?.length || 0) + (dashboard.created_by_me?.length || 0);
        }
    }, [dashboard]);

    useEffect(() => {
        const playNotificationSound = () => {
            const audio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNbrMnAAAAAAD/+9DEAAAIAANIAAAAFZYhKjyigABMSTVu+d3vcQ/8+gMBjp0Bg+sEP/E4Pv/WCH/5cEwfWD7+oCYPv/Lg+//1g+/+D4f///E4Pg+D/8uCHBAMHQQAAAgAAAAA8PDw8PDw8A8QAHD4f1A+H9YPh//0B//qA//+AwAAJxyOBwOBgHwfAgAAACTP//5M///JM///km//+Sf/5Jv//JN//8k3//5Jv//ySb//5N//8m//+Tb//5N//8m3//yb//5N//8k3//yTf//JN//8m//+Sf/5Jv//km//+Sb//5Jv//JN//8k2//+Sb//5N//8m3//yb/');
            audio.volume = 0.3;
            audio.play().catch(() => {});
        };

        const pollForNewTasks = async () => {
            try {
                const params = new URLSearchParams();
                params.append('status_filter', viewMode);
                const response = await axios.get(`${API}/dashboard?${params.toString()}`);
                const newData = response.data;
                
                const currentTotal = (newData.assigned_to_me?.length || 0) + (newData.created_by_me?.length || 0);
                
                if (lastTaskCountRef.current !== null && currentTotal > lastTaskCountRef.current) {
                    playNotificationSound();
                    toast.success('New task received!');
                    setDashboard(newData);
                }
                
                lastTaskCountRef.current = currentTotal;
            } catch (error) {
                // Silent fail for polling
            }
        };

        // Poll every 10 seconds while visible; wake instantly when the tab returns
        let interval = null;
        const start = () => {
            if (interval) return;
            interval = setInterval(() => {
                if (document.visibilityState === 'visible') pollForNewTasks();
            }, 10000);
        };
        const stop = () => {
            if (interval) { clearInterval(interval); interval = null; }
        };
        const onWake = () => {
            pollForNewTasks();
            fetchDashboard();
            fetchParentGroups();
            start();
        };
        const onVis = () => {
            if (document.visibilityState === 'visible') onWake();
            else stop();
        };
        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('tskflow:app-wake', onWake);
        return () => {
            stop();
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('tskflow:app-wake', onWake);
        };
    }, [viewMode]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowUserDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchDashboard = async () => {
        try {
            const params = new URLSearchParams();
            params.append('status_filter', viewMode);
            
            const dateRange = getDateRange(dateFilter);
            if (dateRange.from) params.append('date_from', dateRange.from);
            if (dateRange.to) params.append('date_to', dateRange.to);
            
            const response = await axios.get(`${API}/dashboard?${params.toString()}`);
            setDashboard(response.data);
        } catch (error) {
            toast.error('Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    };

    const fetchDrafts = async () => {
        try {
            const response = await axios.get(`${API}/tasks/drafts`);
            setDrafts(response.data.drafts || []);
        } catch (error) {
            console.error('Failed to fetch drafts');
        }
    };

    const fetchUsers = async () => {
        try {
            const response = await axios.get(`${API}/users`);
            setUsers(response.data);
        } catch (error) {
            console.error('Failed to fetch users');
        }
    };

    const fetchGroups = async () => {
        if (user?.subscription_tier === 'free') {
            setGroups([]);
            return;
        }
        try {
            const response = await axios.get(`${API}/groups`);
            setGroups(response.data);
        } catch (error) {
            // Silent: free users or no groups yet
        }
    };

    const fetchParentGroups = async () => {
        try {
            const params = new URLSearchParams();
            params.append('status_filter', viewMode);
            const response = await axios.get(`${API}/tasks/parents?${params.toString()}`);
            setParentGroups(response.data || []);
        } catch (error) {
            // Silent
        }
    };

    const addGroupEmail = () => {
        const input = groupEmailInput.trim();
        if (!input) {
            toast.error('Enter an email address');
            return;
        }
        
        // Check if input contains multiple emails (bulk paste detection)
        const lines = input.split(/[\n,;]+/).map(line => line.trim().toLowerCase()).filter(line => line);
        
        if (lines.length > 1) {
            // Bulk import
            const validEmails = lines.filter(email => email.includes('@'));
            const newEmails = validEmails.filter(email => !groupForm.emails.includes(email));
            
            if (newEmails.length === 0) {
                toast.error('All emails are already added');
                return;
            }
            
            setGroupForm({ ...groupForm, emails: [...groupForm.emails, ...newEmails] });
            setGroupEmailInput('');
            toast.success(`Added ${newEmails.length} email(s)`);
        } else {
            // Single email
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
        }
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
                // Update existing group
                await axios.put(`${API}/groups/${editingGroupId}`, {
                    name: groupForm.name.trim(),
                    emails: groupForm.emails
                });
                toast.success(`Group "${groupForm.name.trim()}" updated`);
                setEditingGroupId(null);
            } else {
                // Create new group
                await axios.post(`${API}/groups`, {
                    name: groupForm.name.trim(),
                    emails: groupForm.emails
                });
                toast.success(`Group "${groupForm.name.trim()}" created`);
            }
            setGroupForm({ id: null, name: '', emails: [] });
            setGroupEmailInput('');
            fetchGroups();
        } catch (error) {
            toast.error(getErrorMessage(error, editingGroupId ? 'Failed to update group' : 'Failed to create group'));
        } finally {
            setGroupSaving(false);
        }
    };

    const handleEditGroup = (group) => {
        setEditingGroupId(group.id);
        setGroupForm({
            id: group.id,
            name: group.name,
            emails: [...group.emails]
        });
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
            fetchGroups();
        } catch (error) {
            toast.error('Failed to delete group');
        }
    };

    const fetchDashboardAiSummary = async () => {
        setLoadingAiSummary(true);
        try {
            const response = await axios.post(`${API}/dashboard/ai-summary-v2`, {
                view_mode: viewMode,
                date_filter: dateFilter
            });
            setAiSummary(response.data.summary);
            setAiSummaryStats(response.data.stats || null);
        } catch (error) {
            toast.error('Failed to generate AI summary');
        } finally {
            setLoadingAiSummary(false);
        }
    };

    const handleBulkApprove = async () => {
        if (!window.confirm('Approve all tasks pending your review?')) return;
        
        setBulkApproving(true);
        try {
            const response = await axios.post(`${API}/tasks/bulk-approve`);
            toast.success(response.data.message);
            fetchDashboard();
        } catch (error) {
            toast.error('Failed to bulk approve tasks');
        } finally {
            setBulkApproving(false);
        }
    };

    const applyGroup = (group) => {
        const newAssignees = [...selectedAssignees];
        let added = 0;
        group.emails.forEach((email) => {
            const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
            if (existingUser) {
                const dup = newAssignees.some(a => a.type === 'user' && a.id === existingUser.id);
                if (!dup) {
                    newAssignees.push({ type: 'user', id: existingUser.id, name: existingUser.name, email: existingUser.email });
                    added++;
                }
            } else {
                const dup = newAssignees.some(a => a.type === 'email' && a.email === email);
                if (!dup) {
                    newAssignees.push({ type: 'email', email });
                    added++;
                }
            }
        });
        setSelectedAssignees(newAssignees);
        setShowUserDropdown(false);
        toast.success(`Added ${added} member(s) from "${group.name}"`);
    };

    const fetchDeletedTasks = async () => {
        try {
            const response = await axios.get(`${API}/tasks/deleted`);
            setDeletedTasks(response.data);
        } catch (error) {
            console.error('Failed to fetch deleted tasks');
        }
    };

    const handleRestoreTask = async (taskId) => {
        try {
            await axios.put(`${API}/tasks/${taskId}/restore`);
            toast.success('Task restored');
            fetchDashboard();
            fetchDeletedTasks();
        } catch (error) {
            toast.error('Failed to restore task');
        }
    };

    const handleQuickComplete = async (taskId, completionNote, completionImages) => {
        try {
            await axios.put(`${API}/tasks/${taskId}/complete`, {
                completion_note: completionNote,
                completion_note_images: completionImages
            });
            toast.success('Task submitted!');
            fetchDashboard();
        } catch (error) {
            toast.error('Failed to complete task');
        }
    };

    const filterOverdueTasks = (tasks) => {
        const now = new Date();
        return tasks.filter(task => {
            const dueDate = parseISO(task.due_date);
            return isBefore(dueDate, now) && task.status !== 'Completed';
        });
    };

    const getOverdueCount = () => {
        if (!dashboard) return 0;
        const allTasks = [...(dashboard.assigned_to_me || []), ...(dashboard.self_assigned || []), ...(dashboard.assigned_by_me || [])];
        return filterOverdueTasks(allTasks).length;
    };

    const toggleTaskSelection = (taskId) => {
        const newSelected = new Set(selectedTasks);
        if (newSelected.has(taskId)) {
            newSelected.delete(taskId);
        } else {
            newSelected.add(taskId);
        }
        setSelectedTasks(newSelected);
    };

    const handleBulkDelete = async () => {
        if (selectedTasks.size === 0) return;
        
        setDeleteLoading(true);
        try {
            await axios.post(`${API}/tasks/bulk-delete`, Array.from(selectedTasks));
            toast.success(`${selectedTasks.size} task(s) deleted`);
            setSelectedTasks(new Set());
            setSelectionMode(false);
            fetchDashboard();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to delete tasks'));
        } finally {
            setDeleteLoading(false);
        }
    };

    const cancelSelection = () => {
        setSelectionMode(false);
        setSelectedTasks(new Set());
    };

    const addAssignee = (assignee) => {
        const exists = selectedAssignees.some(a => 
            (a.type === 'user' && assignee.type === 'user' && a.id === assignee.id) ||
            (a.type === 'email' && assignee.type === 'email' && a.email === assignee.email) ||
            (a.type === 'self' && assignee.type === 'self')
        );
        if (!exists) {
            setSelectedAssignees([...selectedAssignees, assignee]);
        }
        setShowUserDropdown(false);
        setEmailInput('');
    };

    const removeAssignee = (index) => {
        setSelectedAssignees(selectedAssignees.filter((_, i) => i !== index));
    };

    const handleEmailKeyDown = (e) => {
        if (e.key === 'Enter' && emailInput.trim()) {
            e.preventDefault();
            if (emailInput.includes('@')) {
                const existingUser = users.find(u => u.email.toLowerCase() === emailInput.toLowerCase());
                if (existingUser) {
                    addAssignee({ type: 'user', id: existingUser.id, name: existingUser.name, email: existingUser.email });
                } else {
                    addAssignee({ type: 'email', email: emailInput.trim() });
                }
            } else {
                toast.error('Please enter a valid email address');
            }
        }
    };

    const toggleUserSelection = (userObj) => {
        const exists = selectedAssignees.some(a => a.type === 'user' && a.id === userObj.id);
        if (exists) {
            setSelectedAssignees(selectedAssignees.filter(a => !(a.type === 'user' && a.id === userObj.id)));
        } else {
            addAssignee({ type: 'user', id: userObj.id, name: userObj.name, email: userObj.email });
        }
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        
        if (selectedAssignees.length === 0) {
            toast.error('Please select at least one assignee');
            return;
        }

        setCreateLoading(true);
        try {
            const assigneeList = selectedAssignees.map(a => {
                if (a.type === 'self') return 'self';
                if (a.type === 'user') return a.id;
                if (a.type === 'email') return a.email;
                return null;
            }).filter(Boolean);

            const taskData = { ...taskForm, attachments };

            // Recurring series path — one series per assignee
            if (recurrence.enabled) {
                const rule = {
                    frequency: recurrence.frequency,
                    interval: recurrence.interval,
                    end_type: recurrence.end_type,
                    end_date: recurrence.end_date || null,
                    end_count: recurrence.end_count || null,
                };
                for (const a of assigneeList) {
                    await axios.post(`${API}/recurring`, {
                        title: taskForm.title,
                        description: taskForm.description,
                        assigned_to: a,
                        start_due_date: taskForm.due_date,
                        priority: taskForm.priority,
                        is_sales_task: !!taskForm.is_sales_task,
                        requires_screen_recording: !!taskForm.requires_screen_recording,
                        attachments,
                        recurrence: rule,
                    });
                }
                toast.success(`Recurring series created (${assigneeList.length} assignee${assigneeList.length === 1 ? '' : 's'})`);
                // If we had a draft, delete it since it's been superseded
                if (draftInModal.id) {
                    try { await axios.delete(`${API}/tasks/drafts/${draftInModal.id}`); } catch { /* noop */ }
                }
            } else if (draftInModal.id) {
                // If exactly one assignee, use the complete-draft endpoint (preserves ID)
                if (assigneeList.length === 1) {
                    await axios.put(`${API}/tasks/drafts/${draftInModal.id}`, {
                        title: taskForm.title,
                        description: taskForm.description,
                        assigned_to: assigneeList[0],
                        due_date: taskForm.due_date,
                        priority: taskForm.priority,
                        success_criteria: taskForm.success_criteria || '',
                    });
                    await axios.post(`${API}/tasks/drafts/${draftInModal.id}/complete`);
                    toast.success('Task created from draft');
                } else {
                    // Multi-assignee: create bulk and delete the draft
                    await axios.post(`${API}/tasks/bulk`, {
                        ...taskData,
                        assigned_to: assigneeList
                    });
                    try { await axios.delete(`${API}/tasks/drafts/${draftInModal.id}`); } catch { /* noop */ }
                    toast.success(`${assigneeList.length} tasks created successfully!`);
                }
            } else if (assigneeList.length === 1) {
                await axios.post(`${API}/tasks`, {
                    ...taskData,
                    assigned_to: assigneeList[0]
                });
                toast.success('Task created successfully!');
            } else {
                await axios.post(`${API}/tasks/bulk`, {
                    ...taskData,
                    assigned_to: assigneeList
                });
                toast.success(`${assigneeList.length} tasks created successfully!`);
            }

            setShowCreateModal(false);
            setTaskForm({
                title: '',
                description: '',
                due_date: '',
                priority: 'Medium',
                is_sales_task: false,
                success_criteria: '',
            });
            setRecurrence({ enabled: false, frequency: 'weekly', interval: 1, end_type: 'never', end_date: '', end_count: 5 });
            setDraftInModal({ id: null, status: '' });
            setSelectedAssignees([]);
            setAttachments([]);
            fetchDashboard();
            fetchParentGroups();
            fetchDrafts();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to create task'));
        } finally {
            setCreateLoading(false);
        }
    };

    const handleModalChange = (open) => {
        setShowCreateModal(open);
        if (!open) {
            // Best-effort final save before closing (if a draft exists)
            if (draftInModal.id && draftInModal.status === 'saving') {
                // Let the pending timer fire; nothing more to do
            }
            setSelectedAssignees([]);
            setEmailInput('');
            setAttachments([]);
            setTaskForm({
                title: '',
                description: '',
                due_date: '',
                priority: 'Medium',
                is_sales_task: false,
                success_criteria: '',
            });
            setRecurrence({ enabled: false, frequency: 'weekly', interval: 1, end_type: 'never', end_date: '', end_count: 5 });
            setDraftInModal({ id: null, status: '' });
            fetchDrafts();
        }
    };

    const primaryFilters = [
        { value: 'today_overdue', label: 'Today + Overdue' },
        { value: 'overdue', label: 'Overdue', badge: true },
        { value: 'today', label: 'Today' },
        { value: 'this_week', label: 'This Week' }
    ];

    const moreFilters = [
        { value: 'next_week', label: 'Next Week' },
        { value: 'this_month', label: 'This Month' },
        { value: 'next_month', label: 'Next Month' },
        { value: 'custom', label: 'Custom Range' }
    ];

    const filterTodayAndOverdue = (tasks) => {
        const now = new Date();
        const endToday = endOfDay(now);
        return tasks.filter(task => {
            if (task.status === 'Completed') return false;
            const dueDate = parseISO(task.due_date);
            if (isNaN(dueDate.getTime())) return false;
            // Any task due today (before end of today) or overdue in the past
            return dueDate <= endToday;
        });
    };

    const matchesSearch = (task) => {
        const q = (searchQuery || '').trim().toLowerCase();
        if (!q) return true;
        const fields = [
            task.title,
            task.description,
            task.priority,
            task.status,
            task.category,
            task.assigned_to_name,
            task.created_by_name,
            task.assigned_to_email,
            task.created_by_email
        ];
        return fields.some(v => v && String(v).toLowerCase().includes(q));
    };

    const getFilteredTasks = (tasks) => {
        let filtered = tasks;
        if (dateFilter === 'overdue') {
            filtered = filterOverdueTasks(filtered);
        } else if (dateFilter === 'today_overdue') {
            filtered = filterTodayAndOverdue(filtered);
        }
        filtered = filtered.filter(matchesSearch);
        if (salesOnly) {
            filtered = filtered.filter(
                (t) => !!t.is_sales_task || String(t.category || '').toLowerCase() === 'sales'
            );
        }
        return filtered;
    };

    const isSalesGroup = (group) =>
        !!group?.is_sales_task
        || String(group?.category || '').toLowerCase() === 'sales'
        || (group?.children || group?.assignees || []).some(
            (c) => !!c.is_sales_task || String(c.category || '').toLowerCase() === 'sales'
        );

    const matchesGroupSearch = (group) => {
        const q = (searchQuery || '').trim().toLowerCase();
        if (!q) return true;
        if (group.title && group.title.toLowerCase().includes(q)) return true;
        if (group.description && group.description.toLowerCase().includes(q)) return true;
        if (group.priority && group.priority.toLowerCase().includes(q)) return true;
        return (group.assignees || []).some(a =>
            (a.name && a.name.toLowerCase().includes(q)) ||
            (a.email && a.email.toLowerCase().includes(q)) ||
            (a.status && a.status.toLowerCase().includes(q))
        );
    };

    const downloadAllTasksCSV = () => {
        const buckets = [
            { name: 'Assigned to Me', tasks: dashboard?.assigned_to_me || [] },
            { name: 'Self-Assigned', tasks: dashboard?.self_assigned || [] },
            { name: 'Delegated', tasks: dashboard?.assigned_by_me || [] }
        ];
        const rows = [[
            'Bucket', 'Title', 'Description', 'Priority', 'Status', 'Due Date',
            'Assigned To', 'Assigned To Email', 'Created By', 'Created By Email',
            'Created At', 'Accepted At', 'Completed At', 'Category'
        ]];
        buckets.forEach(b => {
            b.tasks.forEach(t => {
                rows.push([
                    b.name,
                    t.title,
                    t.description,
                    t.priority,
                    t.status,
                    t.due_date,
                    t.assigned_to_name,
                    t.assigned_to_email || '',
                    t.created_by_name,
                    t.created_by_email || '',
                    t.created_at,
                    t.accepted_at || '',
                    t.completed_at || '',
                    t.category || ''
                ]);
            });
        });
        // Include grouped/parent tasks
        (parentGroups || []).forEach(g => {
            (g.assignees || []).forEach(a => {
                rows.push([
                    'Delegated (Group)',
                    g.title,
                    g.description,
                    g.priority,
                    a.status,
                    g.due_date,
                    a.name,
                    a.email || '',
                    user?.name || '',
                    user?.email || '',
                    g.created_at,
                    '',
                    a.completed ? 'yes' : '',
                    ''
                ]);
            });
        });
        const csv = rows.map(r => r.map(cell => {
            const s = String(cell ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `tskflow-tasks-${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Tasks exported to CSV');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen gradient-mesh">
                <div className="text-lg font-medium">Loading your tasks...</div>
            </div>
        );
    }

    const overdueCount = getOverdueCount();

    return (
        <div data-testid="task-hub" className="page-shell">
            <AnimatePresence>
                {showOnboarding && (
                    <OnboardingPopup page="dashboard" onClose={closeOnboarding} />
                )}
            </AnimatePresence>

            <header className="sticky top-0 z-50 glass-header border-b pt-[env(safe-area-inset-top,0px)]">
                <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                        <h1 onClick={() => navigate('/')} className="brand-wordmark cursor-pointer hover:opacity-80 transition-opacity text-xl sm:text-2xl shrink-0">Tskflow</h1>
                        {user?.subscription_tier === 'teams' ? (
                            <Badge className="hidden sm:flex bg-teal-600 text-white rounded-full px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-semibold items-center gap-1">
                                <Crown className="w-3 h-3" />
                                TEAMS
                            </Badge>
                        ) : user?.subscription_tier === 'pro' ? (
                            <Badge className="hidden sm:flex bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-full px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-semibold items-center gap-1">
                                <Crown className="w-3 h-3" />
                                PRO
                            </Badge>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                        <NotificationBell />
                        {/* Desktop icon strip */}
                        <div className="hidden md:flex items-center gap-2">
                            <Button variant="outline" size="icon" onClick={() => navigate('/recurring')} className="rounded-full border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100" title="Recurring series" data-testid="recurring-button">
                                <Repeat className="w-5 h-5" />
                            </Button>
                            {user?.subscription_tier === 'teams' && (
                                <Button data-testid="team-button" variant="outline" size="icon" onClick={() => navigate('/team')} className="rounded-full border-teal-300 text-teal-600 hover:text-teal-700 hover:bg-teal-50" title="Manage Team">
                                    <Users className="w-5 h-5" />
                                </Button>
                            )}
                            <Button data-testid="analytics-button" variant="outline" size="icon" onClick={() => navigate('/analytics')} className="rounded-full border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100" title="Analytics & Leaderboards">
                                <BarChart3 className="w-5 h-5" />
                            </Button>
                            <Button data-testid="activity-log-button" variant="outline" size="icon" onClick={() => navigate('/activity')} className="rounded-full border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100" title="Activity & data log">
                                <ScrollText className="w-5 h-5" />
                            </Button>
                            <Button data-testid="settings-button" variant="outline" size="icon" onClick={() => navigate('/settings')} className="rounded-full border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100">
                                <Settings className="w-5 h-5" />
                            </Button>
                            <Button data-testid="logout-button" variant="outline" size="icon" onClick={logout} className="rounded-full border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100">
                                <LogOut className="w-5 h-5" />
                            </Button>
                        </div>
                        {/* Mobile overflow menu — keeps the header one-handed */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" className="md:hidden rounded-full border-gray-300 text-gray-600" data-testid="mobile-nav-menu" aria-label="More">
                                    <MoreHorizontal className="w-5 h-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem onClick={() => navigate('/recurring')}>
                                    <Repeat className="w-4 h-4 mr-2" /> Recurring
                                </DropdownMenuItem>
                                {user?.subscription_tier === 'teams' && (
                                    <DropdownMenuItem onClick={() => navigate('/team')}>
                                        <Users className="w-4 h-4 mr-2" /> Team
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => navigate('/analytics')}>
                                    <BarChart3 className="w-4 h-4 mr-2" /> Analytics
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate('/activity')}>
                                    <ScrollText className="w-4 h-4 mr-2" /> Activity log
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate('/recordings')} data-testid="recording-library-button-mobile">
                                    <Library className="w-4 h-4 mr-2" /> Recordings
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate('/settings')}>
                                    <Settings className="w-4 h-4 mr-2" /> Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate('/help')}>
                                    <HelpCircle className="w-4 h-4 mr-2" /> Help
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-600">
                                    <LogOut className="w-4 h-4 mr-2" /> Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 sm:px-6 py-5 sm:py-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5 sm:mb-6">
                    <div className="min-w-0">
                        <h2 className="text-2xl sm:text-3xl font-bold leading-tight" style={{ fontFamily: 'Outfit' }}>
                            Welcome, {user?.name}
                        </h2>
                        <p className="text-sm sm:text-base text-muted-foreground mt-0.5">
                            Tell Jarvis what needs doing — he&apos;ll follow up so nothing slips.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                        {/* AI Summary and Bulk Approve */}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchDashboardAiSummary}
                            disabled={loadingAiSummary}
                            className="rounded-full"
                        >
                            ✨ <span className="ml-1">{loadingAiSummary ? '…' : 'Summary'}</span>
                        </Button>
                        
                        {dashboard?.assigned_by_me?.some(t => t.status === 'Review Pending') && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleBulkApprove}
                                disabled={bulkApproving}
                                className="rounded-full bg-green-50 text-green-700 border-green-300"
                                title="Bulk Approve"
                            >
                                <CheckSquare className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">{bulkApproving ? 'Approving...' : 'Bulk Approve'}</span>
                            </Button>
                        )}
                        
                        {selectionMode ? (
                            <>
                                <span className="text-sm text-muted-foreground mr-2">{selectedTasks.size} selected</span>
                                <Button variant="outline" onClick={cancelSelection} className="rounded-full">Cancel</Button>
                                <Button variant="destructive" onClick={handleBulkDelete} disabled={selectedTasks.size === 0 || deleteLoading} className="rounded-full">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    {deleteLoading ? 'Deleting...' : 'Delete'}
                                </Button>
                            </>
                        ) : (
                            <>
                                {/* Single "Recordings" button — merges Record + Library. Takes user to the library where they can start a new recording or browse past ones. */}
                                <Button variant="outline" onClick={() => navigate('/recordings')} className="hidden sm:inline-flex rounded-full gap-2" data-testid="recording-library-button" title="Screen recordings">
                                    <Library className="w-4 h-4" />
                                    Recordings
                                </Button>
                                <Button variant="outline" onClick={() => setSelectionMode(true)} className="rounded-full gap-2" data-testid="select-tasks-button">
                                    <CheckSquare className="w-4 h-4" />
                                    <span className="hidden sm:inline">Select</span>
                                </Button>
                                <Button
                                    data-testid="create-task-button"
                                    onClick={() => setShowAIDialog(true)}
                                    className="rounded-full gap-2"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    <span className="hidden sm:inline">New Task</span>
                                    <span className="sm:hidden">New</span>
                                </Button>
                                <Dialog open={showCreateModal} onOpenChange={handleModalChange}>
                                    <DialogContent className="rounded-2xl max-w-xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
                                        <DialogHeader className="pr-8">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <DialogTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Manual form</DialogTitle>
                                                    <DialogDescription className="sr-only">Create a task with the full form</DialogDescription>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {draftInModal.status === 'saving' && <span className="text-[11px] text-amber-600 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> Saving…</span>}
                                                    {draftInModal.status === 'saved' && <span className="text-[11px] text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Saved</span>}
                                                    {draftInModal.status === 'error' && <span className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Save failed — will retry</span>}
                                                    {smartParsing && <span className="text-[11px] text-teal-600 flex items-center gap-1"><Wand2 className="w-3 h-3" /> Analyzing…</span>}
                                                </div>
                                            </div>
                                        </DialogHeader>
                                        <form onSubmit={handleCreateTask} className="space-y-5">
                                            <div className="flex justify-start -mt-1 mb-1">
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowCreateModal(false); navigate('/transcript'); }}
                                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-teal-700 transition-colors"
                                                    data-testid="from-transcript-btn"
                                                    title="Auto-draft tasks from a meeting transcript"
                                                >
                                                    <FileText className="w-3.5 h-3.5" />
                                                    <span>From transcript</span>
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="title">Task Title</Label>
                                                <Input id="title" data-testid="task-title-input" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Enter task title" required className="rounded-xl" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="description">Description</Label>
                                                <RichTextEditor
                                                    value={taskForm.description}
                                                    onChange={(value) => setTaskForm({ ...taskForm, description: value })}
                                                    placeholder="Describe the task with formatting..."
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="success_criteria">Done well looks like <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                                <Textarea
                                                    id="success_criteria"
                                                    data-testid="task-success-criteria"
                                                    value={taskForm.success_criteria || ''}
                                                    onChange={(e) => setTaskForm({ ...taskForm, success_criteria: e.target.value })}
                                                    placeholder="What does a good completion look like?"
                                                    className="rounded-xl min-h-[64px]"
                                                    rows={2}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="flex items-center gap-2"><Users className="w-4 h-4" />Assign To</Label>
                                                    {!isFreeUser && (
                                                        <button type="button" data-testid="manage-groups-button" onClick={() => setShowGroupModal(true)} className="text-xs font-medium text-teal-600 hover:text-teal-800 flex items-center gap-1">
                                                            <Users className="w-3.5 h-3.5" /> Manage groups
                                                        </button>
                                                    )}
                                                </div>
                                                {selectedAssignees.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        <AnimatePresence>
                                                            {selectedAssignees.map((assignee, index) => (
                                                                <motion.div key={`${assignee.type}-${assignee.id || assignee.email || 'self'}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-1 bg-teal-100 text-teal-800 px-3 py-1.5 rounded-full text-sm">
                                                                    {assignee.type === 'self' ? (<><User className="w-3 h-3" />Me (Self)</>) : assignee.type === 'user' ? (<span>{assignee.name}</span>) : (<span>{assignee.email}</span>)}
                                                                    <button type="button" onClick={() => removeAssignee(index)} className="ml-1 hover:bg-teal-200 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                                                                </motion.div>
                                                            ))}
                                                        </AnimatePresence>
                                                    </div>
                                                )}
                                                <div className="relative" ref={dropdownRef}>
                                                    <Input placeholder="Type email or click to select team members..." value={emailInput} onChange={(e) => setEmailInput(e.target.value)} onFocus={() => setShowUserDropdown(true)} onKeyDown={handleEmailKeyDown} className="rounded-xl" />
                                                    {showUserDropdown && (
                                                        <div className="absolute z-50 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-64 overflow-y-auto">
                                                            {!selectedAssignees.some(a => a.type === 'self') && (
                                                                <div onClick={() => addAssignee({ type: 'self' })} className="flex items-center gap-3 px-4 py-3 hover:bg-teal-50 cursor-pointer border-b">
                                                                    <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center"><User className="w-4 h-4 text-teal-600" /></div>
                                                                    <div><p className="font-medium">Assign to Self</p><p className="text-xs text-muted-foreground">Auto-accept this task</p></div>
                                                                </div>
                                                            )}
                                                            {!isFreeUser && groups.length > 0 && (
                                                                <>
                                                                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-gray-50">Your Groups</div>
                                                                    {groups.map((group) => (
                                                                        <div key={group.id} data-testid={`group-option-${group.id}`} onClick={() => applyGroup(group)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-teal-50 cursor-pointer border-b">
                                                                            <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center"><Users className="w-4 h-4 text-teal-700" /></div>
                                                                            <div className="flex-1 min-w-0"><p className="font-medium truncate">{group.name}</p><p className="text-xs text-muted-foreground truncate">{group.emails.length} member(s)</p></div>
                                                                            <Plus className="w-4 h-4 text-teal-500" />
                                                                        </div>
                                                                    ))}
                                                                </>
                                                            )}
                                                            {users.filter(u => u.id !== user?.id).length > 0 && (<div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-gray-50">Team Members</div>)}
                                                            {users.filter(u => u.id !== user?.id).filter(u => !emailInput || u.name.toLowerCase().includes(emailInput.toLowerCase()) || u.email.toLowerCase().includes(emailInput.toLowerCase())).map((u) => {
                                                                const isSelected = selectedAssignees.some(a => a.type === 'user' && a.id === u.id);
                                                                return (
                                                                    <div key={u.id} onClick={() => toggleUserSelection(u)} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-teal-50 cursor-pointer ${isSelected ? 'bg-teal-50' : ''}`}>
                                                                        <Checkbox checked={isSelected} className="pointer-events-none" />
                                                                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><span className="text-sm font-medium">{u.name.charAt(0)}</span></div>
                                                                        <div className="flex-1 min-w-0"><p className="font-medium truncate">{u.name}</p><p className="text-xs text-muted-foreground truncate">{u.email}</p></div>
                                                                    </div>
                                                                );
                                                            })}
                                                            {emailInput && emailInput.includes('@') && (
                                                                <div onClick={() => { const existingUser = users.find(u => u.email.toLowerCase() === emailInput.toLowerCase()); if (existingUser) { addAssignee({ type: 'user', id: existingUser.id, name: existingUser.name, email: existingUser.email }); } else { addAssignee({ type: 'email', email: emailInput.trim() }); } }} className="flex items-center gap-3 px-4 py-3 hover:bg-teal-50 cursor-pointer border-t">
                                                                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center"><Plus className="w-4 h-4 text-green-600" /></div>
                                                                    <div><p className="font-medium">Invite "{emailInput}"</p><p className="text-xs text-muted-foreground">Send task via email</p></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground">Select multiple team members or type any email. Press Enter to add email.</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="priority">Priority</Label>
                                                    <Select value={taskForm.priority} onValueChange={(value) => setTaskForm({ ...taskForm, priority: value })}>
                                                        <SelectTrigger data-testid="priority-select" className="rounded-xl"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Low">Low</SelectItem>
                                                            <SelectItem value="Medium">Medium</SelectItem>
                                                            <SelectItem value="High">High</SelectItem>
                                                            <SelectItem value="Urgent">Urgent</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="due_date">Due Date & Time</Label>
                                                    <DateTimePicker
                                                        value={taskForm.due_date}
                                                        onChange={(val) => setTaskForm({ ...taskForm, due_date: val })}
                                                        testId="due-date"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Attachments & Screen Recording</Label>
                                                <AttachmentPicker attachments={attachments} setAttachments={setAttachments} />
                                            </div>
                                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={taskForm.is_sales_task || false}
                                                    onChange={(e) => setTaskForm({ ...taskForm, is_sales_task: e.target.checked })}
                                                    data-testid="is-sales-task-checkbox"
                                                    className="rounded"
                                                />
                                                <DollarSign className="w-4 h-4 text-emerald-600" />
                                                <span>This is a Sales Task <span className="text-xs text-muted-foreground">(involves a customer or prospect)</span></span>
                                            </label>

                                            {/* Advanced options — collapsed by default so the form stays short */}
                                            <details className="rounded-xl border bg-gray-50/50 group" data-testid="advanced-options">
                                                <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium flex items-center justify-between hover:bg-gray-100 rounded-xl">
                                                    <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-teal-600" /> Advanced options</span>
                                                    <ChevronDown className="w-4 h-4 text-gray-500 group-open:rotate-180 transition-transform" />
                                                </summary>
                                                <div className="px-4 pb-4 pt-2 space-y-3">
                                                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={taskForm.requires_screen_recording || false}
                                                            onChange={(e) => setTaskForm({ ...taskForm, requires_screen_recording: e.target.checked })}
                                                            data-testid="requires-recording-checkbox"
                                                            className="rounded mt-0.5"
                                                        />
                                                        <span>
                                                            <span className="font-medium">Require a screen recording from the assignee</span>
                                                            <span className="block text-xs text-muted-foreground mt-0.5">A prominent banner will appear on their task view asking them to attach a Loom-style recording before they can mark it done.</span>
                                                        </span>
                                                    </label>
                                                    <div className="pt-3 border-t">
                                                        <RecurrenceEditor value={recurrence} onChange={setRecurrence} />
                                                    </div>
                                                </div>
                                            </details>

                                            <Button data-testid="submit-task-button" type="submit" className="w-full rounded-full" disabled={createLoading || selectedAssignees.length === 0}>
                                                {createLoading ? 'Creating...' : selectedAssignees.length > 1 ? `Create ${selectedAssignees.length} Tasks` : 'Create Task'}
                                            </Button>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                                {!isFreeUser && (
                                    <Dialog open={showGroupModal} onOpenChange={setShowGroupModal}>
                                        <DialogContent className="rounded-2xl max-w-lg w-[95vw] sm:w-full max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
                                            <DialogHeader className="p-6 pb-3 shrink-0 pr-10">
                                                <DialogTitle className="text-xl" style={{ fontFamily: 'Outfit' }}>Groups</DialogTitle>
                                                <DialogDescription className="sr-only">Manage assignment groups</DialogDescription>
                                            </DialogHeader>
                                            <div className="px-6 pb-6 overflow-y-auto flex-1 min-h-0">
                                                <GroupsManager
                                                    compact
                                                    onChanged={(next) => {
                                                        setGroups(next || []);
                                                    }}
                                                />
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* (Search moved to header; Sales toggle is now next to Active/Completed) */}

                {/* AI Summary Display */}
                {aiSummary && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        className="mb-6 p-4 bg-gradient-to-r from-teal-50 to-slate-50 border-2 border-teal-200 rounded-2xl"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xl">🤖</span>
                                    <h3 className="font-semibold text-purple-900">Jarvis Summary — {viewMode === 'active' ? 'Active Tasks' : 'Completed Tasks'}</h3>
                                </div>
                                {aiSummaryStats && (
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 font-medium">🔴 {aiSummaryStats.urgent_high_count} high-urgent</span>
                                        <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">⏰ {aiSummaryStats.due_in_hours_count} due in &lt;6h</span>
                                        <span className="text-xs px-2 py-1 rounded-full bg-teal-100 text-teal-800 font-medium">📅 {aiSummaryStats.due_today_count} due today</span>
                                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-800 font-medium">⚠️ {aiSummaryStats.overdue_count} overdue</span>
                                    </div>
                                )}
                                <p className="text-sm text-teal-900">{aiSummary}</p>
                            </div>
                            <button
                                onClick={() => { setAiSummary(null); setAiSummaryStats(null); }}
                                className="text-purple-400 hover:text-teal-700 p-1"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Filter Bar */}
                <div className="flex flex-col gap-3 mb-5 sm:mb-6">
                    <div className="relative w-full sm:hidden">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                            data-testid="task-search-input-mobile"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search tasks…"
                            className="pl-9 pr-8 h-10 rounded-full bg-white border-gray-200 text-sm"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                                aria-label="Clear search"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
                        <div className="mobile-h-scroll sm:overflow-visible items-center gap-1 bg-gray-100 rounded-full p-1 w-full sm:w-auto shrink-0">
                            <button data-testid="view-active-tasks" onClick={() => setViewMode('active')} className={`shrink-0 px-3.5 sm:px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'active' ? 'bg-white shadow-sm text-teal-600' : 'text-gray-600 hover:text-gray-900'}`}>Active</button>
                            <button data-testid="view-completed-tasks" onClick={() => setViewMode('completed')} className={`shrink-0 px-3.5 sm:px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${viewMode === 'completed' ? 'bg-white shadow-sm text-green-600' : 'text-gray-600 hover:text-gray-900'}`}><CheckCircle2 className="w-4 h-4" />Done</button>
                            <button
                                type="button"
                                data-testid="toggle-sales-only"
                                onClick={() => setSalesOnly((v) => !v)}
                                title={salesOnly ? 'Showing only sales tasks — click to disable' : 'Show only sales tasks'}
                                className={`group shrink-0 ml-0.5 flex items-center gap-1.5 h-9 px-2.5 rounded-full text-sm font-medium transition-all ${salesOnly ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:text-emerald-600'}`}
                            >
                                <DollarSign className="w-4 h-4" />
                                <span className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${salesOnly ? 'max-w-[120px]' : 'max-w-0 sm:group-hover:max-w-[120px]'}`}>
                                    Sales only
                                </span>
                            </button>
                        </div>

                        <div className="flex items-center gap-2 flex-1 min-w-0 sm:justify-end">
                            {/* Compact search bar — desktop */}
                            <div className="relative min-w-[180px] max-w-[240px] hidden sm:block">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                <Input
                                    ref={searchInputRef}
                                    data-testid="task-search-input"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search tasks…"
                                    className="pl-9 pr-8 h-8 rounded-full bg-white border-gray-200 text-sm"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        aria-label="Clear search"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            <div className="mobile-h-scroll sm:overflow-visible sm:flex-wrap items-center gap-2 flex-1 sm:flex-initial pb-0.5">
                                <button data-testid="date-filter-all" onClick={() => setDateFilter('all')} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${dateFilter === 'all' ? 'bg-teal-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-teal-300'}`}>All</button>
                                
                                {primaryFilters.map((option) => (
                                    <button key={option.value} data-testid={`date-filter-${option.value}`} onClick={() => setDateFilter(option.value)} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${dateFilter === option.value ? 'bg-teal-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-teal-300'}`}>
                                        {option.value === 'overdue' && <AlertCircle className="w-3.5 h-3.5" />}
                                        {option.label}
                                        {option.badge && overdueCount > 0 && viewMode === 'active' && (
                                            <span className={`px-1.5 py-0.5 text-xs rounded-full ${dateFilter === 'overdue' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'}`}>{overdueCount}</span>
                                        )}
                                    </button>
                                ))}
                                
                                <DropdownMenu open={showMoreFilters} onOpenChange={setShowMoreFilters}>
                                    <DropdownMenuTrigger asChild>
                                        <button data-testid="more-filters-button" className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${moreFilters.some(f => f.value === dateFilter) ? 'bg-teal-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-teal-300'}`}>
                                            <MoreHorizontal className="w-3.5 h-3.5" />
                                            More
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-48">
                                        {moreFilters.map((option) => (
                                            option.value === 'custom' ? (
                                                <Popover key={option.value} open={showDatePicker} onOpenChange={setShowDatePicker}>
                                                    <PopoverTrigger asChild>
                                                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDateFilter('custom'); setShowDatePicker(true); }} className="cursor-pointer">
                                                            <Calendar className="w-4 h-4 mr-2" />
                                                            {dateFilter === 'custom' && customDateRange.from && customDateRange.to ? `${format(customDateRange.from, 'MMM d')} - ${format(customDateRange.to, 'MMM d')}` : 'Custom Range'}
                                                        </DropdownMenuItem>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start" side="bottom">
                                                        <CalendarComponent mode="range" selected={{ from: customDateRange.from, to: customDateRange.to }} onSelect={(range) => { setCustomDateRange({ from: range?.from || null, to: range?.to || null }); if (range?.from && range?.to) { setShowDatePicker(false); setShowMoreFilters(false); } }} numberOfMonths={1} className="rounded-xl" />
                                                    </PopoverContent>
                                                </Popover>
                                            ) : (
                                                <DropdownMenuItem key={option.value} onClick={() => { setDateFilter(option.value); setShowMoreFilters(false); }} className={`cursor-pointer ${dateFilter === option.value ? 'bg-teal-50 text-teal-600' : ''}`}>
                                                    {option.label}
                                                </DropdownMenuItem>
                                            )
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Upgrade Nudges */}
                {showLightBanner && !showPersistentBanner && (
                    <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <p className="text-sm text-teal-800">You have {activeTaskCount} active tasks. Upgrade for advanced features!</p>
                        <Button size="sm" onClick={() => navigate('/settings')} className="rounded-full text-xs shrink-0 self-start sm:self-auto"><Crown className="w-3 h-3 mr-1" />Upgrade</Button>
                    </div>
                )}

                {showPersistentBanner && (
                    <Card className="mb-6 border-amber-200 bg-amber-50 rounded-2xl">
                        <CardContent className="py-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-start sm:items-center gap-3"><Crown className="w-5 h-5 text-amber-600 shrink-0" /><p className="text-amber-800 text-sm sm:text-base">You're managing {activeTaskCount} tasks! Upgrade to Pro or Teams for priority support and team features.</p></div>
                                <Button onClick={() => navigate('/settings')} className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 shrink-0 self-start sm:self-auto"><Crown className="w-4 h-4 mr-2" />Upgrade</Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Upgrade Modal (shown once at 20 tasks) */}
                <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
                    <DialogContent className="rounded-2xl">
                        <DialogHeader>
                            <DialogTitle className="text-foreground">You're Growing Fast!</DialogTitle>
                            <DialogDescription>You now have {activeTaskCount} active tasks. Consider upgrading to Pro or Teams for team collaboration, analytics, and priority support.</DialogDescription>
                        </DialogHeader>
                        <div className="flex gap-2 justify-end pt-4">
                            <Button variant="outline" onClick={() => setShowUpgradeModal(false)} className="rounded-full">Maybe Later</Button>
                            <Button onClick={() => { setShowUpgradeModal(false); navigate('/settings'); }} className="rounded-full"><Crown className="w-4 h-4 mr-2" />View Plans</Button>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* AI Command Center Dialog — primary flow for new tasks + Q&A + help */}
                <Dialog
                    open={showAIDialog}
                    onOpenChange={async (open) => {
                        if (!open) {
                            // Persist in-progress quick-create so accidental dismiss doesn't lose work
                            const snap = aiQuickSnapRef.current;
                            if (snap && (snap.text?.trim() || snap.editTitle?.trim()) && !snap.sending) {
                                try {
                                    const a = (snap.editAssignees || [])[0];
                                    const assigned = a?.id === 'self' ? 'self' : (a?.id || a?.email || '');
                                    await axios.post(`${API}/tasks/drafts`, {
                                        title: (snap.editTitle || snap.text || 'Untitled draft').trim().slice(0, 120),
                                        description: snap.editDesc || snap.text || '',
                                        due_date: snap.editDue || '',
                                        priority: snap.editPriority || 'Medium',
                                        assigned_to: assigned,
                                        success_criteria: snap.editCriteria || undefined,
                                    });
                                    toast.message('Saved as draft', { description: 'You can resume it from Drafts below.' });
                                    fetchDrafts();
                                } catch (_) { /* silent */ }
                            }
                            aiQuickSnapRef.current = null;
                        }
                        setShowAIDialog(open);
                    }}
                >
                    <DialogContent
                        className="max-w-2xl w-[min(96vw,42rem)] sm:w-full max-h-[88dvh] overflow-y-auto p-0 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] fixed left-1/2 bottom-3 top-auto translate-x-[-50%] translate-y-0 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-2xl shadow-slate-900/15 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4"
                        // Portaled @mention / assignee pickers live on document.body — don't treat
                        // those clicks as "outside" or the dialog closes and loses the task.
                        onPointerDownOutside={(e) => {
                            const t = e.target;
                            if (t?.closest?.('[data-testid="clarify-people-dropdown"], [data-testid="mention-dropdown"], [data-testid="ai-inline-assignees"]')) {
                                e.preventDefault();
                            }
                        }}
                        onInteractOutside={(e) => {
                            const t = e.target;
                            if (t?.closest?.('[data-testid="clarify-people-dropdown"], [data-testid="mention-dropdown"], [data-testid="ai-inline-assignees"]')) {
                                e.preventDefault();
                            }
                        }}
                        onFocusOutside={(e) => {
                            const t = e.target;
                            if (t?.closest?.('[data-testid="clarify-people-dropdown"], [data-testid="mention-dropdown"], [data-testid="ai-inline-assignees"]')) {
                                e.preventDefault();
                            }
                        }}
                    >
                        <div className="p-4 sm:p-5">
                            <DialogHeader className="mb-2 pr-8">
                                <DialogTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: 'Outfit' }}>
                                    <Sparkles className="w-4.5 h-4.5 text-slate-800" />
                                    New task
                                </DialogTitle>
                                <DialogDescription className="sr-only">
                                    Describe what needs to get done
                                </DialogDescription>
                            </DialogHeader>
                            <AIQuickCreate
                                embedded
                                onSnapshot={(snap) => { aiQuickSnapRef.current = snap; }}
                                onCreated={() => {
                                    aiQuickSnapRef.current = null;
                                    fetchDashboard();
                                    fetchParentGroups();
                                    fetchDrafts();
                                    setShowAIDialog(false);
                                }}
                                onOpenAdvanced={(prefill) => {
                                    aiQuickSnapRef.current = null;
                                    if (prefill) {
                                        setTaskForm((f) => ({
                                            ...f,
                                            title: prefill.title || f.title,
                                            description: prefill.description || f.description,
                                            due_date: prefill.due_date || f.due_date,
                                            priority: prefill.priority || f.priority,
                                            is_sales_task: prefill.is_sales_task || f.is_sales_task,
                                            success_criteria: prefill.success_criteria || f.success_criteria || '',
                                            requires_screen_recording: prefill.requires_screen_recording || f.requires_screen_recording,
                                        }));
                                        if (Array.isArray(prefill.attachments) && prefill.attachments.length) {
                                            setAttachments(prefill.attachments);
                                        }
                                        if (Array.isArray(prefill.assignees) && prefill.assignees.length) {
                                            const mapped = prefill.assignees.map((a) => {
                                                if (a.id === 'self' || a.kind === 'self') return { type: 'self' };
                                                if (a.kind === 'email' || (!a.id && a.email)) return { type: 'email', email: a.email, name: a.name || a.email };
                                                if (a.kind === 'user' && a.id) return { type: 'user', id: a.id, name: a.name, email: a.email };
                                                if ((a.kind === 'group' || a.kind === 'team') && Array.isArray(a.emails)) {
                                                    return (a.emails || []).map((email) => ({ type: 'email', email, name: email.split('@')[0] }));
                                                }
                                                if ((a.kind === 'group' || a.kind === 'team') && Array.isArray(a.members)) {
                                                    return a.members.map((id) => ({ type: 'user', id, name: a.name }));
                                                }
                                                return null;
                                            }).flat().filter(Boolean);
                                            if (mapped.length) setSelectedAssignees(mapped);
                                        }
                                    }
                                    setShowAIDialog(false);
                                    setShowCreateModal(true);
                                }}
                            />
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Compact drafts pill — tucked away, one line, one tap to expand */}
                {drafts.length > 0 && (
                    <details className="mb-4 group" data-testid="drafts-compact">
                        <summary className="cursor-pointer select-none inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100">
                            <FileText className="w-3.5 h-3.5" />
                            <span className="font-medium">{drafts.length} unfinished {drafts.length === 1 ? 'draft' : 'drafts'}</span>
                            <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                        </summary>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {drafts.map((draft) => (
                                <div
                                    key={draft.id}
                                    className="relative flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs cursor-pointer hover:bg-amber-100 group/draft"
                                    onClick={() => resumeDraft(draft)}
                                    data-testid={`draft-card-${draft.id}`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-slate-900 truncate">{draft.title || 'Untitled draft'}</p>
                                        <p className="text-[10px] text-amber-700">
                                            {draft.created_at && !isNaN(new Date(draft.created_at).getTime())
                                                ? format(new Date(draft.created_at), 'MMM dd, h:mm a')
                                                : 'Recent'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => deleteDraft(draft.id, e)}
                                        className="opacity-0 group-hover/draft:opacity-100 text-red-500 hover:bg-red-50 rounded-full p-1"
                                        title="Delete draft"
                                        data-testid={`delete-draft-${draft.id}`}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </details>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-start">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                        <Card className="border-2 shadow-soft rounded-2xl">
                            <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6">
                                <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div>Assigned to Me</CardTitle>
                                <CardDescription>Tasks from others</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 max-h-none md:max-h-[calc(100vh-320px)] overflow-y-visible md:overflow-y-auto pr-1 clean-scroll px-4 sm:px-6 pb-4 sm:pb-6">
                                {getFilteredTasks(dashboard?.assigned_to_me || []).length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">{viewMode === 'completed' ? 'No completed tasks' : salesOnly ? 'No sales tasks in this view' : 'No tasks assigned to you'}</p>
                                ) : (
                                    getFilteredTasks(dashboard?.assigned_to_me || []).map((task, index) => (
                                        <TaskCard key={task.id} task={task} index={index} onComplete={handleQuickComplete} selectionMode={selectionMode} selected={selectedTasks.has(task.id)} onSelect={toggleTaskSelection} />
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                        <Card className="border-2 shadow-soft rounded-2xl">
                            <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6">
                                <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-teal-500"></div>Self-Assigned</CardTitle>
                                <CardDescription>Your personal tasks</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 max-h-none md:max-h-[calc(100vh-320px)] overflow-y-visible md:overflow-y-auto pr-1 clean-scroll px-4 sm:px-6 pb-4 sm:pb-6">
                                {getFilteredTasks(dashboard?.self_assigned || []).length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">{viewMode === 'completed' ? 'No completed tasks' : salesOnly ? 'No sales tasks in this view' : 'No self-assigned tasks'}</p>
                                ) : (
                                    getFilteredTasks(dashboard?.self_assigned || []).map((task, index) => (
                                        <TaskCard key={task.id} task={task} index={index} onComplete={handleQuickComplete} selectionMode={selectionMode} selected={selectedTasks.has(task.id)} onSelect={toggleTaskSelection} />
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
                        <Card className="border-2 shadow-soft rounded-2xl">
                            <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6">
                                <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div>Delegated</CardTitle>
                                <CardDescription>Tasks you assigned</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 max-h-none md:max-h-[calc(100vh-320px)] overflow-y-visible md:overflow-y-auto pr-1 clean-scroll px-4 sm:px-6 pb-4 sm:pb-6">
                                {parentGroups
                                    .filter(matchesGroupSearch)
                                    .filter((g) => !salesOnly || isSalesGroup(g))
                                    .map((group) => (
                                    <ParentTaskGroup
                                        key={group.id}
                                        group={group}
                                        onChanged={fetchParentGroups}
                                        selectable={selectionMode}
                                        selected={selectedTasks.has(group.id)}
                                        onToggleSelect={toggleTaskSelection}
                                    />
                                ))}
                                {getFilteredTasks(dashboard?.assigned_by_me || []).length === 0
                                    && parentGroups.filter(matchesGroupSearch).filter((g) => !salesOnly || isSalesGroup(g)).length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">{viewMode === 'completed' ? 'No completed tasks' : salesOnly ? 'No sales tasks in this view' : 'No delegated tasks'}</p>
                                ) : (
                                    getFilteredTasks(dashboard?.assigned_by_me || []).map((task, index) => (
                                        <TaskCard key={task.id} task={task} index={index} showAssignee selectionMode={selectionMode} selected={selectedTasks.has(task.id)} onSelect={toggleTaskSelection} />
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Recently Deleted has been moved to inside the individual task view.
                    The trash/restore controls now live only on TaskDetail. */}
            </main>
        </div>
    );
};

export default TaskHub;
