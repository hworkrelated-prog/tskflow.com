import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { toast } from 'sonner';

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
}) => {
    const [emailInput, setEmailInput] = useState('');
    const [query, setQuery] = useState('');

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

    const addEmails = () => {
        const input = emailInput.trim();
        if (!input) {
            toast.error('Enter an email address');
            return;
        }
        const lines = input.split(/[\n,;]+/).map((l) => l.trim().toLowerCase()).filter(Boolean);
        const valid = lines.filter((e) => e.includes('@'));
        const fresh = valid.filter((e) => !selectedEmails.includes(e));
        if (!fresh.length) {
            toast.error(valid.length ? 'All emails already added' : 'Enter a valid email');
            return;
        }
        onChange?.({ userIds: selectedIds, emails: [...selectedEmails, ...fresh] });
        setEmailInput('');
        if (fresh.length > 1) toast.success(`Added ${fresh.length} emails`);
    };

    const removeEmail = (email) => {
        onChange?.({ userIds: selectedIds, emails: selectedEmails.filter((e) => e !== email) });
    };

    return (
        <div className="space-y-3" data-testid="team-people-picker">
            <div>
                <Label className="text-sm font-medium">{label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Select people already on Tskflow, or paste a list of emails (comma or new line).
                </p>
            </div>

            <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search teammates…"
                className="rounded-xl"
                data-testid="team-people-search"
            />

            <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y bg-white">
                {filtered.length === 0 ? (
                    <p className="text-xs text-slate-500 px-3 py-4">No matching teammates</p>
                ) : (
                    filtered.map((p) => (
                        <label
                            key={p.id}
                            className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                        >
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(p.id)}
                                onChange={() => toggleId(p.id)}
                                className="accent-teal-700"
                            />
                            <span className="min-w-0">
                                <span className="font-medium text-slate-800 block truncate">{p.name}</span>
                                <span className="text-xs text-slate-500 truncate block">{p.email}</span>
                            </span>
                            {p.reports_to_you && (
                                <span className="ml-auto text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-full shrink-0">On your team</span>
                            )}
                        </label>
                    ))
                )}
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Add by email (not on the list yet)</Label>
                <Textarea
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder={"alex@company.com\njamie@company.com"}
                    rows={2}
                    className="rounded-xl text-sm"
                    data-testid="team-email-list"
                />
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={addEmails}>
                    Add emails
                </Button>
            </div>

            {selectedEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selectedEmails.map((email) => (
                        <span
                            key={email}
                            className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 rounded-full pl-2.5 pr-1 py-1"
                        >
                            {email}
                            <button type="button" onClick={() => removeEmail(email)} className="p-0.5 rounded-full hover:bg-slate-200" aria-label="Remove">
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
