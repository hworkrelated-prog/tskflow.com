import React from 'react';
import { Mail, MessageSquare, Calendar, Video } from 'lucide-react';

const SalesforceMark = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M10.2 6.4c.7-1.2 2-2 3.4-2 1.7 0 3.1 1 3.7 2.5 1.5-.4 3.1.5 3.5 2 .4 1.6-.5 3.2-2 3.7v.1c0 2.2-1.8 4-4 4H8.4C6 16.7 4 14.7 4 12.2c0-2.2 1.6-4 3.7-4.3.5-1 1.5-1.7 2.5-1.5z" />
    </svg>
);

const ITEMS = [
    { id: 'email', label: 'Email', Icon: Mail },
    { id: 'slack', label: 'Slack', Icon: MessageSquare },
    { id: 'calendar', label: 'Calendar', Icon: Calendar },
    { id: 'salesforce', label: 'Salesforce', Icon: SalesforceMark },
    { id: 'meet', label: 'Meet', Icon: Video },
];

/** Channel marks only. No descriptive text. */
export default function LandingIntegrations() {
    return (
        <section
            className="landing-story landing-story--slim"
            data-testid="landing-integrations"
            aria-label="Email, Slack, Calendar, Salesforce, Meet"
        >
            <div className="landing-integ-row">
                {ITEMS.map((item) => (
                    <span
                        key={item.id}
                        className="landing-integ"
                        title={item.label}
                        aria-label={item.label}
                        data-testid={`landing-integ-${item.id}`}
                    >
                        <item.Icon className="w-5 h-5" />
                    </span>
                ))}
            </div>
        </section>
    );
}
