import React from 'react';
import { CAST } from '@/lib/landingCast';

export default function LandingCastMark({ who, size = 'md', className = '' }) {
    const person = typeof who === 'string' ? CAST[String(who).toLowerCase()] : who;
    if (!person) return null;
    return (
        <span
            className={`landing-cast landing-cast--${size} ${className}`.trim()}
            style={{ background: person.bg, color: person.fg }}
            title={person.name}
            data-testid={`landing-cast-${person.id}`}
        >
            {person.initial}
        </span>
    );
}

export function StoryTask({
    task,
    buried,
    weak,
    flagged,
    className = '',
    children,
    ...rest
}) {
    return (
        <article
            className={[
                'landing-story-task',
                `landing-story-task--${task.tone}`,
                buried ? 'is-buried' : '',
                weak ? 'is-weak' : '',
                flagged ? 'is-flag' : '',
                className,
            ].filter(Boolean).join(' ')}
            data-testid={`landing-task-${task.id}`}
            {...rest}
        >
            <div className="landing-story-task-row">
                <LandingCastMark who={task.who} size="sm" />
                <span className="landing-story-task-title">{task.title}</span>
            </div>
            {task.due ? (
                <span className="landing-clockchip landing-clockchip--sm">{task.due}</span>
            ) : null}
            {children}
        </article>
    );
}
