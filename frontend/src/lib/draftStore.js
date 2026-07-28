// Offline-aware draft queue backed by localStorage.
// While offline we buffer changes; whenever the browser comes back online we flush.
import axios from 'axios';

const QUEUE_KEY = 'tskflow.draft.queue.v1';

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* noop */ }
}

export function enqueue(op) {
  const q = readQueue();
  q.push({ ...op, ts: Date.now() });
  writeQueue(q);
}

export async function flushQueue(apiBase) {
  const q = readQueue();
  if (!q.length) return { flushed: 0 };
  const remaining = [];
  let flushed = 0;
  for (const op of q) {
    try {
      if (op.kind === 'create') {
        await axios.post(`${apiBase}/tasks/drafts`, op.payload);
      } else if (op.kind === 'update') {
        await axios.put(`${apiBase}/tasks/drafts/${op.id}`, op.payload);
      } else if (op.kind === 'delete') {
        await axios.delete(`${apiBase}/tasks/drafts/${op.id}`);
      }
      flushed++;
    } catch (e) {
      remaining.push(op);
    }
  }
  writeQueue(remaining);
  return { flushed, remaining: remaining.length };
}

export function attachOnlineFlusher(apiBase, onFlush) {
  const handler = async () => {
    if (navigator.onLine) {
      const r = await flushQueue(apiBase);
      onFlush && onFlush(r);
    }
  };
  window.addEventListener('online', handler);
  // Try flush at load too
  if (navigator.onLine) handler();
  return () => window.removeEventListener('online', handler);
}
