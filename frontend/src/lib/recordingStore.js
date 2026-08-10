// IndexedDB helpers to reliably pass recording Blobs between tabs and to
// survive a mid-recording tab crash (chunks are flushed every timeslice).

const DB_NAME = 'tsk_recordings';
const STORE = 'blobs';
const LIVE_STORE = 'live_chunks';
const KEY = 'last';
const LIVE_KEY = 'active';
const VERSION = 2;

const openDb = () =>
    new Promise((resolve, reject) => {
        try {
            const req = indexedDB.open(DB_NAME, VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE);
                }
                if (!db.objectStoreNames.contains(LIVE_STORE)) {
                    db.createObjectStore(LIVE_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        } catch (err) {
            reject(err);
        }
    });

const txDone = (tx) =>
    new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB aborted'));
    });

export const saveRecordingBlob = async (blob, meta = {}) => {
    try {
        const db = await openDb();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ blob, meta, savedAt: Date.now() }, KEY);
        await txDone(tx);
        return true;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('recordingStore.saveRecordingBlob failed', err);
        return false;
    }
};

export const loadRecordingBlob = async () => {
    try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('recordingStore.loadRecordingBlob failed', err);
        return null;
    }
};

export const clearRecordingBlob = async () => {
    try {
        const db = await openDb();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        await txDone(tx);
    } catch { /* noop */ }
};

/**
 * Begin a live recording session. Clears any previous in-progress chunks.
 * Call appendLiveChunk on every MediaRecorder timeslice, then finalizeLiveRecording on stop.
 */
export const beginLiveRecording = async (meta = {}) => {
    try {
        const db = await openDb();
        const tx = db.transaction(LIVE_STORE, 'readwrite');
        tx.objectStore(LIVE_STORE).put({
            chunks: [],
            meta,
            startedAt: Date.now(),
            updatedAt: Date.now(),
        }, LIVE_KEY);
        await txDone(tx);
        return true;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('recordingStore.beginLiveRecording failed', err);
        return false;
    }
};

/** Append one MediaRecorder timeslice to the live session (best-effort). */
export const appendLiveChunk = async (chunk) => {
    if (!chunk || !chunk.size) return false;
    try {
        const db = await openDb();
        const existing = await new Promise((resolve, reject) => {
            const tx = db.transaction(LIVE_STORE, 'readonly');
            const req = tx.objectStore(LIVE_STORE).get(LIVE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
        if (!existing) return false;
        // Cap retained live data at ~180MB to avoid filling IndexedDB on runaway sessions.
        const currentSize = (existing.chunks || []).reduce((n, c) => n + (c?.size || 0), 0);
        if (currentSize + chunk.size > 180 * 1024 * 1024) {
            // eslint-disable-next-line no-console
            console.warn('recordingStore.appendLiveChunk: live buffer full, skipping further chunks');
            return false;
        }
        const tx = db.transaction(LIVE_STORE, 'readwrite');
        tx.objectStore(LIVE_STORE).put({
            ...existing,
            chunks: [...(existing.chunks || []), chunk],
            updatedAt: Date.now(),
        }, LIVE_KEY);
        await txDone(tx);
        return true;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('recordingStore.appendLiveChunk failed', err);
        return false;
    }
};

/** Load any in-progress live session (for crash recovery). */
export const loadLiveRecording = async () => {
    try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(LIVE_STORE, 'readonly');
            const req = tx.objectStore(LIVE_STORE).get(LIVE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null;
    }
};

/**
 * Finalize a live session into the regular `last` blob store and clear live chunks.
 * Returns the assembled Blob, or null if nothing was saved.
 */
export const finalizeLiveRecording = async (mimeType) => {
    try {
        const live = await loadLiveRecording();
        if (!live?.chunks?.length) {
            await clearLiveRecording();
            return null;
        }
        const type = mimeType || live.meta?.mimeType || 'video/webm';
        const blob = new Blob(live.chunks, { type });
        await saveRecordingBlob(blob, { ...(live.meta || {}), type, size: blob.size, recovered: true });
        await clearLiveRecording();
        return blob;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('recordingStore.finalizeLiveRecording failed', err);
        return null;
    }
};

export const clearLiveRecording = async () => {
    try {
        const db = await openDb();
        const tx = db.transaction(LIVE_STORE, 'readwrite');
        tx.objectStore(LIVE_STORE).delete(LIVE_KEY);
        await txDone(tx);
    } catch { /* noop */ }
};
