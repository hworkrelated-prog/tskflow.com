import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Sparkles } from 'lucide-react';

const UpdatesPage = () => {
    const [updates, setUpdates] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        (async () => {
            try {
                const res = await axios.get(`${API}/product-updates`);
                setUpdates(res.data.updates || []);
            } finally { setLoading(false); }
        })();
    }, []);

    return (
        <div className="min-h-screen bg-white">
            <header className="border-b bg-white sticky top-0 z-10">
                <div className="container mx-auto px-6 py-4">
                    <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-2">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-indigo-600" />
                        <h1 className="text-2xl font-semibold">What&apos;s New</h1>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Everything we shipped in the latest batch — before &amp; after.</p>
                </div>
            </header>
            <main className="container mx-auto px-6 py-8 max-w-4xl space-y-4">
                {loading ? (
                    <div className="text-center text-muted-foreground py-10">Loading updates...</div>
                ) : updates.map((u) => (
                    <div key={u.id} className="border-2 rounded-2xl p-5 hover:shadow-md transition-shadow">
                        <div className="text-xs font-medium text-indigo-600 uppercase tracking-wide mb-1">{u.area}</div>
                        <div className="font-semibold text-lg mb-2">{u.change}</div>
                        <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-gray-500">Before:</span> {u.was}
                        </div>
                    </div>
                ))}
            </main>
        </div>
    );
};

export default UpdatesPage;
