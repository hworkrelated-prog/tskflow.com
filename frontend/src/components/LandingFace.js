import React from 'react';
import { CAST } from '@/lib/landingCast';

/** Photo when we have one. Slack uses a rounded square. Meet/Gmail use a circle. */
export default function LandingFace({ who, size = 36, radius = 8, className = '' }) {
    const person = typeof who === 'string' ? CAST[String(who).toLowerCase()] : who;
    if (!person) return null;
    if (person.photo) {
        return (
            <img
                src={person.photo}
                alt=""
                width={size}
                height={size}
                className={`landing-face ${className}`.trim()}
                style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover' }}
                data-testid={`landing-face-${person.id}`}
            />
        );
    }
    return (
        <span
            className={`landing-cast landing-cast--md ${className}`.trim()}
            style={{
                background: person.bg,
                color: person.fg,
                width: size,
                height: size,
                borderRadius: radius,
                fontSize: size * 0.38,
            }}
            title={person.name}
        >
            {person.initial}
        </span>
    );
}
