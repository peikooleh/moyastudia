import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

import {
  accountPrefsForUser,
  channelPreferencesForAvailableChannels,
  channelDisplayContext,
  channelDisplayLabel,
  prefsAfterChannelRemoval,
  loadPrefs,
  savePrefs,
} from "../lib/prefs.js";
import { requestLogout, requestSessionState } from "../lib/auth-state.mjs";
import { t } from "../lib/i18n.js";
import { monetizationStorageKey, progressToGoal, publicUploadsInLast90Days, sanitizeQualifiedInput, yppThresholds } from "../lib/monetization.mjs";
import { calendarLocalDateKey, calendarWeekCells, calendarWeekStart, calendarWindowRange, shiftCalendarWeek } from "../lib/calendar-grid.mjs";
import {
  catalogVideoDetailUrl,
  catalogVideoDisplayTitle,
  catalogVideosUrl,
  catalogVideoWorkingUrl,
  continueCatalogSyncPage,
  finishCatalogSync,
  isCurrentCatalogRequest,
  mapPlaylistForStudio,
  playlistItemsUrl,
  playlistPageItems,
  playlistPageSelection,
  cachedVideoMetricSummary,
  playlistsForChannel,
  resetWorkingVideoPatch,
  shouldResumeCatalogSync,
  shouldShowCatalogContinue,
  statisticsCatalogSyncAction,
  tryStartCatalogSync,
  unicodeCharacterCount,
  workingVideoPatch,
  workingVideoStatusKey,
  youtubeMetadataLimit,
  youtubeTagsCharacterCount,
  youtubeVideoCategoryName,
} from "../lib/catalog-state.mjs";


test("calendar groups a UTC-night publication on the next day in Zurich", () => {
  const result = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import { calendarLocalDateKey } from "./lib/calendar-grid.mjs"; process.stdout.write(calendarLocalDateKey("2026-10-10T23:30:00Z"));',
    ],
    { cwd: new URL("../", import.meta.url), env: { ...process.env, TZ: "Europe/Zurich" }, encoding: "utf8" },
  );
  assert.equal(result, "2026-10-11");
});

test("calendar groups ISO timestamps by the browser local day", () => {
  const timestamp = "2026-10-10T23:30:00Z";
  const expected = new Date(timestamp);
  const localKey = [
    expected.getFullYear(),
    String(expected.getMonth() + 1).padStart(2, "0"),
    String(expected.getDate()).padStart(2, "0"),
  ].join("-");

  assert.equal(calendarLocalDateKey(timestamp), localKey);
  assert.equal(calendarLocalDateKey("not-a-date"), "");
});

test("channel labels distinguish equal titles with stable YouTube IDs", () => {
  const first = { id: 7, title: "MOYAMOVA", youtube_channel_id: "UCo_Srxy3jqF4PbuxgldLpWA" };
  const second = { id: 6, title: "MOYAMOVA", youtube_channel_id: "UChUFZoc6nnrzqPCsKQx5xmw" };

  assert.notEqual(channelDisplayLabel(first), channelDisplayLabel(second));
  assert.equal(channelDisplayLabel(first), "MOYAMOVA · UCo_Srxy3jqF4PbuxgldLpWA");
  assert.equal(channelDisplayContext({ id: 3, title: "Channel" }), "ID 3");
});

test("logout request succeeds only for an OK response", async () => {
  assert.equal(await requestLogout(async () => ({ ok: true })), true);
  assert.equal(await requestLogout(async () => ({ ok: false })), false);
  assert.equal(await requestLogout(async () => { throw new Error("offline"); }), false);
});

test("logout request supplies an abort signal", async () => {
  let signal;
  await requestLogout(async (_path, options) => {
    signal = options.signal;
    return { ok: true };
  });

  assert.equal(signal instanceof AbortSignal, true);
  assert.equal(signal.aborted, false);
});

