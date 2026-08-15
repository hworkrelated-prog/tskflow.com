import React from 'react';
import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';
import { LEGAL_ENTITY, SITE_URL, TRADE_NAME } from '@/components/LegalEntityNotice';

const LegalPage = () => {
    return (
        <div data-testid="legal-page" className="min-h-screen bg-white">
            <header className="border-b">
                <div className="container mx-auto px-6 py-4">
                    <Link to="/" className="flex items-center gap-2 w-fit">
                        <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                            <Target className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent" style={{ fontFamily: 'Outfit' }}>Tskflow</span>
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-6 py-12 max-w-3xl">
                <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Outfit' }}>Legal</h1>
                <p className="text-muted-foreground mb-8">Last updated: August 15, 2026</p>

                <div className="prose prose-slate max-w-none space-y-6 text-slate-700 leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">Legal entity and trade name</h2>
                        <p>
                            <strong>{TRADE_NAME}</strong> (also styled &quot;Tskflow&quot;) is a trade name of <strong>{LEGAL_ENTITY}</strong>.
                            {' '}{LEGAL_ENTITY} is the legal entity that owns and operates {TRADE_NAME} and the website {SITE_URL.replace('https://', '')}.
                        </p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li><strong>Legal name:</strong> {LEGAL_ENTITY}</li>
                            <li><strong>Trade name / brand:</strong> {TRADE_NAME} (Tskflow)</li>
                            <li><strong>Website:</strong> <a href={SITE_URL} className="text-indigo-600 underline">{SITE_URL}</a></li>
                            <li><strong>Contact:</strong> <a href="mailto:hashim@tskflow.com" className="text-indigo-600 underline">hashim@tskflow.com</a></li>
                        </ul>
                        <p>
                            Campaign descriptions, customer communications, product branding, and SMS (where you opt in) that refer to {TRADE_NAME} refer to services provided by {LEGAL_ENTITY}.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-slate-900">Policies</h2>
                        <p>
                            <Link to="/terms" className="text-indigo-600 underline">Terms of Service</Link>
                            {' · '}
                            <Link to="/privacy" className="text-indigo-600 underline">Privacy Policy</Link>
                            {' · '}
                            <Link to="/contact" className="text-indigo-600 underline">Contact</Link>
                        </p>
                    </section>
                </div>
            </main>
        </div>
    );
};

export default LegalPage;
