import React from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';

/**
 * One nameless bar: type a topic, get a shareable link.
 */
export default function UnbiasslyTopicBar({ topic, onChange, creating, onSubmit }) {
    const ready = topic.trim().length >= 3;

    return (
        <form className="unbiassly-topic-bar" onSubmit={onSubmit} data-testid="unbiassly-create-form">
            <label htmlFor="unbiassly-topic" className="sr-only">
                Topic for discussion or collecting feedback
            </label>
            <input
                id="unbiassly-topic"
                data-testid="unbiassly-topic"
                value={topic}
                onChange={(e) => onChange(e.target.value)}
                maxLength={160}
                placeholder="A topic for discussion or collecting feedback"
                className="unbiassly-topic-bar-input"
                autoComplete="off"
                autoCorrect="off"
            />
            <button
                type="submit"
                disabled={creating || !ready}
                className={`unbiassly-topic-bar-send${ready || creating ? ' is-ready' : ''}`}
                data-testid="unbiassly-create"
                aria-label={creating ? 'Creating link' : 'Create a link'}
            >
                {creating
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <ArrowUp className="w-4 h-4" strokeWidth={2.25} />}
            </button>
        </form>
    );
}
