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

export function catalogVideoDetailUrl(channelId, videoId) {
  return `/channels/${channelId}/videos/${videoId}`;
}

export function catalogVideoWorkingUrl(channelId, videoId) {
  return `${catalogVideoDetailUrl(channelId, videoId)}/working`;
}

export function mapPlaylistForStudio(playlist) {
  return {
    id: typeof playlist?.id === "string" ? playlist.id : "",
    title: playlist?.title || "",
    description: playlist?.description || "",
    thumb: playlist?.thumb || "",
    publishedAt: playlist?.publishedAt || "",
    privacy: playlist?.privacy || "",
    itemCount: Number.isInteger(playlist?.itemCount) ? playlist.itemCount : null,
  };
}

export function playlistsForChannel(state, channelId) {
  if (!channelId || state?.channelId !== String(channelId)) return [];
  return state.items || [];
}

export function playlistItemsUrl(channelId, playlistId, pageToken = "", limit = 50) {
  const params = new URLSearchParams({ limit: String(Math.min(Math.max(Number(limit) || 50, 1), 50)) });
  if (pageToken) params.set("page_token", pageToken);
  const suffix = params.size ? `?${params.toString()}` : "";
  return `/channels/${channelId}/playlists/${encodeURIComponent(playlistId)}/items${suffix}`;
}

export function playlistPageItems(items, page, pageSize) {
  const start = Math.max(0, Number(page) || 0) * Math.max(1, Number(pageSize) || 1);
  return (items || []).slice(start, start + Math.max(1, Number(pageSize) || 1));
}

export function playlistPageSelection(currentIds, items, checked) {
  const next = new Set(currentIds || []);
  (items || []).forEach((item) => {
    if (!item?.videoId) return;
    if (checked) next.add(item.videoId);
    else next.delete(item.videoId);
  });
  return next;
}

export function cachedVideoMetricSummary(videos) {
  const rows = videos || [];
  const sumAvailable = (field) => {
    const values = rows.map((video) => video?.[field]).filter(Number.isFinite);
    return {
      total: values.length ? values.reduce((sum, value) => sum + value, 0) : null,
      count: values.length,
    };
  };
  const views = sumAvailable("views");
  const likes = sumAvailable("likes");
  const comments = sumAvailable("comments");
  return {
    loadedVideoCount: rows.length,
    views: views.total,
    viewsCount: views.count,
    likes: likes.total,
    likesCount: likes.count,
    comments: comments.total,
    commentsCount: comments.count,
  };
}

export function catalogVideoDisplayTitle(video) {
  return video?.effectiveTitle ?? video?.title ?? "";
}

export const YOUTUBE_METADATA_LIMITS = Object.freeze({
  title: 100,
  descriptionBytes: 5000,
  tags: 500,
});

const VIDEO_CATEGORY_NAMES = Object.freeze({
  1: "Film & Animation",
  2: "Autos & Vehicles",
  10: "Music",
  15: "Pets & Animals",
  17: "Sports",
  18: "Short Movies",
  19: "Travel & Events",
  20: "Gaming",
  21: "Videoblogging",
  22: "People & Blogs",
  23: "Comedy",
  24: "Entertainment",
  25: "News & Politics",
  26: "Howto & Style",
  27: "Education",
  28: "Science & Technology",
  29: "Nonprofits & Activism",
  30: "Movies",
  31: "Anime/Animation",
  32: "Action/Adventure",
  33: "Classics",
  34: "Comedy",
  35: "Documentary",
  36: "Drama",
  37: "Family",
  38: "Foreign",
  39: "Horror",
  40: "Sci-Fi/Fantasy",
  41: "Thriller",
  42: "Shorts",
  43: "Shows",
  44: "Trailers",
});

export function youtubeVideoCategoryName(categoryId) {
  return VIDEO_CATEGORY_NAMES[String(categoryId ?? "")] || "";
}

export function unicodeCharacterCount(value) {
  return Array.from(String(value ?? "")).length;
}

export function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value ?? "")).length;
}

export function youtubeTagsCharacterCount(value) {
  const tags = String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags.reduce(
    (total, tag, index) => total + unicodeCharacterCount(tag) + (tag.includes(" ") ? 2 : 0) + (index ? 1 : 0),
    0,
  );
}

export function youtubeMetadataLimit(field, value) {
  const text = String(value ?? "");
  const config = {
    title: { limit: YOUTUBE_METADATA_LIMITS.title, used: unicodeCharacterCount(text), unit: "characters" },
    description: { limit: YOUTUBE_METADATA_LIMITS.descriptionBytes, used: utf8ByteLength(text), unit: "bytes" },
    tags: { limit: YOUTUBE_METADATA_LIMITS.tags, used: youtubeTagsCharacterCount(text), unit: "characters" },
  }[field];
  if (!config) return null;

  return {
    ...config,
    nearLimit: config.used >= config.limit * 0.9 && config.used <= config.limit,
    exceedsLimit: config.used > config.limit,
    hasUnsupportedCharacters: field !== "tags" && /[<>]/.test(text),
  };
}

export function workingVideoPatch(revision, changes) {
  return { revision, ...changes };
}

export function resetWorkingVideoPatch(video) {
  const changes = {};
  for (const field of ["title", "description", "tags"]) {
    if (video?.working?.[field] !== null && video?.working?.[field] !== undefined) {
      changes[field] = null;
    }
  }
  return changes;
}

export function workingVideoStatusKey(video, edits, saving, saveState) {
  if (video?.conflict) return "conflict";
  if (saving) return "saving";
  if (Object.keys(edits || {}).length > 0) return "modified";
  if (saveState === "error") return "error";
  if (saveState === "saved" || video?.dirty) return "saved";
  return "";
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
