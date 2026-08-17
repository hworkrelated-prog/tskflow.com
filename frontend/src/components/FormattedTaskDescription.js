import React from 'react';
import {
    descriptionHasStructuredHtml,
    parseDescriptionBlocks,
    rewriteSelfAssignCopy,
} from '@/lib/taskDescription';

const FormattedTaskDescription = ({ value, className = '', testId = 'task-description', isSelf = false }) => {
    if (!value) {
        return <p className="mt-2 text-sm text-muted-foreground italic">No description</p>;
    }

    const source = isSelf ? rewriteSelfAssignCopy(value) : value;

    if (descriptionHasStructuredHtml(source)) {
        return (
            <div
                className={`mt-2 text-base leading-relaxed prose prose-sm max-w-none break-words [word-break:break-word] overflow-hidden text-foreground ${className}`}
                style={{ overflowWrap: 'anywhere' }}
                dangerouslySetInnerHTML={{ __html: source }}
                data-testid={testId}
            />
        );
    }

    const blocks = parseDescriptionBlocks(source);
    return (
        <div className={`mt-2 space-y-3 text-base leading-relaxed text-foreground ${className}`} data-testid={testId}>
            {blocks.map((block, i) => {
                if (block.type === 'h') {
                    return (
                        <p key={i} className="font-semibold text-foreground pt-1">
                            {block.text}
                        </p>
                    );
                }
                if (block.type === 'ol') {
                    return (
                        <ol key={i} className="list-decimal pl-5 space-y-1.5">
                            {block.items.map((item, j) => (
                                <li key={j} className="break-words pl-1">
                                    {item}
                                </li>
                            ))}
                        </ol>
                    );
                }
                return (
                    <p key={i} className="whitespace-pre-wrap break-words">
                        {block.text}
                    </p>
                );
            })}
        </div>
    );
};

export default FormattedTaskDescription;
