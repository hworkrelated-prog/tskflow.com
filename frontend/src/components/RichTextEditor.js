import React, { useMemo } from 'react';
import { Textarea } from '@/components/ui/textarea';

/** Strip HTML tags for plain-text editing (legacy Quill content still displays elsewhere). */
function htmlToPlainText(html) {
    if (!html) return '';
    if (!/<[a-z][\s\S]*>/i.test(html)) return html;
    try {
        if (typeof document !== 'undefined') {
            const el = document.createElement('div');
            el.innerHTML = html;
            return (el.textContent || el.innerText || '').trim();
        }
    } catch (_) { /* noop */ }
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Description editor - plain textarea (no react-quill dependency).
 * Keeps the same value/onChange API used across TaskHub, TaskDetail, etc.
 */
const RichTextEditor = ({ value, onChange, placeholder = 'Enter description...', className = '' }) => {
    const displayValue = useMemo(() => htmlToPlainText(value), [value]);

    return (
        <div className={`rich-text-editor ${className}`}>
            <Textarea
                value={displayValue}
                onChange={(e) => onChange?.(e.target.value)}
                placeholder={placeholder}
                className="min-h-[150px] rounded-xl bg-white text-sm"
                rows={6}
                data-testid="rich-text-editor"
            />
        </div>
    );
};

export default RichTextEditor;