test("logout request fails when its request times out", async () => {
  const result = await requestLogout(
    (_path, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
    5,
  );

  assert.equal(result, false);
});

test("session state distinguishes authenticated, anonymous, and unavailable", async () => {
  assert.equal(await requestSessionState(async () => ({
    ok: true,
    json: async () => ({ authenticated: true }),
  })), true);
  assert.equal(await requestSessionState(async () => ({
    ok: true,
    json: async () => ({ authenticated: false }),
  })), false);
  assert.equal(await requestSessionState(async () => ({ ok: false })), null);
  assert.equal(await requestSessionState(async () => { throw new Error("offline"); }), null);
});

test("Studio catalog pages use the selected channel's local API route", () => {
  const url = catalogVideosUrl("channel-7", {
    cursor: "db-cursor",
    filter: "private",
    query: "draft",
    sort: "title",
  });

  assert.equal(
    url,
    "/channels/channel-7/videos?limit=50&sort=title&cursor=db-cursor&q=draft&visibility=private",
  );
  assert.equal(url.includes("pageToken"), false);
  assert.equal(url.includes("youtube.googleapis.com"), false);
});

test("catalog defaults to explicit newest-first date sorting", () => {
  assert.equal(
    catalogVideosUrl("channel-7"),
    "/channels/channel-7/videos?limit=50&sort=date_desc",
  );
});

test("late catalog responses from another channel or request are ignored", () => {
  assert.equal(isCurrentCatalogRequest("channel-old", "channel-new", 3, 4), false);
  assert.equal(isCurrentCatalogRequest("channel-new", "channel-new", 3, 4), false);
  assert.equal(isCurrentCatalogRequest("channel-new", "channel-new", 4, 4), true);
});

test("removing the selected channel clears its language and selects a remaining channel", () => {
  assert.deepEqual(
    prefsAfterChannelRemoval(
      {
        selectedChannelId: "7",
        channelLangs: { "7": "ru", "9": "uk" },
      },
      7,
      [{ id: 9 }],
    ),
    {
      selectedChannelId: "9",
      channelLangs: { "9": "uk" },
    },
  );
});

test("removing the last channel clears its selected ID and language preference", () => {
  assert.deepEqual(
    prefsAfterChannelRemoval(
      { selectedChannelId: "7", channelLangs: { "7": "ru" } },
      "7",
      [],
    ),
    { selectedChannelId: "", channelLangs: {} },
  );
});

test("account-scoped preferences reset when switching MoyaStudia users", () => {
  assert.deepEqual(accountPrefsForUser("user-b"), {
    accountUserId: "user-b",
    onboarded: false,
    selectedChannelId: "",
    channelLangs: {},
  });
});

test("channel preferences retain only channels returned for the authenticated user", () => {
  assert.deepEqual(
    channelPreferencesForAvailableChannels(
      {
        selectedChannelId: "foreign-channel",
        channelLangs: { "owned-channel": "ru", "foreign-channel": "uk" },
      },
      [{ id: "owned-channel" }, { id: "another-owned-channel" }],
    ),
    { selectedChannelId: "owned-channel", channelLangs: { "owned-channel": "ru" } },
  );
  assert.deepEqual(
    channelPreferencesForAvailableChannels(
      { selectedChannelId: "stale-channel", channelLangs: { "stale-channel": "ru" } },
      [],
    ),
    { selectedChannelId: "", channelLangs: {} },
  );
});

test("Studio sorting preferences survive a preferences reload", () => {
  const previousLocalStorage = globalThis.localStorage;
  let stored = null;
  globalThis.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value; },
  };
  try {
    savePrefs({
      statisticsPeriod: "90",
      catalogFilter: "private",
      catalogSort: "title",
      playlistVideoSort: "date_asc",
      calendarFilter: "scheduled",
      playlistPageSize: 50,
    });
    const reloaded = loadPrefs();
    assert.equal(reloaded.statisticsPeriod, "90");
    assert.equal(reloaded.catalogFilter, "private");
    assert.equal(reloaded.catalogSort, "title");
    assert.equal(reloaded.playlistVideoSort, "date_asc");
    assert.equal(reloaded.calendarFilter, "scheduled");
    assert.equal(reloaded.playlistPageSize, 50);
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});

test("working video routes stay under the selected channel", () => {
  assert.equal(catalogVideoDetailUrl(12, 34), "/channels/12/videos/34");
  assert.equal(catalogVideoWorkingUrl(12, 34), "/channels/12/videos/34/working");
});

test("playlist mapping preserves all available fields for the Studio view", () => {
  assert.deepEqual(
    mapPlaylistForStudio({
      id: "playlist-1",
      title: "Playlist title",
      description: "Playlist description",
      thumb: "https://img.example.test/playlist.jpg",
      publishedAt: "2026-01-02T03:04:05Z",
      privacy: "private",
      itemCount: 7,
    }),
    {
      id: "playlist-1",
      title: "Playlist title",
      description: "Playlist description",
      thumb: "https://img.example.test/playlist.jpg",
      publishedAt: "2026-01-02T03:04:05Z",
      privacy: "private",
      itemCount: 7,
    },
  );
});

