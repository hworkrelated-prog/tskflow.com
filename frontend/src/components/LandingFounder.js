import React from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Users, Sparkles, Linkedin, Calendar } from 'lucide-react';

const CRED = [
    { id: 'yrs', Icon: Briefcase, label: '5 yrs leading' },
    { id: 'aes', Icon: Users, label: '20+ AEs' },
    { id: 'own', Icon: Sparkles, label: 'His own problem' },
];

/** One-screen mini-profile. Photo first. Almost no copy. */
export default function LandingFounder() {
    return (
        <section className="landing-founder" data-testid="landing-founder" aria-label="Get to Know the Founder">
            <img
                src="/founder.jpg"
                alt="Hashim Mahmood"
                className="landing-founder-photo"
                data-testid="landing-founder-photo"
                width={720}
                height={900}
            />
            <div className="landing-founder-copy">
                <h2 className="landing-founder-name" data-testid="landing-founder-name">Hashim Mahmood</h2>
                <p className="landing-founder-role" data-testid="landing-founder-title">
                    Founder, TskFlow — 5 years leading sales teams, IC + Manager
                </p>
                <p className="landing-founder-origin" data-testid="landing-founder-origin">
                    Built this because I was tired of chasing my own team for updates.
                </p>
                <ul className="landing-founder-cred" data-testid="landing-founder-cred">
                    {CRED.map((item) => (
                        <li key={item.id} data-testid={`landing-founder-cred-${item.id}`}>
                            <item.Icon className="w-4 h-4" aria-hidden />
                            <span>{item.label}</span>
                        </li>
                    ))}
                </ul>
                <div className="landing-founder-actions">
                    <a
                        className="landing-founder-btn"
                        href="https://www.linkedin.com/in/hashim-mahmood/"
                        target="_blank"
                        rel="noreferrer"
                        data-testid="landing-founder-linkedin"
                    >
                        <Linkedin className="w-4 h-4" aria-hidden />
                        LinkedIn
                    </a>
                    <Link
                        className="landing-founder-btn landing-founder-btn--ghost"
                        to="/contact"
                        data-testid="landing-founder-book"
                    >
                        <Calendar className="w-4 h-4" aria-hidden />
                        Book 5 min
                    </Link>
                </div>
            </div>
        </section>
    );
}
