import axios from 'axios';
import { API } from '@/App';

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB — safely under proxy limits
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isRetryable = (err) => {
    if (!err) return false;
    if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') return true;
    const status = err?.response?.status;
    // Retry on rate limits, gateway errors, and transient server errors.
    return status === 408 || status === 429 || (status >= 500 && status <= 599);
};

const withRetry = async (fn, { label = 'request', onRetry } = {}) => {
    let lastErr;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt >= MAX_RETRIES || !isRetryable(err)) throw err;
            const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
            if (onRetry) onRetry(attempt + 1, delay, err);
            // eslint-disable-next-line no-console
            console.warn(`[upload] ${label} failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms`, err?.message || err);
            await sleep(delay);
        }
    }
    throw lastErr;
};

const uploadErrorMessage = (err) => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (err?.response?.status === 413) return 'Recording is too large (max 200MB). Try a shorter recording.';
    if (err?.response?.status === 502) return 'Storage is temporarily unavailable. Please try again in a moment.';
    if (err?.code === 'ERR_NETWORK') return 'Network error while uploading. Check your connection and try again.';
    return err?.message || 'Upload failed';
};

/**
 * Uploads a Blob/File to cloud object storage via chunked upload with retries.
 * Returns the attachment reference { id, storage_path, original_filename, content_type, size, kind }.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @param {string} contentType
 * @param {(pct: number) => void} [onProgress]
 * @param {{ signal?: AbortSignal }} [opts]
 */
export const uploadBlob = async (blob, filename, contentType, onProgress, opts = {}) => {
    if (!blob || !blob.size) {
        throw new Error('Nothing to upload — recording was empty.');
    }

    try {
        const { data: startData } = await withRetry(
            () => axios.post(`${API}/uploads/start`, null, { signal: opts.signal }),
            { label: 'uploads/start' },
        );
        const uploadId = startData.upload_id;

        const total = blob.size;
        let sent = 0;
        for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
            if (opts.signal?.aborted) {
                const abortErr = new Error('Upload cancelled');
                abortErr.name = 'AbortError';
                throw abortErr;
            }
            const chunk = blob.slice(offset, offset + CHUNK_SIZE);
            await withRetry(
                () => axios.put(`${API}/uploads/${uploadId}/chunk`, chunk, {
                    headers: { 'Content-Type': 'application/octet-stream' },
                    signal: opts.signal,
                    timeout: 120_000,
                }),
                { label: `uploads/chunk@${offset}` },
            );
            sent += chunk.size;
            if (onProgress) onProgress(Math.min(99, Math.round((sent / total) * 100)));
        }

        const { data: attachment } = await withRetry(
            () => axios.post(`${API}/uploads/${uploadId}/finish`, {
                filename: filename || 'file',
                content_type: contentType || blob.type || 'application/octet-stream',
            }, { signal: opts.signal, timeout: 180_000 }),
            { label: 'uploads/finish' },
        );
        if (onProgress) onProgress(100);
        return attachment;
    } catch (err) {
        if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') throw err;
        const wrapped = new Error(uploadErrorMessage(err));
        wrapped.cause = err;
        wrapped.response = err?.response;
        throw wrapped;
    }
};

/** Build an authenticated, inline-streamable URL for an attachment (usable in <video>/<img> src). */
export const fileUrl = (storagePath) => {
    if (!storagePath) return '';
    // Absolute http(s) URLs (legacy/external) pass through.
    if (/^https?:\/\//i.test(storagePath)) return storagePath;
    const token = localStorage.getItem('token');
    return `${API}/files/${storagePath}?auth=${encodeURIComponent(token || '')}`;
};

/** Public stream URL for a shareable recording token (no JWT required). */
export const publicRecordingStreamUrl = (token) => {
    if (!token) return '';
    return `${API}/recordings/${encodeURIComponent(token)}/stream`;
};
