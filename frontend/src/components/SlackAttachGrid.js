import React, { useState } from 'react';
import { X, FileText, Download, Video, Play } from 'lucide-react';
import { fileUrl } from '@/lib/upload';
import {
    attachKey,
    attachName,
    attachUrl,
    slackMosaicClass,
    splitSlackAttaches,
} from '@/lib/slackAttach';

const Lightbox = ({ open, url, name, video, onClose }) => {
    if (!open || !url) return null;
    return (
        <button
            type="button"
            className="slack-lightbox"
            data-testid="slack-lightbox"
            onClick={onClose}
            aria-label="Close"
        >
            <span className="slack-lightbox-frame" onClick={(e) => e.stopPropagation()}>
                {video ? (
                    <video src={url} controls autoPlay className="slack-lightbox-media" />
                ) : (
                    <img src={url} alt={name || ''} className="slack-lightbox-media" />
                )}
                <button type="button" className="slack-lightbox-x" onClick={onClose} aria-label="Close preview">
                    <X className="w-4 h-4" />
                </button>
            </span>
        </button>
    );
};

/**
 * Pictures sit in a Slack-style mosaic: rounded tiles, no filename, click to expand.
 */
export default function SlackAttachGrid({
    attachments = [],
    items,
    onRemove,
    compact = false,
    testId = 'slack-attach-grid',
}) {
    const raw = items || attachments || [];
    const list = raw.filter((att) => {
        if (!att) return false;
        if (typeof att === 'string') return Boolean(att);
        return Boolean(att.storage_path || att.url || att.src || att.previewUrl);
    });
    const { images, videos, files } = splitSlackAttaches(list);
    const [open, setOpen] = useState(null);

    if (!list.length) return null;

    const shown = images.slice(0, 4);
    const extra = Math.max(0, images.length - 4);

    return (
        <div className={`slack-attach${compact ? ' is-compact' : ''}`} data-testid={testId}>
            {images.length > 0 && (
                <div className={slackMosaicClass(images.length)} data-testid="slack-image-mosaic">
                    {shown.map(({ att, i }, slot) => {
                        const url = attachUrl(att, fileUrl);
                        const name = attachName(att);
                        const last = slot === shown.length - 1 && extra > 0;
                        return (
                            <button
                                type="button"
                                key={attachKey(att, i)}
                                className="slack-tile"
                                data-testid={`slack-image-${i}`}
                                onClick={() => url && setOpen({ url, name, video: false })}
                                title={name || 'Image'}
                            >
                                {url ? <img src={url} alt="" /> : <span className="slack-tile-empty" />}
                                {last && <span className="slack-tile-more">+{extra}</span>}
                                {onRemove && (
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        className="slack-tile-remove"
                                        aria-label="Remove"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemove(att, i);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onRemove(att, i);
                                            }
                                        }}
                                    >
                                        <X className="w-3 h-3" />
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {videos.map(({ att, i }) => {
                const url = attachUrl(att, fileUrl);
                const name = attachName(att) || 'Recording';
                return (
                    <button
                        type="button"
                        key={attachKey(att, i)}
                        className="slack-video"
                        data-testid={`slack-video-${i}`}
                        onClick={() => url && setOpen({ url, name, video: true })}
                    >
                        <span className="slack-video-play" aria-hidden>
                            <Play className="w-4 h-4" />
                        </span>
                        <Video className="w-3.5 h-3.5" />
                        <span className="slack-video-name">{name}</span>
                        {onRemove && (
                            <span
                                role="button"
                                tabIndex={0}
                                className="slack-file-remove"
                                aria-label="Remove"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(att, i);
                                }}
                            >
                                <X className="w-3 h-3" />
                            </span>
                        )}
                    </button>
                );
            })}

            {files.map(({ att, i }) => {
                const url = attachUrl(att, fileUrl);
                const name = attachName(att) || 'File';
                return (
                    <a
                        key={attachKey(att, i)}
                        href={url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="slack-file"
                        data-testid={`slack-file-${i}`}
                        onClick={(e) => {
                            if (!url) e.preventDefault();
                        }}
                    >
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="truncate">{name}</span>
                        <Download className="w-3.5 h-3.5 shrink-0 opacity-60" />
                        {onRemove && (
                            <span
                                role="button"
                                tabIndex={0}
                                className="slack-file-remove"
                                aria-label="Remove"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onRemove(att, i);
                                }}
                            >
                                <X className="w-3 h-3" />
                            </span>
                        )}
                    </a>
                );
            })}

            <Lightbox
                open={Boolean(open)}
                url={open?.url}
                name={open?.name}
                video={open?.video}
                onClose={() => setOpen(null)}
            />
        </div>
    );
}
