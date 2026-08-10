/**
 * Shared MediaRecorder helpers — MIME negotiation that works across Chrome,
 * Edge, Firefox, and Safari (mp4/H.264 when WebM isn't available).
 */

const PREFERRED_MIME_TYPES = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
];

/** Pick the best MIME type the current browser can record. Returns '' if none. */
export const pickRecorderMimeType = () => {
    try {
        if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
            return '';
        }
        return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    } catch {
        return '';
    }
};

/** File extension for a MIME type (used for uploads / downloads). */
export const extForMime = (mime) => {
    const m = (mime || '').toLowerCase();
    if (m.includes('mp4')) return 'mp4';
    if (m.includes('webm')) return 'webm';
    if (m.includes('ogg')) return 'ogg';
    return 'webm';
};

/** Human-readable recording capability check for upfront UX. */
export const canRecordScreen = () => {
    try {
        return !!(
            navigator?.mediaDevices?.getDisplayMedia &&
            typeof MediaRecorder !== 'undefined'
        );
    } catch {
        return false;
    }
};

/** Friendly error message for getDisplayMedia / getUserMedia failures. */
export const mediaErrorMessage = (err, kind = 'screen') => {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return kind === 'screen'
            ? 'Screen sharing was blocked. Click the camera/lock icon in the address bar and allow screen capture, then try again.'
            : `${kind === 'mic' ? 'Microphone' : 'Camera'} access was blocked. Allow it in your browser settings and try again.`;
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return kind === 'mic'
            ? 'No microphone found. Plug one in or continue without commentary.'
            : kind === 'camera'
                ? 'No camera found. Continuing without webcam.'
                : 'No screen capture source available.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return 'The device is already in use by another app. Close other apps using it and try again.';
    }
    if (name === 'NotSupportedError' || name === 'TypeError') {
        return 'Screen recording is not supported in this browser. Please use Chrome, Edge, or Firefox.';
    }
    if (name === 'AbortError') {
        return 'Screen share was cancelled.';
    }
    return err?.message || 'Could not start recording';
};
