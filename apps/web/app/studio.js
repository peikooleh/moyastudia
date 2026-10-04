"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import {
  catalogVideosUrl,
  catalogVideoDisplayTitle,
  catalogVideoDetailUrl,
  catalogVideoWorkingUrl,
  catalogVideoPublishUrl,
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
  tryStartCatalogSync,
  workingVideoPatch,
  workingVideoStatusKey,
  youtubeVideoCategoryName,
  youtubeMetadataLimit,
  unicodeCharacterCount,
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

const VIDEO_CATEGORIES = [
  ["1", "Film & Animation"], ["2", "Autos & Vehicles"], ["10", "Music"], ["15", "Pets & Animals"],
  ["17", "Sports"], ["19", "Travel & Events"], ["20", "Gaming"], ["22", "People & Blogs"],
  ["23", "Comedy"], ["24", "Entertainment"], ["25", "News & Politics"], ["26", "Howto & Style"],
  ["27", "Education"], ["28", "Science & Technology"], ["29", "Nonprofits & Activism"],
];

const VIDEO_LANGUAGES = [
  ["", "—"], ["de", "Deutsch"], ["en", "English"], ["ru", "Русский"], ["uk", "Українська"],
  ["fr", "Français"], ["it", "Italiano"], ["es", "Español"], ["pl", "Polski"], ["pt", "Português"],
  ["tr", "Türkçe"], ["nl", "Nederlands"], ["cs", "Čeština"], ["ro", "Română"], ["ja", "日本語"],
  ["ko", "한국어"], ["zh", "中文"],
];

const WEEKDAY_KEYS = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat", "daySun"];

