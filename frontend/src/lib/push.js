import axios from 'axios';
import { API } from '@/App';

const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
};

/**
 * Registers the service worker and subscribes the browser for background push.
 * Safe to call repeatedly; silently no-ops if unsupported or permission denied.
 */
export const registerPush = async () => {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
            return { ok: false, reason: 'unsupported' };
        }

        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        let permission = Notification.permission;
        if (permission === 'default') {
            permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') {
            return { ok: false, reason: 'denied' };
        }

        const { data } = await axios.get(`${API}/push/vapid-public-key`);
        const publicKey = data.public_key;
        if (!publicKey) return { ok: false, reason: 'no-key' };

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
        }

        await axios.post(`${API}/push/subscribe`, {
            endpoint: subscription.endpoint,
            keys: subscription.toJSON().keys,
        });

        return { ok: true };
    } catch (e) {
        console.warn('Push registration failed:', e);
        return { ok: false, reason: 'error' };
    }
};
