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

const defaults = {
  uiLang: "auto",
  theme: "auto",
  onboarded: false,
  channelLangs: {},
  selectedChannelId: "",
  dailyEdits: 20,
  dailyUploads: 10,
};

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
