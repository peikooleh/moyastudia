"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { catalogVideosUrl, isCurrentCatalogRequest } from "../lib/catalog-state.mjs";
import { t } from "../lib/i18n";
import { usePrefs } from "./providers";

const VIEWS = [
  { id: "catalog", key: "catalogTab" },
  { id: "playlists", key: "playlistsTab" },
  { id: "grid", key: "calendarTab" },
];
const FILTERS = [
  { id: "all", key: "filterAll" },
  { id: "public", key: "filterPublic" },
  { id: "private", key: "filterPrivate" },
  { id: "unlisted", key: "filterUnlisted" },
  { id: "scheduled", key: "filterScheduled" },
  { id: "unavailable", key: "filterUnavailable" },
];
const SORTS = [
  { id: "date", key: "sortDate" },
  { id: "title", key: "sortTitle" },
  { id: "status", key: "sortStatus" },
];

const WEEKDAY_KEYS = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat", "daySun"];

function statusLabel(uiLang, status) {
  const key = {
    public: "filterPublic",
    private: "filterPrivate",
    unlisted: "filterUnlisted",
    scheduled: "filterScheduled",
    unavailable: "filterUnavailable",
  }[status];
  return key ? t(uiLang, key) : status || "—";
}

function readinessLabel(uiLang, light) {
  const key = {
    green: "readinessGood",
    yellow: "readinessPartial",
    red: "readinessMissing",
  }[light];
  return t(uiLang, key || "readinessMissing");
}

function lightOf(v) {
  if (!v) return "red";
  if (v.title && v.description && v.playlist && v.language && v.slot) return "green";
  if (v.title && v.description) return "yellow";
  return "red";
}

