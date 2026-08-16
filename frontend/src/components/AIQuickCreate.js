import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { API } from '@/App';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sparkles, Wand2, X, Users, User as UserIcon, ChevronDown, Check, Loader2, MessageCircleQuestion, Pencil, Plus, Video, Image as ImageIcon, Paperclip, FileText, Mic, MicOff, Bold, Italic, List } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import DateTimePicker from '@/components/DateTimePicker';
import { uploadBlob, fileUrl } from '@/lib/upload';
import { AttachmentPicker } from '@/components/AttachmentPicker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { composeVoiceSubmit, shouldAutoSendVoice } from '@/lib/promptVoice';
import { PROMPT_EXAMPLES, PROMPT_EXAMPLE_INTERVAL_MS, nextPromptExampleIndex } from '@/lib/promptExamples';
import { promptMeansSelfAssign, promptNamesSomeoneElse, rememberedAssigneesForPrompt, writeLastAssignees, SELF_CHIP } from '@/lib/selfAssign';

/*
 * AIQuickCreate — text an assistant, not fill a form.
 * Flow:
 *   1) User types plain English + Enter
 *   2) POST /api/ai/quick-create-preview
 *   3a) If one critical gap → ask ONE clarifying question conversationally
 *   3b) If ready → natural-language summary + one-tap Confirm
 *   4) "Edit details" reveals the full field editor as a fallback
 */

const SALES_WORD_RE = /\b(sales?|selling|upsell|prospect(?:s|ing)?|pipeline|quota|deals?|opportunit(?:y|ies)|demos?|discovery|pitch(?:es)?|proposals?|quotes?|crm|hubspot|salesforce|sdrs?|bdrs?|cold[-\s]?calls?|outbound|renewals?|\barr\b|\bmrr\b|poc|leads?|rfps?|(?:customer|client|prospect|buyer)s?\s+(?:call|meeting|demo|follow[-\s]?up)|(?:follow[-\s]?up|call|meet(?:ing)?)\s+(?:with\s+)?(?:a\s+)?(?:customer|client|prospect)s?)\b/i;

const looksLikeSales = (...parts) => SALES_WORD_RE.test(parts.filter(Boolean).join(' '));

