import React from 'react';

/** Photo + name. No pitch. */
export default function LandingFounder() {
    return (
        <section className="landing-founder" data-testid="landing-founder" aria-label="Founder">
            <img
                src="/founder.jpg"
                alt="Hashim Mahmood"
                className="landing-founder-photo"
                data-testid="landing-founder-photo"
                width={400}
                height={400}
            />
            <h2 className="landing-founder-name" data-testid="landing-founder-name">Hashim Mahmood</h2>
            <p className="landing-founder-role">Founder · Sales</p>
            <a
                className="landing-founder-link"
                href="https://www.linkedin.com/in/hashim-mahmood/"
                target="_blank"
                rel="noreferrer"
                data-testid="landing-founder-linkedin"
            >
                LinkedIn
            </a>
        </section>
    );
}
