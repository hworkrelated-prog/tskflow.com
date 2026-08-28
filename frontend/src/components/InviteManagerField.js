import React, { useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';

/**
 * Invite a manager who is not on the list yet. Sends email; links them when they join.
 */
const InviteManagerField = ({
    domain,
    people = [],
    onLinked,
    value: controlledValue,
    onChange,
    testId = 'team-setup-manager-email',
}) => {
    const [uncontrolled, setUncontrolled] = useState('');
    const [busy, setBusy] = useState(false);
    const [invited, setInvited] = useState('');
    const isControlled = controlledValue !== undefined;
    const email = isControlled ? controlledValue : uncontrolled;
    const setEmail = (next) => {
        if (!isControlled) setUncontrolled(next);
        onChange?.(next);
    };

    const send = async (e) => {
        e?.preventDefault?.();
        const value = email.trim().toLowerCase();
        if (!value || !value.includes('@')) {
            toast.error('Enter an email');
            return;
        }
        const listed = (people || []).find((p) => (p.email || '').toLowerCase() === value);
        setBusy(true);
        try {
            if (listed?.id) {
                const res = await axios.post(`${API}/team/set-manager`, { manager_id: listed.id });
                onLinked?.({ manager: res.data?.manager || listed, pending: false });
                toast.success(res.data?.message || 'Saved');
                setEmail('');
                return;
            }
            const res = await axios.post(`${API}/team/set-manager`, { manager_email: value });
            if (res.data?.manager) {
                onLinked?.({ manager: res.data.manager, pending: false });
                setEmail('');
            } else {
                setInvited(value);
                onLinked?.({ email: value, pending: true });
            }
            toast.success(res.data?.message || `Invite sent to ${value}`);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not send invite'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={send} className="space-y-2" data-testid="invite-manager-field">
            <p className="text-sm text-muted-foreground">Or invite by email</p>
            <div className="flex gap-2">
                <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={domain ? `name@${domain}` : 'name@company.com'}
                    className="rounded-xl h-12"
                    data-testid={testId}
                    autoComplete="off"
                />
                <Button
                    type="submit"
                    variant="outline"
                    className="rounded-full shrink-0 h-12 px-4"
                    disabled={busy || !email.trim()}
                    data-testid={`${testId}-send`}
                >
                    {busy ? 'Sending…' : 'Invite'}
                </Button>
            </div>
            {invited ? (
                <p className="text-sm text-muted-foreground" data-testid="manager-invite-pending">
                    Invite sent to {invited}
                </p>
            ) : null}
        </form>
    );
};

export default InviteManagerField;
