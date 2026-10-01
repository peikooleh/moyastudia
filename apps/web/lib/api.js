const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function apiUrl(path) {
  return `${API_ORIGIN}${path}`;
}

export function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), { ...options, credentials: "include" });
}