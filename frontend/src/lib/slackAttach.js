/** Classify task attachments the way Slack does: images, video thumbs, files. */

export const isImageAttach = (att) => {
    if (!att) return false;
    if (typeof att === 'string') return true;
    const kind = String(att.kind || '').toLowerCase();
    const type = String(att.content_type || att.mime_type || '').toLowerCase();
    if (kind === 'image' || type.startsWith('image/')) return true;
    const name = String(att.original_filename || att.filename || att.name || '');
    return /\.(png|jpe?g|gif|webp|bmp|heic|svg)$/i.test(name);
};

export const isVideoAttach = (att) => {
    if (!att || typeof att === 'string') return false;
    const kind = String(att.kind || '').toLowerCase();
    const type = String(att.content_type || att.mime_type || '').toLowerCase();
    return kind === 'video' || type.startsWith('video/');
};

export const attachUrl = (att, toUrl) => {
    if (!att) return '';
    if (typeof att === 'string') return att;
    if (att.previewUrl) return att.previewUrl;
    if (att.url) return att.url;
    if (att.src) return att.src;
    if (att.storage_path && typeof toUrl === 'function') return toUrl(att.storage_path);
    return '';
};

export const attachName = (att) => {
    if (!att || typeof att === 'string') return '';
    return att.original_filename || att.filename || att.name || '';
};

export const attachKey = (att, i) => {
    if (typeof att === 'string') return `${att}-${i}`;
    return att.id || att.storage_path || att.url || `att-${i}`;
};

export const splitSlackAttaches = (list = []) => {
    const images = [];
    const videos = [];
    const files = [];
    (list || []).forEach((att, i) => {
        if (!att) return;
        const item = { att, i };
        if (isImageAttach(att)) images.push(item);
        else if (isVideoAttach(att)) videos.push(item);
        else files.push(item);
    });
    return { images, videos, files };
};

/** Slack mosaic: 1 large, 2 side-by-side, 3 = 2+1, 4+ = 2x2 with overflow. */
export const slackMosaicClass = (count) => {
    if (count <= 1) return 'slack-mosaic slack-mosaic--1';
    if (count === 2) return 'slack-mosaic slack-mosaic--2';
    if (count === 3) return 'slack-mosaic slack-mosaic--3';
    return 'slack-mosaic slack-mosaic--4';
};
