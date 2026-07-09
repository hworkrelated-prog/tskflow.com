import axios from 'axios';
import { API } from '@/App';

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB — safely under proxy limits

/**
 * Uploads a Blob/File to cloud object storage via chunked upload.
 * Returns the attachment reference { id, storage_path, original_filename, content_type, size, kind }.
 */
export const uploadBlob = async (blob, filename, contentType, onProgress) => {
    const { data: startData } = await axios.post(`${API}/uploads/start`);
    const uploadId = startData.upload_id;

    const total = blob.size;
    let sent = 0;
    for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
        const chunk = blob.slice(offset, offset + CHUNK_SIZE);
        await axios.put(`${API}/uploads/${uploadId}/chunk`, chunk, {
            headers: { 'Content-Type': 'application/octet-stream' },
        });
        sent += chunk.size;
        if (onProgress) onProgress(Math.round((sent / total) * 100));
    }

    const { data: attachment } = await axios.post(`${API}/uploads/${uploadId}/finish`, {
        filename: filename || 'file',
        content_type: contentType || blob.type || 'application/octet-stream',
    });
    return attachment;
};

/** Build an authenticated, inline-streamable URL for an attachment (usable in <video>/<img> src). */
export const fileUrl = (storagePath) => {
    const token = localStorage.getItem('token');
    return `${API}/files/${storagePath}?auth=${token}`;
};
