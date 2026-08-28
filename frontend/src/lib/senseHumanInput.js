import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;

/** Run free-text through the backend so messy paste still makes sense. */
export async function senseHumanInput(text, kind = 'prose') {
    const raw = String(text || '');
    if (!raw.trim()) {
        return { ok: true, text: '', emails: [], summary: '' };
    }
    try {
        const res = await axios.post(`${API}/ai/sense-input`, { text: raw, kind });
        return {
            ok: true,
            text: res.data?.text || raw,
            emails: Array.isArray(res.data?.emails) ? res.data.emails : [],
            summary: res.data?.summary || '',
        };
    } catch {
        return { ok: false, text: raw, emails: [], summary: '' };
    }
}
