// Minimal IndexedDB helper to reliably pass a recording Blob between tabs
// (window.opener is unreliable due to COOP/COEP and popup blockers).

const DB_NAME = 'tsk_recordings';
const STORE = 'blobs';
const KEY = 'last';
const VERSION = 1;

const openDb = () =>
    new Promise((resolve, reject) => {
        try {
            const req = indexedDB.open(DB_NAME, VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        } catch (err) {
            reject(err);
        }
    });

export const saveRecordingBlob = async (blob, meta = {}) => {
    try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            store.put({ blob, meta, savedAt: Date.now() }, KEY);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
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
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(KEY);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch { /* noop */ }
};