test("playlist mapping handles absent optional fields and empty responses", () => {
  assert.deepEqual(mapPlaylistForStudio({ id: "playlist-2" }), {
    id: "playlist-2",
    title: "",
    description: "",
    thumb: "",
    publishedAt: "",
    privacy: "",
    itemCount: null,
  });
  assert.deepEqual([].map(mapPlaylistForStudio), []);
});

test("playlist rows from the previous channel are hidden immediately on channel change", () => {
  const state = { channelId: "channel-a", items: [{ id: "playlist-a" }] };
  assert.deepEqual(playlistsForChannel(state, "channel-a"), [{ id: "playlist-a" }]);
  assert.deepEqual(playlistsForChannel(state, "channel-b"), []);
  assert.deepEqual(playlistsForChannel(state, ""), []);
});

test("playlist item URLs encode IDs and page tokens", () => {
  assert.equal(
    playlistItemsUrl(7, "playlist/one", "token + value"),
    "/channels/7/playlists/playlist%2Fone/items?limit=50&page_token=token+%2B+value",
  );
  assert.equal(playlistItemsUrl(7, "p", "", 100), "/channels/7/playlists/p/items?limit=50");
});

test("playlist UI pages slice accumulated token pages without skipping rows", () => {
  const items = Array.from({ length: 120 }, (_, index) => index);
  assert.deepEqual(playlistPageItems(items, 0, 10), items.slice(0, 10));
  assert.deepEqual(playlistPageItems(items, 1, 30), items.slice(30, 60));
  assert.deepEqual(playlistPageItems(items, 0, 100), items.slice(0, 100));
  assert.deepEqual(playlistPageItems(items, 1, 100), items.slice(100, 120));
});

test("playlist select-page toggles only visible rows and preserves selections on other pages", () => {
  const selected = playlistPageSelection(new Set(["previous-page"]), [
    { videoId: "visible-1" }, { videoId: "visible-2" },
  ], true);
  assert.deepEqual([...selected], ["previous-page", "visible-1", "visible-2"]);
  assert.deepEqual([...playlistPageSelection(selected, [{ videoId: "visible-1" }], false)], ["previous-page", "visible-2"]);
});

test("statistics summarize only metrics present in the loaded catalog rows", () => {
  assert.deepEqual(cachedVideoMetricSummary([
    { views: 10, likes: null, comments: 2 },
    { views: 5, likes: 3, comments: null },
  ]), {
    loadedVideoCount: 2,
    views: 15, viewsCount: 2,
    likes: 3, likesCount: 1,
    comments: 2, commentsCount: 1,
  });
  assert.deepEqual(cachedVideoMetricSummary([]), {
    loadedVideoCount: 0,
    views: null, viewsCount: 0,
    likes: null, likesCount: 0,
    comments: null, commentsCount: 0,
  });
});

test("Cabinet AI labels are localized in English, Russian, and Ukrainian", () => {
  const keys = [
    "actionCancel", "aiConnections", "aiConnectionsHint", "aiProvider", "aiModel", "aiApiKey",
    "aiSettings", "aiModelSettings", "aiModelPlaceholder", "aiApiKeySaved", "aiTitlePrompt",
    "aiTitlePromptPlaceholder", "aiDescriptionPrompt", "aiDescriptionPromptPlaceholder",
    "aiSave", "aiSaving", "aiSaved", "aiLoadError", "aiSaveError", "aiModelRequired", "aiApiKeyRequired",
  ];
  for (const lang of ["en", "ru", "uk"]) {
    for (const key of keys) assert.notEqual(t(lang, key), key, `${lang}:${key}`);
  }
  assert.equal(t("ru", "actionCancel"), "Отмена");
  assert.equal(t("uk", "actionCancel"), "Скасувати");
});

test("YouTube monetization requirements use current and 2027 effective dates", () => {
  assert.deepEqual(yppThresholds(new Date("2026-10-10T12:00:00Z")).early, {
    subscribers: 500, watchHours: 3000, shortsViews: 3000000, uploads: 3,
  });
  assert.deepEqual(yppThresholds(new Date("2027-01-31T23:59:59Z")).ads, {
    subscribers: 1000, watchHours: 4000, shortsViews: 10000000,
  });
  assert.deepEqual(yppThresholds(new Date("2027-02-01T00:00:00Z")).ads, {
    subscribers: 1000, watchHours: 8000, shortsViews: 20000000,
  });
});

