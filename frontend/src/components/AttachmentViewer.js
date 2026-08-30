import React from 'react';
import SlackAttachGrid from '@/components/SlackAttachGrid';

export const AttachmentViewer = ({ attachments }) => {
    if (!attachments || attachments.length === 0) return null;
    return (
        <div className="space-y-3" data-testid="attachment-viewer">
            <SlackAttachGrid attachments={attachments} testId="attachment-slack-grid" />
        </div>
    );
};

export default AttachmentViewer;
