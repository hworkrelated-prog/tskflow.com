import React from 'react';
import { Briefcase, Users, Sparkles, Linkedin, Calendar } from 'lucide-react';

export const FOUNDER_CALENDAR_URL = 'https://calendly.com/hashim-tskflow/30min';

const CRED = [
    { id: 'yrs', Icon: Briefcase, label: '~10 yrs in sales' },
    { id: 'aes', Icon: Users, label: 'AEs + managers' },
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
                    Founder, TskFlow — almost a decade in sales, Regional Director
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
                    <a
                        className="landing-founder-btn landing-founder-btn--ghost"
                        href={FOUNDER_CALENDAR_URL}
                        target="_blank"
                        rel="noreferrer"
                        data-testid="landing-founder-book"
                    >
                        <Calendar className="w-4 h-4" aria-hidden />
                        Book a meeting
                    </a>
                </div>
            </div>
        </section>
    );
}
