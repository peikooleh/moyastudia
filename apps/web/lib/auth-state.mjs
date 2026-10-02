export async function requestLogout(apiFetch, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await apiFetch("/auth/logout", {
      method: "POST",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function requestSessionState(apiFetch, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await apiFetch("/auth/session", { signal: controller.signal });
    if (!response.ok) return null;
    const session = await response.json();
    return typeof session.authenticated === "boolean" ? session.authenticated : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}