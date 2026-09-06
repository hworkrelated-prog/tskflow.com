import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/App';
import TskFlowLogo from '@/components/TskFlowLogo';
import LandingMeetingPad from '@/components/LandingMeetingPad';
import { pinDocumentTheme, restoreDocumentTheme } from '@/lib/theme';

const DemoMeetingPage = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    useEffect(() => {
        pinDocumentTheme('dark');
        document.body.classList.add('landing-active');
        return () => {
            document.body.classList.remove('landing-active');
            restoreDocumentTheme();
        };
    }, []);

    return (
        <div className="landing-page landing-tool landing-visual min-h-screen text-white flex flex-col" style={{ background: '#050807' }} data-testid="demo-meeting-page">
            <header className="relative z-20 shrink-0 sticky top-0 bg-[#050807]/90 backdrop-blur-sm">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 landing-toolbar-row flex items-center gap-3">
                    <Link to="/" data-testid="demo-meeting-home" className="landing-brand-btn" aria-label="TskFlow home">
                        <TskFlowLogo variant="dark" size="sm" />
                    </Link>
                    <button
                        type="button"
                        className="landing-tabs-link ml-auto"
                        onClick={() => navigate('/login')}
                    >
                        Sign in
                    </button>
                </div>
            </header>
            <main className="relative z-10 flex-1">
                <section className="landing-meet-page">
                    <h1 className="landing-meet-headline">Take TskFlow to your next meeting</h1>
                    <p className="landing-meet-line">Keep this tab open. Type or paste what people said.</p>
                    <LandingMeetingPad login={login} onAuthed={(url) => navigate(url)} />
                    <p className="landing-prompt-hint">Free. No account.</p>
                </section>
            </main>
        </div>
    );
};

export default DemoMeetingPage;
