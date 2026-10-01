import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogVideosUrl,
  continueCatalogSyncPage,
  finishCatalogSync,
  isCurrentCatalogRequest,
  shouldResumeCatalogSync,
  shouldShowCatalogContinue,
  tryStartCatalogSync,
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
