// YouTube Partner Program thresholds; date-based to avoid showing obsolete goals.
// Qualified watch hours and Shorts views are not exposed by the Analytics API.
export const YPP_HELP_URL = "https://support.google.com/youtube/answer/94522";
export const YPP_CHANGES_URL = "https://support.google.com/youtube/answer/12843009";
export const MONETIZATION_FIELDS = ["watchHours", "shortsViews"];

export function yppThresholds(date = new Date()) {
  const updated = new Date(date).getTime() >= Date.parse("2027-02-01T00:00:00Z");
  return {
    early: { subscribers: 500, watchHours: 3000, shortsViews: 3000000, uploads: 3 },
    ads: { subscribers: 1000, watchHours: updated ? 8000 : 4000, shortsViews: updated ? 20000000 : 10000000 },
    adsChangeUpcoming: !updated,
  };
}

export function progressToGoal(value, target) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
  const current = Number(value);
  return { current, target, remaining: Math.max(0, target - current), percent: Math.min(100, (current / target) * 100) };
}

export function publicUploadsInLast90Days(videos, now = new Date()) {
  const end = new Date(now).getTime();
  const start = end - 90 * 24 * 60 * 60 * 1000;
  return (videos || []).filter((video) => {
    if (video.status !== "public" || video.availability !== "available") return false;
    const timestamp = Date.parse(video.publishedAt || "");
    return Number.isFinite(timestamp) && timestamp <= end && timestamp >= start;
  }).length;
}

export function sanitizeQualifiedInput(raw) {
  if (raw === "" || raw == null) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function monetizationStorageKey(prefs, channel) {
  const account = String(prefs?.accountUserId || "");
  const youtubeId = String(channel?.youtube_channel_id || "");
  return account && youtubeId ? `${account}:${youtubeId}` : "";
}