function monthMatrix(anchor) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < start; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(y, m, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function Studio() {
  const { prefs, uiLang } = usePrefs();
  const channelId = String(prefs.selectedChannelId || "");
  const [view, setView] = useState("catalog");
  const [videos, setVideos] = useState([]);
  const [calendarVideos, setCalendarVideos] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("date");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [pickedPl, setPickedPl] = useState("");
  const [err, setErr] = useState("");
  const [ch, setCh] = useState(null);
  const [catalogStatus, setCatalogStatus] = useState({ state: "NOT_IMPORTED", video_count: 0 });
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});
  const [catalogSummary, setCatalogSummary] = useState({});
  const [nextCursor, setNextCursor] = useState(null);
  const [calendarCursor, setCalendarCursor] = useState(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const channelRequestId = useRef(0);
  const catalogRequestId = useRef(0);
  const syncRunId = useRef(0);
  const channelIdRef = useRef(channelId);
  const uiLangRef = useRef(uiLang);
  channelIdRef.current = channelId;
  uiLangRef.current = uiLang;

  useEffect(() => {
    const requestId = ++channelRequestId.current;
    syncRunId.current += 1;
    setSyncBusy(false);
    setCh(null);
    setCatalogStatus({ state: "NOT_IMPORTED", video_count: 0 });
    if (!channelId) return undefined;

    apiFetch("/channels")
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (requestId !== channelRequestId.current) return;
        setCh(rows.find((row) => String(row.id) === channelId) || null);
      })
      .catch(() => {
        if (requestId === channelRequestId.current) setCh(null);
      });
    apiFetch(`/channels/${channelId}/catalog/status`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || t(uiLangRef.current, "studioChannelLoadError"));
        return data;
      })
      .then((data) => {
        if (requestId === channelRequestId.current) setCatalogStatus(data);
      })
      .catch((error) => {
        if (requestId === channelRequestId.current) {
          setCatalogStatus({ state: "ERROR", video_count: 0 });
          setErr(String(error.message || error));
        }
      });

    return () => {
      channelRequestId.current += 1;
    };
  }, [channelId]);

  useEffect(() => {
    const requestId = ++catalogRequestId.current;
    const controller = new AbortController();
    setVideos([]);
    setNextCursor(null);
    setCatalogTotal(0);
    setStatusCounts({});
    setSelectedId("");
    setErr("");
    if (!channelId) {
      setLoadingVideos(false);
      return () => controller.abort();
    }

    setLoadingVideos(true);
    apiFetch(catalogVideosUrl(channelId, { filter, query, sort }), { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || t(uiLangRef.current, "studioCatalogLoadError"));
        return data;
      })
      .then((data) => {
        if (requestId !== catalogRequestId.current) return;
        setVideos(data.items || []);
        setNextCursor(data.next_cursor || null);
        setCatalogTotal(data.total || 0);
        setStatusCounts(data.status_counts || {});
        setCatalogSummary(data.summary || {});
        setSelectedId(data.items?.[0]?.id || "");
      })
      .catch((error) => {
        if (error.name !== "AbortError" && requestId === catalogRequestId.current) {
          setErr(String(error.message || error));
        }
      })
      .finally(() => {
        if (requestId === catalogRequestId.current) setLoadingVideos(false);
      });
    return () => controller.abort();
  }, [channelId, filter, query, sort]);

  useEffect(() => {
    if (view !== "playlists" || !channelId) return undefined;
    const controller = new AbortController();
    apiFetch(`/channels/${channelId}/playlists`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (controller.signal.aborted) return;
        setPlaylists(rows);
        setPickedPl(rows[0]?.id || "");
      })
      .catch(() => {
        if (!controller.signal.aborted) setPlaylists([]);
      });
    return () => controller.abort();
  }, [channelId, view]);

  useEffect(() => {
    if (view !== "grid" || !channelId) return undefined;
    const controller = new AbortController();
    const start = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    setCalendarVideos([]);
    setCalendarCursor(null);
    setLoadingCalendar(true);
    apiFetch(
      catalogVideosUrl(channelId, { dateFrom: start, dateTo: end, sort: "date" }),
      { signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || t(uiLangRef.current, "studioCalendarLoadError"));
        return data;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setCalendarVideos(data.items || []);
        setCalendarCursor(data.next_cursor || null);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setErr(String(error.message || error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCalendar(false);
      });
    return () => controller.abort();
  }, [channelId, month, view]);

  async function loadMoreCatalog() {
    if (!nextCursor || !channelId || loadingMore) return;
    const requestId = catalogRequestId.current;
    setLoadingMore(true);
    try {
      const response = await apiFetch(
        catalogVideosUrl(channelId, { cursor: nextCursor, filter, query, sort }),
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || t(uiLang, "studioNextPageError"));
      if (!isCurrentCatalogRequest(channelId, channelIdRef.current, requestId, catalogRequestId.current)) return;
      setVideos((current) => [...current, ...(data.items || [])]);
      setNextCursor(data.next_cursor || null);
      setCatalogTotal(data.total || 0);
      setStatusCounts(data.status_counts || {});
      setCatalogSummary(data.summary || {});
    } catch (error) {
      setErr(String(error.message || error));
    } finally {
      if (requestId === catalogRequestId.current) setLoadingMore(false);
    }
  }

  async function loadMoreCalendar() {
    if (!calendarCursor || !channelId || loadingCalendar) return;
    const requestId = channelRequestId.current;
    const start = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    setLoadingCalendar(true);
    try {
      const response = await apiFetch(
        catalogVideosUrl(channelId, {
          cursor: calendarCursor,
          dateFrom: start,
          dateTo: end,
          sort: "date",
        }),
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || t(uiLang, "studioCalendarLoadError"));
      if (!isCurrentCatalogRequest(channelId, channelIdRef.current, requestId, channelRequestId.current)) return;
      setCalendarVideos((current) => [...current, ...(data.items || [])]);
      setCalendarCursor(data.next_cursor || null);
    } catch (error) {
      if (isCurrentCatalogRequest(channelId, channelIdRef.current, requestId, channelRequestId.current)) {
        setErr(String(error.message || error));
      }
    } finally {
      if (isCurrentCatalogRequest(channelId, channelIdRef.current, requestId, channelRequestId.current)) {
        setLoadingCalendar(false);
      }
    }
  }

  async function runCatalogSync(mode) {
    if (!channelId || syncBusy) return;
    const runId = ++syncRunId.current;
    setSyncBusy(true);
    setErr("");
    try {
      const startResponse = await apiFetch(`/channels/${channelId}/catalog/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      let status = await startResponse.json();
      if (!startResponse.ok) throw new Error(status.detail || t(uiLang, "studioSyncStartError"));
      if (runId !== syncRunId.current || channelIdRef.current !== channelId) return;
      setCatalogStatus(status);

      while (["LOADING", "PARTIAL"].includes(status.state)) {
        if (runId !== syncRunId.current || channelIdRef.current !== channelId) return;
        const response = await apiFetch(`/channels/${channelId}/catalog/sync/continue`, {
          method: "POST",
        });
        status = await response.json();
        if (!response.ok) throw new Error(status.detail || t(uiLang, "studioSyncFailed"));
        if (runId !== syncRunId.current || channelIdRef.current !== channelId) return;
        setCatalogStatus(status);

        const pageRequestId = catalogRequestId.current;
        const pageResponse = await apiFetch(catalogVideosUrl(channelId, { filter, query, sort }));
        const data = await pageResponse.json();
        if (!pageResponse.ok) throw new Error(data.detail || t(uiLang, "studioPageReadError"));
        if (
          !isCurrentCatalogRequest(channelId, channelIdRef.current, runId, syncRunId.current)
          || pageRequestId !== catalogRequestId.current
        ) return;
        setVideos(data.items || []);
        setNextCursor(data.next_cursor || null);
        setCatalogTotal(data.total || 0);
        setStatusCounts(data.status_counts || {});
        setCatalogSummary(data.summary || {});
        setSelectedId(data.items?.[0]?.id || "");
      }
    } catch (error) {
      if (runId === syncRunId.current && channelIdRef.current === channelId) {
        setErr(String(error.message || error));
        apiFetch(`/channels/${channelId}/catalog/status`)
          .then((response) => (response.ok ? response.json() : null))
          .then((status) => {
            if (status && runId === syncRunId.current) setCatalogStatus(status);
          })
          .catch(() => {});
      }
    } finally {
      if (runId === syncRunId.current) setSyncBusy(false);
    }
  }

  const selected = videos.find((v) => v.id === selectedId) || null;
  const playlist = playlists.find((p) => p.id === pickedPl) || null;

  const light = lightOf(selected);
  const counts = statusCounts;
  const upcoming = catalogSummary.upcoming;
  const last = catalogSummary.latest;
  const cells = monthMatrix(month);
  const byDay = {};
  calendarVideos.forEach((v) => {
    const key = (v.slot || v.publishedAt || "").slice(0, 10);
    if (!key) return;
    byDay[key] = byDay[key] || [];
    byDay[key].push(v);
  });
  const quotaLeft = Math.max(0, (prefs.dailyEdits || 20) - (prefs.usedEdits || 0));

  return (
    <div className="studio-wrap">
      <div className="studio-head">
        {ch && ch.thumbnail_url ? (
          <img className="studio-logo" referrerPolicy="no-referrer" src={ch.thumbnail_url} alt="" />
        ) : (
          <span className="avatar">{(ch && ch.title ? ch.title : "?").slice(0, 1)}</span>
        )}
        <div className="channel-banner">
          {ch && ch.banner_url ? (
            <img referrerPolicy="no-referrer" src={ch.banner_url} alt={t(uiLang, "bannerAlt")} />
          ) : null}
        </div>
        <div className="studio-stats">
          <div>{["public", "private", "unlisted", "scheduled", "unavailable"].map((key) =>
            `${t(uiLang, FILTERS.find((item) => item.id === key)?.key || "filterAll")} ${counts[key] || 0}`
          ).join(" · ")}</div>
          <div title={upcoming ? upcoming.title : ""}>
            {t(uiLang, "upcomingVideo")} {upcoming ? upcoming.slot.replace("T", " ") : "—"}
          </div>
          <div title={last ? last.title : ""}>
            {t(uiLang, "latestVideo")} {last ? last.publishedAt.replace("T", " ") : "—"}
          </div>
          <div title={t(uiLang, "quotaRemaining")}>
            {t(uiLang, "quotaEdits", { left: quotaLeft, cap: prefs.dailyEdits || 20 })}
          </div>
        </div>
      </div>

      <div className="studio-tabs">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={view === v.id ? "on" : ""}
            title={t(uiLang, "catalogViewTitle", { view: t(uiLang, v.key) })}
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
          >
            {t(uiLang, v.key)}
          </button>
        ))}
      </div>

      {view === "catalog" ? (
        <>
        <section className="catalog-state" aria-live="polite">
          <div>
            <strong>
              {{
                NOT_IMPORTED: "catalogNotImported",
                LOADING: "catalogLoading",
                PARTIAL: "catalogPartial",
                COMPLETE: "catalogComplete",
                STALE: "catalogStale",
                ERROR: "catalogError",
                EMPTY: "catalogEmpty",
              }[catalogStatus.state]
                ? t(uiLang, {
                    NOT_IMPORTED: "catalogNotImported",
                    LOADING: "catalogLoading",
                    PARTIAL: "catalogPartial",
                    COMPLETE: "catalogComplete",
                    STALE: "catalogStale",
                    ERROR: "catalogError",
                    EMPTY: "catalogEmpty",
                  }[catalogStatus.state])
                : t(uiLang, "catalogUnknown")}
            </strong>
            {catalogStatus.video_count > 0 ? (
              <span>{t(uiLang, "catalogCacheCount", { count: catalogStatus.video_count })}</span>
            ) : null}
            {["LOADING", "PARTIAL"].includes(catalogStatus.state) ? (
              <span>{t(uiLang, "catalogScannedCount", { count: catalogStatus.scanned_count || 0 })}</span>
            ) : null}
            {catalogStatus.last_success_at ? (
              <span>{t(uiLang, "catalogLastUpdated", { date: catalogStatus.last_success_at.replace("T", " ").slice(0, 16) })}</span>
            ) : null}
            {catalogStatus.last_error_code ? (
              <span role="alert">{t(uiLang, "catalogErrorCode", { code: catalogStatus.last_error_code })}</span>
            ) : null}
          </div>
          {catalogStatus.state === "NOT_IMPORTED" ? (
            <button className="btn" type="button" title={t(uiLang, "tipRefreshCatalog")} disabled={syncBusy} onClick={() => runCatalogSync("initial")}>
              {syncBusy ? t(uiLang, "catalogStarting") : t(uiLang, "catalogStart")}
            </button>
          ) : null}
          {["PARTIAL", "ERROR"].includes(catalogStatus.state) ? (
            <button
              className="btn"
              type="button"
              disabled={syncBusy}
              onClick={() => runCatalogSync(catalogStatus.mode || "initial")}
            >
              {syncBusy ? t(uiLang, "catalogContinuing") : t(uiLang, "catalogContinue")}
            </button>
          ) : null}
          {["COMPLETE", "STALE", "EMPTY"].includes(catalogStatus.state) ? (
            catalogStatus.state === "STALE" && catalogStatus.last_error_code ? (
              <button
                className="btn ghost"
                type="button"
                disabled={syncBusy}
                onClick={() => runCatalogSync(catalogStatus.mode || "reconcile")}
              >
                {syncBusy ? t(uiLang, "catalogContinuing") : t(uiLang, "catalogResume")}
              </button>
            ) : (
              <>
                <button
                  className="btn ghost"
                  type="button"
                  title={t(uiLang, "tipRefreshCatalog")}
                  disabled={syncBusy}
                  onClick={() => runCatalogSync("incremental")}
                >
                  {syncBusy ? t(uiLang, "catalogRefreshing") : t(uiLang, "catalogRefresh")}
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  title={t(uiLang, "tipReconcileCatalog")}
                  disabled={syncBusy}
                  onClick={() => runCatalogSync("reconcile")}
                >
                  {t(uiLang, "catalogReconcile")}
                </button>
              </>
            )
          ) : null}
          {syncBusy ? <span role="status">{t(uiLang, "catalogBusy")}</span> : null}
        </section>
        <div className="studio">
          <aside className="studio-list">
            <div className="studio-tools">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" title={t(uiLang, "tipFilterCatalog")} aria-pressed={filter === f.id} className={`chip ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>
                  {t(uiLang, f.key)}
                </button>
              ))}
              <select value={sort} onChange={(e) => setSort(e.target.value)} title={t(uiLang, "tipSortCatalog")} aria-label={t(uiLang, "tipSortCatalog")}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>{t(uiLang, s.key)}</option>
                ))}
              </select>
              <input className="search" title={t(uiLang, "tipSearchCatalog")} aria-label={t(uiLang, "searchVideos")} placeholder={t(uiLang, "searchVideos")} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="list">
              {err ? <div className="empty">{err}</div> : null}
              {loadingVideos ? <div className="empty">{t(uiLang, "catalogLoadCache")}</div> : null}
              {!loadingVideos && catalogStatus.state === "EMPTY" ? (
                <div className="empty">{t(uiLang, "catalogEmptyHint")}</div>
              ) : null}
              {!loadingVideos && catalogStatus.state === "NOT_IMPORTED" ? (
                <div className="empty">{t(uiLang, "catalogImportPrompt")}</div>
              ) : null}
              {videos.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`item ${v.id === selectedId ? "active" : ""}`}
                  onClick={() => setSelectedId(v.id)}
                >
                  <div className="item-title">{v.title}</div>
                  <div className="item-meta">
                    <span>{statusLabel(uiLang, v.status)}</span>
                    <span>{(v.slot || v.publishedAt || "").replace("T", " ")}</span>
                  </div>
                </button>
              ))}
              {nextCursor ? (
                <button className="btn ghost" type="button" disabled={loadingMore} onClick={loadMoreCatalog}>
                  {loadingMore
                    ? t(uiLang, "catalogLoadingMore")
                    : t(uiLang, "catalogLoadMore", { count: Math.max(catalogTotal - videos.length, 0) })}
                </button>
              ) : null}
            </div>
          </aside>
          <section className="studio-card">
            {!selected ? (
              <div className="empty">
                {catalogStatus.state === "EMPTY"
                  ? t(uiLang, "catalogEmptyHint")
                  : catalogStatus.state === "NOT_IMPORTED"
                      ? t(uiLang, "catalogSelectVideo")
                    : t(uiLang, "catalogSelectVideo")}
              </div>
            ) : (
              <>
                {selected.thumb ? <img className="cover" src={selected.thumb} alt={t(uiLang, "videoThumbnailAlt")} /> : null}
                <div className={`light ${light}`} title={readinessLabel(uiLang, light)}>
                  {readinessLabel(uiLang, light)}
                </div>
                <h2>{selected.title}</h2>
                <div className="meta-grid">
                  <label>{t(uiLang, "videoTitle")}<input value={selected.title} readOnly /></label>
                  <label>{t(uiLang, "videoLanguage")}<input value={selected.language || "—"} readOnly /></label>
                  <label className="wide">{t(uiLang, "videoDescription")}<textarea value={selected.description} readOnly /></label>
                  <label className="wide">{t(uiLang, "videoTags")}<input value={selected.tags} readOnly /></label>
                  <label>{t(uiLang, "videoPlaylist")}<input value={selected.playlist || "—"} readOnly title={t(uiLang, "noPlaylist")} /></label>
                  <label>{t(uiLang, "videoCategory")}<input value={selected.category || "—"} readOnly /></label>
                  <label>{t(uiLang, "videoVisibility")}<input value={statusLabel(uiLang, selected.privacy || selected.status)} readOnly /></label>
                  <label>{t(uiLang, "videoScheduledAt")}<input value={selected.slot || "—"} readOnly /></label>
                  <label>{t(uiLang, "videoPublishedAt")}<input value={(selected.publishedAt || "").replace("T", " ") || "—"} readOnly /></label>
                  <label>{t(uiLang, "videoDuration")}<input value={selected.duration || "—"} readOnly /></label>
                  <label>{t(uiLang, "videoViews")}<input value={selected.views ?? "—"} readOnly /></label>
                  <label>{t(uiLang, "videoLikes")}<input value={selected.likes ?? "—"} readOnly /></label>
                  <label>{t(uiLang, "videoComments")}<input value={selected.comments ?? "—"} readOnly /></label>
                  <label>{t(uiLang, "videoCaptions")}<input value={selected.captions == null ? "—" : selected.captions ? t(uiLang, "yes") : t(uiLang, "no")} readOnly /></label>
                  <label>{t(uiLang, "videoMadeForKids")}<input value={selected.madeForKids == null ? "—" : selected.madeForKids ? t(uiLang, "yes") : t(uiLang, "no")} readOnly /></label>
                </div>
                <div className="studio-actions">
                  <button type="button" className="btn ghost" title={t(uiLang, "tipExportPage")} onClick={() => {
                    const blob = new Blob([JSON.stringify({ videos, nextCursor }, null, 2)], { type: "application/json" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "catalog-page.json";
                    a.click();
                  }}>{t(uiLang, "exportCatalogPage")}</button>
                </div>
                <div className="previews">
                  <div>
                    <span>{t(uiLang, "previewDesktop")}</span>
                    <div className="snip">
                      {selected.thumb ? <img src={selected.thumb} alt="" /> : null}
                      <b>{selected.title}</b>
                      <p>{(selected.description || "").slice(0, 90)}</p>
                    </div>
                  </div>
                  <div>
                    <span>{t(uiLang, "previewMobile")}</span>
                    <div className="snip mob">
                      {selected.thumb ? <img src={selected.thumb} alt="" /> : null}
                      <b>{selected.title}</b>
                    </div>
                  </div>
                </div>
                <button className="btn" type="button" disabled title={t(uiLang, "writeDisabled")}>
                  {t(uiLang, "writeDisabled")}
                </button>
              </>
            )}
          </section>
        </div>
        </>
      ) : null}

      {view === "playlists" ? (
        <div className="studio">
          <aside className="studio-list">
            <div className="studio-tools">
              <button className="chip" type="button" disabled title={t(uiLang, "playlistCreateSoon")}>
                {t(uiLang, "playlistCreateSoon")}
              </button>
            </div>
            <div className="list">
              {playlists.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`item ${p.id === pickedPl ? "active" : ""}`}
                  onClick={() => setPickedPl(p.id)}
                >
                  <div className="item-title">{p.title}</div>
                </button>
              ))}
              {!playlists.length ? <div className="empty">{t(uiLang, "emptyPlaylists")}</div> : null}
            </div>
          </aside>
          <section className="studio-card">
            {!playlist ? (
              <div className="empty">{t(uiLang, "selectPlaylist")}</div>
            ) : (
              <>
                {playlist.thumb ? <img className="cover" src={playlist.thumb} alt="" /> : null}
                <h2>{playlist.title}</h2>
                <div className="meta-grid">
                  <label>{t(uiLang, "videoTitle")}<input value={playlist.title} readOnly /></label>
                  <label>{t(uiLang, "playlistVideoCount")}<input value={playlist.itemCount ?? 0} readOnly /></label>
                  <label className="wide">{t(uiLang, "videoDescription")}<textarea value={playlist.description || ""} readOnly /></label>
                  <label>{t(uiLang, "channelCreated")}<input value={playlist.publishedAt || "—"} readOnly /></label>
                  <label>{t(uiLang, "videoVisibility")}<input value={playlist.privacy || "—"} readOnly /></label>
                </div>
                <div className="studio-actions">
                  <label className="btn ghost file-btn" title={t(uiLang, "playlistCreateSoon")}>{t(uiLang, "playlistThumbnailAlt")}<input type="file" accept="image/*" hidden disabled /></label>
                  <button type="button" className="btn" disabled title={t(uiLang, "playlistCreateSoon")}>{t(uiLang, "playlistCreateSoon")}</button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      {view === "grid" ? (
        <div className="studio-grid">
          <div className="cal-nav">
            <button type="button" className="btn ghost" title={t(uiLang, "tipPreviousMonth")} aria-label={t(uiLang, "tipPreviousMonth")} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
            <strong>
              {month.toLocaleString(t(uiLang, "calendarLocale"), { month: "long", year: "numeric" })}
            </strong>
            <button type="button" className="btn ghost" title={t(uiLang, "tipNextMonth")} aria-label={t(uiLang, "tipNextMonth")} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
          </div>
          <div className="cal">
            {WEEKDAY_KEYS.map((key) => (
              <div key={key} className="cal-h">{t(uiLang, key)}</div>
            ))}
            {cells.map((day, i) => {
              const key = day ? day.toISOString().slice(0, 10) : `e${i}`;
              const items = day ? byDay[key] || [] : [];
              return (
                <div key={key} className={`cal-cell ${day ? "" : "off"}`}>
                  {day ? <b>{day.getDate()}</b> : null}
                  {items.slice(0, 3).map((v) => (
                    <span key={v.id} title={v.title}>{v.title}</span>
                  ))}
                </div>
              );
            })}
          </div>
          {loadingCalendar ? <div className="empty">{t(uiLang, "catalogLoadingCalendar")}</div> : null}
          {calendarCursor ? (
            <button className="btn ghost" type="button" title={t(uiLang, "tipRefreshCatalog")} disabled={loadingCalendar} onClick={loadMoreCalendar}>
              {t(uiLang, "catalogLoadCalendar")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