test("Monetization progress distinguishes unavailable qualified data from zero", () => {
  assert.equal(progressToGoal(null, 4000), null);
  assert.equal(progressToGoal("", 4000), null);
  assert.equal(progressToGoal(275, 1000).remaining, 725);
  assert.ok(Math.abs(progressToGoal(275, 1000).percent - 27.5) < 0.001);
  assert.equal(progressToGoal(9000, 4000).percent, 100);
  assert.equal(sanitizeQualifiedInput(""), null);
  assert.equal(sanitizeQualifiedInput("-1"), null);
  assert.equal(sanitizeQualifiedInput("4.2"), null);
  assert.equal(sanitizeQualifiedInput("420"), 420);
  assert.equal(monetizationStorageKey({ accountUserId: "account-1" }, { youtube_channel_id: "channel-1" }), "account-1:channel-1");
  assert.equal(monetizationStorageKey({ accountUserId: "" }, { youtube_channel_id: "channel-1" }), "");
});

test("Recent public upload estimate excludes private, old and unavailable videos", () => {
  const videos = [
    { status: "public", availability: "available", publishedAt: "2026-10-01T00:00:00Z" },
    { status: "private", availability: "available", publishedAt: "2026-10-01T00:00:00Z" },
    { status: "public", availability: "unavailable", publishedAt: "2026-10-01T00:00:00Z" },
    { status: "public", availability: "available", publishedAt: "2026-01-01T00:00:00Z" },
    { status: "public", availability: "available", publishedAt: "" },
  ];
  assert.equal(publicUploadsInLast90Days(videos, new Date("2026-10-10T12:00:00Z")), 1);
});

test("Monetization labels are localized in all UI languages", () => {
  const keys = [
    "monetizationTitle", "monetizationSubtitle", "monetizationBadge", "monetizationOpenHint",
    "monetizationClose", "monetizationTierLabel", "monetizationEarly", "monetizationAds",
    "monetizationEitherRoute", "monetizationSubscribers", "monetizationWatchHours",
    "monetizationShortsViews", "monetizationUploads", "monetizationYouTubeSource",
    "monetizationManualSource", "monetizationCatalogEstimate", "monetizationPercent",
    "monetizationGoalProgress", "monetizationNotEntered", "monetizationUnknown",
    "monetizationQualifiedWarning", "monetizationUpcomingChange", "monetizationEdit",
    "monetizationWatchHoursInput", "monetizationShortsInput", "monetizationSave",
    "monetizationCancel", "monetizationManualUpdated", "monetizationLocalOnly",
    "monetizationOfficialRules", "monetizationRuleChanges",
  ];
  for (const lang of ["en", "ru", "uk"]) {
    for (const key of keys) assert.notEqual(t(lang, key), key, lang + ":" + key);
  }
  assert.equal(t("ru", "monetizationPercent", { count: "27,5" }), "27,5%");
});

test("Analytics date and OAuth channel mismatch guidance are localized", () => {
  assert.equal(t("ru", "statisticsLastReportedDate", { date: "2026-10-08" }), "Последний день с данными Analytics: 2026-10-08");
  assert.match(t("en", "statisticsLastReportedDateHint"), /not an official data-processing cutoff/);
  assert.match(t("uk", "statisticsLastReportedDateHint"), /не офіційна дата/);
  for (const lang of ["en", "ru", "uk"]) {
    assert.notEqual(t(lang, "youtube_analytics_channel_mismatch"), "youtube_analytics_channel_mismatch");
  }
});

test("Analytics pending-data guidance explains successful API response in all UI languages", () => {
  assert.equal(t("ru", "statisticsAnalyticsDataPending"), "Данные YouTube Analytics ещё не доступны.");
  assert.match(t("ru", "statisticsAnalyticsDataPendingDetail"), /API ответил успешно/);
  assert.equal(t("uk", "statisticsAnalyticsDataPending"), "Дані YouTube Analytics ще недоступні.");
  assert.match(t("uk", "statisticsAnalyticsDataPendingDetail"), /API відповів успішно/);
  assert.equal(t("en", "statisticsAnalyticsDataPending"), "YouTube Analytics data is not available yet.");
  assert.match(t("en", "statisticsAnalyticsDataPendingDetail"), /API responded successfully/);
  assert.equal(
    t("ru", "statisticsCurrentYouTubeViewsPendingAnalytics", { count: "249" }),
    "Сейчас на YouTube: 249 · Данные YouTube Analytics ещё не доступны.",
  );
});

