import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2 } from 'lucide-react';

const STEPS = [
    'Create a link.',
    'Share it with whoever should speak.',
    'They write. No name. No account.',
    'You get the summary.',
];

/**
 * Same dark surface as the rest of the landing. One job: start an honest discussion.
 */
export default function LandingUnbiassly({ ctaTo = '/login?next=/unbiassly' } = {}) {
    const navigate = useNavigate();

    return (
        <section className="landing-unbiassly" data-testid="landing-unbiassly-panel" aria-label="Unbiassly">
            <h1 className="landing-unbiassly-title" data-testid="landing-unbiassly-title">
                Unbiassly
            </h1>
            <p className="landing-unbiassly-lead" data-testid="landing-unbiassly-lead">
                Create a link. Get the discussion going. I will summarize it for you.
            </p>
            <ol className="landing-unbiassly-steps">
                {STEPS.map((step, i) => (
                    <li key={step}>
                        <span>{i + 1}</span>
                        {step}
                    </li>
                ))}
            </ol>
            <button
                type="button"
                className="landing-cta"
                onClick={() => navigate(ctaTo)}
                data-testid="landing-unbiassly-create"
            >
                <Link2 className="w-4 h-4" aria-hidden />
                Create a link
            </button>
        </section>
    );
}
