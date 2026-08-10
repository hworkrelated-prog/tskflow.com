import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sparkles, Wand2, X, Users, User as UserIcon, ChevronDown, Check, Loader2, MessageCircleQuestion, Pencil, Plus } from 'lucide-react';
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

const SALES_WORD_RE = /\b(sales?|selling|upsell|prospect(?:s|ing)?|pipeline|quota|deals?|opportunit(?:y|ies)|demos?|discovery|pitch(?:es)?|proposals?|quotes?|crm|hubspot|salesforce|sdrs?|bdrs?|cold[-\s]?calls?|outbound|renewals?|\barr\b|\bmrr\b|poc|leads?|rfps?|(?:customer|client|prospect|buyer)s?\s+(?:call|meeting|demo|follow[-\s]?up)|(?:follow[-\s]?up|call|meet(?:ing)?)\s+(?:with\s+)?(?:a\s+)?(?:customer|client|prospect)s?)\b/i;

const looksLikeSales = (...parts) => SALES_WORD_RE.test(parts.filter(Boolean).join(' '));

/** Detect an @mention token just before the caret. */
const getMentionState = (value, caret) => {
    const before = (value || '').slice(0, caret ?? (value || '').length);
    const m = before.match(/(^|[\s([{])@([^\s@]*)$/);
    if (!m) return null;
    const query = m[2] || '';
    const start = before.length - query.length - 1;
    return { start, end: caret ?? before.length, query };
};

const isEmailLike = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());

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
    const [groups, setGroups] = useState([]);
    const [peopleSearch, setPeopleSearch] = useState('');
    const [showPeopleDrop, setShowPeopleDrop] = useState(false);
    const [peopleDropPos, setPeopleDropPos] = useState(null);
    const [mention, setMention] = useState(null); // { start, end, query }
    const [mentionIndex, setMentionIndex] = useState(0);
    const [mentionPos, setMentionPos] = useState(null); // fixed coords for portal menu
    const [newPersonEmail, setNewPersonEmail] = useState('');
    const [showNewPersonEmail, setShowNewPersonEmail] = useState(false);
    const inputRef = useRef(null);
    const composerRef = useRef(null);
    const clarifyRef = useRef(null);
    const peopleAnchorRef = useRef(null);
    const nudgeSentRef = useRef(false);
    const mentionListRef = useRef(null);

    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editDue, setEditDue] = useState('');
    const [editPriority, setEditPriority] = useState('Medium');
    const [editAssignees, setEditAssignees] = useState([]);
    const [editCriteria, setEditCriteria] = useState('');

    const focusInput = useCallback(() => {
        setTimeout(() => inputRef.current?.focus(), 30);
    }, []);

    // Grow like a chat composer: start compact, expand with content, then scroll.
    const resizePrompt = useCallback(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        const next = Math.min(Math.max(el.scrollHeight, 76), 220);
        el.style.height = `${next}px`;
        el.style.overflowY = el.scrollHeight > 220 ? 'auto' : 'hidden';
    }, []);

    useEffect(() => {
        resizePrompt();
    }, [text, resizePrompt]);

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
                toast.success(`Group “${g.name}” created — add members anytime in Advanced`);
            } catch (err) {
                // Free tier / errors: still put the @mention in the prompt for the parser
                replaceMention(`@${name} `);
                toast.message(`Mentioned “${name}” — create the group in Advanced if needed`);
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
        const names = [...peopleNames].filter(Boolean).sort((a, b) => b.length - a.length);
        for (const name of names) {
            s = s.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
        }
        const nameTokens = new Set();
        names.forEach((n) => n.split(/\s+/).forEach((p) => { if (p.length > 1) nameTokens.add(p.toLowerCase()); }));
        const tokens = s.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        while (tokens.length && nameTokens.has(tokens[0].toLowerCase().replace(/[.,;:]+$/g, ''))) {
            tokens.shift();
        }
        return tokens.join(' ').replace(/^(need to|needs to|have to|must|please)\s+/i, '').trim();
    };

    const applyPreview = (p) => {
        const sales = !!(p.is_sales_task || looksLikeSales(text, p.title, p.description, p.category));
        const peopleNames = [
            ...editAssignees.map((a) => a.name).filter(Boolean),
            ...((p.assignee_resolution?.resolved || []).map((a) => a.name).filter(Boolean)),
            ...((p.assignee_hints || []).map((h) => String(h).replace(/^@/, ''))),
        ];
        let title = stripPeopleNoise(p.title || '', peopleNames);
        let desc = stripPeopleNoise(p.description || '', peopleNames);
        const actions = Array.isArray(p.action_items)
            ? p.action_items.map((a) => stripPeopleNoise(a, peopleNames)).filter(Boolean)
            : [];

        const work = stripPeopleNoise(text || '', peopleNames)
            .replace(/\b(by|before|due)\s+.+$/i, '')
            .trim();
        const looksNamed = peopleNames.some((n) => {
            const last = (n || '').split(/\s+/).pop();
            return last && last.length > 2 && new RegExp(`\\b${last}\\b`, 'i').test(title);
        });
        if (!title || /^assign\b/i.test(title) || title.includes('@') || looksNamed || title.split(/\s+/).length > 14) {
            const seed = actions[0] || work;
            const m = seed.match(/\b(finalize|update|review|complete|prepare|create|send|call|fix|submit|draft|schedule|align|close)\b.*$/i);
            title = (m ? m[0] : seed).split(/\s+/).slice(0, 8).join(' ');
            if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
        }
        if (!desc && actions.length) {
            desc = actions.map((a, i) => `${i + 1}. ${a}`).join('\n');
        }
        if (!desc && work.length > 20) {
            desc = work;
        }

        setEditTitle(title || p.title || '');
        setEditDesc(desc || '');
        setEditDue(p.due_date || '');
        setEditPriority(p.priority || 'Medium');
        // Keep @mentions the user already picked; merge in any newly resolved assignees
        let mergedCount = 0;
        setEditAssignees((prev) => {
            const fromParse = p.assignee_resolution?.resolved || [];
            if (prev.length === 0) {
                mergedCount = fromParse.length;
                return fromParse;
            }
            const merged = [...prev];
            for (const a of fromParse) {
                const key = a.id || a.email || a.name;
                if (!merged.some((x) => (x.id && x.id === key) || (x.email && x.email === a.email) || (x.name && x.name === a.name))) {
                    merged.push(a);
                }
            }
            mergedCount = merged.length;
            return merged;
        });
        setEditCriteria(p.success_criteria || '');
        setShowDetails(false);
        setClarifyAnswer('');
        setPeopleSearch('');
        setMention(null);
        const qs = p.clarifying_questions || [];
        // Skip "who" clarify if @mention already picked someone (or parse resolved them)
        const filteredQs = mergedCount > 0 || (p.assignee_resolution?.resolved || []).length > 0 || /@/.test(text)
            ? qs.filter((q) => !/who|own|assign/i.test(q || ''))
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
            const isWho = /who|own|assign/i.test(filteredQs[0] || '');
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
        setMention(null);
        setShowNewPersonEmail(false);
        setNewPersonEmail('');
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
                    is_sales_task: !!(preview?.is_sales_task || looksLikeSales(text, editTitle, editDesc)),
                    category: (preview?.is_sales_task || looksLikeSales(text, editTitle, editDesc)) ? 'Sales' : undefined,
                    success_criteria: criteria,
                }));
                await Promise.all(payloads.map((p) => axios.post(`${API}/recurring`, p)));
                toast.success(`Recurring series set up for ${unique.length} ${unique.length === 1 ? 'person' : 'people'}`);
            } else {
                const sales = !!(preview?.is_sales_task || looksLikeSales(text, editTitle, editDesc));
                const payload = {
                    title: editTitle.trim(),
                    description: editDesc || '',
                    assigned_to: unique,
                    due_date: editDue,
                    priority: editPriority,
                    is_sales_task: sales,
                    category: sales ? 'Sales' : undefined,
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
                                    Advanced
                                </button>
                            </div>
                        )}
                        <div
                            ref={composerRef}
                            className={`relative flex flex-col rounded-2xl border shadow-sm transition-[box-shadow,border-color] focus-within:border-teal-400/70 focus-within:shadow-md focus-within:ring-2 focus-within:ring-teal-200/50 ${
                                embedded ? 'bg-white border-slate-200' : 'bg-slate-50/80 border-slate-200'
                            }`}
                            data-testid="ai-quick-composer"
                        >
                            <Textarea
                                ref={inputRef}
                                value={text}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const caret = e.target.selectionStart ?? val.length;
                                    setText(val);
                                    syncMentionFromCaret(val, caret);
                                }}
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
                                placeholder="What needs to get done? Type @ to assign someone"
                                rows={1}
                                className="min-h-[76px] max-h-[40dvh] sm:max-h-[220px] w-full resize-none border-0 bg-transparent px-3.5 pt-3 pb-12 text-base sm:text-sm leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-slate-400"
                                data-testid="ai-quick-input"
                                disabled={loading || sending || answerLoading}
                            />

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

                            {editAssignees.length > 0 && !preview && (
                                <div className="flex flex-wrap gap-1.5 px-3 pb-11">
                                    {editAssignees.map((a, i) => (
                                        <span
                                            key={`${a.id || a.email || a.name}-${i}`}
                                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                                                a.kind === 'group'
                                                    ? 'bg-teal-100 text-teal-900 border-teal-200'
                                                    : a.kind === 'email'
                                                        ? 'bg-slate-100 text-slate-700 border-slate-200'
                                                        : 'bg-teal-100 text-teal-800 border-teal-200'
                                            }`}
                                        >
                                            {a.kind === 'group' ? <Users className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                                            {a.name || a.email}
                                            <button type="button" onClick={() => removeAssignee(i)} className="opacity-60 hover:opacity-100" aria-label="Remove">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="absolute bottom-2 right-2 flex items-center gap-2">
                                <span className="hidden sm:inline text-[10px] text-slate-400 pr-1 select-none">
                                    @ to assign · Enter to go
                                </span>
                                <Button
                                    type="button"
                                    onClick={() => runPreview()}
                                    disabled={loading || sending || answerLoading || !text.trim()}
                                    className="rounded-xl bg-slate-900 hover:bg-slate-800 h-10 sm:h-9 px-3.5 gap-1.5"
                                    data-testid="ai-quick-preview-btn"
                                >
                                    {(loading || answerLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                    <span>{loading || answerLoading ? '…' : 'Go'}</span>
                                </Button>
                            </div>
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
                                                    >
                                                        {filteredPeople.length === 0 && (
                                                            <p className="px-2.5 py-3 text-xs text-slate-500">No matches — try an email</p>
                                                        )}
                                                        {filteredPeople.map((u) => (
                                                            <button
                                                                key={u.id || u.email}
                                                                type="button"
                                                                onMouseDown={(e) => { e.preventDefault(); pickPerson(u); }}
                                                                className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-teal-50 flex items-center gap-2.5"
                                                                role="option"
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
                                                    <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase text-[10px] tracking-wide">Sales</Badge>
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