test("new Studio labels are localized in English, Russian, and Ukrainian", () => {
  const keys = [
    "more", "statisticsTab", "calendarToday", "calendarShowMore", "playlistPageSize", "playlistSelectPage",
    "writeMode", "comingLater", "landSafeWrite", "landSafeWriteHint", "landProtectedShort", "readOnlySnapshot", "calendarEventDetails", "videoReadonlyMetadata",
    "calendarDayVideos", "playlistPageStatus", "statisticsCoverage", "statisticsMetricCount",
    "statisticsOverview", "statisticsDashboardIntro", "statisticsChannel", "statisticsScope", "statisticsScopeChannel",
    "statisticsScopePlaylist", "statisticsScopeVideo", "statisticsPeriod", "statisticsPeriodLifetime",
    "statisticsAverageViewDuration", "statisticsSubscribersNet", "statisticsSubscribersTotal", "statisticsSubscribersChange",
    "statisticsViewsOverTime", "statisticsWatchTimeOverTime", "statisticsAverageDurationOverTime", "statisticsSubscribersOverTime", "statisticsShares",
    "statisticsPlaylistMetricUnavailable", "statisticsAnalyticsDataPending", "statisticsAnalyticsDataPendingDetail", "statisticsCurrentYouTubeViewsPendingAnalytics", "statisticsLastReportedDate", "statisticsLastReportedDateHint", "youtube_analytics_channel_mismatch", "statisticsCatalogUpdating", "statisticsCatalogUpdateFailed",
    "youtubeChangesPreview", "youtubeValueBefore", "youtubeValueAfter", "youtubeOrderCurrent", "youtubeOrderChanged",
    "statisticsContentMix", "youtube_analytics_api_disabled", "youtube_analytics_permission_required",
    "youtubeDescriptionByteRule",
    "playlistDateLabel", "playlistVisibilityUnknown", "playlistIdLabel", "playlistIdCopied", "playlistIdCopyFailed",
    "openPlaylistOnYoutube", "openInStudio", "playlistBulkActions", "playlistAddToPlaylist", "playlistMoveToPlaylist",
    "playlistRemoveFromPlaylist", "playlistBulkHelp", "playlistWritesWithWriteMode",
    "sortDateNewest", "sortDateOldest", "catalogCheckedCount", "playlistBulkStatus",
    "playlistBulkStatusHint", "playlistBulkStatusSaveHint", "playlistBulkStatusMixed",
    "playlistBulkStatusUnavailable", "playlistBulkStatusSaved", "playlistBulkStatusPartial",
  ];
  for (const lang of ["en", "ru", "uk"]) {
    for (const key of keys) assert.notEqual(t(lang, key), key, `${lang}:${key}`);
  }
});

test("catalog list prefers the effective local title and preserves explicit empty values", () => {
  assert.equal(catalogVideoDisplayTitle({ title: "Snapshot", effectiveTitle: "Local" }), "Local");
  assert.equal(catalogVideoDisplayTitle({ title: "Snapshot", effectiveTitle: "" }), "");
  assert.deepEqual(workingVideoPatch(3, { title: "", tags: null }), {
    revision: 3,
    title: "",
    tags: null,
  });
});

test("YouTube metadata limits keep Unicode and byte accounting distinct", () => {
  assert.equal(unicodeCharacterCount("A😀Б"), 3);
  assert.deepEqual(youtubeMetadataLimit("title", "x".repeat(100)), {
    limit: 100,
    used: 100,
    unit: "characters",
    nearLimit: true,
    exceedsLimit: false,
    hasUnsupportedCharacters: false,
  });
  assert.equal(youtubeMetadataLimit("description", "😀".repeat(1251)).exceedsLimit, true);
  assert.equal(youtubeMetadataLimit("title", "<draft>").hasUnsupportedCharacters, true);
});

test("YouTube tag limits count separators and quote tags containing spaces", () => {
  assert.equal(youtubeTagsCharacterCount("alpha, two words,omega"), 23);
  assert.equal(youtubeMetadataLimit("tags", "x".repeat(500)).exceedsLimit, false);
  assert.equal(youtubeMetadataLimit("tags", "x".repeat(501)).exceedsLimit, true);
});

test("working metadata patches preserve values beyond YouTube limits", () => {
  const title = "x".repeat(300);
  const description = "😀".repeat(1300);
  const tags = "tag,".repeat(130);

  assert.deepEqual(workingVideoPatch(4, { title, description, tags }), {
    revision: 4,
    title,
    description,
    tags,
  });
});

