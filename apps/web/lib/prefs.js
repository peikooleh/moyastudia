const KEY = "moyastudia.prefs.v1";

export const UI_LANGS = [
  { id: "auto", label: "Auto" },
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
  { id: "uk", label: "Українська" },
];

export const CHANNEL_LANGS = [
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
  { id: "uk", label: "Українська" },
  { id: "de", label: "Deutsch" },
  { id: "pl", label: "Polski" },
  { id: "fr", label: "Français" },
  { id: "es", label: "Español" },
  { id: "it", label: "Italiano" },
  { id: "pt", label: "Português" },
  { id: "tr", label: "Türkçe" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "zh", label: "中文" },
];

export const THEMES = [
  { id: "auto", label: "auto" },
  { id: "light", label: "light" },
  { id: "dark", label: "dark" },
];

export function channelDisplayContext(channel) {
  return String(
    channel?.handle
    || channel?.custom_url
    || channel?.youtube_channel_id
    || (channel?.id != null ? `ID ${channel.id}` : ""),
  );
}

export function channelPreferenceKey(channel) {
  return String(channel?.youtube_channel_id || channel?.id || "");
}

export function channelDisplayLabel(channel) {
  const title = String(channel?.title || "");
  const context = channelDisplayContext(channel);
  return [title, context].filter(Boolean).join(" · ");
}

const defaults = {
  uiLang: "auto",
  theme: "auto",
  accountUserId: "",
  onboarded: false,
  channelLangs: {},
  selectedChannelId: "",
  statisticsPeriod: "28",
  catalogFilter: "all",
  catalogSort: "date_desc",
  calendarFilter: "all",
  playlistVideoSort: "position",
  playlistPageSize: 10,
};

export function accountPrefsForUser(userId) {
  return {
    accountUserId: String(userId || ""),
    onboarded: false,
    selectedChannelId: "",
    channelLangs: {},
  };
}

export function channelPreferencesForAvailableChannels(prefs, channels) {
  const availableIds = new Set(channels.map((channel) => String(channel.id)));
  const currentSelected = String(prefs.selectedChannelId || "");
  const selectedChannelId = availableIds.has(currentSelected)
    ? currentSelected
    : String(channels[0]?.id || "");
  const currentLanguages = prefs.channelLangs || {};
  const channelLangs = {};
  channels.forEach((channel) => {
    const stableKey = channelPreferenceKey(channel);
    const legacyKey = String(channel.id);
    const language = currentLanguages[stableKey] || currentLanguages[legacyKey];
    if (stableKey && language) channelLangs[stableKey] = language;
  });
  const sameLanguages = Object.keys(channelLangs).length === Object.keys(currentLanguages).length
    && Object.entries(channelLangs).every(([channelId, language]) => currentLanguages[channelId] === language);

  if (selectedChannelId === currentSelected && sameLanguages) return null;
  return { selectedChannelId, channelLangs };
}

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const stored = JSON.parse(raw);
    for (const key of ["signedIn", "displayName", "email", "googleClientId", "googleClientSecret"]) {
      delete stored[key];
    }
    return { ...defaults, ...stored };
  } catch {
    return { ...defaults };
  }
}

export function savePrefs(next) {
  const merged = { ...loadPrefs(), ...next };
  localStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
}

export function prefsAfterChannelRemoval(prefs, removedChannelId, remainingChannels) {
  const removedId = String(removedChannelId);
  const selectedChannelId = String(prefs.selectedChannelId || "");
  const channelLangs = { ...prefs.channelLangs };
  delete channelLangs[removedId];

  const selectedStillExists = remainingChannels.some(
    (channel) => String(channel.id) === selectedChannelId,
  );
  const nextSelectedChannelId =
    selectedChannelId !== removedId && selectedStillExists
      ? selectedChannelId
      : String(remainingChannels[0]?.id || "");

  return {
    selectedChannelId: nextSelectedChannelId,
    channelLangs,
  };
}

export function resolveUiLang(prefs) {
  if (prefs.uiLang && prefs.uiLang !== "auto") return prefs.uiLang;
  const nav = (typeof navigator !== "undefined" && navigator.language) || "en";
  const short = nav.slice(0, 2).toLowerCase();
  if (["en", "ru", "uk"].includes(short)) return short;
  return "en";
}

export function resolveTheme(prefs) {
  if (prefs.theme === "light" || prefs.theme === "dark") return prefs.theme;
  const hour = new Date().getHours();
  return hour >= 7 && hour < 20 ? "light" : "dark";
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}
