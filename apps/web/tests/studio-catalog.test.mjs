import assert from "node:assert/strict";
import test from "node:test";

import {
  accountPrefsForUser,
  channelPreferencesForAvailableChannels,
  prefsAfterChannelRemoval,
} from "../lib/prefs.js";
import { requestLogout, requestSessionState } from "../lib/auth-state.mjs";
import {
  catalogVideoDetailUrl,
  catalogVideoDisplayTitle,
  catalogVideosUrl,
  catalogVideoWorkingUrl,
  continueCatalogSyncPage,
  finishCatalogSync,
  isCurrentCatalogRequest,
  mapPlaylistForStudio,
  playlistsForChannel,
  resetWorkingVideoPatch,
  shouldResumeCatalogSync,
  shouldShowCatalogContinue,
  tryStartCatalogSync,
  workingVideoPatch,
  workingVideoStatusKey,
} from "../lib/catalog-state.mjs";

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

test("catalog list prefers the effective local title and preserves explicit empty values", () => {
  assert.equal(catalogVideoDisplayTitle({ title: "Snapshot", effectiveTitle: "Local" }), "Local");
  assert.equal(catalogVideoDisplayTitle({ title: "Snapshot", effectiveTitle: "" }), "");
  assert.deepEqual(workingVideoPatch(3, { title: "", tags: null }), {
    revision: 3,
    title: "",
    tags: null,
  });
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
