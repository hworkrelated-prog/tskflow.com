/**
 * Guest Unbiassly organizers keep a manage token in localStorage so they can
 * conclude a link later without creating an account.
 */
const KEY = 'tsk_unbiassly_manage';

const read = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(raw) ? raw.filter((item) => item?.id && item?.manage_token) : [];
    } catch {
        return [];
    }
};

const write = (rooms) => {
    try {
        localStorage.setItem(KEY, JSON.stringify(rooms.slice(0, 40)));
    } catch { /* noop */ }
};

export const rememberUnbiasslyRoom = (room) => {
    if (!room?.id || !room?.manage_token) return;
    const next = [
        {
            id: room.id,
            manage_token: room.manage_token,
            topic: room.topic || '',
            share_url: room.share_url || '',
            created_at: room.created_at || new Date().toISOString(),
        },
        ...read().filter((item) => item.id !== room.id),
    ];
    write(next);
};

export const listUnbiasslyGuestRooms = () => read();

export const guestManageTokens = () => read().map((item) => item.manage_token).filter(Boolean);

export const forgetUnbiasslyRoom = (id) => {
    write(read().filter((item) => item.id !== id));
};
