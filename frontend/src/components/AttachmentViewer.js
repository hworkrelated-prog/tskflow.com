import React from 'react';
import { fileUrl } from '@/lib/upload';
import { FileText, Download, Video, Image as ImageIcon, Paperclip } from 'lucide-react';

const iconFor = (kind) => {
    if (kind === 'video') return <Video className="w-4 h-4" />;
    if (kind === 'image') return <ImageIcon className="w-4 h-4" />;
    if (kind === 'file') return <FileText className="w-4 h-4" />;
    return <Paperclip className="w-4 h-4" />;
};

export const AttachmentViewer = ({ attachments }) => {
    if (!attachments || attachments.length === 0) return null;
    return (
        <div className="space-y-3" data-testid="attachment-viewer">
            {attachments.map((att, idx) => {
                if (!att || !att.storage_path) return null;
                const url = fileUrl(att.storage_path);
                const key = att.id || `${att.storage_path}-${idx}`;
                const kind = att.kind || (att.content_type && att.content_type.startsWith('video/') ? 'video' : att.content_type && att.content_type.startsWith('image/') ? 'image' : 'file');
                if (kind === 'video') {
                    return (
                        <div key={key} className="rounded-xl overflow-hidden border bg-black" data-testid={`attachment-${att.id || idx}`}>
                            <video src={url} controls preload="metadata" className="w-full max-h-96 bg-black" />
                            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 text-white text-xs">
                                <span className="flex items-center gap-2 truncate"><Video className="w-3.5 h-3.5" />{att.original_filename || 'recording.webm'}</span>
                                <a href={url} target="_blank" rel="noreferrer" className="underline shrink-0">Open</a>
                            </div>
                        </div>
                    );
                }
                if (kind === 'image') {
                    return (
                        <a key={key} href={url} target="_blank" rel="noreferrer" data-testid={`attachment-${att.id || idx}`} className="block rounded-xl overflow-hidden border">
                            <img src={url} alt={att.original_filename || 'image'} className="w-full max-h-96 object-contain bg-slate-50" />
                        </a>
                    );
                }
                return (
                    <a
                        key={key}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`attachment-${att.id || idx}`}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                        <span className="flex items-center gap-2 truncate text-sm">{iconFor(kind)}{att.original_filename || 'file'}</span>
                        <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                    </a>
                );
            })}
        </div>
    );
};

export default AttachmentViewer;
