/**
 * The landing demo signs visitors in as a guest. Remember which guest it was so a
 * later Google login / signup can pull the demo task into the real account.
 */
const GUEST_KEY = 'tsk_guest_user_id';
const TASK_KEY = 'tsk_guest_task_id';

export const rememberGuestSession = (userId, taskId) => {
    try {
        if (userId) localStorage.setItem(GUEST_KEY, String(userId));
        if (taskId) localStorage.setItem(TASK_KEY, String(taskId));
    } catch { /* noop */ }
};

export const guestUserId = () => {
    try {
        return localStorage.getItem(GUEST_KEY) || '';
    } catch {
        return '';
    }
};

export const guestTaskId = () => {
    try {
        return localStorage.getItem(TASK_KEY) || '';
    } catch {
        return '';
    }
};

export const clearGuestSession = () => {
    try {
        localStorage.removeItem(GUEST_KEY);
        localStorage.removeItem(TASK_KEY);
    } catch { /* noop */ }
};
