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
  playlistItemsUrl,
  playlistsForChannel,
  resetWorkingVideoPatch,
  shouldResumeCatalogSync,
  shouldShowCatalogContinue,
  tryStartCatalogSync,
  workingVideoPatch,
  workingVideoStatusKey,
  youtubeVideoCategoryName,
  youtubeMetadataLimit,
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

function MetadataLimitNotice({ uiLang, state }) {
  if (!state) return null;
  const countKey = state.unit === "bytes" ? "youtubeLimitBytes" : "youtubeLimitCharacters";

  return (
    <div
      className={`field-limit ${state.exceedsLimit || state.hasUnsupportedCharacters ? "exceeded" : state.nearLimit ? "near" : ""}`}
      aria-live="polite"
    >
      <span>{t(uiLang, countKey, { count: state.used, limit: state.limit })}</span>
      {state.nearLimit ? <span>{t(uiLang, "youtubeLimitNear")}</span> : null}
      {state.exceedsLimit ? <span>{t(uiLang, "youtubeLimitExceeded")}</span> : null}
      {state.hasUnsupportedCharacters ? <span>{t(uiLang, "youtubeUnsupportedCharacters")}</span> : null}
    </div>
  );
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
  resolveWorkingConflict,
}) {
  if (!selected) {
    return <section className="video-inspector empty">{t(uiLang, "catalogSelectVideo")}</section>;
  }

  const effectiveTitle = workingDraft?.title ?? catalogVideoDisplayTitle(selected);
  const displayDate = selected.slot || selected.publishedAt || "";
  const description = workingDraft?.description ?? selected.description ?? "";
  const tags = workingDraft?.tags ?? selected.tags ?? "";
  const titleLimit = youtubeMetadataLimit("title", effectiveTitle);
  const descriptionLimit = youtubeMetadataLimit("description", description);
  const tagsLimit = youtubeMetadataLimit("tags", tags);
  const categoryName = youtubeVideoCategoryName(selected.category);

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
        <h3 id="inspector-edit-title">{t(uiLang, "localDraft")}</h3>
        <div className="editor-field">
          <label htmlFor="video-working-title">{t(uiLang, "videoTitle")}</label>
          <textarea
            id="video-working-title"
            rows={3}
            value={effectiveTitle}
            readOnly={!workingVideo || workingLoading || workingSaving}
            aria-describedby="video-working-title-limit"
            aria-invalid={titleLimit.exceedsLimit || titleLimit.hasUnsupportedCharacters}
            onChange={(event) => updateWorkingField("title", event.target.value)}
          />
          <div id="video-working-title-limit"><MetadataLimitNotice uiLang={uiLang} state={titleLimit} /></div>
        </div>
        <div className="editor-field description-field">
          <label htmlFor="video-working-description">{t(uiLang, "videoDescription")}</label>
          <textarea
            id="video-working-description"
            rows={10}
            value={description}
            readOnly={!workingVideo || workingLoading || workingSaving}
            aria-describedby="video-working-description-limit"
            aria-invalid={descriptionLimit.exceedsLimit || descriptionLimit.hasUnsupportedCharacters}
            onChange={(event) => updateWorkingField("description", event.target.value)}
          />
          <div id="video-working-description-limit"><MetadataLimitNotice uiLang={uiLang} state={descriptionLimit} /></div>
        </div>
        <div className="editor-field">
          <label htmlFor="video-working-tags">{t(uiLang, "videoTags")}</label>
          <textarea
            id="video-working-tags"
            rows={4}
            value={tags}
            readOnly={!workingVideo || workingLoading || workingSaving}
            aria-describedby="video-working-tags-limit"
            aria-invalid={tagsLimit.exceedsLimit}
            onChange={(event) => updateWorkingField("tags", event.target.value)}
          />
          <div id="video-working-tags-limit"><MetadataLimitNotice uiLang={uiLang} state={tagsLimit} /></div>
        </div>
      </section>

      <div className="working-controls" aria-live="polite">
        {workingLoading ? <span>{t(uiLang, "workingLoading")}</span> : null}
        {workingStateKey ? (
          <strong className={`working-state ${workingStateKey}`}>
            {t(uiLang, workingStateLabels[workingStateKey])}
          </strong>
        ) : null}
        {selected.readOnlyPlaylistVideo ? <span>{t(uiLang, "playlistReadOnlyVideo")}</span> : null}
        {workingVideo?.remoteMissing ? <span role="alert">{t(uiLang, "workingRemoteMissing")}</span> : null}
        {workingVideo?.conflict ? (
          <div className="conflict-actions" role="alert">
            <p>{t(uiLang, "workingConflictHelp")}</p>
            <button className="btn ghost" type="button" disabled={workingLoading || workingSaving} onClick={() => resolveWorkingConflict("use_snapshot")}>
              {t(uiLang, "workingUseSnapshot")}
            </button>
            <button className="btn" type="button" disabled={workingLoading || workingSaving} onClick={() => resolveWorkingConflict("keep_local")}>
              {t(uiLang, "workingKeepLocal")}
            </button>
          </div>
        ) : null}
        {workingError ? <span role="alert">{workingError}</span> : null}
        {!workingVideo?.conflict && (Object.keys(workingEdits).length || workingVideo?.dirty) ? (
          <button
            className="btn ghost"
            type="button"
            disabled={!workingVideo || workingLoading || workingSaving}
            onClick={resetWorkingToSnapshot}
          >
            {t(uiLang, "workingUseSnapshot")}
          </button>
        ) : null}
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
          <div><dt>{t(uiLang, "videoCategory")}</dt><dd>{categoryName || (selected.category ? t(uiLang, "videoCategoryUnknown", { id: selected.category }) : "—")}</dd></div>
          <div><dt>{t(uiLang, "videoLanguage")}</dt><dd>{selected.language || "—"}</dd></div>
          <div><dt>{t(uiLang, "videoCaptions")}</dt><dd>{selected.captions == null ? "—" : selected.captions ? t(uiLang, "yes") : t(uiLang, "no")}</dd></div>
          <div><dt>{t(uiLang, "videoMadeForKids")}</dt><dd>{selected.madeForKids == null ? "—" : selected.madeForKids ? t(uiLang, "yes") : t(uiLang, "no")}</dd></div>
        </dl>
      </details>

      {workingVideo && (workingVideo.dirty || workingVideo.conflict || Object.keys(workingEdits).length) ? (
        <details className="inspector-disclosure snapshot-disclosure">
          <summary>{t(uiLang, "workingSnapshot")}</summary>
          <dl className="inspector-data">
            {Object.entries(workingVideo.snapshot || {}).map(([field, value]) => (
              <div key={field}>
                <dt>{t(uiLang, `video${field[0].toUpperCase()}${field.slice(1)}`)}</dt>
                <dd className="snapshot-value">{value == null ? "—" : value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}

      <details className="inspector-disclosure">
        <summary>{t(uiLang, "videoStatistics")}</summary>
        <dl className="inspector-data">
          <div><dt>{t(uiLang, "videoViews")}</dt><dd>{selected.views ?? "—"}</dd></div>
          <div><dt>{t(uiLang, "videoLikes")}</dt><dd>{selected.likes ?? "—"}</dd></div>
          <div><dt>{t(uiLang, "videoComments")}</dt><dd>{selected.comments ?? "—"}</dd></div>
        </dl>
      </details>

    </section>
  );
}

export function Studio({ view = "videos", onViewChange = () => {} }) {
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
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [playlistContents, setPlaylistContents] = useState({
    channelId: "",
    playlistId: "",
    items: [],
    nextPageToken: "",
    loading: false,
    error: "",
  });
  const [playlistContentsRetry, setPlaylistContentsRetry] = useState(0);
  const [playlistSelectedVideo, setPlaylistSelectedVideo] = useState(null);
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
  const currentPlaylistContents = (
    playlistContents.channelId === channelId
    && playlistContents.playlistId === selectedPlaylistId
  ) ? playlistContents : null;
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
    setPlaylistContents({
      channelId, playlistId: "", items: [], nextPageToken: "", loading: false, error: "",
    });
    setSelectedPlaylistId("");
    setPlaylistSelectedVideo(null);
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
        setSelectedId((current) => current || data.items?.[0]?.id || "");
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
    if (
      !channelId
      || !selectedId
      || (playlistSelectedVideo?.id === selectedId && playlistSelectedVideo.readOnlyPlaylistVideo)
    ) {
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
  }, [channelId, playlistSelectedVideo, selectedId, workingDetailReload]);

  useEffect(() => {
    if (!["videos", "playlists"].includes(view) || !channelId) {
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
    if (view !== "playlists") return;
    if (playlists.some((playlist) => playlist.id === selectedPlaylistId)) return;
    setSelectedPlaylistId(playlists[0]?.id || "");
  }, [playlists, selectedPlaylistId, view]);

  useEffect(() => {
    if (view !== "playlists" || !channelId || !selectedPlaylistId) {
      setPlaylistContents({
        channelId, playlistId: selectedPlaylistId, items: [], nextPageToken: "", loading: false, error: "",
      });
      return undefined;
    }
    const controller = new AbortController();
    setPlaylistContents({
      channelId, playlistId: selectedPlaylistId, items: [], nextPageToken: "", loading: true, error: "",
    });
    apiFetch(playlistItemsUrl(channelId, selectedPlaylistId), { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || t(uiLangRef.current, "playlistItemsLoadError"));
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setPlaylistContents({
            channelId,
            playlistId: selectedPlaylistId,
            items: data.items || [],
            nextPageToken: data.nextPageToken || "",
            loading: false,
            error: "",
          });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setPlaylistContents({
            channelId,
            playlistId: selectedPlaylistId,
            items: [],
            nextPageToken: "",
            loading: false,
            error: error.message || t(uiLangRef.current, "playlistItemsLoadError"),
          });
        }
      });
    return () => controller.abort();
  }, [channelId, selectedPlaylistId, playlistContentsRetry, view]);

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
    if (
      !activeVideos.some((video) => video.id === selectedId)
      && playlistSelectedVideo?.id !== selectedId
    ) {
      setSelectedId(activeVideos[0]?.id || "");
    }
  }, [calendarVideos, playlistSelectedVideo, selectedId, videos, view]);

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

  async function loadMorePlaylistItems() {
    if (!playlistContents.nextPageToken || playlistContents.loading || !channelId) return;
    const playlistId = selectedPlaylistId;
    setPlaylistContents((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await apiFetch(
        playlistItemsUrl(channelId, playlistId, playlistContents.nextPageToken),
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistItemsLoadError"));
      if (channelIdRef.current !== channelId || selectedPlaylistId !== playlistId) return;
      setPlaylistContents((current) => ({
        ...current,
        items: [...current.items, ...(data.items || [])],
        nextPageToken: data.nextPageToken || "",
        loading: false,
        error: "",
      }));
    } catch (error) {
      setPlaylistContents((current) => ({
        ...current,
        loading: false,
        error: String(error.message || error),
      }));
    }
  }

  function openPlaylistVideo(item) {
    if (item.catalogVideo) {
      setPlaylistSelectedVideo(item.catalogVideo);
      setSelectedId(item.catalogVideo.id);
    } else if (item.videoSnapshot) {
      const readOnlyVideo = {
        ...item.videoSnapshot,
        id: `playlist:${item.videoId}`,
        readOnlyPlaylistVideo: true,
      };
      setPlaylistSelectedVideo(readOnlyVideo);
      setSelectedId(readOnlyVideo.id);
    } else {
      return;
    }
    onViewChange("videos");
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
      setPlaylistSelectedVideo((current) => (
        current?.id === data.id
          ? { ...current, effectiveTitle: data.effective.title, dirty: data.dirty }
          : current
      ));
    } catch (error) {
      setWorkingSaveState("error");
      setWorkingError(String(error.message || error));
    } finally {
      setWorkingSaving(false);
    }
  }

  async function resolveWorkingConflict(resolution) {
    if (!workingVideo?.conflict || workingSaving) return;
    setWorkingSaving(true);
    setWorkingError("");
    try {
      const response = await apiFetch(catalogVideoWorkingUrl(channelId, workingVideo.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: workingVideo.revision,
          conflict_resolution: resolution,
        }),
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
      setWorkingSaveState(data.dirty ? "saved" : "");
      setVideos((current) => current.map((video) => (
        video.id === data.id ? { ...video, effectiveTitle: data.effective.title, dirty: data.dirty } : video
      )));
      setPlaylistSelectedVideo((current) => (
        current?.id === data.id
          ? { ...current, effectiveTitle: data.effective.title, dirty: data.dirty }
          : current
      ));
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
    || (view === "videos" && playlistSelectedVideo?.id === selectedId ? playlistSelectedVideo : null)
    || null;
  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) || null;
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
              {!loadingVideos && !err && videos.length === 0 ? (
                <div className="empty">
                  {catalogStatus.state === "NOT_IMPORTED"
                    ? t(uiLang, "catalogImportPrompt")
                    : query.trim() || filter !== "all"
                      ? t(uiLang, "catalogNoResults")
                      : catalogStatus.state === "EMPTY"
                        ? t(uiLang, "catalogEmptyHint")
                        : catalogStatus.state === "ERROR"
                          ? t(uiLang, "catalogError")
                          : t(uiLang, "catalogNoResults")}
                </div>
              ) : null}
              {videos.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`item ${v.id === selectedId ? "active" : ""}`}
                  onClick={() => {
                    setPlaylistSelectedVideo(null);
                    setSelectedId(v.id);
                  }}
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
            resolveWorkingConflict={resolveWorkingConflict}
          />
        </div>
        </>
      ) : null}

      {view === "playlists" ? (
        <main className="playlist-workspace">
          <aside className="playlist-pane" aria-label={t(uiLang, "playlistsTab")}>
            <header className="workspace-heading">
              <h1>{t(uiLang, "playlistsTab")}</h1>
              <span>{t(uiLang, "playlistCount", { count: playlists.length })}</span>
            </header>
            <div className="playlist-picker-list">
              {currentPlaylistState?.loading ? <p className="empty" role="status">{t(uiLang, "playlistsLoading")}</p> : null}
              {currentPlaylistState?.error ? (
                <div className="empty" role="alert">
                  <span>{currentPlaylistState.error}</span>
                  <button className="text-button" type="button" onClick={() => setPlaylistRetry((current) => current + 1)}>{t(uiLang, "playlistsRetry")}</button>
                </div>
              ) : null}
              {!currentPlaylistState?.loading && !currentPlaylistState?.error && playlists.length === 0 ? (
                <p className="empty">{t(uiLang, "emptyPlaylists")}</p>
              ) : null}
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  className={`playlist-picker-row ${playlist.id === selectedPlaylistId ? "active" : ""}`}
                  type="button"
                  aria-pressed={playlist.id === selectedPlaylistId}
                  onClick={() => setSelectedPlaylistId(playlist.id)}
                >
                  {playlist.thumb ? <img src={playlist.thumb} alt="" loading="lazy" /> : <span className="playlist-thumb-placeholder" />}
                  <span><strong>{playlist.title || t(uiLang, "untitledPlaylist")}</strong><small>{t(uiLang, "playlistVideoCountWithCount", { count: playlist.itemCount ?? "—" })}</small></span>
                </button>
              ))}
            </div>
          </aside>
          <section className="playlist-content-pane" aria-labelledby="playlist-content-title">
            <header className="workspace-heading">
              <h2 id="playlist-content-title">{selectedPlaylist?.title || t(uiLang, "selectPlaylist")}</h2>
              {selectedPlaylist ? <span>{selectedPlaylist.privacy || "—"}</span> : null}
            </header>
            {currentPlaylistContents?.loading && !currentPlaylistContents.items.length ? (
              <p className="empty" role="status">{t(uiLang, "playlistItemsLoading")}</p>
            ) : null}
            {currentPlaylistContents?.error ? (
              <p className="empty" role="alert">
                {currentPlaylistContents.error}
                <button className="text-button" type="button" onClick={() => setPlaylistContentsRetry((current) => current + 1)}>{t(uiLang, "playlistsRetry")}</button>
              </p>
            ) : null}
            {!currentPlaylistContents?.loading && !currentPlaylistContents?.error && selectedPlaylist && !currentPlaylistContents?.items.length ? (
              <p className="empty">{t(uiLang, "playlistItemsEmpty")}</p>
            ) : null}
            <ol className="playlist-video-list">
              {(currentPlaylistContents?.items || []).map((item, index) => {
                const cached = item.catalogVideo;
                const selectable = cached || item.videoSnapshot;
                const title = cached
                  ? catalogVideoDisplayTitle(cached)
                  : item.videoSnapshot?.title || item.title;
                return (
                  <li key={`${item.videoId}-${index}`}>
                    <button
                      type="button"
                      className="playlist-video-row"
                      disabled={!selectable}
                      title={!selectable ? t(uiLang, "playlistVideoNotCached") : undefined}
                      onClick={() => openPlaylistVideo(item)}
                    >
                      {item.thumb ? <img src={item.thumb} alt="" loading="lazy" /> : <span className="playlist-thumb-placeholder" />}
                      <span className="playlist-video-copy">
                        <strong>{title || t(uiLang, "untitledVideo")}</strong>
                        {!cached ? <small>{t(uiLang, selectable ? "playlistReadOnlyVideo" : "playlistVideoNotCached")}</small> : null}
                      </span>
                      {selectable ? <span className="playlist-open-video">{t(uiLang, cached ? "openVideo" : "previewReadOnlyVideo")}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ol>
            {currentPlaylistContents?.nextPageToken ? (
              <button className="btn ghost playlist-load-more" type="button" disabled={currentPlaylistContents.loading} onClick={loadMorePlaylistItems}>
                {currentPlaylistContents.loading ? t(uiLang, "playlistItemsLoading") : t(uiLang, "playlistLoadMore")}
              </button>
            ) : null}
          </section>
        </main>
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
                        onClick={() => {
                          setPlaylistSelectedVideo(null);
                          setSelectedId(video.id);
                        }}
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
            resolveWorkingConflict={resolveWorkingConflict}
          />
        </main>
      ) : null}
    </div>
  );
}
