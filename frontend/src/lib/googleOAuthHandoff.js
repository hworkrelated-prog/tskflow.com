/**
 * Google redirects Calendar OAuth to the frontend host
 * (`/api/auth/google/callback`) because that URI is registered in Google Cloud.
 * Production API lives on a different host, so the SPA must hand the code off.
 */
export function googleCallbackApiPath(pathname = '') {
    if (String(pathname).includes('sheets')) return '/api/auth/google/sheets/callback';
    // Sign-in is a separate purpose from the Calendar/Sheets grants.
    if (String(pathname).includes('/login/')) return '/api/auth/google/login/callback';
    return '/api/auth/google/callback';
}

export function googleCallbackBackendUrl({
    backendUrl,
    pathname,
    search,
    origin,
} = {}) {
    const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    if (params.get('error')) return null;

    const base = String(backendUrl || '').replace(/\/$/, '');
    if (!base) return null;

    let backendOrigin = '';
    try {
        backendOrigin = new URL(base).origin;
    } catch {
        return null;
    }
    if (origin && backendOrigin === origin) return null;

    const qs = String(search || '');
    const query = qs.startsWith('?') || qs === '' ? qs : `?${qs}`;
    return `${base}${googleCallbackApiPath(pathname)}${query}`;
}
