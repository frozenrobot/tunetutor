// API Configuration
// Globally handles switching between local development and production URLs.

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// Helper to construct API endpoints
export const apiPath = (path: string) => {
    // Ensure path starts with /
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE_URL}${cleanPath}`;
};

// Authenticated fetch wrapper — automatically handles 401 by logging out
export const authFetch = async (path: string, token: string | null, options: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(apiPath(path), { ...options, headers });

    if (res.status === 401) {
        // Token is invalid or expired — clear it and reload to show login
        localStorage.removeItem("lyvo_token");
        window.location.reload();
    }

    return res;
};
