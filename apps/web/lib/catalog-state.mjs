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