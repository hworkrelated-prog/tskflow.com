import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { senseHumanInput } from '@/lib/senseHumanInput';

/**
 * Groups-style multi-select: checkbox people on the platform + paste emails.
 */
const TeamPeoplePicker = ({
    people = [],
    selectedIds = [],
    selectedEmails = [],
    onChange,
    excludeIds = [],
    label = 'People on your team',
    quiet = false,
}) => {
    const [emailInput, setEmailInput] = useState('');
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(false);

    const excluded = useMemo(() => new Set(excludeIds.filter(Boolean)), [excludeIds]);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (people || []).filter((p) => {
            if (!p?.id || excluded.has(p.id)) return false;
            if (!q) return true;
            return (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
        });
    }, [people, query, excluded]);

    const toggleId = (id) => {
        const nextIds = selectedIds.includes(id)
            ? selectedIds.filter((x) => x !== id)
            : [...selectedIds, id];
        onChange?.({ userIds: nextIds, emails: selectedEmails });
    };

    const addEmails = async () => {
        const input = emailInput.trim();
        if (!input) {
            toast.error('Enter an email address');
            return;
        }
        setBusy(true);
        try {
            const sensed = await senseHumanInput(input, 'emails');
            const fromAi = (sensed.emails || []).map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes('@'));
            const lines = input.split(/[\n,;]+/).map((l) => l.trim().toLowerCase()).filter(Boolean);
            const valid = fromAi.length ? fromAi : lines.filter((e) => e.includes('@'));
            const fresh = valid.filter((e) => !selectedEmails.includes(e));
            if (!fresh.length) {
                toast.error(valid.length ? 'All emails already added' : 'Enter a valid email');
                return;
            }
            onChange?.({ userIds: selectedIds, emails: [...selectedEmails, ...fresh] });
            setEmailInput('');
            if (fresh.length > 1) toast.success(`Added ${fresh.length} emails`);
        } finally {
            setBusy(false);
        }
    };

    const removeEmail = (email) => {
        onChange?.({ userIds: selectedIds, emails: selectedEmails.filter((e) => e !== email) });
    };

    return (
        <div className="space-y-3" data-testid="team-people-picker">
            {!quiet && (
                <Label className="text-sm font-medium">{label}</Label>
            )}

            <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="rounded-xl h-11"
                data-testid="team-people-search"
            />

            <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y bg-white">
                {filtered.length === 0 ? (
                    <p className="text-xs text-slate-500 px-3 py-4">{query.trim() ? 'No matches' : 'Paste emails below'}</p>
                ) : (
                    filtered.map((p) => (
                        <label
                            key={p.id}
                            className="flex items-center gap-2.5 px-3 py-2.5 text-sm cursor-pointer hover:bg-slate-50"
                        >
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(p.id)}
                                onChange={() => toggleId(p.id)}
                                className="accent-teal-700 w-4 h-4"
                            />
                            <span className="min-w-0">
                                <span className="font-medium text-slate-800 block truncate">{p.name}</span>
                                <span className="text-xs text-slate-500 truncate block">{p.email}</span>
                            </span>
                        </label>
                    ))
                )}
            </div>

            <div className="space-y-1.5">
                <Textarea
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@company.com"
                    rows={2}
                    className="rounded-xl text-sm"
                    data-testid="team-email-list"
                />
                <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={addEmails}>
                    {busy ? 'Reading' : 'Add'}
                </Button>
            </div>

            {selectedEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5" data-testid="team-email-chips">
                    {selectedEmails.map((email) => (
                        <span
                            key={email}
                            className="team-email-chip inline-flex items-center gap-1 max-w-full text-xs font-medium rounded-full pl-2.5 pr-1 py-1"
                            data-testid="team-email-chip"
                        >
                            <span className="min-w-0 truncate">{email}</span>
                            <button
                                type="button"
                                onClick={() => removeEmail(email)}
                                className="shrink-0 p-0.5 rounded-full opacity-70 hover:opacity-100"
                                aria-label={`Remove ${email}`}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TeamPeoplePicker;