function formatStudioDate(value, uiLang) {
  if (!value) return "";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ");
  const locale = { en: "en-US", ru: "ru-RU", uk: "uk-UA" }[uiLang] || "en-US";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatPlaylistDate(value, uiLang) {
  if (!value) return "";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = { en: "en-US", ru: "ru-RU", uk: "uk-UA" }[uiLang] || "en-US";
  const options = dateOnly ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

function formatStudioDuration(value) {
  if (!value) return "";
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return value;
  const seconds = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

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

function MetadataLimitNotice({ uiLang, state, characters }) {
  if (!state) return null;

  return (
    <div
      className={`field-limit ${state.exceedsLimit || state.hasUnsupportedCharacters ? "exceeded" : state.nearLimit ? "near" : ""}`}
      aria-live="polite"
    >
      <span>{t(uiLang, "youtubeLimitCharacters", { count: characters })}</span>
      {state.unit === "bytes" ? <span>{t(uiLang, "youtubeDescriptionByteRule")}</span> : null}
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
  publishWorkingVideo,
  writeMode,
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const [localCategory, setLocalCategory] = useState("");
  const [localAudience, setLocalAudience] = useState("");
  const [localCaptions, setLocalCaptions] = useState(false);

  useEffect(() => {
    setLocalCategory(selected?.category || "");
    setLocalAudience(selected?.madeForKids === true ? "kids" : selected?.madeForKids === false ? "not-kids" : "");
    setLocalCaptions(selected?.captions === true);
  }, [selected?.id, selected?.category, selected?.madeForKids, selected?.captions]);
  if (!selected) {
    return <section className="video-inspector empty">{t(uiLang, "catalogSelectVideo")}</section>;
  }

  const effectiveTitle = workingDraft?.title ?? catalogVideoDisplayTitle(selected);
  const displayDate = selected.slot || selected.publishedAt || "";
  const description = workingDraft?.description ?? selected.description ?? "";
  const tags = workingDraft?.tags ?? selected.tags ?? "";
  const language = workingDraft?.language ?? selected.language ?? "";
  const titleLimit = youtubeMetadataLimit("title", effectiveTitle);
  const descriptionLimit = youtubeMetadataLimit("description", description);
  const tagsLimit = youtubeMetadataLimit("tags", tags);
  const categoryName = youtubeVideoCategoryName(selected.category);
  const categoryValue = categoryName || (selected.category ? t(uiLang, "videoCategoryUnknown", { id: selected.category }) : "—");

  return (
    <section className="video-inspector" aria-label={t(uiLang, "selectedVideo")}>
      <header className="video-summary">
        <div className="video-summary-thumbnail">
          {selected.thumb ? <img src={selected.thumb} alt={t(uiLang, "videoThumbnailAlt")} /> : <span className="item-thumb empty-thumb" />}
          <div className="thumbnail-actions">
            <button className="btn ghost" type="button" disabled title={t(uiLang, "writeModeDescription")}>{t(uiLang, "changeThumbnail")}</button>
            <button className="btn ghost" type="button" disabled title={t(uiLang, "writeModeDescription")}>{t(uiLang, "removeThumbnail")}</button>
          </div>
        </div>
        <div className="video-summary-copy">
          <h2>{effectiveTitle || t(uiLang, "untitledVideo")}</h2>
          <dl className="video-summary-meta">
            <div><dt>{t(uiLang, "videoStatus")}</dt><dd className={`status-label ${selected.availability === "unavailable" || selected.remoteMissing ? "warning" : ""}`}>{statusLabel(uiLang, selected.status)}</dd></div>
            <div><dt>{t(uiLang, selected.slot ? "videoScheduledAt" : "videoPublishedAt")}</dt><dd>{displayDate ? formatStudioDate(displayDate, uiLang) : "—"}</dd></div>
            <div><dt>{t(uiLang, "videoAvailability")}</dt><dd>{t(uiLang, selected.availability === "available" ? "availabilityAvailable" : selected.availability === "unavailable" ? "availabilityUnavailable" : selected.availability === "remote_missing" ? "availabilityRemoteMissing" : "availabilityUnknown")}</dd></div>
            <div><dt>{t(uiLang, "videoDuration")}</dt><dd>{formatStudioDuration(selected.duration) || "—"}</dd></div>
            <div className="video-id-row"><dt>{t(uiLang, "videoYoutubeId")}</dt><dd><code>{selected.youtubeId || "—"}</code><button className="text-button" type="button" disabled={!selected.youtubeId} onClick={async () => { try { await navigator.clipboard.writeText(selected.youtubeId); setCopyStatus(t(uiLang, "videoIdCopied")); } catch { setCopyStatus(t(uiLang, "videoIdCopyFailed")); } }}>{t(uiLang, "copyId")}</button>{selected.youtubeId ? <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(selected.youtubeId)}`} target="_blank" rel="noreferrer">{t(uiLang, "openVideo")}</a> : null}</dd></div>
          </dl>
          {copyStatus ? <span role="status">{copyStatus}</span> : null}
          {workingVideo?.dirty ? <span className="item-change">{t(uiLang, "workingModified")}</span> : null}
        </div>
        {selected.youtubeId ? <div className="video-preview"><iframe src={`https://www.youtube.com/embed/${encodeURIComponent(selected.youtubeId)}?rel=0`} title={t(uiLang, "videoPreview")} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div> : null}
      </header>

      <section className="inspector-edit" aria-labelledby="inspector-edit-title">
        <h3 id="inspector-edit-title">{t(uiLang, workingVideo ? "localDraft" : "readOnlySnapshot")}</h3>
        <div className={`editor-field ${!workingVideo ? "snapshot-field" : ""}`}>
          <div className="editor-field-heading"><label htmlFor="video-working-title">{t(uiLang, "videoTitle")}</label><button className="ai-improve-btn" type="button" disabled title={t(uiLang, "aiImproveComingLater")}>{t(uiLang, "aiImprove")}</button></div>
          <textarea
            id="video-working-title"
            rows={2}
            value={effectiveTitle}
            readOnly={!workingVideo || workingLoading || workingSaving}
            aria-describedby="video-working-title-limit"
            aria-invalid={titleLimit.exceedsLimit || titleLimit.hasUnsupportedCharacters}
            onChange={(event) => updateWorkingField("title", event.target.value)}
          />
          <div className="field-limit-anchor" id="video-working-title-limit"><MetadataLimitNotice uiLang={uiLang} state={titleLimit} characters={unicodeCharacterCount(effectiveTitle)} /></div>
        </div>
        <div className="description-metadata-layout">
        <div className={`editor-field description-field ${!workingVideo ? "snapshot-field" : ""}`}>
          <div className="editor-field-heading"><label htmlFor="video-working-description">{t(uiLang, "videoDescription")}</label><button className="ai-improve-btn" type="button" disabled title={t(uiLang, "aiImproveComingLater")}>{t(uiLang, "aiImprove")}</button></div>
          <textarea
            id="video-working-description"
            rows={10}
            value={description}
            readOnly={!workingVideo || workingLoading || workingSaving}
            aria-describedby="video-working-description-limit"
            aria-invalid={descriptionLimit.exceedsLimit || descriptionLimit.hasUnsupportedCharacters}
            onChange={(event) => updateWorkingField("description", event.target.value)}
          />
          <div className="field-limit-anchor" id="video-working-description-limit"><MetadataLimitNotice uiLang={uiLang} state={descriptionLimit} characters={unicodeCharacterCount(description)} /></div>
        </div>
        </div>
        <div className={`editor-field ${!workingVideo ? "snapshot-field" : ""}`}>
          <div className="editor-field-heading"><label htmlFor="video-working-tags">{t(uiLang, "videoTags")}</label><button className="ai-improve-btn" type="button" disabled title={t(uiLang, "aiImproveComingLater")}>{t(uiLang, "aiImprove")}</button></div>
          <textarea
            id="video-working-tags"
            rows={4}
            value={tags}
            readOnly={!workingVideo || workingLoading || workingSaving}
            aria-describedby="video-working-tags-limit"
            aria-invalid={tagsLimit.exceedsLimit}
            onChange={(event) => updateWorkingField("tags", event.target.value)}
          />
          <div className="field-limit-anchor" id="video-working-tags-limit"><MetadataLimitNotice uiLang={uiLang} state={tagsLimit} characters={unicodeCharacterCount(tags)} /></div>
        </div>
      </section>

      <section className="video-properties" aria-labelledby="video-properties-title">
        <h3 id="video-properties-title">{t(uiLang, "videoSettings")}</h3>
        <label>{t(uiLang, "videoCategory")}<select value={localCategory} onChange={(event) => setLocalCategory(event.target.value)}><option value="">—</option>{VIDEO_CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <fieldset><legend>{t(uiLang, "videoAudience")}</legend><label><input type="radio" name={`audience-${selected.id}`} checked={localAudience === "kids"} onChange={() => setLocalAudience("kids")} /> {t(uiLang, "audienceKids")}</label><label><input type="radio" name={`audience-${selected.id}`} checked={localAudience === "not-kids"} onChange={() => setLocalAudience("not-kids")} /> {t(uiLang, "audienceNotKids")}</label></fieldset>
        <label>{t(uiLang, "videoLanguage")}<select value={language} disabled={!workingVideo || workingLoading || workingSaving} onChange={(event) => updateWorkingField("language", event.target.value)}>{VIDEO_LANGUAGES.map(([code, label]) => <option key={code || "none"} value={code}>{label}{code ? ` (${code})` : ""}</option>)}</select></label>
        <fieldset><legend>{t(uiLang, "videoCaptions")}</legend><label><input type="checkbox" checked={localCaptions} onChange={(event) => setLocalCaptions(event.target.checked)} /> {t(uiLang, localCaptions ? "yes" : "no")}</label></fieldset>
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
          className="btn ghost"
          type="button"
          disabled={!workingVideo || workingLoading || workingSaving || !Object.keys(workingEdits).length}
          onClick={saveWorkingVideo}
        >
          {workingSaving ? t(uiLang, "workingSaving") : t(uiLang, "saveLocally")}
        </button>
        <button className="btn youtube-write-action" type="button" disabled={!writeMode?.enabled || !workingVideo?.dirty || workingVideo?.conflict || workingSaving || Object.keys(workingEdits).length > 0} title={!writeMode?.enabled ? t(uiLang, "writeModeDescription") : Object.keys(workingEdits).length ? t(uiLang, "saveLocalBeforeYoutube") : ""} onClick={publishWorkingVideo}>{t(uiLang, "saveToYoutube")}</button>
      </div>

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
    </section>
  );
}

function CalendarEventDetails({ uiLang, selected, workingVideo }) {
  if (!selected) {
    return <aside className="calendar-event-details empty">{t(uiLang, "calendarSelectEvent")}</aside>;
  }
  const date = selected.slot || selected.publishedAt || "";
  const displayDate = formatStudioDate(date, uiLang);
  return (
    <aside className="calendar-event-details" aria-label={t(uiLang, "calendarEventDetails")}>
      {selected.thumb ? <img className="calendar-event-thumb" src={selected.thumb} alt={t(uiLang, "videoThumbnailAlt")} /> : null}
      <h2>{catalogVideoDisplayTitle(selected) || t(uiLang, "untitledVideo")}</h2>
      <dl className="inspector-data">
        <div><dt>{t(uiLang, selected.slot ? "videoScheduledAt" : "videoPublishedAt")}</dt><dd>{displayDate || "—"}</dd></div>
        <div><dt>{t(uiLang, "videoVisibility")}</dt><dd>{statusLabel(uiLang, selected.privacy || selected.status)}</dd></div>
        <div><dt>{t(uiLang, "videoAvailability")}</dt><dd>{t(uiLang, selected.availability === "available" ? "availabilityAvailable" : selected.availability === "unavailable" ? "availabilityUnavailable" : selected.availability === "remote_missing" ? "availabilityRemoteMissing" : "availabilityUnknown")}</dd></div>
        <div><dt>{t(uiLang, "videoDuration")}</dt><dd>{formatStudioDuration(selected.duration) || "—"}</dd></div>
        <div><dt>{t(uiLang, "videoViews")}</dt><dd>{selected.views ?? "—"}</dd></div>
        <div><dt>{t(uiLang, "videoLikes")}</dt><dd>{selected.likes ?? "—"}</dd></div>
        <div><dt>{t(uiLang, "videoComments")}</dt><dd>{selected.comments ?? "—"}</dd></div>
      </dl>
      {workingVideo?.dirty ? <p className="item-change">{t(uiLang, "workingModified")}</p> : null}
      {workingVideo?.conflict ? <p className="calendar-conflict">{t(uiLang, "workingConflict")}</p> : null}
      <p className="readonly-note">{t(uiLang, "readOnlySnapshot")}</p>
    </aside>
  );
}

export function Studio({ view = "videos", onViewChange = () => {}, writeMode = { enabled: false } }) {
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
  const [playlistQuery, setPlaylistQuery] = useState("");
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
  const [playlistPageSize, setPlaylistPageSize] = useState(10);
  const [playlistPage, setPlaylistPage] = useState(0);
  const [selectedPlaylistVideoIds, setSelectedPlaylistVideoIds] = useState(() => new Set());
  const [playlistIdCopyStatus, setPlaylistIdCopyStatus] = useState("");
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
  const [calendarDetailDay, setCalendarDetailDay] = useState("");
  const [statisticsQuery, setStatisticsQuery] = useState("");
  const [statisticsStatus, setStatisticsStatus] = useState("all");
  const [statisticsSort, setStatisticsSort] = useState("views");
  const [channelAnalytics, setChannelAnalytics] = useState(null);
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
  const visiblePlaylists = playlists.filter((playlist) => {
    const needle = playlistQuery.trim().toLocaleLowerCase();
    return !needle || (playlist.title || "").toLocaleLowerCase().includes(needle);
  });
  const currentPlaylistState = playlistState.channelId === channelId ? playlistState : null;
  const currentPlaylistContents = (
    playlistContents.channelId === channelId
    && playlistContents.playlistId === selectedPlaylistId
  ) ? playlistContents : null;
  useEffect(() => {
    if (!channelId) {
      setChannelAnalytics(null);
      return undefined;
    }
    const controller = new AbortController();
    apiFetch(`/channels/${channelId}/analytics/summary`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("analytics unavailable");
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setChannelAnalytics(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setChannelAnalytics(null);
      });
    return () => controller.abort();
  }, [channelId]);

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
    setSelectedPlaylistVideoIds(new Set());
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
    apiFetch(playlistItemsUrl(channelId, selectedPlaylistId, "", 50), { signal: controller.signal })
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
    setPlaylistPage(0);
    setSelectedPlaylistVideoIds(new Set());
    setPlaylistIdCopyStatus("");
  }, [selectedPlaylistId]);

  useEffect(() => {
    if (view !== "calendar" || !channelId) return undefined;
    const controller = new AbortController();
    const start = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    setCalendarVideos([]);
    setCalendarCursor(null);
    setSelectedId("");
    setCalendarDetailDay("");
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

  const loadPlaylistPage = useCallback(async (targetPage = playlistPage + 1, targetSize = playlistPageSize) => {
    if (playlistContents.loading || !channelId) return;
    const playlistId = selectedPlaylistId;
    setPlaylistContents((current) => ({ ...current, loading: true, error: "" }));
    try {
      let items = playlistContents.items;
      let pageToken = playlistContents.nextPageToken;
      const requiredCount = (targetPage + 1) * targetSize;
      while (items.length < requiredCount && pageToken) {
        const response = await apiFetch(playlistItemsUrl(channelId, playlistId, pageToken, 50));
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistItemsLoadError"));
        if (view !== "playlists" || channelIdRef.current !== channelId || selectedPlaylistId !== playlistId) return;
        items = [...items, ...(data.items || [])];
        pageToken = data.nextPageToken || "";
        setPlaylistContents((current) => ({ ...current, items, nextPageToken: pageToken }));
      }
      setPlaylistPage(targetPage);
      setPlaylistContents((current) => ({ ...current, loading: false, error: "" }));
    } catch (error) {
      if (view === "playlists" && channelIdRef.current === channelId && selectedPlaylistId === playlistId) {
        setPlaylistContents((current) => ({
          ...current,
          loading: false,
          error: String(error.message || error),
        }));
      }
    }
  }, [channelId, playlistContents, playlistPage, playlistPageSize, selectedPlaylistId, uiLang, view]);

  useEffect(() => {
    if (
      view === "playlists"
      && playlistContents.channelId === channelId
      && playlistContents.playlistId === selectedPlaylistId
      && !playlistContents.loading
      && !playlistContents.error
      && playlistContents.nextPageToken
      && playlistContents.items.length < (playlistPage + 1) * playlistPageSize
    ) {
      loadPlaylistPage(playlistPage, playlistPageSize);
    }
  }, [channelId, loadPlaylistPage, playlistContents, playlistPage, playlistPageSize, selectedPlaylistId, view]);

  function togglePlaylistVideo(videoId, checked) {
    setSelectedPlaylistVideoIds((current) => {
      const next = new Set(current);
      if (checked) next.add(videoId);
      else next.delete(videoId);
      return next;
    });
  }

  async function copyPlaylistId() {
    if (!selectedPlaylist?.id) return;
    try {
      await navigator.clipboard.writeText(selectedPlaylist.id);
      setPlaylistIdCopyStatus(t(uiLang, "playlistIdCopied"));
    } catch {
      setPlaylistIdCopyStatus(t(uiLang, "playlistIdCopyFailed"));
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

  async function publishWorkingVideo() {
    if (!workingVideo || workingSaving || !writeMode?.enabled || workingVideo.conflict || Object.keys(workingEdits).length) return;
    if (!window.confirm(t(uiLang, "publishMetadataConfirm"))) return;
    setWorkingSaving(true);
    setWorkingError("");
    try {
      const response = await apiFetch(catalogVideoPublishUrl(channelId, workingVideo.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: workingVideo.revision }),
      });
      const data = await response.json();
      if (response.status === 409 && data.detail?.current) {
        setWorkingVideo(data.detail.current);
        setWorkingDraft(data.detail.current.effective);
        setWorkingSaveState("conflict");
        throw new Error(t(uiLang, "workingRevisionError"));
      }
      if (!response.ok) {
        const code = data.detail?.code;
        if (code === "youtube_reauthorization_required") throw new Error(t(uiLang, "youtubeReauthorizationRequired"));
        if (code === "quota_preflight_failed") throw new Error(t(uiLang, "youtubeQuotaInsufficient"));
        throw new Error(t(uiLang, "youtubePublishError"));
      }
      setWorkingVideo(data);
      setWorkingDraft(data.effective);
      setWorkingEdits({});
      setWorkingSaveState("");
      setWorkingDetailReload((current) => current + 1);
      setCatalogReload((current) => current + 1);
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
  const visiblePlaylistItems = playlistPageItems(currentPlaylistContents?.items, playlistPage, playlistPageSize);
  const hasNextPlaylistPage = Boolean(currentPlaylistContents?.nextPageToken)
    || (currentPlaylistContents?.items?.length || 0) > (playlistPage + 1) * playlistPageSize;
  const calendarSelected = calendarVideos.find((video) => video.id === selectedId) || null;
  const statistics = cachedVideoMetricSummary(videos);
  const statisticsRows = [...videos]
    .filter((video) => {
      const needle = statisticsQuery.trim().toLocaleLowerCase();
      const matchesQuery = !needle || (catalogVideoDisplayTitle(video) || "").toLocaleLowerCase().includes(needle);
      const effectiveStatus = video.remoteMissing
        ? "remote_missing"
        : video.availability === "unavailable"
          ? "unavailable"
          : video.status;
      return matchesQuery && (statisticsStatus === "all" || effectiveStatus === statisticsStatus);
    })
    .sort((a, b) => {
      if (statisticsSort === "title") return (catalogVideoDisplayTitle(a) || "").localeCompare(catalogVideoDisplayTitle(b) || "", t(uiLang, "calendarLocale"));
      if (statisticsSort === "publishedAt") {
        const av = Date.parse(a.publishedAt || a.slot || "");
        const bv = Date.parse(b.publishedAt || b.slot || "");
        if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
        if (!Number.isFinite(av)) return 1;
        if (!Number.isFinite(bv)) return -1;
        return bv - av;
      }
      const metric = statisticsSort === "likes" ? "likes" : statisticsSort === "comments" ? "comments" : "views";
      const av = Number(a[metric]);
      const bv = Number(b[metric]);
      if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
      if (!Number.isFinite(av)) return 1;
      if (!Number.isFinite(bv)) return -1;
      return bv - av;
    });
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
  const calendarDayItems = byDay[calendarDetailDay] || [];
  const todayKey = localDateKey(new Date());
  const monthHasToday = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

  function showCalendarToday() {
    const today = new Date();
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setCalendarDetailDay(localDateKey(today));
  }
  return (
    <div className="studio-wrap">
      {view === "videos" ? (
        <header className="workspace-heading compact-workspace-heading">
          <h1>{t(uiLang, "videos")}</h1>
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
              <span className="catalog-progress">{Math.min(catalogStatus.scanned_count || catalogStatus.video_count, catalogStatus.video_count)}/{catalogStatus.video_count}</span>
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
                  className="btn"
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
                      <time dateTime={v.slot || v.publishedAt || undefined}>{formatStudioDate(v.slot || v.publishedAt || "", uiLang)}</time>
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
            publishWorkingVideo={publishWorkingVideo}
            writeMode={writeMode}
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
            <div className="playlist-picker-search">
              <input
                className="search"
                type="search"
                value={playlistQuery}
                onChange={(event) => setPlaylistQuery(event.target.value)}
                placeholder={t(uiLang, "playlistSearch")}
                aria-label={t(uiLang, "playlistSearch")}
              />
            </div>
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
              {!currentPlaylistState?.loading && !currentPlaylistState?.error && playlists.length > 0 && visiblePlaylists.length === 0 ? <p className="empty">{t(uiLang, "playlistSearchEmpty")}</p> : null}
              {visiblePlaylists.map((playlist) => (
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
            {selectedPlaylist ? (
              <header className="playlist-summary">
                {selectedPlaylist.thumb ? <img src={selectedPlaylist.thumb} alt={t(uiLang, "playlistThumbnailAlt")} /> : <span className="playlist-summary-placeholder" />}
                <div className="playlist-summary-copy">
                  <h2 id="playlist-content-title">{selectedPlaylist.title || t(uiLang, "untitledPlaylist")}</h2>
                  {selectedPlaylist.description ? <p>{selectedPlaylist.description}</p> : null}
                  <div className="playlist-summary-footer">
                    <div className="playlist-summary-meta">
                      <span>{t(uiLang, "videoVisibility")}: {selectedPlaylist.privacy ? t(uiLang, ({ public: "filterPublic", private: "filterPrivate", unlisted: "filterUnlisted" })[selectedPlaylist.privacy] || "playlistVisibilityUnknown") : "—"}</span>
                      <span>{t(uiLang, "playlistVideoCountWithCount", { count: selectedPlaylist.itemCount ?? "—" })}</span>
                      {selectedPlaylist.publishedAt ? <span>{t(uiLang, "playlistDateLabel")}: <time dateTime={selectedPlaylist.publishedAt}>{formatPlaylistDate(selectedPlaylist.publishedAt, uiLang) || "—"}</time></span> : null}
                      {selectedPlaylist.id ? <span className="playlist-id-value">{t(uiLang, "playlistIdLabel")}: <code>{selectedPlaylist.id}</code></span> : null}
                    </div>
                    {selectedPlaylist.id ? <div className="playlist-id-tools"><button className="text-button" type="button" onClick={copyPlaylistId}>{t(uiLang, "copyId")}</button><a href={`https://www.youtube.com/playlist?list=${encodeURIComponent(selectedPlaylist.id)}`} target="_blank" rel="noreferrer">{t(uiLang, "openPlaylistOnYoutube")}</a></div> : null}
                  </div>
                  {playlistIdCopyStatus ? <span className="playlist-copy-status" role="status">{playlistIdCopyStatus}</span> : null}
                </div>
              </header>
            ) : <header className="workspace-heading"><h2 id="playlist-content-title">{t(uiLang, "selectPlaylist")}</h2></header>}
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
            <div className="playlist-list-controls">
              <div className="playlist-selection-controls">
                <label className="playlist-select-all">
                  <input
                    type="checkbox"
                    checked={visiblePlaylistItems.length > 0 && visiblePlaylistItems.every((item) => selectedPlaylistVideoIds.has(item.videoId))}
                    onChange={(event) => setSelectedPlaylistVideoIds(playlistPageSelection(selectedPlaylistVideoIds, visiblePlaylistItems, event.target.checked))}
                    aria-label={t(uiLang, "playlistSelectPage")}
                  />
                  {t(uiLang, "playlistSelectPage")}
                </label>
                <span className="playlist-selected-count">{t(uiLang, "playlistSelectedCount", { count: selectedPlaylistVideoIds.size })}</span>
                <div className="playlist-bulk-actions" aria-label={t(uiLang, "playlistBulkActions")}>
                  <button type="button" disabled title={t(uiLang, "playlistAddToPlaylist")}>+ {t(uiLang, "playlistAddToPlaylist")}</button>
                  <button type="button" disabled title={t(uiLang, "playlistMoveToPlaylist")}>→ {t(uiLang, "playlistMoveToPlaylist")}</button>
                  <button type="button" disabled title={t(uiLang, "playlistRemoveFromPlaylist")}>− {t(uiLang, "playlistRemoveFromPlaylist")}</button>
                </div>
              </div>
              <label className="playlist-page-size">
                {t(uiLang, "playlistPageSize")}
                <select value={playlistPageSize} onChange={(event) => {
                  const size = Number(event.target.value);
                  setPlaylistPageSize(size);
                  setPlaylistPage(0);
                }}>
                  {[10, 30, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            </div>
            <p className="playlist-bulk-help" id="playlist-bulk-help">
              {t(uiLang, "playlistWritesWithWriteMode")} {t(uiLang, "playlistBulkHelp")}
            </p>
            <ol className="playlist-video-list">
              {visiblePlaylistItems.map((item, index) => {
                const cached = item.catalogVideo;
                const selectable = cached || item.videoSnapshot;
                const title = cached
                  ? catalogVideoDisplayTitle(cached)
                  : item.videoSnapshot?.title || item.title;
                return (
                  <li key={`${item.videoId}-${index}`} className={selectedPlaylistVideoIds.has(item.videoId) ? "selected" : ""}>
                    <input
                      className="playlist-row-checkbox"
                      type="checkbox"
                      checked={selectedPlaylistVideoIds.has(item.videoId)}
                      onChange={(event) => togglePlaylistVideo(item.videoId, event.target.checked)}
                      aria-label={t(uiLang, "playlistSelectVideo", { title: title || t(uiLang, "untitledVideo") })}
                    />
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
                        {(cached?.publishedAt || item.videoSnapshot?.publishedAt) ? <small><time dateTime={cached?.publishedAt || item.videoSnapshot?.publishedAt}>{formatPlaylistDate(cached?.publishedAt || item.videoSnapshot?.publishedAt, uiLang) || "—"}</time></small> : <small>—</small>}
                        {!cached ? <small>{t(uiLang, selectable ? "playlistReadOnlyVideo" : "playlistVideoNotCached")}</small> : null}
                      </span>
                      {selectable ? <span className="playlist-open-video">{t(uiLang, "openInStudio")}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ol>
            <nav className="playlist-pagination" aria-label={t(uiLang, "playlistPagination")}>
              <button className="btn ghost" type="button" disabled={playlistPage === 0 || currentPlaylistContents?.loading} onClick={() => setPlaylistPage((page) => Math.max(0, page - 1))}>{t(uiLang, "playlistPreviousPage")}</button>
              <span>{t(uiLang, "playlistPageStatus", { page: playlistPage + 1, count: visiblePlaylistItems.length })}</span>
              <button className="btn ghost" type="button" disabled={!hasNextPlaylistPage || currentPlaylistContents?.loading} onClick={() => loadPlaylistPage()}>
                {currentPlaylistContents?.loading ? t(uiLang, "playlistItemsLoading") : t(uiLang, "playlistNextPage")}
              </button>
            </nav>
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
                <button type="button" className="btn ghost calendar-today" onClick={showCalendarToday}>{t(uiLang, "calendarToday")}</button>
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
                  <div key={key} className={`cal-cell ${day ? "" : "off"} ${day && localDateKey(day) === todayKey ? "today" : ""}`} role="gridcell">
                    {day ? <b aria-current={monthHasToday && localDateKey(day) === todayKey ? "date" : undefined}>{day.getDate()}</b> : null}
                    {items.slice(0, 2).map((video) => (
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
                    {items.length > 2 ? (
                      <button className="calendar-more-events" type="button" onClick={() => setCalendarDetailDay((current) => current === key ? "" : key)}>
                        {t(uiLang, "calendarShowMore", { count: items.length - 2 })}
                      </button>
                    ) : null}
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
          {calendarDetailDay ? (
            <aside className="calendar-event-details calendar-day-drawer" aria-labelledby="calendar-day-title">
              <header>
                <h2 id="calendar-day-title">{t(uiLang, "calendarDayVideos", { date: calendarDetailDay })}</h2>
                <button className="text-button" type="button" onClick={() => setCalendarDetailDay("")}>{t(uiLang, "close")}</button>
              </header>
              <ul>
                {calendarDayItems.map((video) => (
                  <li key={video.id}>
                    <button
                      className={video.id === selectedId ? "active" : ""}
                      type="button"
                      aria-pressed={video.id === selectedId}
                      onClick={() => {
                        setPlaylistSelectedVideo(null);
                        setSelectedId(video.id);
                        setCalendarDetailDay("");
                      }}
                    >
                      {video.thumb ? <img className="calendar-day-thumb" src={video.thumb} alt="" loading="lazy" /> : <span className="calendar-day-thumb empty-thumb" />}
                      <span className="calendar-day-copy">
                        <strong>{catalogVideoDisplayTitle(video) || t(uiLang, "untitledVideo")}</strong>
                        <small>{formatStudioDate(video.slot || video.publishedAt || "", uiLang) || "—"}</small>
                        <small>{t(uiLang, "videoViews")}: {video.views ?? "—"} · {t(uiLang, "videoLikes")}: {video.likes ?? "—"} · {t(uiLang, "videoComments")}: {video.comments ?? "—"}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          ) : (
            <CalendarEventDetails
              uiLang={uiLang}
              selected={calendarSelected}
              workingVideo={workingVideo?.id === calendarSelected?.id ? workingVideo : null}
            />
          )}
        </main>
      ) : null}

      {view === "statistics" ? (
        <main className="statistics-workspace">
          <header className="workspace-heading">
            <h1>{t(uiLang, "statisticsTab")}</h1>
            <span>{t(uiLang, "statisticsLoadedVideos", { loaded: statistics.loadedVideoCount, total: catalogTotal })}</span>
          </header>
          <div className="statistics-cards">
            {[["videoViews", statistics.views, statistics.viewsCount], ["videoLikes", statistics.likes, statistics.likesCount], ["videoComments", statistics.comments, statistics.commentsCount], ["statisticsWatchTime", channelAnalytics ? t(uiLang, "statisticsWatchTimeValue", { count: Math.round(channelAnalytics.estimated_minutes_watched / 60) }) : "—", null]].map(([key, value, count]) => (
              <article key={key}>
                <h2>{t(uiLang, key)}</h2>
                <strong>{value == null ? "—" : value.toLocaleString(t(uiLang, "calendarLocale"))}</strong>
                {count != null ? <small>{t(uiLang, "statisticsMetricCount", { count })}</small> : null}
              </article>
            ))}
          </div>
          <div className="statistics-toolbar">
            <input className="search" type="search" value={statisticsQuery} onChange={(event) => setStatisticsQuery(event.target.value)} placeholder={t(uiLang, "statisticsSearch")} aria-label={t(uiLang, "statisticsSearch")} />
            <label><span>{t(uiLang, "statisticsStatus")}</span><select value={statisticsStatus} onChange={(event) => setStatisticsStatus(event.target.value)}>{FILTERS.map((item) => <option key={item.id} value={item.id}>{t(uiLang, item.key)}</option>)}</select></label>
            <label><span>{t(uiLang, "statisticsSortBy")}</span><select value={statisticsSort} onChange={(event) => setStatisticsSort(event.target.value)}><option value="views">{t(uiLang, "videoViews")}</option><option value="likes">{t(uiLang, "videoLikes")}</option><option value="comments">{t(uiLang, "videoComments")}</option><option value="publishedAt">{t(uiLang, "videoPublishedAt")}</option><option value="title">{t(uiLang, "videoTitle")}</option></select></label>
          </div>
          {err ? <p className="calendar-error" role="alert">{err}</p> : null}
          {!loadingVideos && videos.length === 0 ? <p className="empty">{t(uiLang, catalogStatus.state === "NOT_IMPORTED" ? "statisticsCatalogNotImported" : "statisticsEmpty")}</p> : null}
          <div className="statistics-table-wrap">
            <table className="statistics-table">
              <thead><tr><th>{t(uiLang, "videoTitle")}</th><th>{t(uiLang, "videoViews")}</th><th>{t(uiLang, "videoLikes")}</th><th>{t(uiLang, "videoComments")}</th></tr></thead>
              <tbody>
                {statisticsRows.map((video) => (
                  <tr key={video.id}>
                    <th scope="row">
                      <button type="button" className="statistics-video-link" onClick={() => { setSelectedId(video.id); onViewChange("videos"); }}>
                        {video.thumb ? <img className="statistics-video-thumb" src={video.thumb} alt="" loading="lazy" /> : <span className="statistics-video-thumb empty-thumb" />}
                        <span>{catalogVideoDisplayTitle(video) || t(uiLang, "untitledVideo")}</span>
                      </button>
                    </th>
                    <td>{video.views ?? "—"}</td><td>{video.likes ?? "—"}</td><td>{video.comments ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loadingVideos && videos.length > 0 && statisticsRows.length === 0 ? <p className="empty statistics-empty">{t(uiLang, "statisticsNoResults")}</p> : null}
          {nextCursor ? <button className="btn ghost statistics-load-more" type="button" disabled={loadingMore} onClick={loadMoreCatalog}>{loadingMore ? t(uiLang, "catalogLoadingMore") : t(uiLang, "catalogLoadMore", { count: Math.max(catalogTotal - videos.length, 0) })}</button> : null}
        </main>
      ) : null}
    </div>
  );
}