test("known YouTube category IDs display human-readable names", () => {
  assert.equal(youtubeVideoCategoryName("27"), "Education");
  assert.equal(youtubeVideoCategoryName("999"), "");
});

test("local editing status distinguishes modified, saved, and conflict states", () => {
  assert.equal(workingVideoStatusKey(null, { title: "New" }, false, ""), "modified");
  assert.equal(workingVideoStatusKey({ dirty: true }, {}, false, ""), "saved");
  assert.equal(workingVideoStatusKey({ conflict: true }, {}, false, "saved"), "conflict");
  assert.equal(workingVideoStatusKey(null, {}, true, ""), "saving");
});

test("reset working patch clears only active overrides with null", () => {
  assert.deepEqual(
    resetWorkingVideoPatch({ working: { title: "", description: null, tags: "local" } }),
    { title: null, tags: null },
  );
});

test("Statistics reuses a ready catalog and syncs only incomplete or stale states", () => {
  assert.equal(statisticsCatalogSyncAction({ state: "READY" }), null);
  assert.equal(statisticsCatalogSyncAction({ state: "NOT_IMPORTED" }), "initial");
  assert.equal(statisticsCatalogSyncAction({ state: "LOADING" }), "continue");
  assert.equal(statisticsCatalogSyncAction({ state: "PARTIAL" }), "continue");
  assert.equal(statisticsCatalogSyncAction({ state: "STALE" }), "incremental");
  assert.equal(statisticsCatalogSyncAction({ state: "ERROR" }), "incremental");
});

test("Continue is available for resumable loading and existing partial/error states", () => {
  assert.equal(shouldShowCatalogContinue({ state: "LOADING", can_continue: true }), true);
  assert.equal(shouldShowCatalogContinue({ state: "LOADING", can_continue: false }), false);
  assert.equal(shouldResumeCatalogSync({ state: "LOADING", can_continue: true }), true);
  assert.equal(shouldResumeCatalogSync({ state: "PARTIAL", can_continue: true }), false);
  assert.equal(shouldShowCatalogContinue({ state: "PARTIAL" }), true);
  assert.equal(shouldShowCatalogContinue({ state: "ERROR" }), true);
});

test("Continue posts to the existing endpoint and applies returned status", async () => {
  const calls = [];
  const appliedStatuses = [];
  const nextStatus = { state: "PARTIAL", can_continue: true, scanned_count: 50 };
  const status = await continueCatalogSyncPage(
    "channel-7",
    async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => nextStatus };
    },
    "sync failed",
    (value) => appliedStatuses.push(value),
  );

  assert.deepEqual(calls, [{
    url: "/channels/channel-7/catalog/sync/continue",
    options: { method: "POST" },
  }]);
  assert.equal(status, nextStatus);
  assert.deepEqual(appliedStatuses, [nextStatus]);
});

test("catalog sync lock rejects a second simultaneous action", () => {
  const lock = { current: false };

  assert.equal(tryStartCatalogSync(lock), true);
  assert.equal(tryStartCatalogSync(lock), false);
  finishCatalogSync(lock);
  assert.equal(tryStartCatalogSync(lock), true);
});

test("calendar always shows 42 dates and weekly navigation moves exactly seven days", () => {
  const october = new Date(2026, 9, 1);
  const first = calendarWeekCells(october);
  assert.equal(first.length, 42);
  assert.equal(first[0].getDay(), 1);
  assert.equal(first[0].getDate(), 28);
  assert.equal(first[0].getMonth(), 8);
  assert.equal(first[41].getDate(), 8);
  assert.equal(first[41].getMonth(), 10);

  const followingWeek = calendarWeekCells(shiftCalendarWeek(october, 1));
  assert.equal(followingWeek.length, 42);
  assert.equal(followingWeek[0].getDate(), 5);
  assert.equal(followingWeek[0].getMonth(), 9);
  assert.equal(shiftCalendarWeek(shiftCalendarWeek(october, 1), -1).getTime(), october.getTime());
});

test("calendar week shift crosses month and year boundaries without skipping days", () => {
  const yearEnd = new Date(2026, 11, 30);
  const next = shiftCalendarWeek(yearEnd, 1);
  assert.equal(next.getFullYear(), 2027);
  assert.equal(next.getMonth(), 0);
  assert.equal(next.getDate(), 6);

  const range = calendarWindowRange(yearEnd);
  assert.equal(new Date(range.start).getTime(), calendarWeekStart(yearEnd).getTime());
  assert.equal((new Date(range.end).getTime() - new Date(range.start).getTime()) / 86400000, 42);
});
