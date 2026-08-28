import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';

const MailClaimPage = () => {
    const [params] = useSearchParams();
    const id = params.get('id') || '';
    const token = params.get('token') || '';
    const [done, setDone] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const send = async (action) => {
        setBusy(true);
        setError('');
        try {
            await axios.post(`${API}/mail/claim`, { id, token, action });
            setDone(action);
        } catch (e) {
            setError(e?.response?.data?.detail || 'Could not save that. Try opening Tskflow.');
        } finally {
            setBusy(false);
        }
    };

    if (done) {
        return (
            <div className="min-h-screen gradient-mesh flex items-center justify-center p-6" data-testid="mail-claim-done">
                <div className="text-center space-y-2">
                    <p className="text-2xl font-semibold" style={{ fontFamily: 'Outfit' }}>
                        {done === 'yes' ? 'Thanks' : 'Got it'}
                    </p>
                    <p className="text-sm text-muted-foreground">You can close this.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen gradient-mesh flex items-center justify-center p-6" data-testid="mail-claim-page">
            <div className="w-full max-w-sm space-y-5 text-center">
                <p className="text-2xl font-semibold" style={{ fontFamily: 'Outfit' }}>Are you their manager?</p>
                <p className="text-sm text-muted-foreground">Yes or No is enough. Either answer is respected.</p>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <div className="flex flex-col gap-2">
                    <Button className="rounded-full h-12" disabled={busy || !id || !token} onClick={() => send('yes')} data-testid="mail-claim-yes">
                        Yes
                    </Button>
                    <Button variant="outline" className="rounded-full h-12" disabled={busy || !id || !token} onClick={() => send('no')} data-testid="mail-claim-no">
                        No
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default MailClaimPage;
