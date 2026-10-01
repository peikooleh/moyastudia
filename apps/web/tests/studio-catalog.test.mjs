import assert from "node:assert/strict";
import test from "node:test";

import { prefsAfterChannelRemoval } from "../lib/prefs.js";
import {
  catalogVideoDetailUrl,
  catalogVideoDisplayTitle,
  catalogVideosUrl,
  catalogVideoWorkingUrl,
  continueCatalogSyncPage,
  finishCatalogSync,
  isCurrentCatalogRequest,
  resetWorkingVideoPatch,
  shouldResumeCatalogSync,
  shouldShowCatalogContinue,
  tryStartCatalogSync,
  workingVideoPatch,
  workingVideoStatusKey,
} from "../lib/catalog-state.mjs";

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

test("working video routes stay under the selected channel", () => {
  assert.equal(catalogVideoDetailUrl(12, 34), "/channels/12/videos/34");
  assert.equal(catalogVideoWorkingUrl(12, 34), "/channels/12/videos/34/working");
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
