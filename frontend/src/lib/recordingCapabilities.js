/** True when the page can capture a display/tab/window (desktop Chrome/Safari). iPhone Safari cannot. */
export function canCaptureDisplay() {
    if (typeof navigator === 'undefined') return false;
    return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

/** True when the page can record the device camera/mic in-browser (phones included). */
export function canRecordWithCamera() {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
    return typeof navigator.mediaDevices?.getUserMedia === 'function'
        && typeof window.MediaRecorder === 'function';
}

export function isAppleMobile() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    if (/iPhone|iPad|iPod/i.test(ua) || /iPhone|iPad|iPod/i.test(platform)) return true;
    // iPadOS 13+ reports as MacIntel but has touch
    if (platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    return false;
}

export function needsIosScreenRecordFlow() {
    return isAppleMobile() || !canCaptureDisplay();
}

/** Safari on iPhone prefers MP4; desktop Chrome prefers WebM. */
export function pickRecorderMime() {
    if (typeof window === 'undefined' || !window.MediaRecorder?.isTypeSupported) return '';
    const types = [
        'video/mp4',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
    ];
    return types.find((t) => window.MediaRecorder.isTypeSupported(t)) || '';
}

export function recordingFilename(contentType, prefix = 'screen-recording') {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const ct = (contentType || '').toLowerCase();
    const ext = ct.includes('mp4') ? 'mp4' : ct.includes('quicktime') || ct.includes('mov') ? 'mov' : 'webm';
    return `${prefix}-${stamp}.${ext}`;
}
