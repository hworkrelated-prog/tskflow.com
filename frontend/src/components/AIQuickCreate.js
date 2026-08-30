import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { API, useAuth } from '@/App';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sparkles, X, Users, User as UserIcon, ChevronDown, Check, Loader2, MessageCircleQuestion, Plus, Video, Image as ImageIcon, Paperclip, FileText, Mic, MicOff, Bold, Italic, List, ArrowUp, Repeat } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import DateTimePicker from '@/components/DateTimePicker';
import { uploadBlob, fileUrl } from '@/lib/upload';
import { AttachmentPicker } from '@/components/AttachmentPicker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { createDictationSession } from '@/lib/promptVoice';
import { speakChatGptVoice, stopChatGptVoice } from '@/lib/chatGptVoice';
import { applyVoiceAction, shouldComposeTask, VOICE_ROUTES } from '@/lib/voiceActions';
import { needsIosScreenRecordFlow } from '@/lib/recordingCapabilities';
import { PROMPT_EXAMPLES, PROMPT_EXAMPLE_INTERVAL_MS, nextPromptExampleIndex } from '@/lib/promptExamples';
import { promptMeansSelfAssign, promptNamesSomeoneElse, rememberedAssigneesForPrompt, writeLastAssignees, matchAssigneesFromPeople, SELF_CHIP, subjectForPhrase, looksLikeTimeOnly, looksLikeFollowupFragment, classifyClarifyAnswer, repairMessyPrompt } from '@/lib/selfAssign';
import { assigneesAreSelf, sentTaskFollowupMessage, rewriteSelfAssignCopy, layoutTaskDescription, isSelfAssigneeChip, fallbackTaskTitle, displayTaskTitle } from '@/lib/taskDescription';
import SlackAttachGrid from '@/components/SlackAttachGrid';

/*
 * AIQuickCreate - text an assistant, not fill a form.
 * Flow:
 *   1) User types plain English + Enter
 *   2) POST /api/ai/quick-create-preview
 *   3a) If something critical is missing → keep chatting until it is filled in
 *   3b) If ready → natural-language summary + Send (keep chatting to tweak anything)
 *   4) Fallback field editor only when something is still missing
 */

const SALES_WORD_RE = /\b(sales?|selling|upsell|prospect(?:s|ing)?|pipeline|quota|deals?|opportunit(?:y|ies)|demos?|discovery|pitch(?:es)?|proposals?|quotes?|crm|hubspot|salesforce|sdrs?|bdrs?|cold[-\s]?calls?|outbound|renewals?|\barr\b|\bmrr\b|poc|leads?|rfps?|(?:customer|client|prospect|buyer)s?\s+(?:call|meeting|demo|follow[-\s]?up)|(?:follow[-\s]?up|call|meet(?:ing)?)\s+(?:with\s+)?(?:a\s+)?(?:customer|client|prospect)s?)\b/i;

const looksLikeSales = (...parts) => SALES_WORD_RE.test(parts.filter(Boolean).join(' '));

const CONFIRM_SEND_RE = /^(send|yes|yep|yeah|y|ok|okay|looks good|lgtm|ship it|go ahead|confirm|do it|please send)[.!]?$/i;
const CONFIRM_READY_HINT = 'Ready when you are. Hit Send, or tell me what to change.';