const COMMAND_ROUTES = [
    { keys: ['analytics', 'metrics', 'reports', 'report'], re: /\b(analytics|metrics|reports?)\b/i, path: '/analytics', label: 'Analytics' },
    { keys: ['settings', 'preferences'], re: /\b(settings|preferences)\b/i, path: '/settings', label: 'Settings' },
    { keys: ['team', 'org chart', 'direct reports'], re: /\b(team|org chart|direct reports)\b/i, path: '/team', label: 'Team' },
    { keys: ['help'], re: /\b(help|how to)\b/i, path: '/help', label: 'Help' },
    { keys: ['recording', 'recordings'], re: /\brecordings?\b/i, path: '/recordings', label: 'Recordings' },
    { keys: ['recurring'], re: /\brecurring\b/i, path: '/recurring', label: 'Recurring' },
    { keys: ['transcript', 'meeting notes'], re: /\b(transcript|meeting notes)\b/i, path: '/transcript', label: 'Transcript' },
    { keys: ['lead', 'leads'], re: /\b(leads?)\b/i, path: '/leads', label: 'Leads' },
    { keys: ['dashboard', 'home', 'hub'], re: /\b(dashboard|home|hub)\b/i, path: '/dashboard', label: 'Dashboard' },
    { keys: ['activity', 'activity log'], re: /\bactivity\b/i, path: '/activity', label: 'Activity log' },
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
    if (/^(start|new)\s+record(ing)?\b/i.test(t) || /^record(ing)?$/i.test(t)) {
        return { type: 'navigate', path: '/recordings', label: 'Recordings' };
    }
    const search = t.match(/^(search|find|look up)\s+(.+)/i);
    if (search) {
        return { type: 'search', query: search[2].trim() };
    }
    if (/^\/form\b/i.test(t) || /^manual form\b/i.test(t)) {
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

const getSpeechRecognition = () => {
    const SR = typeof window !== 'undefined'
        ? (window.SpeechRecognition || window.webkitSpeechRecognition)
        : null;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    return rec;
};

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
    const [showDetails, setShowDetails] = useState(false);
    const [answerMode, setAnswerMode] = useState(null);
    const [answerLoading, setAnswerLoading] = useState(false);
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
    const [showRecordPicker, setShowRecordPicker] = useState(false);
    const [showAttachPrompt, setShowAttachPrompt] = useState(false);
    const [previewAttachment, setPreviewAttachment] = useState(null);
    const [teamScopePrompt, setTeamScopePrompt] = useState(null); // { options: [...] }
    // Which confirm-summary field is open for inline edit: title|due|priority|criteria|assignees|desc|null
    const [editingField, setEditingField] = useState(null);
    const [listening, setListening] = useState(false);
    const fileInputRef = useRef(null);
    const pasteZoneRef = useRef(null);
    const recRef = useRef(null);
    const voiceFinalRef = useRef('');
    const voiceSeedRef = useRef('');
    const runPreviewRef = useRef(null);
    const navigate = useNavigate();

    const focusInput = useCallback(() => {
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 30);
    }, []);

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
        const opts = [
            ...mentionPeople.map((u) => ({ type: 'user', data: u })),
            ...mentionGroups.map((g) => ({ type: 'group', data: g })),
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
        const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(140, Math.min(260, openUp ? spaceAbove - 4 : spaceBelow - 4));
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
                toast.success(`Group “${g.name}” created — add members in Manual form or Team → Groups`);
            } catch (err) {
                // Free tier / errors: still put the @mention in the prompt for the parser
                replaceMention(`@${name} `);
                toast.message(`Mentioned “${name}” — create the group in Manual form if needed`);
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
        s = s.replace(/@[A-Za-z][\w'.-]*(?:\s+[A-Za-z][\w'.-]*){0,2}/g, ' ');
        s = s.replace(/@\S+/g, ' ');
        // Speech debris: "please can you Mahmood an EOD report" → drop can-you + capitalized name only
        s = s.replace(/\b(?:[Pp]lease\s+)?[Cc]an\s+you\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}\s+/g, '');
        s = s.replace(/\b(?:[Pp]lease\s+)?[Cc]an\s+you\s+/g, '');
        // Manager-voice: "get Hashim to review…" / "have Sarah do…" → keep the work clause
        s = s.replace(/\b(?:get|have|ask|tell)\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}\s+to\s+/gi, '');
        s = s.replace(/\b(?:get|have|ask|tell)\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2}\s+/gi, '');
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
        const sales = !!(p.is_sales_task || looksLikeSales(text, p.title, p.description, p.category));
        const peopleNames = [
            ...editAssignees.map((a) => a.name).filter(Boolean),
            ...((p.assignee_resolution?.resolved || []).map((a) => a.name).filter(Boolean)),
            ...((p.assignee_hints || []).map((h) => String(h).replace(/^@/, ''))),
        ];
        // Prefer the LLM title when it already looks clean — avoid over-scrubbing into "get do it"
        const llmTitle = String(p.title || '').trim();
        const llmTitleClean = !llmTitle
            || /@/.test(llmTitle)
            || /^assign\b/i.test(llmTitle)
            || peopleNames.some((n) => n && llmTitle.toLowerCase().includes(String(n).toLowerCase()));
        let title = llmTitleClean ? stripPeopleNoise(llmTitle, peopleNames) : llmTitle;
        let desc = stripPeopleNoise(p.description || '', peopleNames);
        const actions = Array.isArray(p.action_items)
            ? p.action_items.map((a) => stripPeopleNoise(a, peopleNames)).filter(Boolean)
            : [];

        const work = stripPeopleNoise(text || '', peopleNames)
            .replace(/\b(by|before|due)\s+.+$/i, '')
            .replace(/\band\s+get\b/gi, 'and')
            .trim();
        const looksNamed = peopleNames.some((n) => {
            const last = (n || '').split(/\s+/).pop();
            return last && last.length > 2 && new RegExp(`\\b${last}\\b`, 'i').test(title);
        });
        const titleBad = !title
            || /^assign\b/i.test(title)
            || title.includes('@')
            || looksNamed
            || title.split(/\s+/).length > 12
            || title.split(/\s+/).length < 2
            || /^(an?|the)\b/i.test(title)
            || /\b(can you|please can|get do)\b/i.test(title)
            || /\bget\s*$/i.test(title);
        if (titleBad) {
            const seed = actions[0] || work;
            const m = seed.match(/\b(finalize|update|review|complete|prepare|create|send|call|fix|submit|draft|schedule|align|close|do|check|watch|look|provide|share|write)\b.*$/i);
            if (m) {
                title = m[0].split(/\s+/).slice(0, 8).join(' ');
            } else if (/\beod\b|end of day|report/i.test(seed)) {
                title = 'Send EOD report';
            } else {
                const cleaned = seed.replace(/^(an?|the)\s+/i, '').split(/\s+/).slice(0, 8).join(' ');
                title = cleaned ? `Complete ${cleaned}` : '';
            }
            if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
        }
        // Description: prefer clean LLM / action steps — never leave mangled "get do it"
        if (!desc && actions.length) {
            desc = actions.map((a, i) => `${i + 1}. ${a}`).join('\n');
        }
        if (!desc && work.length > 12) {
            desc = work;
        }
        desc = (desc || '')
            .replace(/\bget\s+do\b/gi, 'do')
            .replace(/\band\s+get\b/gi, 'and')
            .replace(/\s+/g, ' ')
            .trim();
        if (desc && !/^(please|kindly|review|complete|send|submit|prepare|create|update|watch|check|do)\b/i.test(desc)) {
            if (/\b(review|watch|check|complete|send|submit)\b/i.test(desc)) {
                desc = desc.charAt(0).toUpperCase() + desc.slice(1);
            } else {
                desc = `Please ${desc.charAt(0).toLowerCase()}${desc.slice(1)}`;
            }
        }

        setEditTitle(title || p.title || '');
        setEditDesc(desc || '');
        setEditDue(p.due_date || '');
        setEditPriority(p.priority || 'Medium');
        // Keep @mentions the user already picked; merge in any newly resolved assignees.
        // "Remind me" / "I need to" always lands on Me — never reopen the people picker.
        const fromParse = p.assignee_resolution?.resolved || [];
        let merged;
        if (promptMeansSelfAssign(text)) {
            const me = (fromParse.find((a) => a.kind === 'user') || fromParse[0]) || SELF_CHIP;
            merged = [me];
        } else {
            merged = mergeAssigneeLists(editAssigneesRef.current, fromParse);
        }
        editAssigneesRef.current = merged;
        setEditAssignees(merged);
        const mergedCount = merged.length;
        if (mergedCount) writeLastAssignees(merged);
        setEditCriteria(p.success_criteria || '');
        setEditSales(!!sales);
        setEditScreenRecording(!!p.requires_screen_recording);
        setEditingField(null);
        setShowDetails(false);
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
                    { ...teamChip, label: teamChip.name || 'Direct reports' },
                    ...(teamChip.alternates || []).map((alt) => ({ ...alt, label: alt.name })),
                ],
            });
        } else {
            setTeamScopePrompt(null);
        }

        const qs = p.clarifying_questions || [];
        // Skip "who" if we already have a person — a first name / "me" is enough
        const hasAssignees = mergedCount > 0
            || promptMeansSelfAssign(text)
            || (p.assignee_resolution?.resolved || []).length > 0
            || (p.assignee_hints || []).some((h) => /^(me|myself|self)$/i.test(String(h || '').trim()) || !/^(my team|the team|our team|team|my reports|my direct reports|direct reports|everyone under me)$/i.test(String(h || '').trim()))
            || /@/.test(text);
        const filteredQs = hasAssignees
            ? qs.filter((q) => !/who|own|assign/i.test(q || '') || /scope|direct reports|everyone under/i.test(q || ''))
            : qs;
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
            const isWho = /who|own|assign/i.test(filteredQs[0] || '') && !hasAssignees;
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
        if (!t || t.length < 2) {
            toast.error('Type a bit more so I can understand what you need.');
            return;
        }
        const cmd = tryLocalCommand(t);
        if (cmd?.type === 'navigate') {
            toast.success(`Opening ${cmd.label}`);
            setText('');
            navigate(cmd.path);
            onRequestExit?.();
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
        if (looksLikeQuestion) {
            setAnswerMode(null);
            setPreview(null);
            await runQA(t);
            return;
        }
        setAnswerMode(null);
        if (promptMeansSelfAssign(t)) {
            editAssigneesRef.current = [SELF_CHIP];
            setEditAssignees([SELF_CHIP]);
            setShowPeopleDrop(false);
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

    runPreviewRef.current = runPreview;

    const stopVoice = useCallback(() => {
        try { recRef.current?.stop(); } catch { /* already stopped */ }
    }, []);

    const startVoice = useCallback(() => {
        const rec = getSpeechRecognition();
        if (!rec) {
            toast.error('Voice isn’t available in this browser. Try Chrome or Safari.');
            return;
        }
        try { recRef.current?.abort(); } catch { /* noop */ }
        voiceSeedRef.current = (inputRef.current?.value || '').trim();
        voiceFinalRef.current = '';
        rec.onresult = (event) => {
            let interim = '';
            let finalText = '';
            for (let i = 0; i < event.results.length; i += 1) {
                const piece = event.results[i][0]?.transcript || '';
                if (event.results[i].isFinal) finalText += piece;
                else interim += piece;
            }
            voiceFinalRef.current = finalText.trim();
            const spoken = composeVoiceSubmit(voiceFinalRef.current, interim);
            const shown = composeVoiceSubmit(voiceSeedRef.current, spoken);
            if (shown) setText(shown);
        };
        rec.onerror = (event) => {
            if (event.error === 'not-allowed') {
                toast.error('Microphone permission is needed for voice.');
            } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
                toast.error('Couldn’t hear that — try again.');
            }
            setListening(false);
        };
        rec.onend = () => {
            recRef.current = null;
            setListening(false);
            const spoken = voiceFinalRef.current.trim();
            if (shouldAutoSendVoice(spoken)) {
                runPreviewRef.current?.(composeVoiceSubmit(voiceSeedRef.current, spoken));
            }
        };
        recRef.current = rec;
        setComposerFocused(true);
        setListening(true);
        try {
            rec.start();
        } catch {
            setListening(false);
            recRef.current = null;
            toast.error('Couldn’t start the microphone.');
        }
    }, []);

    const toggleVoice = useCallback(() => {
        if (listening) stopVoice();
        else startVoice();
    }, [listening, startVoice, stopVoice]);

    useEffect(() => () => {
        try { recRef.current?.abort(); } catch { /* noop */ }
        recRef.current = null;
    }, []);

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

        // Stay on the confirm message — do not re-ask who or reopen the picker.
        if (!hasDue) {
            setShowPeopleDrop(false);
        }
    };

    const reset = useCallback(() => {
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
        setShowRecordPicker(false);
        setTeamScopePrompt(null);
        setEditingField(null);
        setShowDetails(false);
        setClarifyAnswer('');
        setPeopleSearch('');
        setShowPeopleDrop(false);
        setMention(null);
        setShowNewPersonEmail(false);
        setNewPersonEmail('');
        setAnswerMode(null);
        nudgeSentRef.current = false;
        focusInput();
    }, [focusInput]);

    useEffect(() => {
        const onReset = () => reset();
        window.addEventListener('tskflow:ai-dock-reset', onReset);
        return () => window.removeEventListener('tskflow:ai-dock-reset', onReset);
    }, [reset]);

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
        toast.success('Recording attached — describe the task and send');
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
        }]);
        setTeamScopePrompt(null);
        // Drop the scope clarifying question so Confirm can appear
        setPreview((p) => {
            if (!p) return p;
            const qs = (p.clarifying_questions || []).filter(
                (q) => !/scope|direct reports|everyone under/i.test(q || '')
            );
            return { ...p, clarifying_questions: qs };
        });
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
                    description: editDesc || '',
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
                    description: editDesc || '',
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
                toast.success(`Task${unique.length > 1 ? 's' : ''} sent to ${unique.length} ${unique.length === 1 ? 'person' : 'people'}`);
            }
            writeLastAssignees(editAssignees);
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
        !needsAmbiguousPick &&
        !teamScopePrompt;

    // Keep parent in sync so dismissing the dialog can save a draft.
    useEffect(() => {
        onSnapshot?.({
            text,
            editTitle,
            editDesc,
            editDue,
            editPriority,
            editAssignees,
            editCriteria,
            sending,
            preview: !!preview,
            answerMode: !!answerMode,
            attachments,
            focused: composerFocused || listening,
        });
    }, [text, editTitle, editDesc, editDue, editPriority, editAssignees, editCriteria, sending, preview, answerMode, attachments, composerFocused, listening, onSnapshot]);
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
        const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(120, Math.min(240, openUp ? spaceAbove - 4 : spaceBelow - 4));
        setPeopleDropPos({
            left: Math.max(12, r.left),
            width: Math.min(r.width, window.innerWidth - 24),
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

    const showCommandChips = embedded && !preview && !answerMode && !text.trim() && composerFocused;
    const showPromptExample = !text.trim() && !preview && !answerMode && !listening;
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
                                    Manual form
                                </button>
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
                            }${listening ? ' is-listening' : ''}`}
                            data-testid="ai-quick-composer"
                        >
                            <div className="flex items-center gap-0.5 px-1.5 pt-1.5" data-testid="ai-format-toolbar">
                                <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); wrapSelection('**', '**'); }}
                                    className="h-7 w-7 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 inline-flex items-center justify-center"
                                    title="Bold"
                                    aria-label="Bold"
                                >
                                    <Bold className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); wrapSelection('_', '_'); }}
                                    className="h-7 w-7 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 inline-flex items-center justify-center"
                                    title="Italic"
                                    aria-label="Italic"
                                >
                                    <Italic className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); prefixLine('- '); }}
                                    className="h-7 w-7 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 inline-flex items-center justify-center"
                                    title="Bullet list"
                                    aria-label="Bullet list"
                                >
                                    <List className="w-3.5 h-3.5" />
                                </button>
                            </div>
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
                                onClick={(e) => syncMentionFromCaret(e.target.value, e.target.selectionStart)}
                                onKeyUp={(e) => syncMentionFromCaret(e.target.value, e.target.selectionStart)}
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
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        runPreview();
                                    }
                                }}
                                placeholder={listening ? 'Listening…' : ''}
                                aria-label="Create, search, or go to"
                                rows={1}
                                className="min-h-[40px] max-h-[40dvh] sm:max-h-[220px] w-full resize-none border-0 bg-transparent px-3.5 pt-2.5 pb-1 text-base sm:text-sm leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-slate-400"
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
                                                active ? 'bg-teal-50 text-teal-950' : 'text-slate-800 hover:bg-slate-50 active:bg-slate-50'
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
                                <div className="flex flex-wrap gap-1.5 px-3 pb-1">
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
                                    {attachments.map((att, i) => {
                                        const isVideo = att.kind === 'video' || (att.content_type || '').startsWith('video/');
                                        const isImage = att.kind === 'image' || (att.content_type || '').startsWith('image/');
                                        const thumb = att.storage_path && isImage ? fileUrl(att.storage_path) : null;
                                        return (
                                            <span
                                                key={att.id || att.storage_path || i}
                                                className="inline-flex items-center gap-1.5 text-[11px] pl-1 pr-2 py-1 rounded-xl border bg-slate-50 text-slate-700 border-slate-200"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewAttachment(att)}
                                                    className="inline-flex items-center gap-1.5 hover:opacity-90"
                                                    title="View attachment"
                                                    data-testid={`ai-attachment-preview-${i}`}
                                                >
                                                    {thumb ? (
                                                        <img src={thumb} alt="" className="w-8 h-8 rounded-md object-cover border border-slate-200" />
                                                    ) : (
                                                        <span className="w-8 h-8 rounded-md bg-slate-200/80 flex items-center justify-center">
                                                            {isVideo ? <Video className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                                                        </span>
                                                    )}
                                                    <span className="max-w-[120px] truncate text-left">{att.original_filename || (isVideo ? 'Recording' : 'Screenshot')}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                                                    className="opacity-60 hover:opacity-100"
                                                    aria-label="Remove attachment"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="relative z-[1] flex items-center justify-between gap-2 px-2 pb-2 pt-0.5">
                                <div className="flex items-center gap-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setShowRecordPicker((v) => !v)}
                                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50/80 flex items-center justify-center transition-colors"
                                        title="Record your screen to attach"
                                        aria-label="Record screen"
                                        data-testid="ai-screen-record-btn"
                                    >
                                        <Video className="w-3.5 h-3.5" strokeWidth={1.75} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowAttachPrompt(true)}
                                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 flex items-center justify-center transition-colors"
                                        title="Attach"
                                        aria-label="Attach"
                                        data-testid="ai-attach-file-btn"
                                    >
                                        {(uploadingPaste)
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <Paperclip className="w-3.5 h-3.5" strokeWidth={1.75} />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/transcript')}
                                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-indigo-700 hover:bg-indigo-50/80 flex items-center justify-center transition-colors"
                                        title="From transcript"
                                        aria-label="From transcript"
                                        data-testid="ai-transcript-btn"
                                    >
                                        <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
                                    </button>
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
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={toggleVoice}
                                        disabled={loading || sending || answerLoading}
                                        className={`h-10 w-10 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center transition-colors ${
                                            listening
                                                ? 'bg-red-500 text-white animate-pulse'
                                                : 'text-slate-500 hover:text-teal-800 hover:bg-teal-50'
                                        }`}
                                        data-testid="ai-prompt-voice-btn"
                                        aria-label={listening ? 'Stop and send' : 'Speak to send'}
                                        aria-pressed={listening}
                                        title={listening ? 'Tap to send now' : 'Speak — sends when you finish'}
                                    >
                                        {listening
                                            ? <MicOff className="w-4 h-4" />
                                            : <Mic className="w-4 h-4" />}
                                    </button>
                                    <Button
                                        type="button"
                                        onClick={() => runPreview()}
                                        disabled={loading || sending || answerLoading || listening || !text.trim()}
                                        className="rounded-xl bg-slate-900 hover:bg-slate-800 h-10 sm:h-9 px-3.5 gap-1.5"
                                        data-testid="ai-quick-preview-btn"
                                    >
                                        {(loading || answerLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                        <span>{loading || answerLoading ? '…' : 'Go'}</span>
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {showRecordPicker && (
                            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3" data-testid="ai-inline-recorder">
                                <AttachmentPicker
                                    attachments={attachments}
                                    setAttachments={setAttachments}
                                    requiresScreenRecording={editScreenRecording}
                                />
                            </div>
                        )}

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

                {answerMode && (
                    <div className="mt-4 bg-slate-50 rounded-xl border border-slate-200 p-4" data-testid="ai-qa-answer">
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-xs text-slate-500">You asked</p>
                            <button
                                type="button"
                                onClick={() => { reset(); onRequestExit?.(); }}
                                className="text-slate-400 hover:text-slate-700 rounded-full p-0.5"
                                aria-label="Exit"
                                data-testid="ai-qa-exit"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="flex items-start gap-2">
                            <Sparkles className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
                            <div className="min-w-0">
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

                            {teamScopePrompt && (
                                <div className="flex justify-start" data-testid="ai-team-scope">
                                    <div className="w-full max-w-[95%] rounded-2xl rounded-bl-md bg-teal-50 border border-teal-200 px-3.5 py-3 space-y-2">
                                        <p className="text-sm font-medium text-teal-950">Who should this go to?</p>
                                        <div className="flex flex-wrap gap-2">
                                            {(teamScopePrompt.options || []).map((opt) => (
                                                <button
                                                    key={opt.id || opt.label}
                                                    type="button"
                                                    onClick={() => pickTeamScope(opt)}
                                                    className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-white px-3 py-1.5 text-xs font-medium text-teal-900 hover:bg-teal-100 transition-colors"
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

                            {clarifying.length > 0 && (
                                <div className="flex justify-start" data-testid="ai-clarifying">
                                    <div className="w-full max-w-[95%] rounded-2xl rounded-bl-md bg-amber-50 border border-amber-200 px-3.5 py-3 space-y-2">
                                        <div className="flex items-start gap-2">
                                            <MessageCircleQuestion className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                                            <p className="text-sm font-medium text-amber-950">{clarifying[0]}</p>
                                        </div>

                                        {/scope|direct reports|everyone under/i.test(clarifying[0] || '') && teamScopePrompt ? (
                                            <div className="flex flex-wrap gap-2 ml-6">
                                                {(teamScopePrompt.options || []).map((opt) => (
                                                    <button
                                                        key={`q-${opt.id || opt.label}`}
                                                        type="button"
                                                        onClick={() => pickTeamScope(opt)}
                                                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100"
                                                    >
                                                        <Users className="w-3.5 h-3.5" />
                                                        {opt.label || opt.name}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : isWhoClarify ? (
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
                                                    placeholder="Search people or type @name"
                                                    className="h-9 text-sm rounded-lg border-amber-300 bg-white"
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
                                                        className="overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xl shadow-slate-900/10 py-1.5 px-1.5 clean-scroll"
                                                        data-testid="clarify-people-dropdown"
                                                        role="listbox"
                                                        onPointerDown={(e) => e.stopPropagation()}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        {filteredPeople.length === 0 && groups.filter((g) => !peopleQuery || (g.name || '').toLowerCase().includes(peopleQuery)).length === 0 && (
                                                            <p className="px-2.5 py-3 text-xs text-slate-500">No matches — try an email or group</p>
                                                        )}
                                                        {groups
                                                            .filter((g) => !peopleQuery || (g.name || '').toLowerCase().includes(peopleQuery))
                                                            .slice(0, 4)
                                                            .map((g) => (
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
                                                                            return { ...p, clarifying_questions: qs };
                                                                        });
                                                                        if (editDue || preview?.due_date) runPreview(text, nextAnswers);
                                                                    }}
                                                                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-teal-50 flex items-center gap-2.5"
                                                                    role="option"
                                                                    data-testid={`clarify-pick-group-${g.id}`}
                                                                >
                                                                    <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                                                                        <Users className="w-3.5 h-3.5" />
                                                                    </span>
                                                                    <span className="min-w-0 flex-1">
                                                                        <span className="text-sm font-medium text-slate-800 block truncate">{g.name}</span>
                                                                        <span className="text-[11px] text-slate-500">Group · {(g.emails || []).length}</span>
                                                                    </span>
                                                                </button>
                                                            ))}
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
                                                                className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-teal-50 flex items-center gap-2.5"
                                                                role="option"
                                                                data-testid={`clarify-pick-${u.id || u.email}`}
                                                            >
                                                                <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                                                    u.id === 'self' ? 'bg-teal-700 text-white text-xs font-semibold' : 'bg-slate-100 text-slate-600'
                                                                }`}>
                                                                    {u.id === 'self' ? 'Me' : <UserIcon className="w-3.5 h-3.5" />}
                                                                </span>
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="text-sm font-medium text-slate-800 block truncate">{u.name}</span>
                                                                    {u.email ? <span className="text-[11px] text-slate-500 truncate block">{u.email}</span> : null}
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
                                                                className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-slate-50 text-sm text-slate-700 mt-0.5 flex items-center gap-2.5"
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
                                                    </div>,
                                                    document.body
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

                            {ambiguous.length > 0 && clarifying.length === 0 && editAssignees.length === 0 && (
                                <div className="flex justify-start">
                                    <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-amber-50 border border-amber-200 px-3.5 py-3 space-y-2">
                                        <p className="text-sm font-medium text-amber-950">Who did you mean?</p>
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
                                                            className="rounded-full bg-white border border-amber-300 hover:bg-amber-100 px-2.5 py-1 text-xs"
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
                                            <div className="flex flex-wrap gap-2" data-testid="ai-confirm-attachments">
                                                {attachments.map((att, i) => {
                                                    const isVideo = att.kind === 'video' || (att.content_type || '').startsWith('video/');
                                                    const isImage = att.kind === 'image' || (att.content_type || '').startsWith('image/');
                                                    const thumb = att.storage_path && isImage ? fileUrl(att.storage_path) : null;
                                                    return (
                                                        <button
                                                            key={att.id || att.storage_path || i}
                                                            type="button"
                                                            onClick={() => setPreviewAttachment(att)}
                                                            className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-white hover:ring-2 hover:ring-teal-300"
                                                            title="View attachment"
                                                        >
                                                            {thumb ? (
                                                                <img src={thumb} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="w-full h-full flex items-center justify-center text-slate-500">
                                                                    {isVideo ? <Video className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <p className="text-[15px] leading-7 text-slate-800" data-testid="ai-confirm-message">
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
                                                    className="font-semibold rounded-md px-1 py-0.5 hover:bg-white border border-transparent hover:border-slate-200"
                                                    data-testid="ai-chip-title"
                                                    title="Edit task"
                                                >
                                                    {editTitle || 'Untitled'}
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
                                                    className="font-semibold rounded-md px-1 py-0.5 hover:bg-white border border-transparent hover:border-slate-200"
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
                                                className="text-[14px] leading-6 text-slate-700 whitespace-pre-wrap"
                                                data-testid="ai-confirm-assignee-ask"
                                            >
                                                {editDesc}
                                            </div>
                                        ) : null}

                                        {editingField === 'assignees' && (
                                            <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-2" data-testid="ai-inline-assignees">
                                                <Input
                                                    autoFocus
                                                    value={peopleSearch}
                                                    onChange={(e) => setPeopleSearch(e.target.value)}
                                                    placeholder="Search people or type an email…"
                                                    className="h-8 text-sm rounded-lg"
                                                    data-testid="ai-inline-assignee-search"
                                                />
                                                <div className="max-h-36 overflow-y-auto space-y-0.5">
                                                    {filteredPeople.map((u) => {
                                                        const selected = editAssignees.some((a) => a.id === u.id || (u.email && a.email === u.email));
                                                        return (
                                                            <button
                                                                key={u.id || u.email}
                                                                type="button"
                                                                disabled={selected}
                                                                onClick={() => pickPerson(u)}
                                                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${selected ? 'opacity-40' : 'hover:bg-slate-50'}`}
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
                                                </div>
                                                <button type="button" onClick={() => setEditingField(null)} className="text-[11px] text-slate-500 underline">Done</button>
                                            </div>
                                        )}

                                        {showDetails && (
                                            <div className="space-y-2 text-sm">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingField(editingField === 'desc' ? null : 'desc')}
                                                    className="text-left text-slate-600 w-full rounded-md px-1.5 py-0.5 hover:bg-white"
                                                    data-testid="ai-chip-desc"
                                                >
                                                    {editDesc || <span className="text-slate-400 italic">Add a note for them (optional)</span>}
                                                </button>
                                                {editingField === 'desc' && (
                                                    <Textarea
                                                        autoFocus
                                                        value={editDesc}
                                                        onChange={(e) => setEditDesc(e.target.value)}
                                                        onBlur={() => setEditingField(null)}
                                                        className="rounded-lg text-sm min-h-[56px]"
                                                        rows={3}
                                                        data-testid="ai-inline-desc"
                                                    />
                                                )}
                                                <div className="flex flex-wrap gap-2">
                                                    {preview.recurring?.is_recurring && (
                                                        <Badge className="bg-slate-200 text-slate-800">
                                                            Recurring · {preview.recurring.frequency}
                                                        </Badge>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditSales((v) => !v)}
                                                        className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wide font-semibold border ${
                                                            editSales
                                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                : 'bg-white text-slate-500 border-slate-200'
                                                        }`}
                                                        data-testid="ai-chip-sales"
                                                    >
                                                        {editSales ? 'Sales' : 'Mark as sales'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditScreenRecording((v) => !v)}
                                                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold border ${
                                                            editScreenRecording
                                                                ? 'bg-violet-100 text-violet-800 border-violet-200'
                                                                : 'bg-white text-slate-500 border-slate-200'
                                                        }`}
                                                        data-testid="ai-chip-screen-recording"
                                                    >
                                                        {editScreenRecording ? 'Screen recording required' : 'Require screen recording'}
                                                    </button>
                                                </div>
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
                                                {sending ? 'Sending…' : 'Send'}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => setShowDetails((v) => !v)}
                                                className="rounded-full gap-1.5"
                                                data-testid="ai-edit-details"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                                {showDetails ? 'Less' : 'More'}
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

                        {/* Details editor — fallback, not the default path */}
                        {(!readyToConfirm && clarifying.length === 0) && (
                            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4" data-testid="ai-details-editor">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold text-slate-800">
                                        {readyToConfirm ? 'Edit details' : 'Fill in what is missing'}
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
                                            {`Couldn't identify: ${unresolved.join(', ')}. Add via the manual form.`}
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
                                            Open manual form
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
                                            Open manual form
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

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
