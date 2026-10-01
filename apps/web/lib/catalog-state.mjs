export function catalogVideosUrl(channelId, options = {}) {
  const params = new URLSearchParams({ limit: "50", sort: options.sort || "date" });
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.query) params.set("q", options.query);
  if (options.filter && options.filter !== "all") {
    params.set("visibility", options.filter);
  }
  if (options.dateFrom) params.set("date_from", options.dateFrom);
  if (options.dateTo) params.set("date_to", options.dateTo);
  return `/channels/${channelId}/videos?${params.toString()}`;
}

export function isCurrentCatalogRequest(
  requestChannelId,
  currentChannelId,
  requestId,
  currentRequestId,
) {
  return String(requestChannelId || "") === String(currentChannelId || "")
    && requestId === currentRequestId;
}

export function shouldShowCatalogContinue(status) {
  return ["PARTIAL", "ERROR"].includes(status?.state)
    || (status?.state === "LOADING" && status.can_continue === true);
}

export function shouldResumeCatalogSync(status) {
  return status?.state === "LOADING";
}

export function catalogSyncContinueUrl(channelId) {
  return `/channels/${channelId}/catalog/sync/continue`;
}

export async function continueCatalogSyncPage(channelId, apiFetch, errorMessage, onStatus) {
  const response = await apiFetch(catalogSyncContinueUrl(channelId), { method: "POST" });
  const status = await response.json();
  if (!response.ok) throw new Error(status.detail || errorMessage);
  onStatus(status);
  return status;
}

export function tryStartCatalogSync(lock) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function finishCatalogSync(lock) {
  lock.current = false;
}