/** Local chat edits while a task is ready to send - no More/Less form. */
const parseConfirmChatEdit = (raw) => {
    const t = String(raw || '').trim();
    if (!t) return { kind: 'empty' };
    if (CONFIRM_SEND_RE.test(t)) return { kind: 'send' };

    const notes = [];
    const patch = {};

    if (/\b(urgent|asap|immediately|critical|fire\s*drill)\b/i.test(t)) {
        patch.priority = 'Urgent';
        notes.push('marked Urgent');
    } else if (/\b(high priority|make it high|priority high)\b/i.test(t)) {
        patch.priority = 'High';
        notes.push('marked High');
    } else if (/\b(low priority|make it low|priority low|no rush)\b/i.test(t)) {
        patch.priority = 'Low';
        notes.push('marked Low');
    } else if (/\b(medium priority|priority medium|make it medium)\b/i.test(t)) {
        patch.priority = 'Medium';
        notes.push('marked Medium');
    }

    if (/\b(don'?t|do not|no|remove|without)\b.{0,24}\bscreen\s*recording\b/i.test(t)
        || /\bscreen\s*recording\b.{0,16}\b(off|not required|unnecessary)\b/i.test(t)) {
        patch.requires_screen_recording = false;
        notes.push('screen recording not required');
    } else if (/\b(require|need|ask for|with|add)\b.{0,20}\bscreen\s*recording\b/i.test(t)
        || /\brecord (their|your|a|the)\s+screen\b/i.test(t)
        || /\bscreen\s*recording\s+required\b/i.test(t)) {
        patch.requires_screen_recording = true;
        notes.push('screen recording required');
    }

    if (/\b(not sales|unmark sales|remove sales|not a sales)\b/i.test(t)) {
        patch.is_sales_task = false;
        notes.push('not a sales task');
    } else if (/\b(mark (it |this |as )?sales|sales task|this is sales|make it sales)\b/i.test(t)) {
        patch.is_sales_task = true;
        notes.push('marked as Sales');
    }

    const titleM = t.match(/^(?:change|set|update|rename)\s+(?:the\s+)?(?:title|task|name)\s+to\s+(.+)$/i)
        || t.match(/^title:\s*(.+)$/i);
    if (titleM) {
        patch.title = titleM[1].trim().replace(/^["']|["']$/g, '');
        notes.push('updated the title');
    }

    const descM = t.match(/^(?:change|set|update|rewrite)\s+(?:the\s+)?(?:message|description|ask|note|body)\s+to\s+(.+)$/i)
        || t.match(/^(?:message|description|ask):\s*(.+)$/i);
    if (descM) {
        patch.description = descM[1].trim().replace(/^["']|["']$/g, '');
        notes.push('updated the message');
    }

    const dueM = t.match(/^(?:change|set|update|make)\s+(?:the\s+)?(?:due(?:\s*date)?|deadline)\s+(?:to|for)\s+(.+)$/i)
        || t.match(/^(?:due|deadline):\s*(.+)$/i)
        || t.match(/^(?:due|make it due|push (?:it )?to|move (?:it )?to)\s+(.+)$/i);
    if (dueM) {
        patch.due_phrase = dueM[1].trim();
        notes.push(`due ${dueM[1].trim()}`);
    } else if (/\b(due|deadline|by)\b/i.test(t) && /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|asap|eod|next week|in\s+\d+)\b/i.test(t)) {
        patch.due_phrase = t;
        notes.push('updating the due date');
    } else if (looksLikeTimeOnly(t)) {
        patch.due_phrase = t;
        notes.push(`due ${t}`);
    }

    if (notes.length) return { kind: 'patch', patch, notes };
    return { kind: 'reparse', text: t };
};

const COMMAND_ROUTES = [
    { keys: ['analytics', 'metrics', 'reports', 'report'], re: /\b(analytics|metrics|reports?)\b/i, path: VOICE_ROUTES.analytics, label: 'Analytics' },
    { keys: ['settings', 'preferences'], re: /\b(settings|preferences)\b/i, path: VOICE_ROUTES.settings, label: 'Settings' },
    { keys: ['team', 'org chart', 'direct reports'], re: /\b(team|org chart|direct reports)\b/i, path: VOICE_ROUTES.team, label: 'Team' },
    { keys: ['help'], re: /\b(help|how to)\b/i, path: VOICE_ROUTES.help, label: 'Help' },
    { keys: ['recording', 'recordings'], re: /\brecordings?\b/i, path: VOICE_ROUTES.recordings, label: 'Recordings' },
    { keys: ['recurring'], re: /\brecurring\b/i, path: VOICE_ROUTES.recurring, label: 'Recurring' },
    { keys: ['transcript', 'meeting notes'], re: /\b(transcript|meeting notes)\b/i, path: VOICE_ROUTES.transcript, label: 'Transcript' },
    { keys: ['lead', 'leads'], re: /\b(leads?)\b/i, path: VOICE_ROUTES.leads, label: 'Leads' },
    { keys: ['dashboard', 'home', 'hub'], re: /\b(dashboard|home|hub)\b/i, path: VOICE_ROUTES.dashboard, label: 'Dashboard' },
    { keys: ['activity', 'activity log'], re: /\bactivity\b/i, path: VOICE_ROUTES.activity, label: 'Activity log' },
    { keys: ['unbiassly'], re: /\bunbiassly\b/i, path: VOICE_ROUTES.unbiassly, label: 'Unbiassly' },
    { keys: ['calendar', 'connect calendar'], re: /\b(google )?calendar\b/i, path: VOICE_ROUTES.calendar, label: 'Calendar' },
    { keys: ['leaderboard'], re: /\bleaderboard\b/i, path: VOICE_ROUTES.leaderboard, label: 'Leaderboard' },
    { keys: ['updates', "what's new"], re: /\b(updates|what'?s new)\b/i, path: VOICE_ROUTES.updates, label: 'Updates' },
];

const tryLocalCommand = (raw) => {
    const t = (raw || '').trim();
    if (!t) return null;
    const low = t.toLowerCase().replace(/^\/+/, '');
    if (/^(go to|open|show|take me to|jump to)\b/i.test(t) || t.startsWith('/')) {
        const body = t.replace(/^[/]/, '').replace(/^(go to|open|show|take me to|jump to)\s+/i, '');
        for (const c of COMMAND_ROUTES) {
            if (c.re.test(body) || c.re.test(t)) return { type: 'navigate', path: c.path, label: c.label };
        }
    }
    const exact = COMMAND_ROUTES.find((c) => c.keys.includes(low));
    if (exact) return { type: 'navigate', path: exact.path, label: exact.label };
    if (/^(from transcript|import transcript|extract tasks from)/i.test(t)) {
        return { type: 'navigate', path: '/transcript', label: 'Transcript' };
    }
    if (/\b(record (my |the )?screen|start (a )?(screen )?record(ing)?)\b/i.test(t)) {
        return { type: 'start_recording' };
    }
    if (/^(start|new)\s+record(ing)?\b/i.test(t) || /^record(ing)?$/i.test(t)) {
        return { type: 'navigate', path: '/recordings', label: 'Recordings' };
    }
    if (/^(start |new |create |make )?(a )?recurring(\s+task|\s+series)?$/i.test(t)
        || /\bmake (this|it) recurring\b/i.test(t)) {
        return { type: 'start_recurring' };
    }
    const search = t.match(/^(search|find|look up)\s+(.+)/i);
    if (search) {
        return { type: 'search', query: search[2].trim() };
    }
    if (/^\/form\b/i.test(t) || /^manual form\b/i.test(t) || /^full form\b/i.test(t)) {
        return { type: 'manual' };
    }
    return null;
};

/** Detect an @mention token just before the caret (supports multi-word group names). */
const getMentionState = (value, caret) => {
    const before = (value || '').slice(0, caret ?? (value || '').length);
    // Allow up to 4 word tokens after @ so "@Sales Team" / "@East Coast Managers" work
    const m = before.match(/(^|[\s([{])@([A-Za-z0-9_.+'@-]*(?:\s+[A-Za-z0-9_.+'-]+){0,3})$/);
    if (!m) return null;
    const query = m[2] || '';
    const start = before.length - query.length - 1;
    return { start, end: caret ?? before.length, query };
};

const isEmailLike = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());

const htmlToMarkdown = (html) => {
    if (!html) return '';
    let s = String(html);
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/p>/gi, '\n').replace(/<p[^>]*>/gi, '');
    s = s.replace(/<\/div>/gi, '\n').replace(/<div[^>]*>/gi, '');
    s = s.replace(/<\/li>/gi, '\n').replace(/<li[^>]*>/gi, '- ');
    s = s.replace(/<\/(ul|ol)>/gi, '\n').replace(/<(ul|ol)[^>]*>/gi, '');
    s = s.replace(/<(strong|b)[^>]*>/gi, '**').replace(/<\/(strong|b)>/gi, '**');
    s = s.replace(/<(em|i)[^>]*>/gi, '_').replace(/<\/(em|i)>/gi, '_');
    s = s.replace(/<[^>]+>/g, '');
    s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return s.replace(/\n{3,}/g, '\n\n').trim();
};

const mergeAssigneeLists = (prev, fromParse) => {
    const merged = [...(prev || [])];
    for (const a of fromParse || []) {
        const key = a.id || a.email || a.name;
        if (!merged.some((x) => (x.id && x.id === key) || (x.email && x.email === a.email) || (x.name && x.name === a.name))) {
            merged.push(a);
        }
    }
    return merged;
};

const AIQuickCreate = ({
    onCreated,
    onOpenAdvanced,
    onSnapshot,
    embedded = false,
    externalAttachments = null,
    onExternalAttachmentsConsumed,
    registerAttachHandler,
    onRequestExit,
}) => {
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState(null);
    const [answers, setAnswers] = useState({});
    const [sending, setSending] = useState(false);
    const [answerMode, setAnswerMode] = useState(null);
    const [answerLoading, setAnswerLoading] = useState(false);
    const [thread, setThread] = useState([]);
    const [activePrompt, setActivePrompt] = useState('');
    const [clarifyAnswer, setClarifyAnswer] = useState('');
    const [people, setPeople] = useState([]);
    const [groups, setGroups] = useState([]);
    const [peopleSearch, setPeopleSearch] = useState('');
    const [showPeopleDrop, setShowPeopleDrop] = useState(false);
    const [peopleDropPos, setPeopleDropPos] = useState(null);
    const [mention, setMention] = useState(null); // { start, end, query }
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionPos, setMentionPos] = useState(null); // fixed coords for portal menu
    const [newPersonEmail, setNewPersonEmail] = useState('');
    const [showNewPersonEmail, setShowNewPersonEmail] = useState(false);
    const [composerFocused, setComposerFocused] = useState(false);
    const [exampleIndex, setExampleIndex] = useState(0);
    const inputRef = useRef(null);
    const composerRef = useRef(null);
    const clarifyRef = useRef(null);
    const peopleAnchorRef = useRef(null);
    const nudgeSentRef = useRef(false);
    const mentionListRef = useRef(null);
    const editAssigneesRef = useRef([]);
    const skipMentionSyncRef = useRef(false);

    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editDue, setEditDue] = useState('');
    const [editPriority, setEditPriority] = useState('Medium');
    const [editAssignees, setEditAssignees] = useState([]);
    const [editCriteria, setEditCriteria] = useState('');
    const [editSales, setEditSales] = useState(false);
    const [editScreenRecording, setEditScreenRecording] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [uploadingPaste, setUploadingPaste] = useState(false);
    const recordPickerRef = useRef(null);
    const [plusOpen, setPlusOpen] = useState(false);
    const [showAttachPrompt, setShowAttachPrompt] = useState(false);
    const [previewAttachment, setPreviewAttachment] = useState(null);
    const [teamScopePrompt, setTeamScopePrompt] = useState(null); // { options: [...] }
    const [recurringHint, setRecurringHint] = useState(false);
    // Which confirm-summary field is open for inline edit: title|due|priority|criteria|assignees|desc|null
    const [editingField, setEditingField] = useState(null);
    const [listening, setListening] = useState(false);
    const [voiceSession, setVoiceSession] = useState(false);
    const [voicePhase, setVoicePhase] = useState('idle'); // idle | listening | thinking | speaking
    const [formatOpen, setFormatOpen] = useState(false);
    const fileInputRef = useRef(null);
    const plusRef = useRef(null);
    const pasteZoneRef = useRef(null);
    const voiceSeedRef = useRef('');
    const dictationRef = useRef(null);
    const runPreviewRef = useRef(null);
    const runQARef = useRef(null);
    const sendRef = useRef(null);
    const previewRef = useRef(null);
    const voiceSessionRef = useRef(false);
    const voiceGenRef = useRef(0);
    const startVoiceRef = useRef(null);
    const handleVoiceTurnRef = useRef(null);
    const threadEndRef = useRef(null);
    const threadRef = useRef([]);
    const activePromptRef = useRef('');
    const recurringHintRef = useRef(false);
    const navigate = useNavigate();
    const { user } = useAuth();
    const [slackStatus, setSlackStatus] = useState({ connected: false, canManage: false });

    const focusInput = useCallback(() => {
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 30);
    }, []);

    useEffect(() => {
        previewRef.current = preview;
    }, [preview]);

    // Grow like a chat composer: start compact, expand with content, then scroll.
    const resizePrompt = useCallback(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        const next = Math.min(Math.max(el.scrollHeight, 40), 220);
        el.style.height = `${next}px`;
        el.style.overflowY = el.scrollHeight > 220 ? 'auto' : 'hidden';
    }, []);

    useEffect(() => {
        resizePrompt();
    }, [text, resizePrompt]);

    useEffect(() => {
        editAssigneesRef.current = editAssignees;
    }, [editAssignees]);

    useEffect(() => {
        threadRef.current = thread;
    }, [thread]);

    useEffect(() => {
        threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [thread, loading, answerLoading, preview, sending]);

    useEffect(() => {
        const onResume = (e) => {
            const d = e.detail;
            if (!d) return;
            setText(d.description || d.title || '');
            if (d.title) setEditTitle(d.title);
            if (d.due_date) setEditDue(d.due_date);
            if (d.priority) setEditPriority(d.priority);
            focusInput();
        };
        window.addEventListener('tskflow:resume-ai-draft', onResume);
        return () => window.removeEventListener('tskflow:resume-ai-draft', onResume);
    }, [focusInput]);

    useEffect(() => {
        const onKey = (e) => {
            const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
            if (e.key === '/' && !typing) {
                e.preventDefault();
                focusInput();
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                focusInput();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [focusInput]);

    useEffect(() => {
        const onFocus = () => focusInput();
        window.addEventListener('tskflow:focus-ai-prompt', onFocus);
        return () => window.removeEventListener('tskflow:focus-ai-prompt', onFocus);
    }, [focusInput]);

    useEffect(() => {
        let cancelled = false;
        axios.get(`${API}/auth/preferences`)
            .then((res) => {
                if (cancelled) return;
                setSlackStatus({
                    connected: Boolean(res.data?.slack_team_connected),
                    canManage: Boolean(res.data?.can_manage_slack),
                });
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await axios.get(`${API}/users`);
                if (!cancelled) setPeople(Array.isArray(res.data) ? res.data : []);
            } catch (_) {
                if (!cancelled) setPeople([]);
            }
            try {
                const g = await axios.get(`${API}/groups`);
                if (!cancelled) setGroups(Array.isArray(g.data) ? g.data : []);
            } catch (_) {
                if (!cancelled) setGroups([]);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const mentionQuery = (mention?.query || '').trim().toLowerCase();
    const mentionPeople = [
        { id: 'self', name: 'Me', email: '', _kind: 'user' },
        ...people
            .filter((u) => u && u.id !== 'self' && (u.name || '').toLowerCase() !== 'me' && (u.name || '').toLowerCase() !== 'me (self)')
            .map((u) => ({ ...u, _kind: 'user' })),
    ].filter((u) => {
        if (!mentionQuery) return true;
        return (u.name || '').toLowerCase().includes(mentionQuery)
            || (u.email || '').toLowerCase().includes(mentionQuery);
    }).slice(0, 5);

    const mentionGroups = groups.filter((g) => {
        if (!mentionQuery) return true;
        return (g.name || '').toLowerCase().includes(mentionQuery);
    }).slice(0, 3).map((g) => ({ ...g, _kind: 'group' }));

    const mentionHasExactPerson = mentionPeople.some((u) =>
        (u.name || '').toLowerCase() === mentionQuery || (u.email || '').toLowerCase() === mentionQuery
    );
    const mentionHasExactGroup = mentionGroups.some((g) => (g.name || '').toLowerCase() === mentionQuery);
    const showAddPerson = Boolean(mention) && mentionQuery.length > 0 && !mentionHasExactPerson;
    const showAddGroup = Boolean(mention) && mentionQuery.length > 0 && !mentionHasExactGroup;

    const mentionOptions = (() => {
        // Groups first so they are visible without scrolling past people.
        const opts = [
            ...mentionGroups.map((g) => ({ type: 'group', data: g })),
            ...mentionPeople.map((u) => ({ type: 'user', data: u })),
        ];
        if (showAddPerson) opts.push({ type: 'add_person', data: { query: mention?.query || '' } });
        if (showAddGroup) opts.push({ type: 'add_group', data: { query: mention?.query || '' } });
        return opts;
    })();

    const updateMentionPos = useCallback(() => {
        const el = composerRef.current || inputRef.current;
        if (!el || !mention) {
            setMentionPos(null);
            return;
        }
        const r = el.getBoundingClientRect();
        const vv = window.visualViewport;
        const viewTop = vv?.offsetTop ?? 0;
        const viewHeight = vv?.height ?? window.innerHeight;
        const viewWidth = vv?.width ?? window.innerWidth;
        const pad = 8;
        const narrow = viewWidth < 640;
        // On phones (esp. with the keyboard up), dock the picker as a bottom sheet
        // inside the visual viewport so it never sits under the soft keyboard.
        if (narrow) {
            const maxHeight = Math.max(160, Math.min(280, viewHeight * 0.42));
            setMentionPos({
                left: 8,
                width: Math.max(0, viewWidth - 16),
                maxHeight,
                openUp: true,
                mobileSheet: true,
                top: undefined,
                bottom: Math.max(8, window.innerHeight - (viewTop + viewHeight) + 8),
            });
            return;
        }
        const spaceAbove = r.top - viewTop - pad;
        const spaceBelow = (viewTop + viewHeight) - r.bottom - pad;
        // Prefer opening upward near the bottom dock so groups aren't off-screen.
        const openUp = spaceBelow < 280 || spaceAbove > spaceBelow;
        const maxHeight = Math.max(180, Math.min(320, openUp ? spaceAbove - 4 : spaceBelow - 4));
        setMentionPos({
            left: Math.max(12, r.left),
            width: Math.min(r.width, viewWidth - 24),
            maxHeight,
            openUp,
            mobileSheet: false,
            top: openUp ? undefined : r.bottom + 6,
            bottom: openUp ? Math.max(12, window.innerHeight - r.top + 6) : undefined,
        });
    }, [mention]);

    useEffect(() => {
        setMentionIndex(0);
    }, [mention?.query, mention?.start]);

    useEffect(() => {
        if (!mention) {
            setMentionPos(null);
            return undefined;
        }
        updateMentionPos();
        const onMove = () => updateMentionPos();
        window.addEventListener('resize', onMove);
        window.addEventListener('scroll', onMove, true);
        const vv = window.visualViewport;
        vv?.addEventListener('resize', onMove);
        vv?.addEventListener('scroll', onMove);
        return () => {
            window.removeEventListener('resize', onMove);
            window.removeEventListener('scroll', onMove, true);
            vv?.removeEventListener('resize', onMove);
            vv?.removeEventListener('scroll', onMove);
        };
    }, [mention, text, editAssignees.length, showNewPersonEmail, updateMentionPos]);

    useEffect(() => {
        if (!mention || !mentionListRef.current) return;
        const active = mentionListRef.current.querySelector('[data-active="true"]');
        active?.scrollIntoView({ block: 'nearest' });
    }, [mentionIndex, mention]);

    const replaceMention = useCallback((insertText, caretExtra = 0) => {
        if (!mention) return;
        const before = text.slice(0, mention.start);
        const after = text.slice(mention.end);
        const next = `${before}${insertText}${after}`;
        const caret = before.length + insertText.length + caretExtra;
        setText(next);
        setMention(null);
        setShowNewPersonEmail(false);
        setNewPersonEmail('');
        setTimeout(() => {
            const el = inputRef.current;
            if (!el) return;
            el.focus();
            try { el.setSelectionRange(caret, caret); } catch (_) { /* noop */ }
            resizePrompt();
        }, 0);
    }, [mention, text, resizePrompt]);

    const addAssigneeChip = useCallback((chip) => {
        setEditAssignees((prev) => {
            const key = chip.id || chip.email || chip.name;
            if (prev.some((a) => (a.id && a.id === key) || (a.email && a.email === chip.email) || (a.name && a.name === chip.name && a.kind === chip.kind))) {
                return prev;
            }
            return [...prev, chip];
        });
    }, []);

    const applyMentionOption = useCallback(async (opt) => {
        if (!opt || !mention) return;
        skipMentionSyncRef.current = true;
        if (opt.type === 'user') {
            const u = opt.data;
            const label = u.id === 'self' ? 'Me' : (u.name || u.email);
            replaceMention(`@${label} `);
            addAssigneeChip(
                u.id === 'self'
                    ? { kind: 'user', id: 'self', name: 'Me' }
                    : { kind: 'user', id: u.id, name: u.name, email: u.email }
            );
            return;
        }
        if (opt.type === 'group') {
            const g = opt.data;
            replaceMention(`@${g.name} `);
            addAssigneeChip({
                kind: 'group',
                id: g.id,
                name: g.name,
                emails: g.emails || [],
                members: g.emails || [],
                member_count: (g.emails || []).length,
            });
            return;
        }
        if (opt.type === 'add_person') {
            const q = (opt.data.query || '').trim();
            if (isEmailLike(q)) {
                replaceMention(`@${q} `);
                addAssigneeChip({ kind: 'email', email: q, name: q.split('@')[0] });
                return;
            }
            setShowNewPersonEmail(true);
            setNewPersonEmail('');
            return;
        }
        if (opt.type === 'add_group') {
            const name = (opt.data.query || '').trim();
            if (!name) return;
            try {
                const res = await axios.post(`${API}/groups`, { name, emails: [] });
                const g = res.data;
                setGroups((prev) => [g, ...prev]);
                replaceMention(`@${g.name} `);
                addAssigneeChip({
                    kind: 'group',
                    id: g.id,
                    name: g.name,
                    emails: [],
                    members: [],
                    member_count: 0,
                });
                toast.success(`Group “${g.name}” created`);
            } catch (err) {
                // Free tier / errors: still put the @mention in the prompt for the parser
                replaceMention(`@${name} `);
                toast.message(`Mentioned “${name}”`);
            }
        }
    }, [mention, replaceMention, addAssigneeChip]);

    const confirmNewPerson = () => {
        const email = newPersonEmail.trim();
        const name = (mention?.query || '').trim() || email.split('@')[0];
        if (!isEmailLike(email)) {
            toast.error('Enter a valid email for the new person');
            return;
        }
        replaceMention(`@${name} `);
        addAssigneeChip({ kind: 'email', email, name });
        toast.success(`Will assign to ${email}`);
    };

    const syncMentionFromCaret = (value, caret) => {
        if (skipMentionSyncRef.current) {
            skipMentionSyncRef.current = false;
            setMention(null);
            setShowNewPersonEmail(false);
            return;
        }
        const state = getMentionState(value, caret);
        setMention(state);
        if (!state) {
            setShowNewPersonEmail(false);
            setNewPersonEmail('');
        }
    };

    const stripPeopleNoise = (value, peopleNames = []) => {
        let s = String(value || '');
        // Multi-word @mentions: "@Mark Sibghat"
        s = s.replace(/@[A-Za-z][\w'.-]*(?:\s+[A-Z][A-Za-z']*){0,2}/g, ' ');
        s = s.replace(/@\S+/g, ' ');
        // Speech debris: "please can you Mahmood an EOD report" → drop can-you + capitalized name only
        s = s.replace(/\b(?:[Pp]lease\s+)?[Cc]an\s+you\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}\s+/g, '');
        s = s.replace(/\b(?:[Pp]lease\s+)?[Cc]an\s+you\s+/g, '');
        // Manager-voice: "get Hashim to review…" / "have Sarah do…" → keep the work clause
        s = s.replace(/\bi(?:'ve| have)\s+(?:asked|told)\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}\s+to\s+/gi, '');
        s = s.replace(/\b(?:asked|told|get|have|ask|tell)\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}\s+to\s+/gi, '');
        s = s.replace(/\b(?:get|have|ask|tell)\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}\s+/gi, '');
        s = s.replace(/\bi\s+(?:need|want|would like)\s+(?:my|the|our)\s+(?:@[^\s]+(?:\s+[A-Za-z][\w'.-]*){0,2}\s+)?to\s+/gi, '');
        s = s.replace(/\bi\s+(?:need|want|would like)\s+(?:my|the|our)\s+to\s+/gi, '');
        const names = [...peopleNames].filter(Boolean).sort((a, b) => b.length - a.length);
        for (const name of names) {
            s = s.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
        }
        // Collapse broken remnants like "get do it" / "to do it by"
        s = s.replace(/\b(?:get|have|ask|tell)\s+(?=do\b|to\b)/gi, '');
        s = s.replace(/\bget\s+do\b/gi, 'do');
        s = s.replace(/\band\s+get\b/gi, 'and');
        const nameTokens = new Set();
        names.forEach((n) => n.split(/\s+/).forEach((p) => { if (p.length > 1) nameTokens.add(p.toLowerCase()); }));
        const tokens = s.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        while (tokens.length && nameTokens.has(tokens[0].toLowerCase().replace(/[.,;:]+$/g, ''))) {
            tokens.shift();
        }
        return tokens.join(' ')
            .replace(/^(need to|needs to|have to|must|please|kindly|can you)\s+/i, '')
            .replace(/^(an?|the)\s+/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const applyPreview = (p) => {
        const sourceText = repairMessyPrompt(activePromptRef.current || text || '').trim();
        const sales = !!(p.is_sales_task || looksLikeSales(sourceText, p.title, p.description, p.category));
        const fromParse = p.assignee_resolution?.resolved || [];
        const fromPeople = matchAssigneesFromPeople(sourceText, people);
        const peopleNames = [
            ...editAssignees.map((a) => a.name).filter(Boolean),
            ...fromParse.map((a) => a.name).filter(Boolean),
            ...fromPeople.map((a) => a.name).filter(Boolean),
            ...((p.assignee_hints || []).map((h) => String(h).replace(/^@/, ''))),
        ];
        // Prefer the LLM title when it already looks clean - avoid over-scrubbing into "get do it"
        const llmTitle = String(p.title || '').trim();
        const llmTitleClean = !llmTitle
            || /@/.test(llmTitle)
            || /^assign\b/i.test(llmTitle)
            || peopleNames.some((n) => n && llmTitle.toLowerCase().includes(String(n).toLowerCase()));
        let title = llmTitleClean ? stripPeopleNoise(llmTitle, peopleNames) : llmTitle;
        let desc = String(p.description || '')
            .replace(/@[A-Za-z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .trim();
        const actions = Array.isArray(p.action_items)
            ? p.action_items.map((a) => stripPeopleNoise(a, peopleNames)).filter(Boolean)
            : [];
        const hintSelf = (p.assignee_hints || []).some((h) => /^(me|myself|self)$/i.test(String(h || '').trim()));
        const resolvedSelf = fromParse.length > 0 && fromParse.every((a) => isSelfAssigneeChip(a, user?.id));
        const namedSomeoneElse = promptNamesSomeoneElse(sourceText);
        const selfParse = namedSomeoneElse
            ? false
            : (promptMeansSelfAssign(sourceText) || ((hintSelf || resolvedSelf) && !namedSomeoneElse));

        const work = stripPeopleNoise(sourceText || '', peopleNames)
            .replace(/\b(by|before|due)\s+.+$/i, '')
            .replace(/\band\s+get\b/gi, 'and')
            .trim();
        const account = subjectForPhrase(sourceText);
        const looksNamed = peopleNames.some((n) => {
            const last = (n || '').split(/\s+/).pop();
            return last && last.length > 2 && new RegExp(`\\b${last}\\b`, 'i').test(title);
        });
        const titleMissesAccount = !!(account && title && !account.split(/\s+/).filter((w) => !/^(the|a|an|account|client|deal)$/i.test(w)).every((w) => title.toLowerCase().includes(w.toLowerCase())));
        const titleBad = !title
            || /^assign\b/i.test(title)
            || title.includes('@')
            || looksNamed
            || titleMissesAccount
            || title.split(/\s+/).length > 12
            || title.split(/\s+/).length < 2
            || /^(an?|the)\b/i.test(title)
            || /\b(can you|please can|get do)\b/i.test(title)
            || /\bget\s*$/i.test(title);
        if (titleBad) {
            const seed = (actions[0] || work)
                .replace(/\s+(?:with|to)\s+me\b/gi, '')
                .replace(/\s+for\s+me\b/gi, '')
                .replace(/\b(?:a|an)\s+(?:good|great|nice|solid|quick|strong)\s+/gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (looksLikeTimeOnly(seed) || /^assign this\b/i.test(seed)) {
                const fromSource = sourceText
                    .replace(/\bwhich is(?:\s+to)?\s+/i, '')
                    .replace(/^(?:to\s+)?have\s+.+?\s+be able to\s+/i, '');
                const mWork = fromSource.match(/\b(send|share|enable|let|allow|review|update|submit|create|fix)\b.*$/i);
                title = (mWork ? mWork[0] : fromSource).split(/\s+/).slice(0, 8).join(' ');
            } else {
                const mShare = seed.match(/\b(share|send|draft|write|email)\b.*$/i);
                const m = seed.match(/\b(finalize|update|review|complete|prepare|create|send|call|fix|submit|draft|schedule|align|close|do|check|watch|look|provide|share|write)\b.*$/i);
                if (mShare && /template|email|deck|update|report/i.test(mShare[0])) {
                    title = mShare[0].split(/\s+/).slice(0, 10).join(' ');
                } else if (m) {
                    title = m[0].split(/\s+/).slice(0, 8).join(' ');
                } else if (/\beod\b|end of day|report/i.test(seed)) {
                    title = 'Send EOD report';
                } else {
                    title = fallbackTaskTitle(seed);
                }
            }
            if (account && title && !title.toLowerCase().includes(account.toLowerCase())) {
                title = `${title.replace(/\s+for\b.*$/i, '').trim()} for ${account}`;
            }
            if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
        }
        // Description: prefer clean LLM / action steps - never leave mangled "get do it"
        if (!desc && actions.length) {
            desc = actions.map((a, i) => `${i + 1}. ${a}`).join('\n');
        }
        if (!desc && work.length > 12) {
            desc = work;
        }
        desc = (desc || '')
            .replace(/\bget\s+do\b/gi, 'do')
            .replace(/\band\s+get\b/gi, 'and')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
        if (!selfParse && desc && /\bi need my\b|^please i\b/i.test(desc.split('\n')[0] || '')) {
            const m = desc.match(/\b(submit|send|review|complete|prepare|create|update|call|fix|draft|schedule|share|write|close)\b[\s\S]*/i);
            if (m) desc = m[0].charAt(0).toUpperCase() + m[0].slice(1);
        }
        if (!selfParse && desc && !/^(please|kindly|review|complete|send|submit|prepare|create|update|watch|check|do)\b/i.test(desc)) {
            if (/^(i|we|my)\b/i.test(desc)) {
                const m = desc.match(/\b(submit|send|review|complete|prepare|create|update|call|fix|draft|schedule|share|write|close)\b[\s\S]*/i);
                desc = m ? m[0] : desc.replace(/^i\s+need\s+my\s+(to\s+)?/i, '');
            }
            if (desc && !/^(please|kindly|review|complete|send|submit|prepare|create|update|watch|check|do|i)\b/i.test(desc)) {
                desc = `Please ${desc.charAt(0).toLowerCase()}${desc.slice(1)}`;
            } else if (desc && /^(submit|send|review|complete|prepare|create|update)\b/i.test(desc)) {
                desc = `Please ${desc.charAt(0).toLowerCase()}${desc.slice(1)}`;
            }
        }

        setEditDue(p.due_date || '');
        setEditPriority(p.priority || 'Medium');
        // Keep @mentions the user already picked; merge in any newly resolved assignees.
        // "Remind me" / "I need to" always lands on Me - never reopen the people picker.
        let merged;
        if (promptMeansSelfAssign(sourceText)) {
            merged = [SELF_CHIP];
        } else {
            merged = mergeAssigneeLists(editAssigneesRef.current, fromParse);
            merged = mergeAssigneeLists(merged, fromPeople);
            if (namedSomeoneElse) {
                merged = merged.filter((a) => a && a.id !== 'self' && !isSelfAssigneeChip(a, user?.id));
            }
        }
        editAssigneesRef.current = merged;
        setEditAssignees(merged);
        if ((selfParse || p.self_assign) && !namedSomeoneElse) {
            title = rewriteSelfAssignCopy(title);
            desc = rewriteSelfAssignCopy(desc);
        }
        title = displayTaskTitle(title);
        desc = layoutTaskDescription(desc);
        setEditTitle(title || p.title || '');
        setEditDesc(desc || '');
        const mergedCount = merged.length;
        if (mergedCount) writeLastAssignees(merged);
        setEditCriteria(p.success_criteria || '');
        setEditSales(!!sales);
        setEditScreenRecording(!!p.requires_screen_recording);
        setEditingField(null);
        setClarifyAnswer('');
        setPeopleSearch('');
        setMention(null);

        // Offer a quick scope pick when "my team" could mean direct vs everyone under me
        const teamChip = (p.assignee_resolution?.resolved || []).find(
            (a) => a.kind === 'team' && (a.needs_scope_pick || (Array.isArray(a.alternates) && a.alternates.some((x) => x.id === 'everyone-under-me')))
        );
        if (teamChip && (p.assignee_resolution?.needs_team_scope || teamChip.needs_scope_pick)) {
            setTeamScopePrompt({
                current: teamChip,
                options: [
                    { ...teamChip, label: teamChip.name || 'Your managers' },
                    ...(teamChip.alternates || []).map((alt) => ({
                        ...alt,
                        label: alt.id === 'everyone-under-me'
                            ? (alt.name || 'Everyone under you')
                            : alt.id === 'skip-level'
                                ? (alt.name || 'Their teams')
                                : alt.name,
                    })),
                ],
            });
        } else {
            setTeamScopePrompt(null);
        }

        const qs = p.clarifying_questions || [];
        const resolvedPeople = (p.assignee_resolution?.resolved || []).filter(
            (a) => a && (a.kind !== 'team' || ((a.members || a.emails || []).length && !a.needs_scope_pick))
        );
        const pendingScope = Boolean(
            p.assignee_resolution?.needs_team_scope
            || (p.assignee_resolution?.resolved || []).some((a) => a?.needs_scope_pick)
        );
        const hasAssignees = mergedCount > 0
            || promptMeansSelfAssign(sourceText)
            || resolvedPeople.length > 0
            || fromPeople.length > 0;
        const filteredQs = (qs || []).filter((q) => {
            if (hasAssignees && /who|own|assign/i.test(q || '') && !/scope|direct reports|everyone under|managers/i.test(q || '')) {
                return false;
            }
            return true;
        });
        if (pendingScope) {
            const withoutWhen = filteredQs.filter((q) => !/when|due|deadline/i.test(q || '') || /scope|managers|everyone under/i.test(q || ''));
            if (!withoutWhen.some((q) => /scope|managers|everyone under|direct reports/i.test(q || ''))) {
                withoutWhen.unshift('Your managers, or everyone under you, including their teams?');
            }
            filteredQs.length = 0;
            filteredQs.push(...withoutWhen);
        } else if (!hasAssignees) {
            const withoutWhen = filteredQs.filter((q) => !/when|due|deadline/i.test(q || ''));
            if (!withoutWhen.some((q) => /who|own|assign|set up your team/i.test(q || ''))) {
                withoutWhen.unshift(
                    p.assignee_resolution?.needs_team_setup
                        ? 'Who should this go to? Set up your team, or pick people.'
                        : 'Who should this be assigned to?'
                );
            }
            filteredQs.length = 0;
            filteredQs.push(...withoutWhen);
        }
        const nextPreview = {
            ...p,
            title: title || p.title,
            description: desc || p.description,
            is_sales_task: sales,
            category: sales ? (p.category || 'Sales') : p.category,
            clarifying_questions: filteredQs,
        };
        setPreview(nextPreview);
        if (filteredQs.length > 0) {
            const q = filteredQs[0];
            const last = threadRef.current[threadRef.current.length - 1];
            if (!(last?.role === 'assistant' && last.text === q)) {
                const entry = {
                    id: `${Date.now()}-assistant-q`,
                    role: 'assistant',
                    text: q,
                };
                setThread((prev) => {
                    const next = [...prev, entry];
                    threadRef.current = next;
                    return next;
                });
            }
            const isWho = /who|own|assign/i.test(q || '') && !hasAssignees;
            setShowPeopleDrop(isWho);
            // When / cadence questions: stay in the main composer - no second reply box.
            // Who questions: focus the people search in the picker.
            setTimeout(() => {
                if (isWho) {
                    clarifyRef.current?.focus();
                } else {
                    inputRef.current?.focus({ preventScroll: true });
                }
            }, 50);
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
            // Confirm is ready - invite more chat instead of opening a form.
            const last = threadRef.current[threadRef.current.length - 1];
            if (!(last?.role === 'assistant' && last.text === CONFIRM_READY_HINT)) {
                const entry = {
                    id: `${Date.now()}-assistant-ready`,
                    role: 'assistant',
                    text: CONFIRM_READY_HINT,
                };
                setThread((prev) => {
                    const next = [...prev, entry];
                    threadRef.current = next;
                    return next;
                });
            }
            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
        }
    };

    const appendThread = (msg) => {
        const entry = {
            id: msg.id || `${Date.now()}-${msg.role}-${Math.random().toString(36).slice(2, 6)}`,
            role: msg.role,
            text: msg.text,
        };
        setThread((prev) => {
            const next = [...prev, entry];
            threadRef.current = next;
            return next;
        });
        return entry;
    };

    const applyConfirmChatEdit = async (raw) => {
        const parsed = parseConfirmChatEdit(raw);
        if (parsed.kind === 'empty') return;
        if (parsed.kind === 'send') {
            await sendRef.current?.();
            return;
        }

        if (parsed.kind === 'patch') {
            const { patch, notes } = parsed;
            if (patch.priority) setEditPriority(patch.priority);
            if (typeof patch.requires_screen_recording === 'boolean') {
                setEditScreenRecording(patch.requires_screen_recording);
            }
            if (typeof patch.is_sales_task === 'boolean') {
                setEditSales(patch.is_sales_task);
            }
            if (patch.title) setEditTitle(displayTaskTitle(patch.title) || patch.title);
            if (patch.description) setEditDesc(layoutTaskDescription(patch.description) || patch.description);

            if (patch.due_phrase) {
                setLoading(true);
                try {
                    const base = activePromptRef.current || editTitle || 'task';
                    const res = await axios.post(`${API}/ai/quick-create-preview`, {
                        text: `${base}. This is due ${patch.due_phrase}`,
                        answers: { ...(answers || {}), 'When should this be done by?': patch.due_phrase },
                        history: threadRef.current.slice(-12).map((m) => ({ role: m.role, text: m.text })),
                        context_hint: 'User is refining a ready-to-send task in chat. Update due date from their message; keep assignees unless they clearly change who.',
                    }, { timeout: 35000 });
                    const p = res.data;
                    if (p?.due_date) setEditDue(p.due_date);
                    if (p?.priority && !patch.priority) setEditPriority(p.priority);
                    if (p?.title && !patch.title) setEditTitle(displayTaskTitle(p.title) || p.title);
                    if (p?.description && !patch.description) {
                        setEditDesc(layoutTaskDescription(p.description) || p.description);
                    }
                    setPreview((prev) => (prev ? {
                        ...prev,
                        ...p,
                        clarifying_questions: [],
                        due_date: p.due_date || prev.due_date,
                    } : p));
                } catch {
                    appendThread({
                        role: 'assistant',
                        text: 'I couldn’t update the due date - try “due Friday 5pm” or pick the date on the summary.',
                    });
                    setLoading(false);
                    return;
                } finally {
                    setLoading(false);
                }
            }

            appendThread({
                role: 'assistant',
                text: `Got it - ${notes.join(', ')}. Still ready to send whenever you are.`,
            });
            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40);
            return;
        }

        // Open-ended tweak - reparse with conversation history, keep chips when possible.
        setLoading(true);
        try {
            const base = activePromptRef.current || editTitle || 'task';
            const res = await axios.post(`${API}/ai/quick-create-preview`, {
                text: `${base}. Change request: ${parsed.text}`,
                answers: {
                    ...(answers || {}),
                    ...(editDue ? { 'When should this be done by?': editDue } : {}),
                },
                history: threadRef.current.slice(-12).map((m) => ({ role: m.role, text: m.text })),
                context_hint: 'User is refining an already-ready task in continuous chat. Apply only their change. Keep existing assignees unless they rename them. Do not ask clarifying questions unless something critical became missing.',
            }, { timeout: 35000 });
            const p = res.data;
            if (p?.intent === 'question') {
                await runQA(parsed.text, { alreadyLogged: true });
                return;
            }
            applyPreview({
                ...p,
                clarifying_questions: [],
                assignee_resolution: {
                    ...(p.assignee_resolution || {}),
                    // Prefer keeping current chips if the reparse didn't resolve anyone new
                    resolved: (p.assignee_resolution?.resolved?.length
                        ? p.assignee_resolution.resolved
                        : null),
                },
            });
            // Restore chips if reparse dropped them
            if (editAssigneesRef.current.length === 0 && (p.assignee_resolution?.resolved || []).length === 0) {
                /* applyPreview may have cleared - leave as-is */
            }
            appendThread({
                role: 'assistant',
                text: 'Updated - still ready to send whenever you are.',
            });
        } catch (err) {
            appendThread({
                role: 'assistant',
                text: err?.response?.data?.detail || 'I couldn’t apply that - try rephrasing, or hit Send as-is.',
            });
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40);
        }
    };

    const startRecurringCompose = (opts = {}) => {
        setPlusOpen(false);
        setRecurringHint(true);
        recurringHintRef.current = true;
        setComposerFocused(true);
        if (!opts.silent) {
            appendThread({
                role: 'assistant',
                text: 'Who, what, and how often?',
            });
        }
        focusInput();
    };

    // One-click capture from either Record control - must stay in the click
    // gesture so Chrome keeps user-activation for getDisplayMedia + Document PiP.
    // On iPhone, screen capture is unavailable, so Record uses the same
    // dictation session as the mic (Jarvis voice).
    const startComposerRecording = () => {
        setPlusOpen(false);
        if (needsIosScreenRecordFlow()) {
            startVoice();
            return;
        }
        recordPickerRef.current?.startRecording?.();
    };

    const runQA = async (question, { alreadyLogged } = {}) => {
        const q = (question || '').trim();
        if (!q) return;
        setAnswerLoading(true);
        setAnswerMode(null);
        setPreview(null);
        if (!alreadyLogged) {
            appendThread({ role: 'user', text: q });
            setText('');
            setActivePrompt(q);
            activePromptRef.current = q;
        }
        const history = threadRef.current.slice(-12).map((m) => ({ role: m.role, text: m.text }));
        try {
            const res = await axios.post(`${API}/voice/command`, { transcript: q, text: q, history }, { timeout: 20000 });
            const reply = res?.data?.reply || res?.data?.answer || 'I can help with that.';
            appendThread({ role: 'assistant', text: reply });
            const action = res?.data?.action;
            applyVoiceAction(action, {
                navigate,
                delay: 400,
                startRecording: () => setPlusOpen(true),
                startRecurring: () => startRecurringCompose({ silent: true }),
                openForm: () => onOpenAdvanced?.(),
                executed: res?.data?.executed,
                onExecuted: (_act, executed) => {
                    if (['create_task', 'assign_task', 'update_status'].includes(action?.type) && executed) {
                        window.dispatchEvent(new CustomEvent('tskflow:voice-executed', { detail: executed }));
                    }
                },
            });
        } catch (err) {
            const fallback =
                "Type an assignment, or ask what’s outstanding.";
            const detail = err?.response?.data?.detail;
            appendThread({
                role: 'assistant',
                text: typeof detail === 'string' && detail.length < 180 ? detail : fallback,
            });
        } finally {
            setAnswerLoading(false);
        }
    };
    runQARef.current = runQA;

    const runPreview = async (overrideText, overrideAnswers, opts = {}) => {
        const t = (overrideText ?? text).trim();
        if (!t || t.length < 2) {
            toast.error('Type a bit more.');
            return;
        }
        if (!opts.skipThreadUser) {
            const cmd = tryLocalCommand(t);
            if (cmd?.type === 'navigate') {
                toast.success(`Opening ${cmd.label}`);
                setText('');
                navigate(cmd.path);
                onRequestExit?.();
                return;
            }
            if (cmd?.type === 'start_recording') {
                setText('');
                setPlusOpen(true);
                appendThread({ role: 'user', text: t });
                appendThread({ role: 'assistant', text: 'Open the plus menu and hit Record screen.' });
                return;
            }
            if (cmd?.type === 'start_recurring') {
                setText('');
                appendThread({ role: 'user', text: t });
                startRecurringCompose();
                return;
            }
            if (cmd?.type === 'search') {
                navigate(`/dashboard?q=${encodeURIComponent(cmd.query)}`);
                toast.success(`Searching “${cmd.query}”`);
                setText('');
                onRequestExit?.();
                return;
            }
            if (cmd?.type === 'manual') {
                setText('');
                onOpenAdvanced?.();
                return;
            }
            const looksLikeQuestion = /^(how|what|where|why|when|can i|do you|is there|does|who)\b/i.test(t) && (/\?$/.test(t) || t.split(' ').length < 12);
            appendThread({ role: 'user', text: t });
            setText('');
            setAnswerMode(null);
            if (looksLikeQuestion) {
                setActivePrompt(t);
                activePromptRef.current = t;
                setPreview(null);
                await runQA(t, { alreadyLogged: true });
                return;
            }
            const pendingQs = preview?.clarifying_questions || [];
            if (preview && pendingQs.length > 0) {
                // Keep the original ask. This turn is an answer, not a new task.
                answerClarify(pendingQs[0], t, { alreadyLogged: true });
                return;
            }
            if (!looksLikeFollowupFragment(t)) {
                setActivePrompt(t);
                activePromptRef.current = t;
            } else if (!activePromptRef.current) {
                setActivePrompt(t);
                activePromptRef.current = t;
            }
            // Already ready to send - keep chatting to refine instead of wiping the card.
            const ambiguousNow = preview?.assignee_resolution?.ambiguous || [];
            const readyNow = Boolean(
                preview
                && pendingQs.length === 0
                && (editDue || preview?.due_date)
                && (editAssigneesRef.current.length > 0 || (preview?.assignee_resolution?.resolved || []).length > 0)
                && ambiguousNow.length === 0
                && !teamScopePrompt
            );
            if (readyNow) {
                await applyConfirmChatEdit(t);
                return;
            }
            setPreview(null);
        } else {
            setPreview(null);
        }
        if (promptMeansSelfAssign(t)) {
            editAssigneesRef.current = [SELF_CHIP];
            setEditAssignees([SELF_CHIP]);
            setShowPeopleDrop(false);
            setEditTitle((prev) => rewriteSelfAssignCopy(prev));
            setEditDesc((prev) => rewriteSelfAssignCopy(prev));
        } else if (!promptNamesSomeoneElse(t) && editAssigneesRef.current.length === 0) {
            const remembered = rememberedAssigneesForPrompt(t);
            if (remembered.length) {
                editAssigneesRef.current = remembered;
                setEditAssignees(remembered);
                setShowPeopleDrop(false);
            }
        }
        setLoading(true);
        try {
            const res = await axios.post(`${API}/ai/quick-create-preview`, {
                text: t,
                answers: overrideAnswers ?? answers,
                history: threadRef.current.slice(-12).map((m) => ({ role: m.role, text: m.text })),
                context_hint: recurringHintRef.current
                    ? 'User tapped Recurring in the plus menu. Treat this as a repeating series. Infer cadence if they said every/daily/weekly; otherwise ask how often in plain language.'
                    : undefined,
            }, { timeout: 35000 });
            const p = res.data;
            if (p.intent === 'question') {
                await runQA(t, { alreadyLogged: true });
                return;
            }
            applyPreview(p);
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not parse - try rephrasing');
        } finally {
            setLoading(false);
        }
    };

    runPreviewRef.current = runPreview;

    const getDictation = useCallback(() => {
        if (!dictationRef.current) {
            dictationRef.current = createDictationSession({
                getDisplayed: () => inputRef.current?.value || '',
                getSeed: () => voiceSeedRef.current,
                onTranscript: ({ shown }) => {
                    if (shown) setText(shown);
                },
            });
        }
        return dictationRef.current;
    }, []);

    const lastAssistantText = () => {
        const last = [...threadRef.current].reverse().find((m) => m.role === 'assistant');
        return (last?.text || '').trim();
    };

    const continueListening = useCallback(() => {
        if (!voiceSessionRef.current) {
            setVoicePhase('idle');
            return;
        }
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            setVoicePhase('idle');
            return;
        }
        startVoiceRef.current?.();
    }, []);

    const speakThreadReply = useCallback((text) => {
        const gen = voiceGenRef.current;
        const cleaned = String(text || '').trim();
        if (!voiceSessionRef.current || !cleaned) {
            if (voiceSessionRef.current) continueListening();
            else setVoicePhase('idle');
            return;
        }
        speakChatGptVoice(cleaned, {
            onStart: () => {
                if (gen === voiceGenRef.current) setVoicePhase('speaking');
            },
            onEnd: () => {
                if (gen !== voiceGenRef.current || !voiceSessionRef.current) {
                    setVoicePhase('idle');
                    return;
                }
                continueListening();
            },
            onError: () => {
                if (gen !== voiceGenRef.current || !voiceSessionRef.current) {
                    setVoicePhase('idle');
                    return;
                }
                continueListening();
            },
        });
    }, [continueListening]);

    const speakLastAssistantIfVoice = useCallback(() => {
        if (!voiceSessionRef.current) {
            setVoicePhase('idle');
            return;
        }
        const reply = lastAssistantText();
        if (reply) speakThreadReply(reply);
        else continueListening();
    }, [continueListening, speakThreadReply]);

    const handleVoiceTurn = useCallback(async (payload) => {
        const t = String(payload || '').trim();
        if (!t) {
            continueListening();
            return;
        }
        setVoicePhase('thinking');
        setText('');
        try {
            if (previewRef.current) {
                await runPreviewRef.current?.(t);
                speakLastAssistantIfVoice();
                return;
            }
            if (shouldComposeTask(t)) {
                await runPreviewRef.current?.(t);
                speakLastAssistantIfVoice();
                return;
            }
            await runQARef.current?.(t, { alreadyLogged: false });
            speakLastAssistantIfVoice();
        } catch {
            speakThreadReply("Sorry, I missed that. Try once more.");
        }
    }, [continueListening, speakLastAssistantIfVoice, speakThreadReply]);
    handleVoiceTurnRef.current = handleVoiceTurn;

    const finishVoiceSession = useCallback((opts = {}) => {
        const { send = true } = opts;
        const payload = getDictation().stop({ commit: false });
        setListening(false);
        if (send && payload) {
            handleVoiceTurnRef.current?.(payload);
        }
        return payload;
    }, [getDictation]);

    const endVoiceConversation = useCallback(() => {
        voiceGenRef.current += 1;
        voiceSessionRef.current = false;
        setVoiceSession(false);
        stopChatGptVoice();
        getDictation().stop({ commit: false });
        setListening(false);
        setVoicePhase('idle');
    }, [getDictation]);

    const stopVoice = useCallback(() => {
        finishVoiceSession({ send: false });
    }, [finishVoiceSession]);

    const startVoice = useCallback(() => {
        if (!voiceSessionRef.current) {
            voiceSessionRef.current = true;
            setVoiceSession(true);
        }
        stopChatGptVoice();
        voiceSeedRef.current = (inputRef.current?.value || '').trim();
        const result = getDictation().start({
            onCommit: (payload) => {
                setListening(false);
                handleVoiceTurnRef.current?.(payload);
            },
            onError: (error) => {
                setListening(false);
                setVoicePhase('idle');
                if (error === 'not-allowed') {
                    toast.error('Microphone permission is needed for voice.');
                    endVoiceConversation();
                } else if (voiceSessionRef.current) {
                    continueListening();
                }
            },
        });
        if (!result.started) {
            setListening(false);
            setVoicePhase('idle');
            toast.error(result.reason === 'unsupported'
                ? 'Voice isn’t available in this browser. Try Chrome or Safari.'
                : 'Couldn’t start the microphone.');
            return;
        }
        setComposerFocused(true);
        setListening(true);
        setVoicePhase('listening');
    }, [continueListening, endVoiceConversation, getDictation]);
    startVoiceRef.current = startVoice;

    const toggleVoice = useCallback(() => {
        if (voicePhase === 'speaking') {
            stopChatGptVoice();
            startVoice();
            return;
        }
        if (listening) {
            const payload = finishVoiceSession({ send: false });
            if (payload) handleVoiceTurnRef.current?.(payload);
            else endVoiceConversation();
            return;
        }
        startVoice();
    }, [endVoiceConversation, finishVoiceSession, listening, startVoice, voicePhase]);

    useEffect(() => {
        const onStartVoice = () => startVoice();
        window.addEventListener('tskflow:start-prompt-voice', onStartVoice);
        return () => window.removeEventListener('tskflow:start-prompt-voice', onStartVoice);
    }, [startVoice]);

    useEffect(() => () => {
        endVoiceConversation();
    }, [endVoiceConversation]);

    useEffect(() => {
        const killMic = () => {
            if (document.visibilityState === 'hidden') endVoiceConversation();
        };
        const onHide = () => endVoiceConversation();
        document.addEventListener('visibilitychange', killMic);
        window.addEventListener('pagehide', onHide);
        return () => {
            document.removeEventListener('visibilitychange', killMic);
            window.removeEventListener('pagehide', onHide);
        };
    }, [endVoiceConversation]);

    const removeAssignee = (idx) => {
        setEditAssignees((prev) => prev.filter((_, i) => i !== idx));
    };

    const answerClarify = (question, value, opts = {}) => {
        const v = (value || '').trim();
        if (!v) return;
        if (!opts.alreadyLogged) {
            appendThread({ role: 'user', text: v });
        }
        const classified = classifyClarifyAnswer(question, v);
        const next = { ...answers };
        if (classified.when) {
            next['When should this be done by?'] = classified.when;
        }
        if (classified.who) {
            next[question && /who|own|assign/i.test(question) ? question : 'Who should this be assigned to?'] = classified.who;
        } else if (classified.cadence && !classified.when) {
            next[question || 'How often should this repeat?'] = classified.cadence;
        } else if (classified.extra && !classified.when) {
            next[question] = classified.extra;
            const seed = activePromptRef.current || activePrompt || '';
            if (seed && !looksLikeFollowupFragment(classified.extra)) {
                const merged = `${seed.replace(/[. ]+$/, '')}. ${classified.extra}`;
                activePromptRef.current = merged;
                setActivePrompt(merged);
            }
        } else if (!classified.when && !classified.who) {
            next[question] = v;
        }
        setAnswers(next);
        setClarifyAnswer('');
        setPeopleSearch('');
        const prompt = activePromptRef.current || activePrompt || text;
        runPreview(prompt, next, { skipThreadUser: true });
    };

    const pickPerson = (person) => {
        const isSelf = person.id === 'self' || (user?.id && person.id === user.id);
        const isEmailOnly = !isSelf && (String(person.id || '').startsWith('email_') || person.is_invited);
        const chip = isSelf
            ? { kind: 'user', id: 'self', name: 'Me' }
            : isEmailOnly
                ? { kind: 'email', email: person.email, name: person.name || person.email }
                : { kind: 'user', id: person.id, name: person.name, email: person.email };
        setEditAssignees((prev) => {
            const key = chip.id || chip.email;
            const next = prev.some((a) => (a.id && a.id === key) || (a.email && a.email === key))
                ? prev
                : [...prev, chip];
            editAssigneesRef.current = next;
            writeLastAssignees(next);
            return next;
        });
        setPeopleSearch('');
        setShowPeopleDrop(false);
        setClarifyAnswer('');
        if (isSelf) {
            setEditTitle((t) => rewriteSelfAssignCopy(t));
            setEditDesc((d) => rewriteSelfAssignCopy(d));
        }
        const label = person.name || person.email;
        const whoQ = (preview?.clarifying_questions || []).find((q) => /who|own|assign/i.test(q || ''))
            || 'Who should own this task?';
        const nextAnswers = label ? { ...answers, [whoQ]: label } : { ...answers };
        if (label) setAnswers(nextAnswers);

        const hasDue = Boolean(editDue || preview?.due_date);
        // Keep the flow in-dialog: drop the "who" question; ask "when" if still missing.
        setPreview((p) => {
            if (!p) return p;
            const qs = (p.clarifying_questions || []).filter((q) => !/who|own|assign/i.test(q || ''));
            if (!hasDue && !qs.some((q) => /when|due|deadline/i.test(q || ''))) {
                qs.push('When should this be done by?');
            }
            return { ...p, clarifying_questions: qs };
        });

        // Stay on the confirm message - do not re-ask who or reopen the picker.
        if (!hasDue) {
            setShowPeopleDrop(false);
            // Due is still missing - keep focus in the main composer for a seamless answer.
            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
        }
    };

    const reset = useCallback((opts = {}) => {
        setText('');
        setPreview(null);
        setAnswers({});
        setEditAssignees([]);
        setEditTitle('');
        setEditDesc('');
        setEditDue('');
        setEditPriority('Medium');
        setEditCriteria('');
        setEditSales(false);
        setEditScreenRecording(false);
        setAttachments([]);
        setPlusOpen(false);
        setFormatOpen(false);
        setTeamScopePrompt(null);
        setEditingField(null);
        setClarifyAnswer('');
        setPeopleSearch('');
        setShowPeopleDrop(false);
        setMention(null);
        setShowNewPersonEmail(false);
        setNewPersonEmail('');
        setAnswerMode(null);
        if (!opts.keepThread) {
            setThread([]);
            threadRef.current = [];
        }
        setActivePrompt('');
        activePromptRef.current = '';
        nudgeSentRef.current = false;
        setRecurringHint(false);
        recurringHintRef.current = false;
        stopVoice();
        focusInput();
    }, [focusInput, stopVoice]);

    useEffect(() => {
        const onReset = () => {
            endVoiceConversation();
            reset();
        };
        window.addEventListener('tskflow:ai-dock-reset', onReset);
        return () => window.removeEventListener('tskflow:ai-dock-reset', onReset);
    }, [endVoiceConversation, reset]);

    useEffect(() => {
        if (!Array.isArray(externalAttachments) || !externalAttachments.length) return;
        setAttachments((prev) => {
            const keys = new Set(prev.map((a) => a.id || a.storage_path));
            const merged = [...prev];
            externalAttachments.forEach((r) => {
                const key = r?.id || r?.storage_path;
                if (key && !keys.has(key)) merged.push(r);
            });
            return merged;
        });
        onExternalAttachmentsConsumed?.();
        toast.success('Recording attached - describe the task and send');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [externalAttachments]);

    useEffect(() => {
        registerAttachHandler?.((refs) => {
            if (!Array.isArray(refs) || !refs.length) return;
            setAttachments((prev) => {
                const keys = new Set(prev.map((a) => a.id || a.storage_path));
                const merged = [...prev];
                refs.forEach((r) => {
                    const key = r?.id || r?.storage_path;
                    if (key && !keys.has(key)) merged.push(r);
                });
                return merged;
            });
        });
    }, [registerAttachHandler]);

    const flattenAssignees = () => {
        const targets = [];
        for (const a of editAssignees) {
            if (a.kind === 'user' || a.id === 'self') {
                targets.push(a.id === 'self' ? 'self' : a.id);
                continue;
            }
            if (a.kind === 'email' && a.email) {
                targets.push(a.email);
                continue;
            }
            if (a.kind === 'group' || a.kind === 'team') {
                const members = Array.isArray(a.members) ? a.members.filter(Boolean) : [];
                const emails = Array.isArray(a.emails) ? a.emails.filter(Boolean) : [];
                // Prefer registered member ids; always include emails (empty members used to block send)
                if (members.length) {
                    for (const m of members) targets.push(m);
                }
                for (const e of emails) {
                    // Avoid double-counting when members already hold the same id
                    if (!members.includes(e)) targets.push(e);
                }
            }
        }
        return Array.from(new Set(targets)).filter(Boolean);
    };

    const wrapSelection = (before, after = before) => {
        const el = inputRef.current;
        const start = el?.selectionStart ?? text.length;
        const end = el?.selectionEnd ?? text.length;
        const selected = text.slice(start, end) || 'text';
        const next = `${text.slice(0, start)}${before}${selected}${after}${text.slice(end)}`;
        setText(next);
        setFormatOpen(true);
        setTimeout(() => {
            if (!el) return;
            el.focus();
            const caret = start + before.length + selected.length + after.length;
            try { el.setSelectionRange(caret, caret); } catch (_) { /* noop */ }
            resizePrompt();
        }, 0);
    };

    const prefixLine = (prefix) => {
        const el = inputRef.current;
        const start = el?.selectionStart ?? 0;
        const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
        const next = `${text.slice(0, lineStart)}${prefix}${text.slice(lineStart)}`;
        setText(next);
        setFormatOpen(true);
        setTimeout(() => {
            if (!el) return;
            el.focus();
            const caret = start + prefix.length;
            try { el.setSelectionRange(caret, caret); } catch (_) { /* noop */ }
            resizePrompt();
        }, 0);
    };

    const handlePasteImage = async (e) => {
        const items = Array.from(e.clipboardData?.items || []);
        const images = items.filter((it) => it.type && it.type.startsWith('image/'));
        if (!images.length) {
            const html = e.clipboardData?.getData?.('text/html');
            if (html && /<(strong|b|em|i|ul|ol|li|p|br|div)\b/i.test(html)) {
                e.preventDefault();
                const md = htmlToMarkdown(html);
                if (!md) return;
                const el = e.target;
                const start = el?.selectionStart ?? text.length;
                const end = el?.selectionEnd ?? text.length;
                const next = `${text.slice(0, start)}${md}${text.slice(end)}`;
                setText(next);
                setTimeout(() => {
                    try { el?.setSelectionRange(start + md.length, start + md.length); } catch (_) { /* noop */ }
                    resizePrompt();
                }, 0);
            }
            return;
        }
        e.preventDefault();
        setUploadingPaste(true);
        try {
            for (const item of images) {
                const file = item.getAsFile();
                if (!file) continue;
                const name = file.name && file.name !== 'image.png'
                    ? file.name
                    : `screenshot-${Date.now()}.png`;
                const ref = await uploadBlob(file, name, file.type || 'image/png');
                setAttachments((prev) => [...prev, ref]);
            }
            toast.success('Screenshot attached');
            setShowAttachPrompt(false);
        } catch (_) {
            toast.error('Could not attach screenshot');
        } finally {
            setUploadingPaste(false);
        }
    };

    useEffect(() => {
        if (!showAttachPrompt) return undefined;
        const t = setTimeout(() => pasteZoneRef.current?.focus?.(), 50);
        return () => clearTimeout(t);
    }, [showAttachPrompt]);

    useEffect(() => {
        if (!plusOpen) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setPlusOpen(false);
            }
        };
        const onPtr = (e) => {
            if (!plusRef.current?.contains(e.target)) setPlusOpen(false);
        };
        window.addEventListener('keydown', onKey, true);
        document.addEventListener('mousedown', onPtr);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            document.removeEventListener('mousedown', onPtr);
        };
    }, [plusOpen]);

    const handleAttachFiles = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setUploadingPaste(true);
        try {
            for (const file of files) {
                const ref = await uploadBlob(file, file.name, file.type);
                setAttachments((prev) => [...prev, ref]);
            }
        } catch (_) {
            toast.error('Upload failed');
        } finally {
            setUploadingPaste(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const pickTeamScope = (opt) => {
        if (!opt) return;
        setEditAssignees([{
            kind: opt.kind || 'team',
            id: opt.id,
            name: opt.label || opt.name,
            members: opt.members || [],
            emails: opt.emails || [],
            member_count: opt.member_count || (opt.members || []).length || (opt.emails || []).length,
            member_names: opt.member_names,
            alternates: opt.alternates,
            needs_scope_pick: false,
        }]);
        setTeamScopePrompt(null);
        const hasDue = Boolean(editDue || preview?.due_date);
        setPreview((p) => {
            if (!p) return p;
            const qs = (p.clarifying_questions || []).filter(
                (q) => !/scope|direct reports|everyone under|managers/i.test(q || '')
            );
            if (!hasDue && !qs.some((q) => /when|due|deadline/i.test(q || ''))) {
                qs.push('When should this be done by?');
            }
            return {
                ...p,
                clarifying_questions: qs,
                assignee_resolution: {
                    ...(p.assignee_resolution || {}),
                    needs_team_scope: false,
                    resolved: [{
                        kind: opt.kind || 'team',
                        id: opt.id,
                        name: opt.label || opt.name,
                        members: opt.members || [],
                        member_count: opt.member_count || (opt.members || []).length,
                    }],
                },
            };
        });
    };

    const send = async () => {
        const unique = flattenAssignees();

        if (!editTitle || !editTitle.trim()) {
            toast.error('Please give the task a title');
            appendThread({ role: 'assistant', text: 'What should I call this task?' });
            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40);
            return;
        }
        if (teamScopePrompt) {
            toast.error('Pick who this goes to');
            appendThread({ role: 'assistant', text: 'Your managers, or everyone under you, including their teams?' });
            return;
        }
        if (unique.length === 0) {
            toast.error('Please pick at least one assignee');
            appendThread({
                role: 'assistant',
                text: preview?.assignee_resolution?.needs_team_setup
                    ? 'Who should this go to? Set up your team, or pick people.'
                    : 'Who should this be assigned to?',
            });
            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40);
            return;
        }
        if (!editDue) {
            toast.error('Please pick a due date');
            appendThread({ role: 'assistant', text: 'When should this be done by?' });
            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40);
            return;
        }

        setSending(true);
        try {
            const rec = preview?.recurring;
            const isRecurring = rec && rec.is_recurring && rec.frequency;
            const criteria = (editCriteria || '').trim() || undefined;
            const timeOfDay = rec?.time_of_day || (editDue ? editDue.slice(11, 16) : '09:00');
            if (isRecurring) {
                const rule = {
                    frequency: rec.frequency === 'weekdays' ? 'weekdays' : rec.frequency,
                    interval: rec.frequency === 'biweekly' ? 2 : 1,
                    weekdays: rec.days_of_week || null,
                    end_type: rec.end_type || 'never',
                    end_date: rec.end_date || null,
                    end_count: rec.end_count || null,
                };
                if (rec.frequency === 'weekdays') {
                    rule.weekdays = [0, 1, 2, 3, 4];
                }
                const payloads = unique.map((aid) => ({
                    title: editTitle.trim(),
                    description: layoutTaskDescription(editDesc) || '',
                    assigned_to: aid,
                    priority: editPriority,
                    start_due_date: editDue.includes('T')
                        ? `${editDue.slice(0, 10)}T${timeOfDay}`
                        : `${editDue}T${timeOfDay}`,
                    is_sales_task: !!editSales,
                    requires_screen_recording: !!editScreenRecording,
                    auto_reminder: true,
                    attachments: attachments.length ? attachments : undefined,
                    recurrence: rule,
                }));
                await Promise.all(payloads.map((p) => axios.post(`${API}/recurring`, p)));
                toast.success(`Recurring series set up for ${unique.length} ${unique.length === 1 ? 'person' : 'people'}`);
            } else {
                const sales = !!editSales;
                const payload = {
                    title: editTitle.trim(),
                    description: layoutTaskDescription(editDesc) || '',
                    assigned_to: unique,
                    due_date: editDue,
                    priority: editPriority,
                    is_sales_task: sales,
                    category: sales ? 'Sales' : undefined,
                    requires_screen_recording: !!editScreenRecording,
                    success_criteria: criteria,
                    attachments: attachments.length ? attachments : undefined,
                    auto_reminder: true,
                };
                if (unique.length === 1) {
                    await axios.post(`${API}/tasks`, { ...payload, assigned_to: unique[0] });
                } else {
                    await axios.post(`${API}/tasks/bulk`, payload);
                }
            }
            writeLastAssignees(editAssignees);
            const selfAssign = assigneesAreSelf(editAssignees, user?.id);
            const names = editAssignees.map((a) => a.name).filter(Boolean).join(', ') || 'your team';
            if (!isRecurring) {
                toast.success(sentTaskFollowupMessage({ names, isSelf: selfAssign }));
            }
            appendThread({
                role: 'assistant',
                text: sentTaskFollowupMessage({
                    names,
                    isSelf: selfAssign,
                    slackConnected: slackStatus.connected,
                    canManageSlack: slackStatus.canManage,
                }),
            });
            reset({ keepThread: true });
            if (voiceSessionRef.current) speakLastAssistantIfVoice();
            onCreated?.();
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to create task');
        } finally {
            setSending(false);
        }
    };
    sendRef.current = send;

    const swapAlternate = (idx, alt) => {
        setEditAssignees((prev) => prev.map((a, i) => (i === idx ? { ...alt, kind: alt.kind || 'team' } : a)));
    };

    const clarifying = preview?.clarifying_questions || [];
    const ambiguous = preview?.assignee_resolution?.ambiguous || [];
    const unresolved = preview?.assignee_resolution?.unresolved || [];
    const needsAmbiguousPick = ambiguous.length > 0 && editAssignees.length === 0;
    const isWhoClarify = clarifying.length > 0 && /who|own|assign/i.test(clarifying[0] || '');
    const isWhenClarify = clarifying.length > 0 && /when|due|deadline|often|repeat/i.test(clarifying[0] || '');
    const selfAssignConfirm = assigneesAreSelf(editAssignees, user?.id);
    const readyToConfirm =
        !!preview &&
        clarifying.length === 0 &&
        !!editDue &&
        editAssignees.length > 0 &&
        !needsAmbiguousPick &&
        !teamScopePrompt;

    // Keep parent in sync so drafts can save as soon as a conversation starts.
    useEffect(() => {
        onSnapshot?.({
            text,
            activePrompt,
            editTitle,
            editDesc,
            editDue,
            editPriority,
            editAssignees,
            editCriteria,
            sending,
            preview: !!preview,
            answerMode: !!answerMode || thread.length > 0,
            thread: thread.length,
            threadTexts: thread.map((m) => m.text).filter(Boolean).slice(0, 12),
            attachments,
            focused: composerFocused || listening || voiceSession,
        });
    }, [text, activePrompt, editTitle, editDesc, editDue, editPriority, editAssignees, editCriteria, sending, preview, answerMode, thread, attachments, composerFocused, listening, voiceSession, onSnapshot]);
    const peopleQuery = (peopleSearch || '').replace(/^@/, '').trim().toLowerCase();
    const filteredPeople = [
        { id: 'self', name: 'Me', email: '' },
        ...people,
    ].filter((u) => {
        if (!peopleQuery) return true;
        return (u.name || '').toLowerCase().includes(peopleQuery) || (u.email || '').toLowerCase().includes(peopleQuery);
    }).slice(0, 8);

    const updatePeopleDropPos = useCallback(() => {
        const el = peopleAnchorRef.current || clarifyRef.current;
        if (!el || !showPeopleDrop) {
            setPeopleDropPos(null);
            return;
        }
        const r = el.getBoundingClientRect();
        const pad = 8;
        const spaceBelow = window.innerHeight - r.bottom - pad;
        const spaceAbove = r.top - pad;
        // Composer sits near the bottom - open upward so groups stay on-screen.
        const openUp = spaceBelow < 260 || spaceAbove > spaceBelow;
        const maxHeight = Math.max(160, Math.min(320, openUp ? spaceAbove - 4 : spaceBelow - 4));
        setPeopleDropPos({
            left: Math.max(12, r.left),
            width: Math.min(Math.max(r.width, 280), window.innerWidth - 24),
            maxHeight,
            openUp,
            top: openUp ? undefined : r.bottom + 6,
            bottom: openUp ? Math.max(12, window.innerHeight - r.top + 6) : undefined,
        });
    }, [showPeopleDrop]);

    useEffect(() => {
        if (!showPeopleDrop) {
            setPeopleDropPos(null);
            return undefined;
        }
        updatePeopleDropPos();
        const onMove = () => updatePeopleDropPos();
        const onDoc = (e) => {
            const t = e.target;
            if (peopleAnchorRef.current?.contains(t)) return;
            if (t?.closest?.('[data-testid="clarify-people-dropdown"]')) return;
            setShowPeopleDrop(false);
        };
        window.addEventListener('resize', onMove);
        window.addEventListener('scroll', onMove, true);
        document.addEventListener('mousedown', onDoc);
        return () => {
            window.removeEventListener('resize', onMove);
            window.removeEventListener('scroll', onMove, true);
            document.removeEventListener('mousedown', onDoc);
        };
    }, [showPeopleDrop, peopleSearch, updatePeopleDropPos]);

    const formatDue = (iso) => {
        if (!iso) return null;
        try {
            return format(parseISO(iso), "EEE MMM d 'at' h:mm a");
        } catch {
            return iso.replace('T', ' ');
        }
    };

    const showCommandChips = false;
    const showPromptExample = !text.trim() && !preview && !answerMode && thread.length === 0 && !listening && !voiceSession;
    const promptExample = PROMPT_EXAMPLES[exampleIndex] || PROMPT_EXAMPLES[0];

    useEffect(() => {
        if (!showPromptExample) return undefined;
        const id = setInterval(() => {
            setExampleIndex((i) => nextPromptExampleIndex(i));
        }, PROMPT_EXAMPLE_INTERVAL_MS);
        return () => clearInterval(id);
    }, [showPromptExample]);

    const personCount = editAssignees.reduce((n, a) => n + (a.member_count || a.members?.length || 1), 0);

    const priorityColor = {
        Low: 'bg-slate-100 text-slate-700',
        Medium: 'bg-blue-100 text-blue-700',
        High: 'bg-amber-100 text-amber-800',
        Urgent: 'bg-red-100 text-red-700',
    }[editPriority] || 'bg-slate-100 text-slate-700';

    const chipColor = (kind) => ({
        user: 'bg-teal-100 text-teal-800 border-teal-200',
        email: 'bg-slate-100 text-slate-700 border-slate-200',
        group: 'bg-teal-100 text-teal-900 border-teal-200',
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
                                    Full form
                                </button>
                            </div>
                        )}
                        {(thread.length > 0 || preview || loading || answerLoading || voiceSession) && (
                            <div className="ai-thread" data-testid="ai-chat-thread">
                                {thread.map((m) => (
                                    <div
                                        key={m.id}
                                        className={m.role === 'user' ? 'ai-thread-user' : 'ai-thread-assistant'}
                                        data-testid={m.role === 'user' ? 'ai-thread-user' : 'ai-thread-assistant'}
                                    >
                                        {m.text}
                                    </div>
                                ))}
                                {voiceSession && (
                                    <p
                                        className="text-[11px] text-slate-500 px-1 pt-0.5"
                                        data-testid="ai-voice-status"
                                        aria-live="polite"
                                    >
                                        {voicePhase === 'listening' ? 'Listening…'
                                            : voicePhase === 'thinking' ? 'Thinking…'
                                                : voicePhase === 'speaking' ? 'Speaking…'
                                                    : 'Voice on · tap the mic to stop'}
                                    </p>
                                )}
                        {preview && (
                            <div className="space-y-2" data-testid="ai-preview-card">
                                <div className="space-y-2">
                                    {teamScopePrompt && (
                                        <div className="flex justify-start" data-testid="ai-team-scope">
                                            <div className="w-full max-w-[95%] rounded-2xl rounded-bl-md bg-muted/70 border border-border px-3.5 py-3 space-y-2">
                                                <p className="text-sm font-medium text-foreground">Who should this go to?</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {(teamScopePrompt.options || []).map((opt) => (
                                                        <button
                                                            key={opt.id || opt.label}
                                                            type="button"
                                                            onClick={() => pickTeamScope(opt)}
                                                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                                                            data-testid={`team-scope-${opt.id}`}
                                                        >
                                                            <Users className="w-3.5 h-3.5" />
                                                            {opt.label || opt.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {clarifying.length > 0 && !isWhenClarify && (
                                        <div className="flex justify-start" data-testid="ai-clarifying">
                                            <div className="w-full max-w-[95%] rounded-2xl rounded-bl-md bg-muted/70 border border-border px-3.5 py-3 space-y-2">
                                                {/scope|direct reports|everyone under/i.test(clarifying[0] || '') && teamScopePrompt ? (
                                                    <>
                                                        <div className="flex items-start gap-2">
                                                            <MessageCircleQuestion className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                                            <p className="text-sm font-medium text-foreground" data-testid="ai-clarify-question">{clarifying[0]}</p>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 ml-6">
                                                            {(teamScopePrompt.options || []).map((opt) => (
                                                                <button
                                                                    key={`q-${opt.id || opt.label}`}
                                                                    type="button"
                                                                    onClick={() => pickTeamScope(opt)}
                                                                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                                                                >
                                                                    <Users className="w-3.5 h-3.5" />
                                                                    {opt.label || opt.name}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </>
                                                ) : isWhoClarify ? (
                                                    <>
                                                        <div className="flex items-start gap-2">
                                                            <MessageCircleQuestion className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                                            <p className="text-sm font-medium text-foreground" data-testid="ai-clarify-question">{clarifying[0]}</p>
                                                        </div>
                                                        {(preview?.assignee_resolution?.needs_team_setup || /set up your team/i.test(clarifying[0] || '')) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => navigate('/team')}
                                                                className="ml-6 text-xs font-medium text-teal-700 hover:text-teal-900 underline underline-offset-2"
                                                                data-testid="ai-setup-team"
                                                            >
                                                                Set up your team
                                                            </button>
                                                        )}
                                                    <div className="relative ml-6" ref={peopleAnchorRef}>
                                                        <Input
                                                            ref={clarifyRef}
                                                            value={peopleSearch}
                                                            onChange={(e) => {
                                                                const v = e.target.value;
                                                                setPeopleSearch(v);
                                                                setShowPeopleDrop(true);
                                                            }}
                                                            onFocus={() => setShowPeopleDrop(true)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Escape') {
                                                                    e.preventDefault();
                                                                    setShowPeopleDrop(false);
                                                                }
                                                            }}
                                                            placeholder="Search people or groups"
                                                            className="h-9 text-sm rounded-lg border-border bg-background text-foreground"
                                                            data-testid="clarify-people-search"
                                                            disabled={loading || sending}
                                                            autoComplete="off"
                                                        />
                                                        {showPeopleDrop && peopleDropPos && createPortal(
                                                            <div
                                                                style={{
                                                                    position: 'fixed',
                                                                    left: peopleDropPos.left,
                                                                    width: peopleDropPos.width,
                                                                    top: peopleDropPos.openUp ? undefined : peopleDropPos.top,
                                                                    bottom: peopleDropPos.openUp ? peopleDropPos.bottom : undefined,
                                                                    maxHeight: peopleDropPos.maxHeight,
                                                                    zIndex: 220,
                                                                }}
                                                                className="ai-people-dropdown overflow-y-auto overscroll-contain rounded-2xl border py-1.5 px-1.5 clean-scroll"
                                                                data-testid="clarify-people-dropdown"
                                                                role="listbox"
                                                                onPointerDown={(e) => e.stopPropagation()}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                            >
                                                                {(() => {
                                                                    const clarifyGroups = groups.filter(
                                                                        (g) => !peopleQuery || (g.name || '').toLowerCase().includes(peopleQuery)
                                                                    );
                                                                    return (
                                                                        <>
                                                                            {filteredPeople.length === 0 && clarifyGroups.length === 0 && (
                                                                                <p className="px-2.5 py-3 text-xs text-muted-foreground">No matches - try an email or group</p>
                                                                            )}
                                                                            {clarifyGroups.length > 0 && (
                                                                                <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" data-testid="clarify-groups-header">
                                                                                    Groups
                                                                                </div>
                                                                            )}
                                                                            {clarifyGroups.map((g) => (
                                                                                <button
                                                                                    key={`cg-${g.id}`}
                                                                                    type="button"
                                                                                    onMouseDown={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        addAssigneeChip({
                                                                                            kind: 'group',
                                                                                            id: g.id,
                                                                                            name: g.name,
                                                                                            emails: g.emails || [],
                                                                                            members: g.emails || [],
                                                                                            member_count: (g.emails || []).length,
                                                                                        });
                                                                                        setShowPeopleDrop(false);
                                                                                        setPeopleSearch('');
                                                                                        const whoQ = (preview?.clarifying_questions || []).find((q) => /who|own|assign/i.test(q || ''))
                                                                                            || 'Who should own this task?';
                                                                                        const nextAnswers = { ...answers, [whoQ]: g.name };
                                                                                        setAnswers(nextAnswers);
                                                                                        setPreview((p) => {
                                                                                            if (!p) return p;
                                                                                            const qs = (p.clarifying_questions || []).filter((q) => !/who|own|assign/i.test(q || ''));
                                                                                            if (!(editDue || preview?.due_date) && !qs.some((q) => /when|due|deadline/i.test(q || ''))) {
                                                                                                qs.push('When should this be done by?');
                                                                                            }
                                                                                            return { ...p, clarifying_questions: qs };
                                                                                        });
                                                                                        if (!(editDue || preview?.due_date)) {
                                                                                            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
                                                                                        }
                                                                                    }}
                                                                                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-muted flex items-center gap-2.5"
                                                                                    role="option"
                                                                                    data-testid={`clarify-pick-group-${g.id}`}
                                                                                >
                                                                                    <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                                                                                        <Users className="w-3.5 h-3.5" />
                                                                                    </span>
                                                                                    <span className="min-w-0 flex-1">
                                                                                        <span className="text-sm font-medium text-foreground block truncate">{g.name}</span>
                                                                                        <span className="text-[11px] text-muted-foreground">Group · {(g.emails || []).length}</span>
                                                                                    </span>
                                                                                </button>
                                                                            ))}
                                                                            {filteredPeople.length > 0 && clarifyGroups.length > 0 && (
                                                                                <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                                                    People
                                                                                </div>
                                                                            )}
                                                                            {filteredPeople.map((u) => (
                                                                                <button
                                                                                    key={u.id || u.email}
                                                                                    type="button"
                                                                                    onMouseDown={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        pickPerson(u);
                                                                                    }}
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                    }}
                                                                                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-muted flex items-center gap-2.5"
                                                                                    role="option"
                                                                                    data-testid={`clarify-pick-${u.id || u.email}`}
                                                                                >
                                                                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                                                                        u.id === 'self' ? 'bg-teal-700 text-white text-xs font-semibold' : 'bg-muted text-muted-foreground'
                                                                                    }`}>
                                                                                        {u.id === 'self' ? 'Me' : <UserIcon className="w-3.5 h-3.5" />}
                                                                                    </span>
                                                                                    <span className="min-w-0 flex-1">
                                                                                        <span className="text-sm font-medium text-foreground block truncate">{u.name}</span>
                                                                                        {u.email ? <span className="text-[11px] text-muted-foreground truncate block">{u.email}</span> : null}
                                                                                    </span>
                                                                                </button>
                                                                            ))}
                                                                            {peopleSearch.includes('@') && peopleSearch.includes('.') && !filteredPeople.some((u) => (u.email || '').toLowerCase() === peopleSearch.replace(/^@/, '').trim().toLowerCase()) && (
                                                                                <button
                                                                                    type="button"
                                                                                    onMouseDown={(e) => {
                                                                                        e.preventDefault();
                                                                                        const email = peopleSearch.replace(/^@/, '').trim();
                                                                                        pickPerson({ id: `email_${email}`, name: email.split('@')[0], email, is_invited: true });
                                                                                    }}
                                                                                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-muted text-sm text-foreground mt-0.5 flex items-center gap-2.5"
                                                                                >
                                                                                    <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
                                                                                        <Plus className="w-3.5 h-3.5" />
                                                                                    </span>
                                                                                    <span className="min-w-0">
                                                                                        <span className="font-medium block truncate">Assign {peopleSearch.replace(/^@/, '').trim()}</span>
                                                                                        <span className="text-[11px] text-slate-500">Invite by email</span>
                                                                                    </span>
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                    );
                                                                })()}
                                                            </div>,
                                                            document.body
                                                        )}
                                                    </div>
                                                    </>
                                                ) : (
                                                    <div className="flex gap-2">
                                                        <Input
                                                            ref={clarifyRef}
                                                            value={clarifyAnswer}
                                                            onChange={(e) => setClarifyAnswer(e.target.value)}
                                                            placeholder="Your answer…"
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' && clarifyAnswer.trim()) {
                                                                    e.preventDefault();
                                                                    answerClarify(clarifying[0], clarifyAnswer);
                                                                }
                                                            }}
                                                            className="h-9 text-sm rounded-lg border-border bg-background text-foreground"
                                                            data-testid="clarify-answer-0"
                                                            disabled={loading || sending}
                                                        />
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() => answerClarify(clarifying[0], clarifyAnswer)}
                                                            disabled={loading || sending || !clarifyAnswer.trim()}
                                                            className="rounded-lg"
                                                        >
                                                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reply'}
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {ambiguous.length > 0 && clarifying.length === 0 && editAssignees.length === 0 && (
                                        <div className="flex justify-start">
                                            <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-muted/70 border border-border px-3.5 py-3 space-y-2">
                                                <p className="text-sm font-medium text-foreground">Who did you mean?</p>
                                                {ambiguous.map((amb, i) => {
                                                    // Deduplicate identical name/email candidates
                                                    const seen = new Set();
                                                    const unique = (amb.candidates || []).filter((c) => {
                                                        const key = `${(c.email || '').toLowerCase()}|${(c.name || '').toLowerCase()}|${c.id}`;
                                                        if (seen.has(key) || seen.has(c.id)) return false;
                                                        seen.add(key);
                                                        seen.add(c.id);
                                                        return true;
                                                    });
                                                    // If still same display name, show email to distinguish
                                                    const nameCounts = unique.reduce((m, c) => {
                                                        const n = (c.name || '').toLowerCase();
                                                        m[n] = (m[n] || 0) + 1;
                                                        return m;
                                                    }, {});
                                                    return (
                                                        <div key={i} className="flex flex-wrap items-center gap-1.5">
                                                            {unique.map((c) => (
                                                                <button
                                                                    key={c.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        addAssigneeChip({ kind: 'user', id: c.id, name: c.name, email: c.email });
                                                                        // Clear ambiguous so re-clicks don't stack duplicates
                                                                        setPreview((prev) => (prev ? {
                                                                            ...prev,
                                                                            assignee_resolution: {
                                                                                ...(prev.assignee_resolution || {}),
                                                                                ambiguous: [],
                                                                                resolved: [
                                                                                    ...((prev.assignee_resolution?.resolved) || []),
                                                                                    { kind: 'user', id: c.id, name: c.name, email: c.email },
                                                                                ],
                                                                            },
                                                                        } : prev));
                                                                    }}
                                                                    className="rounded-full bg-background border border-border hover:bg-muted px-2.5 py-1 text-xs text-foreground"
                                                                    data-testid={`ambiguous-pick-${c.id}`}
                                                                >
                                                                    {c.name}
                                                                    {nameCounts[(c.name || '').toLowerCase()] > 1 && c.email
                                                                        ? ` · ${c.email}`
                                                                        : ''}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {readyToConfirm && (
                                        <div className="flex justify-start">
                                            <div className="max-w-[95%] w-full rounded-2xl rounded-bl-md bg-white border border-slate-200 px-3.5 py-3 space-y-3" data-testid="ai-confirm-summary">
                                                {attachments.length > 0 && (
                                                    <SlackAttachGrid
                                                        attachments={attachments}
                                                        compact
                                                        testId="ai-confirm-attachments"
                                                    />
                                                )}

                                                <p className="text-[15px] leading-7 text-slate-800" data-testid="ai-confirm-message">
                                                    {selfAssignConfirm ? (
                                                        <>I&apos;ll remind you to{' '}</>
                                                    ) : (
                                                        <>
                                                    I&apos;ll ask{' '}
                                                    {editAssignees.map((a, i) => (
                                                        <span key={`${a.kind}-${a.id || a.email || i}`}>
                                                            {i > 0 ? (i === editAssignees.length - 1 ? ' and ' : ', ') : ''}
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingField(editingField === 'assignees' ? null : 'assignees')}
                                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium border align-baseline ${chipColor(a.kind)} hover:opacity-90`}
                                                                data-testid={`ai-chip-assignee-${i}`}
                                                                title="Change assignee"
                                                            >
                                                                {a.name}
                                                                <span
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onClick={(e) => { e.stopPropagation(); removeAssignee(i); }}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeAssignee(i); } }}
                                                                    className="opacity-60 hover:opacity-100"
                                                                    aria-label="Remove assignee"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </span>
                                                            </button>
                                                        </span>
                                                    ))}
                                                    {' '}to{' '}
                                                        </>
                                                    )}
                                                    {editingField === 'title' ? (
                                                        <Input
                                                            autoFocus
                                                            value={editTitle}
                                                            onChange={(e) => setEditTitle(e.target.value)}
                                                            onBlur={() => setEditingField(null)}
                                                            onKeyDown={(e) => { if (e.key === 'Enter') setEditingField(null); }}
                                                            className="h-8 text-sm rounded-lg inline-flex w-auto min-w-[160px] max-w-full"
                                                            data-testid="ai-inline-title"
                                                        />
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingField('title')}
                                                            className="font-semibold rounded-md px-1 py-0.5 hover:bg-muted border border-transparent hover:border-border"
                                                            data-testid="ai-chip-title"
                                                            title="Edit task"
                                                        >
                                                            {displayTaskTitle(editTitle) || 'Untitled'}
                                                        </button>
                                                    )}
                                                    {editDue ? ' by ' : ''}
                                                    {editingField === 'due' ? (
                                                        <span className="inline-block min-w-[200px] align-middle" data-testid="ai-inline-due">
                                                            <DateTimePicker
                                                                value={editDue}
                                                                onChange={(v) => { setEditDue(v); setEditingField(null); }}
                                                            />
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingField('due')}
                                                            className="font-semibold rounded-md px-1 py-0.5 hover:bg-muted border border-transparent hover:border-border"
                                                            data-testid="ai-chip-due"
                                                        >
                                                            {formatDue(editDue) || 'Pick a date'}
                                                        </button>
                                                    )}
                                                    {'. '}
                                                    {editingField === 'priority' ? (
                                                        <Select value={editPriority} onValueChange={(v) => { setEditPriority(v); setEditingField(null); }}>
                                                            <SelectTrigger className={`h-7 w-[120px] rounded-lg inline-flex ${priorityColor}`} data-testid="ai-inline-priority">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="Low">Low</SelectItem>
                                                                <SelectItem value="Medium">Medium</SelectItem>
                                                                <SelectItem value="High">High</SelectItem>
                                                                <SelectItem value="Urgent">Urgent</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingField('priority')}
                                                            className={`font-semibold rounded-full px-2 py-0.5 text-xs align-baseline ${priorityColor}`}
                                                            data-testid="ai-chip-priority"
                                                        >
                                                            {editPriority}
                                                        </button>
                                                    )}
                                                </p>
                                                {editDesc ? (
                                                    <div
                                                        className="text-[14px] leading-6 text-foreground whitespace-pre-wrap"
                                                        data-testid="ai-confirm-assignee-ask"
                                                    >
                                                        {layoutTaskDescription(editDesc)}
                                                    </div>
                                                ) : null}

                                                {editingField === 'assignees' && (
                                                    <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-2" data-testid="ai-inline-assignees">
                                                        <Input
                                                            autoFocus
                                                            value={peopleSearch}
                                                            onChange={(e) => setPeopleSearch(e.target.value)}
                                                            placeholder="Search people or groups…"
                                                            className="h-8 text-sm rounded-lg"
                                                            data-testid="ai-inline-assignee-search"
                                                        />
                                                        <div className="max-h-36 overflow-y-auto space-y-0.5">
                                                            {(() => {
                                                                const inlineGroups = groups.filter(
                                                                    (g) => !peopleQuery || (g.name || '').toLowerCase().includes(peopleQuery)
                                                                );
                                                                const empty = filteredPeople.length === 0 && inlineGroups.length === 0
                                                                    && !(isEmailLike(peopleSearch) && !editAssignees.some((a) => a.email === peopleSearch.trim()));
                                                                return (
                                                                    <>
                                                                        {empty && (
                                                                            <p className="px-2.5 py-2 text-xs text-slate-500" data-testid="ai-inline-assignee-empty">
                                                                                No matches - try a name, email, or group
                                                                            </p>
                                                                        )}
                                                                        {inlineGroups.length > 0 && (
                                                                            <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400" data-testid="ai-inline-groups-header">
                                                                                Groups
                                                                            </div>
                                                                        )}
                                                                        {inlineGroups.map((g) => {
                                                                            const selected = editAssignees.some((a) => a.kind === 'group' && a.id === g.id);
                                                                            return (
                                                                                <button
                                                                                    key={`ig-${g.id}`}
                                                                                    type="button"
                                                                                    disabled={selected}
                                                                                    onClick={() => {
                                                                                        addAssigneeChip({
                                                                                            kind: 'group',
                                                                                            id: g.id,
                                                                                            name: g.name,
                                                                                            emails: g.emails || [],
                                                                                            members: g.emails || [],
                                                                                            member_count: (g.emails || []).length,
                                                                                        });
                                                                                        setPeopleSearch('');
                                                                                    }}
                                                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 ${selected ? 'opacity-40' : 'hover:bg-slate-50'}`}
                                                                                    data-testid={`ai-inline-pick-group-${g.id}`}
                                                                                >
                                                                                    <Users className="w-3 h-3 text-teal-700 shrink-0" />
                                                                                    <span className="min-w-0 flex-1">
                                                                                        <span className="font-medium">{g.name}</span>
                                                                                        <span className="text-slate-500 ml-1">· {(g.emails || []).length}</span>
                                                                                    </span>
                                                                                </button>
                                                                            );
                                                                        })}
                                                                        {filteredPeople.length > 0 && inlineGroups.length > 0 && (
                                                                            <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                                                People
                                                                            </div>
                                                                        )}
                                                                        {filteredPeople.map((u) => {
                                                                            const selected = editAssignees.some((a) => a.id === u.id || (u.email && a.email === u.email));
                                                                            return (
                                                                                <button
                                                                                    key={u.id || u.email}
                                                                                    type="button"
                                                                                    disabled={selected}
                                                                                    onClick={() => pickPerson(u)}
                                                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${selected ? 'opacity-40' : 'hover:bg-slate-50'}`}
                                                                                    data-testid={`ai-inline-pick-person-${u.id || u.email}`}
                                                                                >
                                                                                    <span className="font-medium">{u.name}</span>
                                                                                    {u.email ? <span className="text-slate-500 ml-1">{u.email}</span> : null}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                        {isEmailLike(peopleSearch) && !editAssignees.some((a) => a.email === peopleSearch.trim()) && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const email = peopleSearch.trim();
                                                                                    setEditAssignees((prev) => [...prev, { kind: 'email', email, name: email }]);
                                                                                    setPeopleSearch('');
                                                                                }}
                                                                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-50"
                                                                            >
                                                                                Add email <span className="font-medium">{peopleSearch.trim()}</span>
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                        <button type="button" onClick={() => setEditingField(null)} className="text-[11px] text-slate-500 underline">Done</button>
                                                    </div>
                                                )}

                                                {(editSales || editScreenRecording || preview.recurring?.is_recurring) && (
                                                    <div className="flex flex-wrap gap-1.5" data-testid="ai-confirm-flags">
                                                        {preview.recurring?.is_recurring && (
                                                            <Badge className="bg-slate-200 text-slate-800">
                                                                Recurring · {preview.recurring.frequency}
                                                            </Badge>
                                                        )}
                                                        {editSales && (
                                                            <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200">Sales</Badge>
                                                        )}
                                                        {editScreenRecording && (
                                                            <Badge className="bg-violet-50 text-violet-800 border border-violet-200">Screen recording required</Badge>
                                                        )}
                                                    </div>
                                                )}

                                                <p className="sr-only" data-testid="ai-confirm-chat-hint">
                                                    Type a change below, then send.
                                                </p>

                                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                                    <Button
                                                        type="button"
                                                        onClick={send}
                                                        disabled={sending}
                                                        className="rounded-full bg-slate-900 hover:bg-slate-800 gap-2"
                                                        data-testid="ai-send-btn"
                                                    >
                                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                        {sending ? 'Sending…' : 'Send'}
                                                    </Button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { onRequestExit?.(); }}
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

                                {/* Details editor - fallback, not the default path */}
                                {(!readyToConfirm && clarifying.length === 0) && (
                                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4" data-testid="ai-details-editor">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold text-slate-800">
                                                {readyToConfirm ? 'Edit' : 'Missing'}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => { reset(); onRequestExit?.(); }}
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
                                                placeholder="Details (optional)"
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
                                                    <p className="text-xs text-slate-500 italic">No one yet</p>
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
                                                    {`Couldn't identify: ${unresolved.join(', ')}. Add via Full form.`}
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
                                                        is_sales_task: editSales,
                                                        requires_screen_recording: editScreenRecording,
                                                        success_criteria: editCriteria,
                                                        assignees: editAssignees,
                                                        attachments,
                                                    })}
                                                    className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
                                                    data-testid="ai-open-advanced"
                                                >
                                                    Full form
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
                                                        is_sales_task: editSales,
                                                        requires_screen_recording: editScreenRecording,
                                                        success_criteria: editCriteria,
                                                        assignees: editAssignees,
                                                        attachments,
                                                    })}
                                                    className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
                                                    data-testid="ai-open-advanced"
                                                >
                                                    Full form
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                                {(loading || answerLoading) && (
                                    <div className="ai-thread-assistant" data-testid="ai-thread-thinking">
                                        <span className="ai-thread-thinking">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Thinking…
                                        </span>
                                    </div>
                                )}
                                <div ref={threadEndRef} />
                            </div>
                        )}

                        {embedded && (
                            <div
                                className={`ai-command-chips-wrap${showCommandChips ? ' is-open' : ''}`}
                                data-testid="ai-command-chips"
                                aria-hidden={!showCommandChips}
                            >
                                <div className="ai-command-chips-inner">
                                    <div className="flex flex-wrap gap-1 px-0.5">
                                        {[
                                            { label: 'Outstanding', cmd: "What's outstanding?" },
                                            { label: 'Analytics', cmd: 'go to analytics' },
                                            { label: 'Transcript', cmd: 'from transcript' },
                                            { label: 'Team', cmd: 'go to team' },
                                            { label: 'Settings', cmd: 'go to settings' },
                                        ].map((c) => (
                                            <button
                                                key={c.label}
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => runPreview(c.cmd)}
                                                className="text-[11px] px-2 py-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                                            >
                                                {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        <div
                            ref={composerRef}
                            className={`ai-composer-shell relative flex flex-col ${
                                embedded ? '' : 'ai-composer-shell--inset'
                            }${listening ? ' is-listening' : ''}${voicePhase === 'speaking' ? ' is-speaking' : ''}${voicePhase === 'thinking' ? ' is-thinking' : ''}`}
                            data-testid="ai-quick-composer"
                        >
                            {formatOpen ? (
                            <div className="ai-format-toolbar absolute left-2 bottom-full z-20 mb-1.5 flex items-center gap-0.5 rounded-full px-1 py-0.5" data-testid="ai-format-toolbar">
                                <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); wrapSelection('**', '**'); }}
                                    className="ai-format-toolbar-btn h-7 w-7 rounded-full inline-flex items-center justify-center"
                                    title="Bold"
                                    aria-label="Bold"
                                >
                                    <Bold className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); wrapSelection('_', '_'); }}
                                    className="ai-format-toolbar-btn h-7 w-7 rounded-full inline-flex items-center justify-center"
                                    title="Italic"
                                    aria-label="Italic"
                                >
                                    <Italic className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); prefixLine('- '); }}
                                    className="ai-format-toolbar-btn h-7 w-7 rounded-full inline-flex items-center justify-center"
                                    title="Bullet list"
                                    aria-label="Bullet list"
                                >
                                    <List className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            ) : null}
                            <div className="ai-prompt-field relative">
                            {showPromptExample && (
                                <div
                                    className="ai-prompt-placeholder"
                                    data-testid="ai-prompt-placeholder"
                                    aria-hidden
                                >
                                    <span key={exampleIndex} className="ai-prompt-placeholder-fade">
                                        {promptExample}
                                    </span>
                                </div>
                            )}
                            <Textarea
                                ref={inputRef}
                                value={text}
                                onFocus={() => {
                                    const x = window.scrollX;
                                    const y = window.scrollY;
                                    setComposerFocused(true);
                                    requestAnimationFrame(() => {
                                        if (window.scrollX !== x || window.scrollY !== y) {
                                            window.scrollTo(x, y);
                                        }
                                    });
                                }}
                                onBlur={() => setTimeout(() => setComposerFocused(false), 180)}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const caret = e.target.selectionStart ?? val.length;
                                    setText(val);
                                    syncMentionFromCaret(val, caret);
                                }}
                                onPaste={handlePasteImage}
                                onClick={(e) => {
                                    syncMentionFromCaret(e.target.value, e.target.selectionStart);
                                    const start = e.target.selectionStart ?? 0;
                                    const end = e.target.selectionEnd ?? 0;
                                    setFormatOpen(end > start);
                                }}
                                onSelect={(e) => {
                                    const start = e.target.selectionStart ?? 0;
                                    const end = e.target.selectionEnd ?? 0;
                                    setFormatOpen(end > start);
                                }}
                                onKeyUp={(e) => {
                                    syncMentionFromCaret(e.target.value, e.target.selectionStart);
                                    const start = e.target.selectionStart ?? 0;
                                    const end = e.target.selectionEnd ?? 0;
                                    setFormatOpen(end > start);
                                }}
                                onKeyDown={(e) => {
                                    if (mention && mentionOptions.length > 0) {
                                        if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            setMentionIndex((i) => (i + 1) % mentionOptions.length);
                                            return;
                                        }
                                        if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            setMentionIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length);
                                            return;
                                        }
                                        if (e.key === 'Escape') {
                                            e.preventDefault();
                                            setMention(null);
                                            setShowNewPersonEmail(false);
                                            return;
                                        }
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            const opt = mentionOptions[mentionIndex];
                                            if (opt) applyMentionOption(opt);
                                            return;
                                        }
                                        if (e.key === 'Tab' && !showNewPersonEmail) {
                                            e.preventDefault();
                                            const opt = mentionOptions[mentionIndex];
                                            if (opt) applyMentionOption(opt);
                                            return;
                                        }
                                    }
                                    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
                                        e.preventDefault();
                                        wrapSelection('**', '**');
                                        return;
                                    }
                                    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
                                        e.preventDefault();
                                        wrapSelection('_', '_');
                                        return;
                                    }
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        runPreview();
                                    }
                                }}
                                placeholder={
                                    listening
                                        ? 'Listening…'
                                        : voicePhase === 'speaking'
                                            ? 'Speaking…'
                                            : voicePhase === 'thinking'
                                                ? 'Thinking…'
                                        : (isWhenClarify
                                            ? (/often|repeat/i.test(clarifying[0] || '')
                                                ? 'e.g. every weekday at 5pm'
                                                : 'e.g. Friday 5pm or ASAP')
                                            : (readyToConfirm
                                                ? 'e.g. make it urgent, due tomorrow, require screen recording…'
                                                : ''))
                                }
                                aria-label="Create, search, or go to"
                                rows={1}
                                className="min-h-[44px] max-h-[40dvh] sm:max-h-[220px] w-full resize-none border-0 bg-transparent px-3.5 pt-3 pb-1 text-base sm:text-sm leading-relaxed shadow-none rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-slate-400"
                                data-testid="ai-quick-input"
                                disabled={loading || sending || answerLoading || listening}
                            />
                            </div>

                            {mention && mentionPos && createPortal(
                                <div
                                    ref={mentionListRef}
                                    style={{
                                        position: 'fixed',
                                        left: mentionPos.left,
                                        width: mentionPos.width,
                                        top: mentionPos.openUp ? undefined : mentionPos.top,
                                        bottom: mentionPos.openUp ? mentionPos.bottom : undefined,
                                        zIndex: 200,
                                        maxHeight: mentionPos.mobileSheet ? mentionPos.maxHeight : undefined,
                                    }}
                                    className={`border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xl shadow-slate-900/10 flex flex-col ${
                                        mentionPos.mobileSheet ? 'rounded-2xl' : 'rounded-2xl'
                                    }`}
                                    data-testid="mention-dropdown"
                                    role="listbox"
                                    aria-label="Assign to"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <div className="px-3 pt-2.5 pb-1.5">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                            Assign to{mention.query ? ` · ${mention.query}` : ''}
                                        </p>
                                    </div>
                                    <div
                                        className="overflow-y-auto overscroll-contain px-1.5 pb-1.5 clean-scroll"
                                        style={{ maxHeight: Math.max(120, mentionPos.maxHeight - (showNewPersonEmail ? 108 : 40)) }}
                                    >
                                        {mentionOptions.length === 0 && (
                                            <p className="px-2.5 py-3 text-xs text-slate-500">Type a name, email, or group</p>
                                        )}
                                        {mentionOptions.map((opt, idx) => {
                                            const active = idx === mentionIndex;
                                            const rowClass = `w-full flex items-center gap-2.5 px-2.5 py-2.5 sm:py-2 rounded-xl text-left text-sm transition-colors touch-manipulation ${
                                                active ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted/60 active:bg-muted'
                                            }`;
                                            if (opt.type === 'user') {
                                                const u = opt.data;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={`u-${u.id || u.email}`}
                                                        data-active={active || undefined}
                                                        onMouseDown={(e) => { e.preventDefault(); applyMentionOption(opt); }}
                                                        onMouseEnter={() => setMentionIndex(idx)}
                                                        className={rowClass}
                                                        role="option"
                                                        aria-selected={active}
                                                    >
                                                        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                                                            u.id === 'self' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'
                                                        }`}>
                                                            {u.id === 'self'
                                                                ? 'Me'
                                                                : <UserIcon className="w-3.5 h-3.5" />}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="font-medium block truncate">{u.name || u.email}</span>
                                                            {u.email ? <span className="text-[11px] text-slate-500 truncate block">{u.email}</span> : null}
                                                        </span>
                                                    </button>
                                                );
                                            }
                                            if (opt.type === 'group') {
                                                const g = opt.data;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={`g-${g.id}`}
                                                        data-active={active || undefined}
                                                        onMouseDown={(e) => { e.preventDefault(); applyMentionOption(opt); }}
                                                        onMouseEnter={() => setMentionIndex(idx)}
                                                        className={rowClass}
                                                        role="option"
                                                        aria-selected={active}
                                                    >
                                                        <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                                                            <Users className="w-3.5 h-3.5" />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="font-medium block truncate">{g.name}</span>
                                                            <span className="text-[11px] text-slate-500">Group · {(g.emails || []).length}</span>
                                                        </span>
                                                    </button>
                                                );
                                            }
                                            if (opt.type === 'add_person') {
                                                return (
                                                    <button
                                                        type="button"
                                                        key="add-person"
                                                        data-active={active || undefined}
                                                        onMouseDown={(e) => { e.preventDefault(); applyMentionOption(opt); }}
                                                        onMouseEnter={() => setMentionIndex(idx)}
                                                        className={`${rowClass} mt-0.5`}
                                                        data-testid="mention-add-person"
                                                        role="option"
                                                        aria-selected={active}
                                                    >
                                                        <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
                                                            <Plus className="w-3.5 h-3.5" />
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="font-medium block truncate">
                                                                {isEmailLike(opt.data.query)
                                                                    ? `Assign ${opt.data.query}`
                                                                    : `Add “${opt.data.query}”`}
                                                            </span>
                                                            <span className="text-[11px] text-slate-500">
                                                                {isEmailLike(opt.data.query) ? 'Invite by email' : 'Ask for email next'}
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            }
                                            return (
                                                <button
                                                    type="button"
                                                    key="add-group"
                                                    data-active={active || undefined}
                                                    onMouseDown={(e) => { e.preventDefault(); applyMentionOption(opt); }}
                                                    onMouseEnter={() => setMentionIndex(idx)}
                                                    className={rowClass}
                                                    data-testid="mention-add-group"
                                                    role="option"
                                                    aria-selected={active}
                                                >
                                                    <span className="w-8 h-8 rounded-full border border-dashed border-teal-300 text-teal-700 flex items-center justify-center shrink-0">
                                                        <Users className="w-3.5 h-3.5" />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="font-medium block truncate">Create “{opt.data.query}”</span>
                                                        <span className="text-[11px] text-slate-500">New group</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {showNewPersonEmail && (
                                        <div className="shrink-0 border-t border-slate-100 p-2.5 space-y-2 bg-slate-50/80" data-testid="mention-new-person-email">
                                            <p className="text-xs text-slate-600">
                                                Email for <span className="font-semibold text-slate-800">{mention.query}</span>
                                            </p>
                                            <div className="flex gap-1.5">
                                                <Input
                                                    type="email"
                                                    autoFocus
                                                    value={newPersonEmail}
                                                    onChange={(e) => setNewPersonEmail(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            confirmNewPerson();
                                                        }
                                                        e.stopPropagation();
                                                    }}
                                                    placeholder="name@company.com"
                                                    className="h-9 text-sm rounded-xl bg-white"
                                                />
                                                <Button type="button" size="sm" className="h-9 rounded-xl bg-teal-800 hover:bg-teal-900 px-3" onClick={confirmNewPerson}>
                                                    Add
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>,
                                document.body
                            )}

                            {(editAssignees.length > 0 || attachments.length > 0) && !preview && (
                                <div className="flex flex-col gap-2 px-3 pb-1">
                                    {attachments.length > 0 && (
                                        <SlackAttachGrid
                                            attachments={attachments}
                                            compact
                                            onRemove={(_att, i) => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                                            testId="ai-composer-attachments"
                                        />
                                    )}
                                    {editAssignees.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {editAssignees.map((a, i) => (
                                        <span
                                            key={`${a.id || a.email || a.name}-${i}`}
                                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                                                a.kind === 'group' || a.kind === 'team'
                                                    ? 'bg-teal-100 text-teal-900 border-teal-200'
                                                    : a.kind === 'email'
                                                        ? 'bg-slate-100 text-slate-700 border-slate-200'
                                                        : 'bg-teal-100 text-teal-800 border-teal-200'
                                            }`}
                                        >
                                            {(a.kind === 'group' || a.kind === 'team') ? <Users className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                                            {a.name || a.email}
                                            <button type="button" onClick={() => removeAssignee(i)} className="opacity-60 hover:opacity-100" aria-label="Remove">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                    )}
                                </div>
                            )}

                            <div className="relative z-[1] flex items-center justify-between gap-2 px-2 pb-2 pt-0.5">
                                <div className="relative flex items-center gap-0.5" ref={plusRef}>
                                    <button
                                        type="button"
                                        onClick={() => setPlusOpen((v) => !v)}
                                        className={`ai-composer-icon-btn h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${plusOpen ? 'is-open' : ''}`}
                                        title="Add"
                                        aria-label="Add attachment or recording"
                                        aria-expanded={plusOpen}
                                        data-testid="ai-plus-btn"
                                    >
                                        <Plus className="w-4 h-4" strokeWidth={1.75} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={startComposerRecording}
                                        className="ai-composer-icon-btn h-8 rounded-lg inline-flex items-center justify-center gap-1 px-2 transition-colors"
                                        title={needsIosScreenRecordFlow() ? 'Speak to send' : 'Record screen'}
                                        aria-label={needsIosScreenRecordFlow() ? 'Speak to send' : 'Record screen'}
                                        data-testid="ai-record-btn"
                                    >
                                        <Video className="w-4 h-4" strokeWidth={1.75} />
                                        <span className="text-xs font-medium leading-none">Record</span>
                                    </button>
                                    {plusOpen && (
                                        <div
                                            className="ai-plus-menu absolute bottom-full left-0 mb-1.5 w-52 rounded-xl border py-1 shadow-lg shadow-slate-900/10 z-30"
                                            data-testid="ai-plus-menu"
                                            role="menu"
                                        >
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setPlusOpen(false);
                                                    recordPickerRef.current?.startRecording?.();
                                                }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                                data-testid="ai-screen-record-btn"
                                            >
                                                <Video className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                                                Record screen
                                            </button>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setPlusOpen(false);
                                                    setShowAttachPrompt(true);
                                                }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                                data-testid="ai-attach-file-btn"
                                            >
                                                {uploadingPaste
                                                    ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                                                    : <Paperclip className="w-4 h-4 text-slate-400" strokeWidth={1.75} />}
                                                Attach
                                            </button>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={startRecurringCompose}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                                data-testid="ai-recurring-btn"
                                            >
                                                <Repeat className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                                                Recurring
                                            </button>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setPlusOpen(false);
                                                    navigate('/transcript');
                                                }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                                data-testid="ai-transcript-btn"
                                            >
                                                <FileText className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                                                From transcript
                                            </button>
                                        </div>
                                    )}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        multiple
                                        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                                        onChange={async (e) => {
                                            await handleAttachFiles(e);
                                            setShowAttachPrompt(false);
                                        }}
                                    />
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <button
                                        type="button"
                                        onClick={toggleVoice}
                                        disabled={loading || sending || answerLoading}
                                        className={`ai-composer-icon-btn h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                                            listening ? 'is-listening bg-red-500 text-white animate-pulse' : ''
                                        }${voicePhase === 'speaking' ? ' is-speaking bg-teal-600 text-white' : ''}`}
                                        data-testid="ai-prompt-voice-btn"
                                        aria-label={
                                            voicePhase === 'speaking' ? 'Stop talking'
                                                : listening ? 'Stop listening'
                                                    : 'Start voice conversation'
                                        }
                                        aria-pressed={listening || voiceSession}
                                        title={
                                            voicePhase === 'speaking' ? 'Tap to interrupt'
                                                : listening ? 'Tap to stop'
                                                    : 'Talk like ChatGPT'
                                        }
                                    >
                                        {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (listening) {
                                                finishVoiceSession({ send: true });
                                                return;
                                            }
                                            runPreview();
                                        }}
                                        disabled={loading || sending || answerLoading || !text.trim()}
                                        className={`ai-composer-send h-8 w-8 rounded-full inline-flex items-center justify-center transition-colors ${
                                            loading || answerLoading || text.trim() ? 'is-ready' : ''
                                        }`}
                                        data-testid="ai-quick-preview-btn"
                                        aria-label="Send"
                                        title="Send"
                                    >
                                        {(loading || answerLoading)
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <ArrowUp className="w-4 h-4" strokeWidth={2.25} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Keep mounted so Record can start from the click gesture.
                            No bordered panel - capture UI is the system picker + floating HUD. */}
                        <div data-testid="ai-inline-recorder">
                            <AttachmentPicker
                                ref={recordPickerRef}
                                compact
                                attachments={attachments}
                                setAttachments={setAttachments}
                                requiresScreenRecording={editScreenRecording}
                            />
                        </div>

                        <Dialog open={showAttachPrompt} onOpenChange={setShowAttachPrompt}>
                            <DialogContent className="max-w-md rounded-2xl" data-testid="ai-attach-prompt">
                                <DialogHeader>
                                    <DialogTitle style={{ fontFamily: 'Outfit' }}>Add an attachment</DialogTitle>
                                    <DialogDescription>
                                        Paste a screenshot first, or choose a file from your device.
                                    </DialogDescription>
                                </DialogHeader>
                                <div
                                    ref={pasteZoneRef}
                                    tabIndex={0}
                                    onPaste={handlePasteImage}
                                    className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-10 text-center outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                                    data-testid="ai-paste-zone"
                                >
                                    <ImageIcon className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                                    <p className="text-sm font-medium text-slate-800">Paste screenshot</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
                                            ? '⌘V'
                                            : 'Ctrl+V'}
                                        {' '}while this box is focused
                                    </p>
                                    {uploadingPaste && (
                                        <p className="text-xs text-teal-700 mt-3 inline-flex items-center gap-1.5">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
                                        </p>
                                    )}
                                </div>
                                <div className="flex justify-end gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-full"
                                        onClick={() => setShowAttachPrompt(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        className="rounded-full"
                                        onClick={() => fileInputRef.current?.click()}
                                        data-testid="ai-attach-choose-files"
                                    >
                                        <Paperclip className="w-4 h-4 mr-1.5" />
                                        Choose files
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>


            </div>

            <Dialog open={!!previewAttachment} onOpenChange={(o) => { if (!o) setPreviewAttachment(null); }}>
                <DialogContent className="max-w-2xl rounded-2xl p-0 overflow-hidden" data-testid="ai-attachment-lightbox">
                    <DialogHeader className="px-4 pt-4 pb-2 pr-10">
                        <DialogTitle className="text-base truncate">
                            {previewAttachment?.original_filename || 'Attachment'}
                        </DialogTitle>
                        <DialogDescription className="sr-only">Preview attached media</DialogDescription>
                    </DialogHeader>
                    <div className="px-4 pb-4">
                        {previewAttachment?.storage_path && (
                            (previewAttachment.kind === 'video' || (previewAttachment.content_type || '').startsWith('video/'))
                                ? (
                                    <video
                                        src={fileUrl(previewAttachment.storage_path)}
                                        controls
                                        autoPlay
                                        className="w-full max-h-[70vh] rounded-xl bg-black"
                                    />
                                )
                                : (
                                    <img
                                        src={fileUrl(previewAttachment.storage_path)}
                                        alt={previewAttachment.original_filename || 'Screenshot'}
                                        className="w-full max-h-[70vh] object-contain rounded-xl bg-slate-50"
                                    />
                                )
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AIQuickCreate;
