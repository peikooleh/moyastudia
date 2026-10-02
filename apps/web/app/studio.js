"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import {
  catalogVideosUrl,
  catalogVideoDisplayTitle,
  catalogVideoDetailUrl,
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
import { t } from "../lib/i18n";
import { usePrefs } from "./providers";

const FILTERS = [
  { id: "all", key: "filterAll" },
  { id: "public", key: "filterPublic" },
  { id: "private", key: "filterPrivate" },
  { id: "unlisted", key: "filterUnlisted" },
  { id: "scheduled", key: "filterScheduled" },
  { id: "unavailable", key: "filterUnavailable" },
  { id: "remote_missing", key: "filterRemoteMissing" },
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
    remote_missing: "filterRemoteMissing",
  }[status];
  return key ? t(uiLang, key) : status || "—";
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

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function VideoInspector({
  uiLang,
  selected,
  workingLoading,
  workingVideo,
  workingDraft,
  workingEdits,
  workingSaving,
  workingError,
  workingStateKey,
  workingStateLabels,
  updateWorkingField,
  resetWorkingToSnapshot,
  saveWorkingVideo,
  videos,
  nextCursor,
  catalogStatus,
  playlists,
  playlistsLoading,
  playlistsError,
  retryPlaylists,
}) {
  if (!selected) {
    return <section className="video-inspector empty">{t(uiLang, "catalogSelectVideo")}</section>;
  }

  const effectiveTitle = workingDraft?.title ?? catalogVideoDisplayTitle(selected);
  const displayDate = selected.slot || selected.publishedAt || "";

  return (
    <section className="video-inspector" aria-label={t(uiLang, "selectedVideo")}>
      <header className="video-summary">
        {selected.thumb ? <img src={selected.thumb} alt={t(uiLang, "videoThumbnailAlt")} /> : null}
        <div className="video-summary-copy">
          <h2>{effectiveTitle || t(uiLang, "untitledVideo")}</h2>
          <div className="video-summary-meta">
            <span className={`status-label ${selected.availability === "unavailable" || selected.remoteMissing ? "warning" : ""}`}>
              {statusLabel(uiLang, selected.status)}
            </span>
            {displayDate ? <time dateTime={displayDate}>{displayDate.replace("T", " ")}</time> : null}
            {selected.availability === "available" ? <span>{t(uiLang, "availabilityAvailable")}</span> : null}
            {selected.duration ? <span>{selected.duration}</span> : null}
            {workingVideo?.dirty ? <span className="item-change">{t(uiLang, "workingModified")}</span> : null}
          </div>
        </div>
      </header>

      <section className="inspector-edit" aria-labelledby="inspector-edit-title">
        <h3 id="inspector-edit-title">{t(uiLang, "videoEditing")}</h3>
        <label>
          {t(uiLang, "videoTitle")}
          <input
            value={workingDraft?.title ?? catalogVideoDisplayTitle(selected)}
            readOnly={!workingVideo || workingLoading || workingSaving}
            onChange={(event) => updateWorkingField("title", event.target.value)}
          />
        </label>
        <label>
          {t(uiLang, "videoDescription")}
          <textarea
            value={workingDraft?.description ?? selected.description ?? ""}
            readOnly={!workingVideo || workingLoading || workingSaving}
            onChange={(event) => updateWorkingField("description", event.target.value)}
          />
        </label>
        <label>
          {t(uiLang, "videoTags")}
          <input
            value={workingDraft?.tags ?? selected.tags ?? ""}
            readOnly={!workingVideo || workingLoading || workingSaving}
            onChange={(event) => updateWorkingField("tags", event.target.value)}
          />
        </label>
      </section>

      <div className="working-controls" aria-live="polite">
        {workingLoading ? <span>{t(uiLang, "workingLoading")}</span> : null}
        {workingStateKey ? (
          <strong className={`working-state ${workingStateKey}`}>
            {t(uiLang, workingStateLabels[workingStateKey])}
          </strong>
        ) : null}
        {workingVideo?.remoteMissing ? <span role="alert">{t(uiLang, "workingRemoteMissing")}</span> : null}
        {workingError ? <span role="alert">{workingError}</span> : null}
        <button
          className="btn ghost"
          type="button"
          disabled={!workingVideo || workingLoading || workingSaving || (
            !Object.keys(workingEdits).length
            && !Object.values(workingVideo?.working || {}).some((value) => value !== null)
          )}
          onClick={resetWorkingToSnapshot}
        >
          {t(uiLang, "workingUseSnapshot")}
        </button>
        <button
          className="btn"
          type="button"
          disabled={!workingVideo || workingLoading || workingSaving || !Object.keys(workingEdits).length}
          onClick={saveWorkingVideo}
        >
          {workingSaving ? t(uiLang, "workingSaving") : t(uiLang, "saveLocally")}
        </button>
      </div>

      <details className="inspector-disclosure">
        <summary>{t(uiLang, "videoMetadata")}</summary>
        <dl className="inspector-data">
          <div><dt>{t(uiLang, "videoCategory")}</dt><dd>{selected.category || "—"}</dd></div>
          <div><dt>{t(uiLang, "videoLanguage")}</dt><dd>{selected.language || "—"}</dd></div>
          <div><dt>{t(uiLang, "videoCaptions")}</dt><dd>{selected.captions == null ? "—" : selected.captions ? t(uiLang, "yes") : t(uiLang, "no")}</dd></div>
          <div><dt>{t(uiLang, "videoMadeForKids")}</dt><dd>{selected.madeForKids == null ? "—" : selected.madeForKids ? t(uiLang, "yes") : t(uiLang, "no")}</dd></div>
        </dl>
      </details>

      <details className="inspector-disclosure">
        <summary>{t(uiLang, "videoStatistics")}</summary>
        <dl className="inspector-data">
          <div><dt>{t(uiLang, "videoViews")}</dt><dd>{selected.views ?? "—"}</dd></div>
          <div><dt>{t(uiLang, "videoLikes")}</dt><dd>{selected.likes ?? "—"}</dd></div>
          <div><dt>{t(uiLang, "videoComments")}</dt><dd>{selected.comments ?? "—"}</dd></div>
        </dl>
      </details>

      <details className="inspector-disclosure">
        <summary>{t(uiLang, "channelPlaylists")}</summary>
        {playlistsLoading ? <p role="status">{t(uiLang, "playlistsLoading")}</p> : null}
        {playlistsError ? (
          <p role="alert">{playlistsError} <button className="text-button" type="button" onClick={retryPlaylists}>{t(uiLang, "playlistsRetry")}</button></p>
        ) : null}
        {!playlistsLoading && !playlistsError && playlists.length === 0 ? <p>{t(uiLang, "emptyPlaylists")}</p> : null}
        <ul className="playlist-list">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <strong>{playlist.title}</strong>
              <span>{playlist.itemCount ?? "—"} · {playlist.privacy || "—"}</span>
            </li>
          ))}
        </ul>
      </details>

      <details className="inspector-disclosure technical-disclosure">
        <summary>{t(uiLang, "videoTechnical")}</summary>
        <dl className="inspector-data">
          <div><dt>YouTube ID</dt><dd>{workingVideo?.youtubeId || selected.youtubeId || "—"}</dd></div>
          <div><dt>{t(uiLang, "workingRevision")}</dt><dd>{workingVideo?.revision ?? "—"}</dd></div>
          <div><dt>{t(uiLang, "catalogStateLabel")}</dt><dd>{t(uiLang, ({
            NOT_IMPORTED: "catalogNotImported", LOADING: "catalogLoading", PARTIAL: "catalogPartial",
            COMPLETE: "catalogComplete", STALE: "catalogStale", ERROR: "catalogError", EMPTY: "catalogEmpty",
          })[catalogStatus.state] || "catalogUnknown")}</dd></div>
          <div><dt>{t(uiLang, "catalogLastUpdatedLabel")}</dt><dd>{catalogStatus.last_success_at || "—"}</dd></div>
          <div><dt>{t(uiLang, "workingSnapshot")}</dt><dd>{JSON.stringify(workingVideo?.snapshot || {})}</dd></div>
          <div><dt>{t(uiLang, "workingValue")}</dt><dd>{JSON.stringify(workingVideo?.working || {})}</dd></div>
          <div><dt>{t(uiLang, "workingBase")}</dt><dd>{JSON.stringify(workingVideo?.base || {})}</dd></div>
          <div><dt>{t(uiLang, "workingConflicts")}</dt><dd>{JSON.stringify(workingVideo?.conflictFields || {})}</dd></div>
        </dl>
        <button className="btn ghost" type="button" onClick={() => {
          const blob = new Blob([JSON.stringify({ videos, nextCursor }, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = "catalog-page.json";
          anchor.click();
          URL.revokeObjectURL(url);
        }}>{t(uiLang, "exportCatalogPage")}</button>
      </details>
    </section>
  );
}

export function Studio({ view = "videos" }) {
  const { prefs, uiLang } = usePrefs();
  const channelId = String(prefs.selectedChannelId || "");
  const [videos, setVideos] = useState([]);
  const [calendarVideos, setCalendarVideos] = useState([]);
  const [playlistState, setPlaylistState] = useState({
    channelId: "",
    items: [],
    loading: false,
    error: "",
  });
  const [playlistRetry, setPlaylistRetry] = useState(0);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("date");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [err, setErr] = useState("");
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
  const [workingVideo, setWorkingVideo] = useState(null);
  const [workingDraft, setWorkingDraft] = useState(null);
  const [workingEdits, setWorkingEdits] = useState({});
  const [workingError, setWorkingError] = useState("");
  const [workingSaveState, setWorkingSaveState] = useState("");
  const [workingSaving, setWorkingSaving] = useState(false);
  const [workingLoading, setWorkingLoading] = useState(false);
  const [workingDetailReload, setWorkingDetailReload] = useState(0);
  const [month, setMonth] = useState(() => new Date());
  const syncBusyRef = useRef(false);
  const channelRequestId = useRef(0);
  const catalogRequestId = useRef(0);
  const workingRequestId = useRef(0);
  const syncRunId = useRef(0);
  const channelIdRef = useRef(channelId);
  const uiLangRef = useRef(uiLang);
  channelIdRef.current = channelId;
  uiLangRef.current = uiLang;
  const playlists = playlistsForChannel(playlistState, channelId);
  const currentPlaylistState = playlistState.channelId === channelId ? playlistState : null;
  const playlistsLoading = Boolean(
    view === "videos"
    && channelId
    && (!currentPlaylistState || currentPlaylistState.loading),
  );
  const playlistsError = currentPlaylistState?.error || "";

  useEffect(() => {
    const requestId = ++channelRequestId.current;
    syncRunId.current += 1;
    finishCatalogSync(syncBusyRef);
    setSyncBusy(false);
    setCatalogStatus({ state: "NOT_IMPORTED", video_count: 0 });
    setCalendarVideos([]);
    setCalendarCursor(null);
    setLoadingCalendar(false);
    setPlaylistState({ channelId, items: [], loading: false, error: "" });
    if (!channelId) return undefined;

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
    setCatalogSummary({});
    setSelectedId("");
    setErr("");
    setLoadingMore(false);
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
    const requestId = ++workingRequestId.current;
    const controller = new AbortController();
    setWorkingVideo(null);
    setWorkingDraft(null);
    setWorkingEdits({});
    setWorkingError("");
    setWorkingSaveState("");
    if (!channelId || !selectedId) {
      setWorkingLoading(false);
      return () => controller.abort();
    }

    setWorkingLoading(true);
    apiFetch(catalogVideoDetailUrl(channelId, selectedId), { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || t(uiLangRef.current, "workingLoadError"));
        return data;
      })
      .then((data) => {
        if (requestId !== workingRequestId.current) return;
        setWorkingVideo(data);
        setWorkingDraft(data.effective);
        setWorkingSaveState(data.conflict ? "conflict" : data.dirty ? "saved" : "");
      })
      .catch((error) => {
        if (error.name !== "AbortError" && requestId === workingRequestId.current) {
          setWorkingError(String(error.message || error));
        }
      })
      .finally(() => {
        if (requestId === workingRequestId.current) setWorkingLoading(false);
      });
    return () => controller.abort();
  }, [channelId, selectedId, workingDetailReload]);

  useEffect(() => {
    if (view !== "videos" || !channelId) {
      setPlaylistState({ channelId, items: [], loading: false, error: "" });
      return undefined;
    }
    const controller = new AbortController();
    setPlaylistState({ channelId, items: [], loading: true, error: "" });
    apiFetch(`/channels/${channelId}/playlists`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            (typeof data?.detail === "string" && data.detail)
              || t(uiLangRef.current, "playlistsLoadError"),
          );
        }
        return data;
      })
      .then((rows) => {
        if (controller.signal.aborted) return;
        const items = Array.isArray(rows) ? rows.map(mapPlaylistForStudio) : [];
        setPlaylistState({ channelId, items, loading: false, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setPlaylistState({
            channelId,
            items: [],
            loading: false,
            error: error.message || t(uiLangRef.current, "playlistsLoadError"),
          });
        }
      });
    return () => controller.abort();
  }, [channelId, view, playlistRetry]);

  useEffect(() => {
    if (view !== "calendar" || !channelId) return undefined;
    const controller = new AbortController();
    const start = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    setCalendarVideos([]);
    setCalendarCursor(null);
    setSelectedId("");
    setLoadingCalendar(true);
    apiFetch(
      catalogVideosUrl(channelId, { dateFrom: start, dateTo: end, sort: "date", filter, query }),
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
  }, [channelId, filter, month, query, view]);

  useEffect(() => {
    const activeVideos = view === "calendar" ? calendarVideos : videos;
    if (!activeVideos.some((video) => video.id === selectedId)) {
      setSelectedId(activeVideos[0]?.id || "");
    }
  }, [calendarVideos, selectedId, videos, view]);

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
          filter,
          query,
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

  function updateWorkingField(field, value) {
    if (!workingVideo) return;
    setWorkingDraft((current) => ({ ...current, [field]: value }));
    setWorkingEdits((current) => {
      const changes = { ...current };
      const nextValue = value;
      if (nextValue === workingVideo.working[field]) delete changes[field];
      else changes[field] = nextValue;
      return changes;
    });
    setWorkingSaveState("modified");
    setWorkingError("");
  }

  function resetWorkingToSnapshot() {
    if (!workingVideo) return;
    const changes = resetWorkingVideoPatch(workingVideo);
    setWorkingDraft(workingVideo.snapshot);
    setWorkingEdits(changes);
    setWorkingSaveState(Object.keys(changes).length ? "modified" : "");
    setWorkingError("");
  }

  async function saveWorkingVideo() {
    if (!workingVideo || !Object.keys(workingEdits).length || workingSaving) return;
    setWorkingSaving(true);
    setWorkingError("");
    try {
      const response = await apiFetch(catalogVideoWorkingUrl(channelId, workingVideo.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workingVideoPatch(workingVideo.revision, workingEdits)),
      });
      const data = await response.json();
      if (response.status === 409 && data.detail?.current) {
        setWorkingVideo(data.detail.current);
        setWorkingSaveState("conflict");
        setWorkingError(t(uiLang, "workingRevisionError"));
        return;
      }
      if (!response.ok) throw new Error(data.detail || t(uiLang, "workingSaveError"));
      setWorkingVideo(data);
      setWorkingDraft(data.effective);
      setWorkingEdits({});
      setWorkingSaveState(data.conflict ? "conflict" : "saved");
      setVideos((current) => current.map((video) => (
        video.id === data.id ? { ...video, effectiveTitle: data.effective.title } : video
      )));
    } catch (error) {
      setWorkingSaveState("error");
      setWorkingError(String(error.message || error));
    } finally {
      setWorkingSaving(false);
    }
  }

  async function runCatalogSync(mode, resumeExisting = false) {
    if (!channelId || !tryStartCatalogSync(syncBusyRef)) return;
    const runId = ++syncRunId.current;
    setSyncBusy(true);
    setErr("");
    try {
      let status = catalogStatus;
      if (!resumeExisting) {
        const startResponse = await apiFetch(`/channels/${channelId}/catalog/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        status = await startResponse.json();
        if (!startResponse.ok) throw new Error(status.detail || t(uiLang, "studioSyncStartError"));
      }
      if (runId !== syncRunId.current || channelIdRef.current !== channelId) return;
      if (!resumeExisting) setCatalogStatus(status);

      while (["LOADING", "PARTIAL"].includes(status.state)) {
        if (runId !== syncRunId.current || channelIdRef.current !== channelId) return;
        status = await continueCatalogSyncPage(
          channelId,
          apiFetch,
          t(uiLang, "studioSyncFailed"),
          (nextStatus) => {
            if (runId === syncRunId.current && channelIdRef.current === channelId) {
              setCatalogStatus(nextStatus);
            }
          },
        );
        if (runId !== syncRunId.current || channelIdRef.current !== channelId) return;

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
        setWorkingDetailReload((current) => current + 1);
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
      if (runId === syncRunId.current) {
        setSyncBusy(false);
        finishCatalogSync(syncBusyRef);
      }
    }
  }

  const selected = videos.find((v) => v.id === selectedId)
    || calendarVideos.find((v) => v.id === selectedId)
    || null;
  const workingStateKey = workingVideoStatusKey(
    workingVideo,
    workingEdits,
    workingSaving,
    workingSaveState,
  );
  const workingStateLabels = {
    saved: "workingSaved",
    modified: "workingModified",
    conflict: "workingConflict",
    saving: "workingSaving",
    error: "workingSaveError",
  };
  const cells = monthMatrix(month);
  const byDay = {};
  calendarVideos.forEach((v) => {
    const key = (v.slot || v.publishedAt || "").slice(0, 10);
    if (!key) return;
    byDay[key] = byDay[key] || [];
    byDay[key].push(v);
  });
  return (
    <div className="studio-wrap">
      {view === "videos" ? (
        <header className="workspace-heading">
          <h1>{t(uiLang, "videos")}</h1>
          <span>{t(uiLang, "videoCount", { count: catalogTotal })}</span>
        </header>
      ) : null}

      {view === "videos" ? (
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
          </div>
          {catalogStatus.state === "NOT_IMPORTED" ? (
            <button className="btn" type="button" title={t(uiLang, "tipRefreshCatalog")} disabled={syncBusy} onClick={() => runCatalogSync("initial")}>
              {syncBusy ? t(uiLang, "catalogStarting") : t(uiLang, "catalogStart")}
            </button>
          ) : null}
          {shouldShowCatalogContinue(catalogStatus) ? (
            <button
              className="btn"
              type="button"
              disabled={syncBusy}
              onClick={() => runCatalogSync(
                catalogStatus.mode || "initial",
                shouldResumeCatalogSync(catalogStatus),
              )}
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
            <div className="video-toolbar">
              <input className="search" title={t(uiLang, "tipSearchCatalog")} aria-label={t(uiLang, "searchVideos")} placeholder={t(uiLang, "searchVideos")} value={query} onChange={(event) => setQuery(event.target.value)} />
              <select value={filter} onChange={(event) => setFilter(event.target.value)} title={t(uiLang, "tipFilterCatalog")} aria-label={t(uiLang, "tipFilterCatalog")}>
                {FILTERS.map((item) => (
                  <option key={item.id} value={item.id}>{t(uiLang, item.key)}</option>
                ))}
              </select>
              <select value={sort} onChange={(event) => setSort(event.target.value)} title={t(uiLang, "tipSortCatalog")} aria-label={t(uiLang, "tipSortCatalog")}>
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>{t(uiLang, s.key)}</option>
                ))}
              </select>
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
                  {v.thumb ? <img className="item-thumb" src={v.thumb} alt="" loading="lazy" /> : <span className="item-thumb empty-thumb" />}
                  <span className="item-content">
                    <strong className="item-title">{catalogVideoDisplayTitle(v) || t(uiLang, "untitledVideo")}</strong>
                    <span className="item-meta">
                      <span>{statusLabel(uiLang, v.status)}</span>
                      {v.availability === "available" ? <span>{t(uiLang, "availabilityAvailable")}</span> : null}
                      <time dateTime={v.slot || v.publishedAt || undefined}>{(v.slot || v.publishedAt || "").replace("T", " ")}</time>
                    </span>
                    {v.dirty ? (
                      <span className="item-change">{t(uiLang, "workingModified")}</span>
                    ) : null}
                  </span>
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
          <VideoInspector
            uiLang={uiLang}
            selected={selected}
            workingLoading={workingLoading}
            workingVideo={workingVideo}
            workingDraft={workingDraft}
            workingEdits={workingEdits}
            workingSaving={workingSaving}
            workingError={workingError}
            workingStateKey={workingStateKey}
            workingStateLabels={workingStateLabels}
            updateWorkingField={updateWorkingField}
            resetWorkingToSnapshot={resetWorkingToSnapshot}
            saveWorkingVideo={saveWorkingVideo}
            videos={videos}
            nextCursor={nextCursor}
            catalogStatus={catalogStatus}
            playlists={playlists}
            playlistsLoading={playlistsLoading}
            playlistsError={playlistsError}
            retryPlaylists={() => setPlaylistRetry((current) => current + 1)}
          />
        </div>
        </>
      ) : null}

      {view === "calendar" ? (
        <main className="calendar-workspace">
          <section className="calendar-panel">
            <header className="calendar-heading">
              <h1>{t(uiLang, "calendarTab")}</h1>
              <div className="cal-nav">
                <button type="button" className="btn ghost" title={t(uiLang, "tipPreviousMonth")} aria-label={t(uiLang, "tipPreviousMonth")} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
                <strong>{month.toLocaleString(t(uiLang, "calendarLocale"), { month: "long", year: "numeric" })}</strong>
                <button type="button" className="btn ghost" title={t(uiLang, "tipNextMonth")} aria-label={t(uiLang, "tipNextMonth")} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
              </div>
            </header>
            <div className="calendar-tools">
              <input className="search" aria-label={t(uiLang, "searchVideos")} placeholder={t(uiLang, "searchVideos")} value={query} onChange={(event) => setQuery(event.target.value)} />
              <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t(uiLang, "tipFilterCatalog")}>
                {FILTERS.map((item) => <option key={item.id} value={item.id}>{t(uiLang, item.key)}</option>)}
              </select>
            </div>
            <div className="calendar-status" role="status" aria-live="polite">
              <strong>{t(uiLang, ({
                NOT_IMPORTED: "catalogNotImported", LOADING: "catalogLoading", PARTIAL: "catalogPartial",
                COMPLETE: "catalogComplete", STALE: "catalogStale", ERROR: "catalogError", EMPTY: "catalogEmpty",
              })[catalogStatus.state] || "catalogUnknown")}</strong>
              {catalogStatus.video_count > 0 ? <span>{t(uiLang, "catalogCacheCount", { count: catalogStatus.video_count })}</span> : null}
              {err ? <span className="calendar-error" role="alert">{err}</span> : null}
            </div>
            <div className="cal" role="grid" aria-label={t(uiLang, "calendarTab")}>
              {WEEKDAY_KEYS.map((key) => <div key={key} className="cal-h" role="columnheader">{t(uiLang, key)}</div>)}
              {cells.map((day, index) => {
                const key = day ? localDateKey(day) : `empty-${index}`;
                const items = day ? byDay[key] || [] : [];
                return (
                  <div key={key} className={`cal-cell ${day ? "" : "off"}`} role="gridcell">
                    {day ? <b>{day.getDate()}</b> : null}
                    {items.slice(0, 3).map((video) => (
                      <button
                        key={video.id}
                        type="button"
                        className={`cal-event ${video.id === selectedId ? "active" : ""}`}
                        title={catalogVideoDisplayTitle(video)}
                        onClick={() => setSelectedId(video.id)}
                      >
                        {catalogVideoDisplayTitle(video) || t(uiLang, "untitledVideo")}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
            {loadingCalendar ? <div className="empty" role="status">{t(uiLang, "catalogLoadingCalendar")}</div> : null}
            {!loadingCalendar && !err && calendarVideos.length === 0 ? (
              <div className="empty">
                {catalogStatus.state === "NOT_IMPORTED"
                  ? t(uiLang, "catalogImportPrompt")
                  : ["COMPLETE", "EMPTY", "STALE"].includes(catalogStatus.state)
                    ? t(uiLang, "calendarNoEvents")
                    : null}
              </div>
            ) : null}
            {calendarCursor ? (
              <button className="btn ghost" type="button" disabled={loadingCalendar} onClick={loadMoreCalendar}>
                {t(uiLang, "catalogLoadCalendar")}
              </button>
            ) : null}
          </section>
          <VideoInspector
            uiLang={uiLang}
            selected={selected}
            workingLoading={workingLoading}
            workingVideo={workingVideo}
            workingDraft={workingDraft}
            workingEdits={workingEdits}
            workingSaving={workingSaving}
            workingError={workingError}
            workingStateKey={workingStateKey}
            workingStateLabels={workingStateLabels}
            updateWorkingField={updateWorkingField}
            resetWorkingToSnapshot={resetWorkingToSnapshot}
            saveWorkingVideo={saveWorkingVideo}
            videos={videos}
            nextCursor={nextCursor}
            catalogStatus={catalogStatus}
            playlists={playlists}
            playlistsLoading={playlistsLoading}
            playlistsError={playlistsError}
            retryPlaylists={() => setPlaylistRetry((current) => current + 1)}
          />
        </main>
      ) : null}
    </div>
  );
}
