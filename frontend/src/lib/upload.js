import axios from 'axios';
import { API } from '@/App';

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB — safely under proxy limits
// Prefer single-shot upload under this size (avoids /tmp session loss across workers).
const DIRECT_MAX = 180 * 1024 * 1024;

const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Single-request upload — durable; no multi-step /tmp session.
 */
const uploadDirect = async (blob, filename, contentType, onProgress) => {
    const { data } = await axios.post(`${API}/uploads/direct`, blob, {
        headers: {
            ...authHeaders(),
            'Content-Type': contentType || blob.type || 'application/octet-stream',
            'X-Filename': encodeURIComponent(filename || 'file'),
            'X-Content-Type': contentType || blob.type || 'application/octet-stream',
        },
        onUploadProgress: (evt) => {
            if (!onProgress || !evt.total) return;
            onProgress(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 10 * 60 * 1000,
    });
    if (onProgress) onProgress(100);
    return data;
};

/**
 * Legacy chunked upload (kept as fallback). Can fail with "Upload session not found"
 * when start/chunk hit different server instances.
 */
const uploadChunked = async (blob, filename, contentType, onProgress) => {
    const { data: startData } = await axios.post(
        `${API}/uploads/start`,
        {},
        { headers: authHeaders() },
    );
    const uploadId = startData.upload_id;

    const total = blob.size;
    let sent = 0;
    for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
        const chunk = blob.slice(offset, offset + CHUNK_SIZE);
        await axios.put(`${API}/uploads/${uploadId}/chunk`, chunk, {
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/octet-stream',
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 5 * 60 * 1000,
        });
        sent += chunk.size;
        if (onProgress) onProgress(Math.round((sent / total) * 100));
    }

    const { data: attachment } = await axios.post(
        `${API}/uploads/${uploadId}/finish`,
        {
            filename: filename || 'file',
            content_type: contentType || blob.type || 'application/octet-stream',
        },
        { headers: authHeaders() },
    );
    return attachment;
};

/**
 * Uploads a Blob/File to cloud object storage.
 * Uses a single-request upload by default so saving a recording does not depend
 * on sticky /tmp sessions across backend workers.
 * Returns the attachment reference { id, storage_path, original_filename, content_type, size, kind }.
 */
export const uploadBlob = async (blob, filename, contentType, onProgress) => {
    if (!blob || !blob.size) {
        throw new Error('Nothing to upload — recording data is empty');
    }

    // Always prefer direct upload within size budget.
    if (blob.size <= DIRECT_MAX) {
        try {
            return await uploadDirect(blob, filename, contentType, onProgress);
        } catch (err) {
            const status = err?.response?.status;
            // If the new endpoint is not deployed yet, fall back to chunked.
            if (status !== 404 && status !== 405) throw err;
        }
    }

    try {
        return await uploadChunked(blob, filename, contentType, onProgress);
    } catch (err) {
        const detail = err?.response?.data?.detail || '';
        const lost = err?.response?.status === 409
            || /upload session/i.test(detail)
            || /session lost/i.test(detail);
        if (lost && blob.size <= DIRECT_MAX) {
            // One automatic recovery attempt via direct upload.
            return uploadDirect(blob, filename, contentType, onProgress);
        }
        throw err;
    }
};

/** Build an authenticated, inline-streamable URL for an attachment (usable in <video>/<img> src). */
export const fileUrl = (storagePath) => {
    const token = localStorage.getItem('token');
    return `${API}/files/${storagePath}?auth=${token}`;
};
