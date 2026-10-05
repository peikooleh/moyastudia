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
      <span>{characters} / {state.limit}</span>
      {state.nearLimit ? <span>{t(uiLang, "youtubeLimitNear")}</span> : null}
      {state.exceedsLimit ? <span>{t(uiLang, "youtubeLimitExceeded")}</span> : null}
      {state.hasUnsupportedCharacters ? <span>{t(uiLang, "youtubeUnsupportedCharacters")}</span> : null}
    </div>
  );
}

function VideoInspector({
  uiLang,
  channelId,
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
  confirmResetWorkingToSnapshot,
  resolveWorkingConflict,
  publishWorkingVideo,
  writeMode,
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const [mediaBusy, setMediaBusy] = useState(false);
  const [thumbnailPreview, setThumbnailPreview] = useState("");

  async function uploadThumbnail(file) {
    if (!file) return;
    if (!writeMode?.enabled) {
      setCopyStatus(t(uiLang, "saveToYoutubeWriteModeHint"));
      return;
    }
    if (!window.confirm(t(uiLang, "thumbnailUploadConfirm", { name: file.name }))) return;
    setMediaBusy(true);
    setCopyStatus("");
    try {
      const response = await apiFetch(`/channels/${channelId}/videos/${selected.id}/thumbnail`, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail?.code || data?.detail || t(uiLang, "thumbnailUploadError"));
      setThumbnailPreview(data.thumbnail_url || URL.createObjectURL(file));
      setCopyStatus(t(uiLang, "thumbnailUploadSuccess"));
    } catch (error) {
      setCopyStatus(String(error.message || error));
    } finally {
      setMediaBusy(false);
    }
  }

  async function uploadCaptions(file) {
    if (!file) return;
    if (!writeMode?.enabled) {
      setCopyStatus(t(uiLang, "saveToYoutubeWriteModeHint"));
      return;
    }
    const captionLanguage = language || "ru";
    if (!window.confirm(t(uiLang, "captionsUploadConfirm", { name: file.name, language: captionLanguage }))) return;
    setMediaBusy(true);
    setCopyStatus("");
    try {
      const params = new URLSearchParams({ language: captionLanguage, name: file.name.slice(0, 150) });
      const response = await apiFetch(`/channels/${channelId}/videos/${selected.id}/captions?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail?.code || data?.detail || t(uiLang, "captionsUploadError"));
      setCopyStatus(t(uiLang, "captionsUploadSuccess"));
    } catch (error) {
      setCopyStatus(String(error.message || error));
    } finally {
      setMediaBusy(false);
    }
  }
  if (!selected) {
    return <section className="video-inspector empty">{t(uiLang, "catalogSelectVideo")}</section>;
  }

  const effectiveTitle = workingDraft?.title ?? catalogVideoDisplayTitle(selected);
  const displayDate = selected.slot || selected.publishedAt || "";
  const description = workingDraft?.description ?? selected.description ?? "";
  const tags = workingDraft?.tags ?? selected.tags ?? "";
  const language = workingDraft?.language ?? selected.language ?? "";
  const category = workingDraft?.category ?? selected.category ?? "";
  const madeForKids = workingDraft?.madeForKids ?? selected.madeForKids ?? null;
  const titleLimit = youtubeMetadataLimit("title", effectiveTitle);
  const descriptionLimit = youtubeMetadataLimit("description", description);
  const tagsLimit = youtubeMetadataLimit("tags", tags);

  return (
    <section className="video-inspector" aria-label={t(uiLang, "selectedVideo")}>
      <header className="video-summary">
        <div className="video-summary-thumbnail">
          {thumbnailPreview || selected.thumb ? <img src={thumbnailPreview || selected.thumb} alt={t(uiLang, "videoThumbnailAlt")} /> : <span className="item-thumb empty-thumb" />}
          <div className="thumbnail-actions">
            <button className="btn ghost thumbnail-change-action" type="button" disabled={mediaBusy} title={!writeMode?.enabled ? t(uiLang, "saveToYoutubeWriteModeHint") : t(uiLang, "thumbnailUploadHint")} onClick={() => document.getElementById(`thumbnail-file-${selected.id}`)?.click()}>{t(uiLang, "changeThumbnail")}</button><input id={`thumbnail-file-${selected.id}`} className="visually-hidden" type="file" accept="image/jpeg,image/png" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; uploadThumbnail(file); }} />
          </div>
        </div>
        <div className="video-summary-copy">
          <h2>{effectiveTitle || t(uiLang, "untitledVideo")}</h2>
          <dl className="video-summary-meta">
            <div><dt>{t(uiLang, "videoStatus")}</dt><dd className={`status-label ${selected.availability === "unavailable" || selected.remoteMissing ? "warning" : ""}`}>{statusLabel(uiLang, selected.status)}</dd></div>
            <div><dt>{t(uiLang, selected.slot ? "videoScheduledAt" : "videoPublishedAt")}</dt><dd>{displayDate ? formatStudioDate(displayDate, uiLang) : "—"}</dd></div>
            <div><dt>{t(uiLang, "videoAvailability")}</dt><dd>{t(uiLang, selected.availability === "available" ? "availabilityAvailable" : selected.availability === "unavailable" ? "availabilityUnavailable" : selected.availability === "remote_missing" ? "availabilityRemoteMissing" : "availabilityUnknown")}</dd></div>
            <div><dt>{t(uiLang, "videoDuration")}</dt><dd>{formatStudioDuration(selected.duration) || "—"}</dd></div>
            <div className="video-id-row"><dt>{t(uiLang, "videoYoutubeId")}</dt><dd><code>{selected.youtubeId || "—"}</code><button className="text-button" type="button" disabled={!selected.youtubeId} title={t(uiLang, "copyVideoIdHint")} onClick={async () => { try { await navigator.clipboard.writeText(selected.youtubeId); setCopyStatus(t(uiLang, "videoIdCopied")); } catch { setCopyStatus(t(uiLang, "videoIdCopyFailed")); } }}>{t(uiLang, "copyId")}</button>{selected.youtubeId ? <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(selected.youtubeId)}`} target="_blank" rel="noreferrer" title={t(uiLang, "openVideoHint")}>{t(uiLang, "openVideo")}</a> : null}</dd></div>
          </dl>
          {copyStatus ? <span role="status">{copyStatus}</span> : null}
          {workingVideo?.dirty ? <span className="item-change">{t(uiLang, "workingModified")}</span> : null}
        </div>
        {selected.youtubeId ? <div className="video-preview"><iframe src={`https://www.youtube.com/embed/${encodeURIComponent(selected.youtubeId)}?rel=0`} title={t(uiLang, "videoPreview")} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div> : null}
      </header>

      <section className="inspector-edit" aria-labelledby="inspector-edit-title">
        <h3 id="inspector-edit-title">{t(uiLang, workingVideo ? "localDraft" : "readOnlySnapshot")}</h3>
        <div className={`editor-field ${!workingVideo ? "snapshot-field" : ""}`}>
          <div className="editor-field-heading"><label htmlFor="video-working-title">{t(uiLang, "videoTitle")}</label><button className="ai-improve-btn" type="button" title={t(uiLang, "aiImproveComingLater")} onClick={() => setWorkingError(t(uiLang, "aiImproveComingLater"))}>{t(uiLang, "aiImprove")}</button></div>
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
          <div className="editor-field-heading"><label htmlFor="video-working-description">{t(uiLang, "videoDescription")}</label><button className="ai-improve-btn" type="button" title={t(uiLang, "aiImproveComingLater")} onClick={() => setWorkingError(t(uiLang, "aiImproveComingLater"))}>{t(uiLang, "aiImprove")}</button></div>
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
          <div className="editor-field-heading"><label htmlFor="video-working-tags">{t(uiLang, "videoTags")}</label><button className="ai-improve-btn" type="button" title={t(uiLang, "aiImproveComingLater")} onClick={() => setWorkingError(t(uiLang, "aiImproveComingLater"))}>{t(uiLang, "aiImprove")}</button></div>
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
        <label>{t(uiLang, "videoLanguage")}<select title={t(uiLang, "videoLanguageHint")} value={language} disabled={!workingVideo || workingLoading || workingSaving} onChange={(event) => updateWorkingField("language", event.target.value)}>{VIDEO_LANGUAGES.map(([code, label]) => <option key={code || "none"} value={code}>{label}{code ? ` (${code})` : ""}</option>)}</select></label>
        <label>{t(uiLang, "videoCategory")}<select title={t(uiLang, "videoCategoryHint")} value={category} disabled={!workingVideo || workingLoading || workingSaving} onChange={(event) => updateWorkingField("category", event.target.value)}><option value="">—</option>{VIDEO_CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <fieldset title={t(uiLang, "videoAudienceHint")} disabled={!workingVideo || workingLoading || workingSaving}><legend>{t(uiLang, "videoAudience")}</legend><label><input type="radio" name={`audience-${selected.id}`} checked={madeForKids === true} onChange={() => updateWorkingField("madeForKids", true)} /> {t(uiLang, "audienceKids")}</label><label><input type="radio" name={`audience-${selected.id}`} checked={madeForKids === false} onChange={() => updateWorkingField("madeForKids", false)} /> {t(uiLang, "audienceNotKids")}</label></fieldset>
        <fieldset className="captions-settings">
          <legend>{t(uiLang, "videoCaptions")}</legend>
          <div className="captions-status">
            <span>{t(uiLang, "captionsYoutubeStatus")}</span>
            <strong>{t(uiLang, selected.captions === true ? "captionsPresent" : selected.captions === false ? "captionsNotDetected" : "captionsUnknown")}</strong>
          </div>
          <button className="btn ghost captions-upload" type="button" disabled={mediaBusy} title={!writeMode?.enabled ? t(uiLang, "saveToYoutubeWriteModeHint") : t(uiLang, "captionsUploadHint")} onClick={() => document.getElementById(`captions-file-${selected.id}`)?.click()}>+ {t(uiLang, "captionsAddFile")}</button><input id={`captions-file-${selected.id}`} className="visually-hidden" type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; uploadCaptions(file); }} />
        </fieldset>
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
        {workingVideo && !workingVideo.conflict && (Object.keys(workingEdits).length || workingVideo.dirty) ? (
          <YoutubeStagedSave
            uiLang={uiLang}
            count={Math.max(1, Object.keys(workingEdits).length)}
            saving={workingSaving}
            writeMode={writeMode}
            onDiscard={confirmResetWorkingToSnapshot}
            onSave={publishWorkingVideo}
            saveHint="publishVideoHint"
            className="video-staged-save"
          />
        ) : null}
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

function YoutubeStagedSave({ uiLang, count = 1, saving = false, status = "", writeMode, onDiscard, onSave, saveHint = "calendarSaveHint", className = "" }) {
  return (
    <div className={`youtube-staged-save ${className}`.trim()} role="status">
      <span className="youtube-staged-note">{t(uiLang, "calendarStaged")}</span>
      <div className="youtube-staged-actions">
        <span>{t(uiLang, "calendarPendingChanges", { count })}</span>
        <div>
          <button className="btn ghost" type="button" disabled={saving} onClick={onDiscard}>{t(uiLang, "actionCancel")}</button>
          <span title={!writeMode?.enabled ? t(uiLang, "saveToYoutubeWriteModeHint") : t(uiLang, saveHint)}>
            <button className="btn youtube-write-action" type="button" disabled={!writeMode?.enabled || saving} onClick={onSave}>
              {saving ? t(uiLang, "workingSaving") : t(uiLang, "saveToYoutube")}
            </button>
          </span>
        </div>
      </div>
      {status ? <small className="calendar-save-status">{status}</small> : null}
    </div>
  );
}

function CalendarEventDetails({ uiLang, selected, workingVideo, draft, onStage, onDate, onTime, pendingCount, saving, saveStatus, writeMode, onDiscard, onSave }) {
  const [linkStatus, setLinkStatus] = useState("");
  if (!selected) {
    return (
      <aside className="calendar-event-details empty">
        <strong>{t(uiLang, "calendarSelectEvent")}</strong>
        <span>{t(uiLang, "calendarSelectEventHint")}</span>
        {pendingCount ? <YoutubeStagedSave uiLang={uiLang} count={pendingCount} saving={saving} status={saveStatus} writeMode={writeMode} onDiscard={onDiscard} onSave={onSave} /> : null}
      </aside>
    );
  }
  const date = selected.slot || selected.publishedAt || "";
  const displayDate = formatStudioDate(date, uiLang);
  const scheduledDate = selected.slot ? new Date(selected.slot) : null;
  const dateValue = scheduledDate && !Number.isNaN(scheduledDate.getTime()) ? localDateKey(scheduledDate) : "";
  const timeValue = scheduledDate && !Number.isNaN(scheduledDate.getTime())
    ? `${String(scheduledDate.getHours()).padStart(2, "0")}:${String(scheduledDate.getMinutes()).padStart(2, "0")}`
    : "";
  const canChooseScheduleDate = Boolean(selected.slot) || selected.privacy === "private";
  return (
    <aside className="calendar-event-details" aria-label={t(uiLang, "calendarEventDetails")}>
      {selected.thumb ? <img className="calendar-event-thumb" src={selected.thumb} alt={t(uiLang, "videoThumbnailAlt")} /> : null}
      <div className="calendar-detail-title">
        <h2>{catalogVideoDisplayTitle(selected) || t(uiLang, "untitledVideo")}</h2>
        <span className={`calendar-status-pill status-${selected.status || selected.privacy || "unknown"}`}>
          {statusLabel(uiLang, selected.status || selected.privacy)}
        </span>
      </div>
      <dl className="inspector-data">
        <div><dt>{t(uiLang, selected.slot ? "videoScheduledAt" : "videoPublishedAt")}</dt><dd>{displayDate || "—"}</dd></div>
        <div><dt>{t(uiLang, "videoVisibility")}</dt><dd>{statusLabel(uiLang, selected.privacy || selected.status)}</dd></div>
        <div><dt>{t(uiLang, "videoDuration")}</dt><dd>{formatStudioDuration(selected.duration) || "—"}</dd></div>
        <div><dt>{t(uiLang, "videoViews")}</dt><dd>{selected.views ?? "—"}</dd></div>
        <div><dt>{t(uiLang, "videoLikes")}</dt><dd>{selected.likes ?? "—"}</dd></div>
        <div><dt>{t(uiLang, "videoComments")}</dt><dd>{selected.comments ?? "—"}</dd></div>
        {selected.youtubeId ? (
          <div className="calendar-youtube-link">
            <dt>{t(uiLang, "calendarYoutubeLink")}</dt>
            <dd>
              <code>{`youtu.be/${selected.youtubeId}`}</code>
              <button className="text-button" type="button" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`https://youtu.be/${selected.youtubeId}`);
                  setLinkStatus(t(uiLang, "calendarLinkCopied"));
                } catch {
                  setLinkStatus(t(uiLang, "calendarLinkCopyFailed"));
                }
              }}>{t(uiLang, "calendarCopyLink")}</button>
              <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(selected.youtubeId)}`} target="_blank" rel="noreferrer">{t(uiLang, "openVideo")}</a>
            </dd>
          </div>
        ) : null}
      </dl>
      {linkStatus ? <span className="calendar-link-status" role="status">{linkStatus}</span> : null}
      <div className="calendar-manipulation-panel">
        <label>
          <span>{t(uiLang, "calendarDate")}</span>
          <input type="date" value={dateValue} disabled={!canChooseScheduleDate} title={!canChooseScheduleDate ? t(uiLang, "calendarPublishedDateLockedHint") : t(uiLang, "calendarDateHint")} onChange={(event) => onDate(selected, event.target.value)} />
        </label>
        <label>
          <span>{t(uiLang, "calendarTime")}</span>
          <input type="time" value={timeValue} disabled={!selected.slot} title={!selected.slot ? t(uiLang, "calendarScheduleFirstHint") : t(uiLang, "calendarTimeHint")} onChange={(event) => onTime(selected, event.target.value)} />
        </label>
        <label>
          <span>{t(uiLang, "videoVisibility")}</span>
          <select title={t(uiLang, "calendarVisibilityHint")} value={draft?.privacy || selected.privacy || "private"} onChange={(event) => onStage(selected, { privacy: event.target.value, publishAt: event.target.value === "private" ? (draft?.publishAt ?? selected.slot ?? null) : null })}>
            <option value="public">{t(uiLang, "filterPublic")}</option>
            <option value="unlisted">{t(uiLang, "filterUnlisted")}</option>
            <option value="private">{t(uiLang, "filterPrivate")}</option>
          </select>
        </label>
        {selected.slot ? (
          <button className="btn ghost" type="button" title={t(uiLang, "calendarCancelScheduleHint")} onClick={() => onStage(selected, { privacy: "private", publishAt: null })}>
            {t(uiLang, "calendarCancelSchedule")}
          </button>
        ) : selected.privacy === "public" ? (
          <button className="btn ghost" type="button" title={t(uiLang, "calendarUnpublishHint")} onClick={() => onStage(selected, { privacy: "private", publishAt: null })}>
            {t(uiLang, "calendarUnpublish")}
          </button>
        ) : null}
      </div>
      {pendingCount ? <YoutubeStagedSave uiLang={uiLang} count={pendingCount} saving={saving} status={saveStatus} writeMode={writeMode} onDiscard={onDiscard} onSave={onSave} /> : saveStatus ? <p className="calendar-save-status">{saveStatus}</p> : null}
      {workingVideo?.conflict ? <p className="calendar-conflict">{t(uiLang, "workingConflict")}</p> : null}
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
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
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
  const [playlistVideoQuery, setPlaylistVideoQuery] = useState("");
  const [playlistVideoSort, setPlaylistVideoSort] = useState("position");
  const [selectedPlaylistVideoIds, setSelectedPlaylistVideoIds] = useState(() => new Set());
  const [playlistIdCopyStatus, setPlaylistIdCopyStatus] = useState("");
  const [playlistMembershipEditor, setPlaylistMembershipEditor] = useState(null);
  const [playlistVideoPicker, setPlaylistVideoPicker] = useState(null);
  const [playlistDraft, setPlaylistDraft] = useState(null);
  const [playlistDescriptionExpanded, setPlaylistDescriptionExpanded] = useState(false);
  const [playlistMetadataEditing, setPlaylistMetadataEditing] = useState(false);
  const [playlistQuickDraft, setPlaylistQuickDraft] = useState({ playlistId: "", privacy: "", positions: {}, basePositions: {} });
  const [playlistSaving, setPlaylistSaving] = useState(false);
  const [playlistMediaBusy, setPlaylistMediaBusy] = useState(false);
  const [localPlaylistMemberships, setLocalPlaylistMemberships] = useState({});
  const [localPlaylistVideoCache, setLocalPlaylistVideoCache] = useState({});
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
  const [catalogDataVersion, setCatalogDataVersion] = useState(0);
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
  const [calendarDrafts, setCalendarDrafts] = useState({});
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [calendarSaveStatus, setCalendarSaveStatus] = useState("");
  const [calendarContext, setCalendarContext] = useState(null);
  const [calendarQueueOpen, setCalendarQueueOpen] = useState(false);
  const [calendarQueueQuery, setCalendarQueueQuery] = useState("");
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
    Promise.all([
      apiFetch(`/channels/${channelId}/playlists`, { signal: controller.signal }),
      apiFetch(`/channels/${channelId}/local-playlists`, { signal: controller.signal }),
    ])
      .then(async ([remoteResponse, localResponse]) => {
        const [remoteRows, localRows] = await Promise.all([remoteResponse.json(), localResponse.json()]);
        if (!remoteResponse.ok) {
          throw new Error((typeof remoteRows?.detail === "string" && remoteRows.detail) || t(uiLangRef.current, "playlistsLoadError"));
        }
        if (!localResponse.ok) throw new Error(localRows.detail || t(uiLangRef.current, "playlistsLoadError"));
        return { remoteRows, localRows };
      })
      .then(({ remoteRows, localRows }) => {
        if (controller.signal.aborted) return;
        const remoteItems = Array.isArray(remoteRows) ? remoteRows.map(mapPlaylistForStudio) : [];
        const localItems = Array.isArray(localRows) ? localRows.map((row) => ({
          id: row.id, title: row.title, description: "", thumb: "", publishedAt: "", privacy: "private",
          itemCount: row.videoIds?.length || 0, localOnly: true,
        })) : [];
        const memberships = {};
        localRows.forEach((row) => { memberships[row.id] = row.videoIds || []; });
        setLocalPlaylistMemberships(memberships);
        setPlaylistState({ channelId, items: [...localItems, ...remoteItems], loading: false, error: "" });
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
    const localPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId && playlist.localOnly);
    if (localPlaylist) {
      const memberIds = new Set(localPlaylistMemberships[selectedPlaylistId] || []);
      const knownVideos = new Map();
      videos.forEach((video) => {
        if (video.youtubeId) knownVideos.set(video.youtubeId, video);
      });
      Object.entries(localPlaylistVideoCache).forEach(([videoId, video]) => {
        if (!knownVideos.has(videoId)) knownVideos.set(videoId, video);
      });
      const items = [...memberIds]
        .map((videoId, index) => {
          const video = knownVideos.get(videoId);
          if (!video) return null;
          return {
            videoId,
            title: catalogVideoDisplayTitle(video),
            thumb: video.thumb || "",
            position: index,
            privacy: video.privacy || "",
            catalogVideo: video.id ? video : null,
            videoSnapshot: video.id ? null : video,
          };
        })
        .filter(Boolean);
      setPlaylistContents({
        channelId, playlistId: selectedPlaylistId, items, nextPageToken: "", loading: false, error: "",
      });
      return undefined;
    }
    const controller = new AbortController();
    setPlaylistContents({
      channelId, playlistId: selectedPlaylistId, items: [], nextPageToken: "", loading: true, error: "",
    });
    (async () => {
      try {
        const items = [];
        let pageToken = "";
        do {
          const response = await apiFetch(playlistItemsUrl(channelId, selectedPlaylistId, pageToken, 50), { signal: controller.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || t(uiLangRef.current, "playlistItemsLoadError"));
          items.push(...(data.items || []));
          pageToken = data.nextPageToken || "";
        } while (pageToken && !controller.signal.aborted);
        if (!controller.signal.aborted) {
          setPlaylistContents({
            channelId,
            playlistId: selectedPlaylistId,
            items,
            nextPageToken: "",
            loading: false,
            error: "",
          });
        }
      } catch (error) {
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
      }
    })();
    return () => controller.abort();
  }, [channelId, selectedPlaylistId, playlistContentsRetry, view, playlists, localPlaylistMemberships, localPlaylistVideoCache, videos]);

  useEffect(() => {
    setPlaylistPage(0);
    setSelectedPlaylistVideoIds(new Set());
    setPlaylistMetadataEditing(false);
    setPlaylistQuickDraft({ playlistId: selectedPlaylistId, privacy: "", positions: {}, basePositions: {} });
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
    (async () => {
      try {
        const items = [];
        let cursor = null;
        do {
          const response = await apiFetch(
            catalogVideosUrl(channelId, { cursor, dateFrom: start, dateTo: end, sort: "date", filter, query }),
            { signal: controller.signal },
          );
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || t(uiLangRef.current, "studioCalendarLoadError"));
          if (controller.signal.aborted) return;
          items.push(...(data.items || []));
          cursor = data.next_cursor || null;
        } while (cursor);
        if (controller.signal.aborted) return;
        setCalendarVideos(items);
        setCalendarCursor(null);
      } catch (error) {
        if (!controller.signal.aborted) setErr(String(error.message || error));
      } finally {
        if (!controller.signal.aborted) setLoadingCalendar(false);
      }
    })();
    return () => controller.abort();
  }, [channelId, filter, month, query, view, catalogDataVersion]);

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

  function updatePlaylistDraft(field, value) {
    if (!selectedPlaylist) return;
    setPlaylistDraft((current) => ({
      id: selectedPlaylist.id,
      title: current?.id === selectedPlaylist.id ? current.title : (selectedPlaylist.title || ""),
      description: current?.id === selectedPlaylist.id ? current.description : (selectedPlaylist.description || ""),
      privacy: current?.id === selectedPlaylist.id ? current.privacy : (selectedPlaylist.privacy || "private"),
      [field]: value,
    }));
  }

  function resetPlaylistDraft() {
    if (!selectedPlaylist) return;
    setPlaylistDraft({ id: selectedPlaylist.id, title: selectedPlaylist.title || "", description: selectedPlaylist.description || "", privacy: selectedPlaylist.privacy || "private" });
    setPlaylistMetadataEditing(false);
    setPlaylistIdCopyStatus("");
  }

  function beginPlaylistEditing() {
    if (!selectedPlaylist || selectedPlaylist.localOnly) return;
    setPlaylistDraft({ id: selectedPlaylist.id, title: selectedPlaylist.title || "", description: selectedPlaylist.description || "", privacy: selectedPlaylist.privacy || "private" });
    setPlaylistMetadataEditing(true);
    setPlaylistDescriptionExpanded(false);
    setPlaylistIdCopyStatus("");
  }

  async function savePlaylistMetadata() {
    if (!selectedPlaylist || selectedPlaylist.localOnly || !playlistMetadataDirty || playlistSaving) return;
    if (!writeMode?.enabled) {
      setPlaylistIdCopyStatus(t(uiLang, "saveToYoutubeWriteModeHint"));
      return;
    }
    if (!effectivePlaylistDraft.title.trim()) {
      setPlaylistIdCopyStatus(t(uiLang, "playlistTitleRequired"));
      return;
    }
    if (!window.confirm(t(uiLang, "playlistSaveConfirm"))) return;
    setPlaylistSaving(true);
    setPlaylistIdCopyStatus("");
    try {
      const response = await apiFetch(`/channels/${channelId}/playlists/${encodeURIComponent(selectedPlaylist.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: effectivePlaylistDraft.title.trim(), description: effectivePlaylistDraft.description, privacy: selectedPlaylist.privacy || "private" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistSaveError"));
      setPlaylistState((current) => ({ ...current, items: current.items.map((playlist) => playlist.id === selectedPlaylist.id ? { ...playlist, ...data } : playlist) }));
      setPlaylistDraft({ id: selectedPlaylist.id, title: data.title || effectivePlaylistDraft.title.trim(), description: data.description ?? effectivePlaylistDraft.description, privacy: data.privacy || selectedPlaylist.privacy || "private" });
      setPlaylistMetadataEditing(false);
      setPlaylistIdCopyStatus(t(uiLang, "playlistSavedToYoutube"));
    } catch (error) {
      setPlaylistIdCopyStatus(String(error.message || error));
    } finally {
      setPlaylistSaving(false);
    }
  }


  async function uploadPlaylistThumbnail(file) {
    if (!file || !selectedPlaylist || selectedPlaylist.localOnly || playlistMediaBusy) return;
    if (!writeMode?.enabled) {
      setPlaylistIdCopyStatus(t(uiLang, "saveToYoutubeWriteModeHint"));
      return;
    }
    if (!window.confirm(t(uiLang, "playlistThumbnailConfirm", { name: file.name }))) return;
    setPlaylistMediaBusy(true);
    setPlaylistIdCopyStatus("");
    try {
      const response = await apiFetch(`/channels/${channelId}/playlists/${encodeURIComponent(selectedPlaylist.id)}/thumbnail`, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistThumbnailError"));
      const preview = URL.createObjectURL(file);
      setPlaylistState((current) => ({ ...current, items: current.items.map((playlist) => playlist.id === selectedPlaylist.id ? { ...playlist, thumb: preview } : playlist) }));
      setPlaylistIdCopyStatus(t(uiLang, "playlistThumbnailSuccess"));
    } catch (error) {
      setPlaylistIdCopyStatus(String(error.message || error));
    } finally {
      setPlaylistMediaBusy(false);
    }
  }

  function openCurrentPlaylistVideoPicker() {
    if (!selectedPlaylist) return;
    const existing = new Set((currentPlaylistContents?.items || []).map((item) => item.videoId));
    (localPlaylistMemberships[selectedPlaylist.id] || []).forEach((videoId) => existing.add(videoId));
    setPlaylistVideoPicker({ selected: new Set(), query: "", existing, loading: false });
  }

  function togglePlaylistPickerVideo(videoId, checked) {
    setPlaylistVideoPicker((current) => {
      if (!current) return current;
      const selected = new Set(current.selected);
      if (checked) selected.add(videoId); else selected.delete(videoId);
      return { ...current, selected };
    });
  }

  async function addPickedVideosToCurrentPlaylist() {
    if (!playlistVideoPicker?.selected.size || !selectedPlaylist) return;
    const videoIds = [...playlistVideoPicker.selected];
    if (selectedPlaylist.localOnly) {
      const nextIds = [...new Set([...(localPlaylistMemberships[selectedPlaylist.id] || []), ...videoIds])];
      setPlaylistVideoPicker((current) => current ? { ...current, loading: true } : current);
      try {
        const response = await apiFetch(`/channels/${channelId}/local-playlists/${encodeURIComponent(selectedPlaylist.id)}/membership`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_ids: nextIds }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistMembershipSaveError"));
        setLocalPlaylistMemberships((current) => ({ ...current, [selectedPlaylist.id]: data.videoIds || nextIds }));
        setPlaylistVideoPicker(null);
        setPlaylistIdCopyStatus(t(uiLang, "playlistVideosAddedLocally"));
      } catch (error) {
        setPlaylistVideoPicker((current) => current ? { ...current, loading: false } : current);
        setPlaylistIdCopyStatus(String(error.message || error));
      }
      return;
    }
    if (!writeMode?.enabled) {
      setPlaylistIdCopyStatus(t(uiLang, "saveToYoutubeWriteModeHint"));
      return;
    }
    if (!window.confirm(t(uiLang, "playlistAddVideosConfirm", { count: videoIds.length }))) return;
    setPlaylistVideoPicker((current) => current ? { ...current, loading: true } : current);
    try {
      const response = await apiFetch(`/channels/${channelId}/playlists/${encodeURIComponent(selectedPlaylist.id)}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_ids: videoIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistAddVideosError"));
      setPlaylistVideoPicker(null);
      setPlaylistContentsRetry((current) => current + 1);
      setPlaylistRetry((current) => current + 1);
      setPlaylistIdCopyStatus(t(uiLang, "playlistVideosAddedYoutube", { count: videoIds.length }));
    } catch (error) {
      setPlaylistVideoPicker((current) => current ? { ...current, loading: false } : current);
      setPlaylistIdCopyStatus(String(error.message || error));
    }
  }

  function movePlaylistItem(item, direction) {
    if (!selectedPlaylist || selectedPlaylist.localOnly || playlistSaving) return;
    const items = [...(currentPlaylistContents?.items || [])].sort((x, y) => Number(x.position ?? 0) - Number(y.position ?? 0));
    const index = items.findIndex((entry) => entry.playlistItemId === item.playlistItemId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
    const other = items[targetIndex];
    const itemPosition = Number(item.position);
    const otherPosition = Number(other.position);
    setPlaylistContents((current) => ({
      ...current,
      items: current.items.map((entry) => {
        if (entry.playlistItemId === item.playlistItemId) return { ...entry, position: otherPosition };
        if (entry.playlistItemId === other.playlistItemId) return { ...entry, position: itemPosition };
        return entry;
      }),
    }));
    setPlaylistQuickDraft((current) => {
      const samePlaylist = current.playlistId === selectedPlaylist.id;
      const basePositions = samePlaylist && Object.keys(current.basePositions || {}).length
        ? current.basePositions
        : Object.fromEntries(items.map((entry) => [entry.playlistItemId, Number(entry.position)]));
      const desiredPositions = Object.fromEntries(items.map((entry) => {
        if (entry.playlistItemId === item.playlistItemId) return [entry.playlistItemId, otherPosition];
        if (entry.playlistItemId === other.playlistItemId) return [entry.playlistItemId, itemPosition];
        return [entry.playlistItemId, Number(entry.position)];
      }));
      const positions = Object.fromEntries(Object.entries(desiredPositions).filter(
        ([playlistItemId, position]) => Number(basePositions[playlistItemId]) !== Number(position)
      ));
      return { playlistId: selectedPlaylist.id, privacy: samePlaylist ? current.privacy : "", positions, basePositions };
    });
  }

  function stagePlaylistPrivacy(privacy) {
    if (!selectedPlaylist || selectedPlaylist.localOnly) return;
    setPlaylistQuickDraft((current) => ({
      playlistId: selectedPlaylist.id,
      privacy: privacy === (selectedPlaylist.privacy || "private") ? "" : privacy,
      positions: current.playlistId === selectedPlaylist.id ? current.positions : {},
      basePositions: current.playlistId === selectedPlaylist.id ? current.basePositions : {},
    }));
  }

  async function savePlaylistQuickChanges() {
    if (!selectedPlaylist || selectedPlaylist.localOnly || !playlistQuickDirty || playlistSaving) return;
    if (!writeMode?.enabled) {
      setPlaylistIdCopyStatus(t(uiLang, "saveToYoutubeWriteModeHint"));
      return;
    }
    if (!window.confirm(t(uiLang, "playlistQuickSaveConfirm"))) return;
    setPlaylistSaving(true);
    setPlaylistIdCopyStatus("");
    let completed = 0;
    try {
      const privacy = playlistQuickDraft.privacy || selectedPlaylist.privacy || "private";
      if (privacy !== (selectedPlaylist.privacy || "private")) {
        const response = await apiFetch(`/channels/${channelId}/playlists/${encodeURIComponent(selectedPlaylist.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: selectedPlaylist.title || "", description: selectedPlaylist.description || "", privacy }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistSaveError"));
        completed += 1;
        setPlaylistState((current) => ({ ...current, items: current.items.map((playlist) => playlist.id === selectedPlaylist.id ? { ...playlist, ...data } : playlist) }));
        setPlaylistQuickDraft((current) => current.playlistId === selectedPlaylist.id ? { ...current, privacy: "" } : current);
      }
      if (Object.keys(playlistQuickDraft.positions || {}).length) {
        const orderedIds = [...(currentPlaylistContents?.items || [])]
          .sort((x, y) => Number(x.position ?? 0) - Number(y.position ?? 0))
          .map((item) => item.playlistItemId)
          .filter(Boolean);
        const response = await apiFetch(`/channels/${channelId}/playlists/${encodeURIComponent(selectedPlaylist.id)}/order`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playlist_item_ids: orderedIds }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistReorderError"));
        completed += 1;
        setPlaylistQuickDraft((current) => current.playlistId === selectedPlaylist.id ? { ...current, positions: {}, basePositions: {} } : current);
      }
      setPlaylistQuickDraft({ playlistId: selectedPlaylist.id, privacy: "", positions: {}, basePositions: {} });
      setPlaylistContentsRetry((current) => current + 1);
      setPlaylistIdCopyStatus(t(uiLang, "playlistQuickSaved"));
    } catch (error) {
      setPlaylistIdCopyStatus(completed > 0
        ? t(uiLang, "playlistQuickPartialError", { error: String(error.message || error) })
        : String(error.message || error));
    } finally {
      setPlaylistSaving(false);
    }
  }

  function discardPlaylistQuickChanges() {
    if (!selectedPlaylist) return;
    setPlaylistQuickDraft({ playlistId: selectedPlaylist.id, privacy: "", positions: {}, basePositions: {} });
    setPlaylistContentsRetry((current) => current + 1);
    setPlaylistIdCopyStatus("");
  }

  async function openPlaylistMembershipEditor(mode) {
    if (!selectedPlaylistVideoIds.size) {
      setPlaylistIdCopyStatus(t(uiLang, "playlistSelectVideosFirst"));
      return;
    }
    const videoIds = [...selectedPlaylistVideoIds];
    setPlaylistMembershipEditor({ mode, targets: new Set(), loading: true });
    try {
      const params = new URLSearchParams();
      videoIds.forEach((videoId) => params.append("video_id", videoId));
      const response = await apiFetch(`/channels/${channelId}/playlist-memberships?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistMembershipLoadError"));
      const remote = data.memberships || {};
      const targets = new Set();
      playlists.forEach((playlist) => {
        const allRemote = !playlist.localOnly && videoIds.every((videoId) => (remote[videoId] || []).includes(playlist.id));
        const local = localPlaylistMemberships[playlist.id];
        const allLocal = Array.isArray(local) && videoIds.every((videoId) => local.includes(videoId));
        if (allRemote || allLocal) targets.add(playlist.id);
      });
      setPlaylistMembershipEditor({ mode, targets, loading: false });
    } catch (error) {
      setPlaylistMembershipEditor(null);
      setPlaylistIdCopyStatus(String(error.message || error));
    }
  }

  function togglePlaylistMembershipTarget(playlistId, checked) {
    setPlaylistMembershipEditor((current) => {
      if (!current) return current;
      const targets = new Set(current.targets);
      if (checked) targets.add(playlistId);
      else targets.delete(playlistId);
      return { ...current, targets };
    });
  }

  function applyLocalPlaylistMemberships() {
    if (!playlistMembershipEditor) return;
    const videoIds = [...selectedPlaylistVideoIds];
    const targets = playlistMembershipEditor.targets;
    const knownItems = currentPlaylistContents?.items || [];
    setLocalPlaylistVideoCache((current) => {
      const next = { ...current };
      knownItems.forEach((item) => {
        if (videoIds.includes(item.videoId)) {
          next[item.videoId] = item.catalogVideo || item.videoSnapshot || {
            youtubeId: item.videoId,
            title: item.title || "",
            effectiveTitle: item.title || "",
            thumb: item.thumb || "",
            privacy: item.privacy || "",
          };
        }
      });
      return next;
    });
    setLocalPlaylistMemberships((current) => {
      const next = { ...current };
      playlists.forEach((playlist) => {
        const membership = new Set(next[playlist.id] || []);
        videoIds.forEach((videoId) => {
          if (targets.has(playlist.id)) membership.add(videoId);
          else membership.delete(videoId);
        });
        next[playlist.id] = [...membership];
      });
      return next;
    });
    const localTargets = playlists.filter((playlist) => playlist.localOnly);
    localTargets.forEach((playlist) => {
      const currentMembership = new Set(localPlaylistMemberships[playlist.id] || []);
      videoIds.forEach((videoId) => {
        if (targets.has(playlist.id)) currentMembership.add(videoId);
        else currentMembership.delete(videoId);
      });
      apiFetch(`/channels/${channelId}/local-playlists/${encodeURIComponent(playlist.id)}/membership`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_ids: [...currentMembership] }),
      }).catch(() => {});
    });
    setPlaylistIdCopyStatus(t(uiLang, "playlistMembershipSavedLocally"));
    setPlaylistMembershipEditor(null);
  }

  async function removeSelectedFromCurrentPlaylist() {
    if (!selectedPlaylistVideoIds.size || !selectedPlaylist) {
      setPlaylistIdCopyStatus(t(uiLang, "playlistSelectVideosFirst"));
      return;
    }
    const removedIds = new Set(selectedPlaylistVideoIds);
    if (!selectedPlaylist.localOnly) {
      if (!writeMode?.enabled) {
        setPlaylistIdCopyStatus(t(uiLang, "saveToYoutubeWriteModeHint"));
        return;
      }
      const targets = (currentPlaylistContents?.items || []).filter((item) => removedIds.has(item.videoId) && item.playlistItemId);
      if (!targets.length) return;
      if (!window.confirm(t(uiLang, "playlistRemoveYoutubeConfirm", { count: targets.length }))) return;
      setPlaylistSaving(true);
      setPlaylistIdCopyStatus("");
      try {
        for (const item of targets) {
          const response = await apiFetch(`/channels/${channelId}/playlists/${encodeURIComponent(selectedPlaylist.id)}/items/${encodeURIComponent(item.playlistItemId)}`, { method: "DELETE" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistRemoveYoutubeError"));
        }
        setSelectedPlaylistVideoIds(new Set());
        setPlaylistContentsRetry((current) => current + 1);
        setPlaylistRetry((current) => current + 1);
        setPlaylistIdCopyStatus(t(uiLang, "playlistRemovedYoutube", { count: targets.length }));
      } catch (error) {
        setPlaylistContentsRetry((current) => current + 1);
        setPlaylistIdCopyStatus(String(error.message || error));
      } finally {
        setPlaylistSaving(false);
      }
      return;
    }
    const nextVideoIds = (localPlaylistMemberships[selectedPlaylist.id] || []).filter((videoId) => !removedIds.has(videoId));
    try {
      const response = await apiFetch(`/channels/${channelId}/local-playlists/${encodeURIComponent(selectedPlaylist.id)}/membership`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_ids: nextVideoIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistMembershipSaveError"));
      setLocalPlaylistMemberships((current) => ({ ...current, [selectedPlaylist.id]: data.videoIds || nextVideoIds }));
      setSelectedPlaylistVideoIds(new Set());
      setPlaylistIdCopyStatus(t(uiLang, "playlistRemovedLocally"));
    } catch (error) {
      setPlaylistIdCopyStatus(String(error.message || error));
    }
  }

  async function deleteLocalPlaylist() {
    if (!selectedPlaylist?.localOnly) return;
    if (!window.confirm(t(uiLang, "playlistDeleteLocalConfirm"))) return;
    setPlaylistIdCopyStatus("");
    try {
      const response = await apiFetch(`/channels/${channelId}/local-playlists/${encodeURIComponent(selectedPlaylist.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistDeleteLocalError"));
      const deletedId = selectedPlaylist.id;
      setPlaylistState((current) => ({ ...current, items: current.items.filter((playlist) => playlist.id !== deletedId) }));
      setLocalPlaylistMemberships((current) => {
        const next = { ...current };
        delete next[deletedId];
        return next;
      });
      setSelectedPlaylistId((current) => (current === deletedId ? "" : current));
      setPlaylistRetry((current) => current + 1);
      setPlaylistIdCopyStatus(t(uiLang, "playlistDeletedLocally"));
    } catch (error) {
      setPlaylistIdCopyStatus(String(error.message || error));
    }
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
      if (nextValue === workingVideo.effective[field]) delete changes[field];
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

  function confirmResetWorkingToSnapshot() {
    if (!window.confirm(t(uiLang, "discardChangesConfirm"))) return;
    resetWorkingToSnapshot();
  }


  async function publishWorkingVideo() {
    if (!workingVideo || workingSaving || !writeMode?.enabled || workingVideo.conflict) return;
    if (!workingVideo.dirty && !Object.keys(workingEdits).length) return;
    if (!window.confirm(t(uiLang, "publishMetadataConfirm"))) return;
    setWorkingSaving(true);
    setWorkingError("");
    let draft = workingVideo;
    try {
      if (Object.keys(workingEdits).length) {
        const saveResponse = await apiFetch(catalogVideoWorkingUrl(channelId, workingVideo.id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(workingVideoPatch(workingVideo.revision, workingEdits)),
        });
        const saved = await saveResponse.json();
        if (saveResponse.status === 409 && saved.detail?.current) {
          setWorkingVideo(saved.detail.current);
          setWorkingDraft(saved.detail.current.effective);
          setWorkingSaveState("conflict");
          throw new Error(t(uiLang, "workingRevisionError"));
        }
        if (!saveResponse.ok) throw new Error(saved.detail || t(uiLang, "workingSaveError"));
        draft = saved;
        setWorkingVideo(saved);
        setWorkingDraft(saved.effective);
        setWorkingEdits({});
        setWorkingSaveState(saved.conflict ? "conflict" : "saved");
        if (saved.conflict) throw new Error(t(uiLang, "workingRevisionError"));
      }

      const response = await apiFetch(catalogVideoPublishUrl(channelId, draft.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: draft.revision }),
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
      setWorkingSaveState((current) => current === "conflict" ? current : "error");
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

      if (runId === syncRunId.current && channelIdRef.current === channelId) {
        setPlaylistRetry((current) => current + 1);
        setPlaylistContentsRetry((current) => current + 1);
        setCatalogDataVersion((current) => current + 1);
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
  const effectivePlaylistDraft = playlistDraft?.id === selectedPlaylistId
    ? playlistDraft
    : selectedPlaylist
      ? { id: selectedPlaylist.id, title: selectedPlaylist.title || "", description: selectedPlaylist.description || "", privacy: selectedPlaylist.privacy || "private" }
      : null;
  const playlistEditing = Boolean(playlistMetadataEditing && selectedPlaylist && !selectedPlaylist.localOnly);
  const playlistQuickDirty = Boolean(selectedPlaylist && playlistQuickDraft.playlistId === selectedPlaylist.id && (
    (playlistQuickDraft.privacy && playlistQuickDraft.privacy !== (selectedPlaylist.privacy || "private"))
    || Object.keys(playlistQuickDraft.positions || {}).length
  ));
  const playlistMetadataDirty = Boolean(selectedPlaylist && effectivePlaylistDraft && (
    effectivePlaylistDraft.title !== (selectedPlaylist.title || "")
    || effectivePlaylistDraft.description !== (selectedPlaylist.description || "")
  ));
  const playlistItemDate = (item) => (
    item.catalogVideo?.slot
    || item.catalogVideo?.publishedAt
    || item.videoSnapshot?.slot
    || item.videoSnapshot?.publishedAt
    || ""
  );
  const filteredPlaylistItems = [...(currentPlaylistContents?.items || [])]
    .filter((item) => {
      const needle = playlistVideoQuery.trim().toLocaleLowerCase();
      const title = item.catalogVideo
        ? catalogVideoDisplayTitle(item.catalogVideo)
        : item.videoSnapshot?.title || item.title || "";
      return !needle || title.toLocaleLowerCase().includes(needle);
    })
    .sort((a, b) => {
      if (playlistVideoSort === "title") {
        const aTitle = a.catalogVideo ? catalogVideoDisplayTitle(a.catalogVideo) : a.videoSnapshot?.title || a.title || "";
        const bTitle = b.catalogVideo ? catalogVideoDisplayTitle(b.catalogVideo) : b.videoSnapshot?.title || b.title || "";
        return aTitle.localeCompare(bTitle, t(uiLang, "calendarLocale"));
      }
      if (playlistVideoSort === "date") {
        const av = Date.parse(playlistItemDate(a));
        const bv = Date.parse(playlistItemDate(b));
        if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
        if (!Number.isFinite(av)) return 1;
        if (!Number.isFinite(bv)) return -1;
        return bv - av;
      }
      return Number(a.position ?? 0) - Number(b.position ?? 0);
    });
  const visiblePlaylistItems = playlistPageItems(filteredPlaylistItems, playlistPage, playlistPageSize);
  const hasNextPlaylistPage = Boolean(currentPlaylistContents?.nextPageToken)
    || filteredPlaylistItems.length > (playlistPage + 1) * playlistPageSize;
  const effectiveCalendarVideos = calendarVideos.map((video) => {
    const draft = calendarDrafts[video.id];
    if (!draft) return video;
    return {
      ...video,
      privacy: draft.privacy,
      status: draft.publishAt ? "scheduled" : draft.privacy,
      slot: draft.publishAt || "",
      calendarStaged: true,
    };
  });
  const calendarSelected = effectiveCalendarVideos.find((video) => video.id === selectedId) || null;
  const calendarQueueVideos = effectiveCalendarVideos.filter((video) => {
    const needle = calendarQueueQuery.trim().toLocaleLowerCase();
    const unscheduledPrivate = video.privacy === "private" && !video.slot && video.availability !== "unavailable" && !video.remoteMissing;
    const matchesQuery = !needle || (catalogVideoDisplayTitle(video) || "").toLocaleLowerCase().includes(needle);
    return unscheduledPrivate && matchesQuery;
  });
  const calendarQueueCount = effectiveCalendarVideos.filter((video) => video.privacy === "private" && !video.slot && video.availability !== "unavailable" && !video.remoteMissing).length;
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
  function calendarBaseline(video) {
    return { privacy: video.privacy || "private", publishAt: video.slot || null };
  }

  function stageCalendarChange(video, changes) {
    const original = calendarVideos.find((item) => item.id === video.id) || video;
    const baseline = calendarBaseline(original);
    setCalendarDrafts((current) => {
      const previous = current[video.id] || baseline;
      const next = { ...previous, ...changes };
      const clean = next.privacy === baseline.privacy && (next.publishAt || null) === (baseline.publishAt || null);
      if (clean) {
        const copy = { ...current };
        delete copy[video.id];
        return copy;
      }
      return { ...current, [video.id]: next };
    });
    setCalendarSaveStatus("");
  }

  function stageCalendarDay(video, dayKey) {
    const source = calendarDrafts[video.id]?.publishAt || video.slot || "";
    const sourceDate = source ? new Date(source) : new Date();
    const [year, monthValue, day] = dayKey.split("-").map(Number);
    const next = new Date(year, monthValue - 1, day, sourceDate.getHours(), sourceDate.getMinutes(), 0, 0);
    if (next.getTime() <= Date.now()) {
      setCalendarSaveStatus(t(uiLang, "calendarFutureOnly"));
      return;
    }
    stageCalendarChange(video, { privacy: "private", publishAt: next.toISOString() });
  }

  function stageCalendarDate(video, dayKey) {
    if (!dayKey) return;
    stageCalendarDay(video, dayKey);
  }

  function stageCalendarTime(video, timeValue) {
    if (!timeValue) return;
    const source = calendarDrafts[video.id]?.publishAt || video.slot || video.publishedAt || new Date().toISOString();
    const date = new Date(source);
    const [hours, minutes] = timeValue.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
    if (date.getTime() <= Date.now()) {
      setCalendarSaveStatus(t(uiLang, "calendarFutureOnly"));
      return;
    }
    stageCalendarChange(video, { privacy: "private", publishAt: date.toISOString() });
  }

  function discardCalendarChanges() {
    setCalendarDrafts({});
    setCalendarSaveStatus("");
    setCalendarContext(null);
  }

  async function saveCalendarChanges() {
    const entries = Object.entries(calendarDrafts);
    if (!entries.length || calendarSaving) return;
    if (!writeMode?.enabled) {
      setCalendarSaveStatus(t(uiLang, "saveToYoutubeWriteModeHint"));
      return;
    }
    if (!window.confirm(t(uiLang, "calendarSaveConfirm", { count: entries.length }))) return;
    setCalendarSaving(true);
    setCalendarSaveStatus("");
    let completed = 0;
    try {
      for (const [videoId, draft] of entries) {
        const response = await apiFetch(`/channels/${channelId}/videos/${videoId}/calendar-status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ privacy: draft.privacy, publishAt: draft.publishAt || null }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.detail?.code || data?.detail || t(uiLang, "calendarSaveError"));
        completed += 1;
        setCalendarVideos((current) => current.map((video) => video.id === Number(videoId) ? { ...video, ...data } : video));
        setCalendarDrafts((current) => {
          const next = { ...current };
          delete next[videoId];
          return next;
        });
      }
      setCalendarSaveStatus(t(uiLang, "calendarSaved"));
    } catch (error) {
      setCalendarSaveStatus(t(uiLang, completed ? "calendarPartialSaveError" : "calendarSaveError", { error: String(error.message || error) }));
    } finally {
      setCalendarSaving(false);
    }
  }

  const cells = monthMatrix(month);
  const byDay = {};
  effectiveCalendarVideos.forEach((v) => {
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
              <div className="catalog-actions">
                <button
                  className="btn catalog-refresh-icon"
                  type="button"
                  title={t(uiLang, "tipRefreshCatalog")}
                  aria-label={t(uiLang, "catalogRefresh")}
                  disabled={syncBusy}
                  onClick={() => runCatalogSync("incremental")}
                >
                  <span aria-hidden="true">↻</span>
                </button>
                <button
                  className="catalog-reconcile-action"
                  type="button"
                  title={t(uiLang, "tipReconcileCatalog")}
                  disabled={syncBusy}
                  onClick={() => runCatalogSync("reconcile")}
                >
                  {t(uiLang, "catalogReconcile")}
                </button>
              </div>
            )
          ) : null}
          {syncBusy ? <span role="status">{t(uiLang, "catalogBusy")}</span> : null}
      </section>

      {view === "videos" ? (
        <>
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
            channelId={channelId}
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
            confirmResetWorkingToSnapshot={confirmResetWorkingToSnapshot}
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
                title={t(uiLang, "playlistSearchHint")}
              />
            </div>
            <form className="playlist-create" onSubmit={(event) => {
              event.preventDefault();
              const title = newPlaylistTitle.trim();
              if (!title) return;
              const localId = `local-${Date.now()}`;
              apiFetch(`/channels/${channelId}/local-playlists`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ local_id: localId, title }),
              }).then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || t(uiLang, "playlistCreateError"));
                setPlaylistState((current) => ({ ...current, channelId, items: [{ id: data.id, title: data.title, itemCount: 0, privacy: "private", localOnly: true }, ...current.items] }));
                setLocalPlaylistMemberships((current) => ({ ...current, [data.id]: data.videoIds || [] }));
                setSelectedPlaylistId(data.id);
                setNewPlaylistTitle("");
                setPlaylistIdCopyStatus(t(uiLang, "playlistCreatedLocally"));
              }).catch((error) => setPlaylistIdCopyStatus(String(error.message || error)));
            }}>
              <input className="search" type="text" value={newPlaylistTitle} onChange={(event) => setNewPlaylistTitle(event.target.value)} placeholder={t(uiLang, "playlistNewTitle")} aria-label={t(uiLang, "playlistNewTitle")} title={t(uiLang, "playlistCreateHint")} maxLength={150} />
              <button className="btn" type="submit" title={t(uiLang, "playlistCreateButtonHint")}>+ {t(uiLang, "playlistCreate")}</button>
            </form>
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
                  title={t(uiLang, "playlistOpenHint", { title: playlist.title || t(uiLang, "untitledPlaylist") })}
                  onClick={() => setSelectedPlaylistId(playlist.id)}
                >
                  {playlist.thumb ? <img src={playlist.thumb} alt="" loading="lazy" /> : <span className="playlist-thumb-placeholder" />}
                  <span><strong>{playlist.title || t(uiLang, "untitledPlaylist")}</strong><small>{t(uiLang, "playlistVideoCountWithCount", { count: playlist.localOnly ? (localPlaylistMemberships[playlist.id] || []).length : (playlist.itemCount ?? "—") })}</small></span>
                </button>
              ))}
            </div>
          </aside>
          <section className="playlist-content-pane" aria-labelledby="playlist-content-title">
            {selectedPlaylist ? (
              <header className="playlist-summary">
                <div className="playlist-summary-media">
                  {selectedPlaylist.thumb ? <img src={selectedPlaylist.thumb} alt={t(uiLang, "playlistThumbnailAlt")} /> : <span className="playlist-summary-placeholder"><span>{selectedPlaylist.localOnly ? t(uiLang, "playlistLocalBadge") : t(uiLang, "playlistThumbnailAlt")}</span></span>}
                  {!selectedPlaylist.localOnly ? (
                    <label className="btn ghost playlist-thumbnail-action" title={!writeMode?.enabled ? t(uiLang, "saveToYoutubeWriteModeHint") : t(uiLang, "playlistThumbnailHint")}>
                      {t(uiLang, "changeThumbnail")}
                      <input className="visually-hidden" type="file" accept="image/jpeg,image/png" disabled={playlistMediaBusy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) uploadPlaylistThumbnail(file); }} />
                    </label>
                  ) : null}
                </div>
                <div className="playlist-summary-copy">
                  {selectedPlaylist.localOnly ? <h2 id="playlist-content-title">{selectedPlaylist.title || t(uiLang, "untitledPlaylist")}</h2> : (
                    <div className={`playlist-metadata-editor ${playlistEditing ? "editing" : ""}`}>
                      {!playlistEditing ? <button className="playlist-edit-metadata" type="button" title={t(uiLang, "playlistEditMetadataHint")} aria-label={t(uiLang, "playlistEditMetadataHint")} onClick={beginPlaylistEditing}>✎</button> : null}
                      <div className="playlist-metadata-field">
                        <div className="playlist-field-heading">
                          <span>{t(uiLang, "videoTitle")}</span>
                          {playlistEditing ? <button className="ai-improve-btn" type="button" title={t(uiLang, "aiImproveComingLater")} onClick={() => setPlaylistIdCopyStatus(t(uiLang, "aiImproveComingLater"))}>{t(uiLang, "aiImprove")}</button> : null}
                        </div>
                        {playlistEditing ? (
                          <>
                            <textarea className="playlist-title-input" rows={2} value={effectivePlaylistDraft?.title || ""} maxLength={150} disabled={playlistSaving} onChange={(event) => updatePlaylistDraft("title", event.target.value)} />
                            <small>{(effectivePlaylistDraft?.title || "").length} / 150</small>
                          </>
                        ) : <div className="playlist-metadata-value playlist-title-value">{selectedPlaylist.title || t(uiLang, "untitledPlaylist")}</div>}
                      </div>
                      <div className="playlist-metadata-field">
                        <div className="playlist-field-heading">
                          <span>{t(uiLang, "videoDescription")}</span>
                          {playlistEditing ? <button className="ai-improve-btn" type="button" title={t(uiLang, "aiImproveComingLater")} onClick={() => setPlaylistIdCopyStatus(t(uiLang, "aiImproveComingLater"))}>{t(uiLang, "aiImprove")}</button> : null}
                        </div>
                        {playlistEditing ? (
                          <>
                            <textarea className="playlist-description-input" rows={7} value={effectivePlaylistDraft?.description || ""} maxLength={5000} disabled={playlistSaving} onChange={(event) => updatePlaylistDraft("description", event.target.value)} />
                            <small>{(effectivePlaylistDraft?.description || "").length} / 5000</small>
                          </>
                        ) : (
                          <>
                            <div className={`playlist-metadata-value playlist-description-value ${playlistDescriptionExpanded ? "expanded" : ""}`}>{selectedPlaylist.description || "—"}</div>
                            {selectedPlaylist.description ? <button className="playlist-description-toggle text-button" type="button" onClick={() => setPlaylistDescriptionExpanded((current) => !current)}>{t(uiLang, playlistDescriptionExpanded ? "playlistShowLess" : "playlistShowMore")}</button> : null}
                          </>
                        )}
                      </div>
                      {playlistEditing ? (
                        <div className="playlist-metadata-actions">
                          <button className="btn ghost" type="button" disabled={playlistSaving} onClick={resetPlaylistDraft}>{t(uiLang, "actionCancel")}</button>
                          <span className="youtube-write-tooltip" title={!writeMode?.enabled ? t(uiLang, "saveToYoutubeWriteModeHint") : t(uiLang, "playlistSaveHint")}>
                            <button className="btn youtube-write-action" type="button" disabled={!writeMode?.enabled || !playlistMetadataDirty || playlistSaving} onClick={savePlaylistMetadata}>{playlistSaving ? t(uiLang, "workingSaving") : t(uiLang, "saveToYoutube")}</button>
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {!selectedPlaylist.localOnly ? (
                    <aside className="playlist-settings-panel">
                      <div className="playlist-setting">
                        <span>{t(uiLang, "playlistVisibility")}</span>
                        <select
                          value={(playlistQuickDraft.playlistId === selectedPlaylist.id && playlistQuickDraft.privacy) || selectedPlaylist.privacy || "private"}
                          disabled={playlistSaving}
                          title={t(uiLang, "playlistVisibilityStageHint")}
                          onChange={(event) => stagePlaylistPrivacy(event.target.value)}
                        >
                          <option value="public">{t(uiLang, "filterPublic")}</option>
                          <option value="unlisted">{t(uiLang, "filterUnlisted")}</option>
                          <option value="private">{t(uiLang, "filterPrivate")}</option>
                        </select>
                      </div>
                      <div className="playlist-setting playlist-youtube-setting">
                        <span>YouTube</span>
                        <a href={`https://www.youtube.com/playlist?list=${encodeURIComponent(selectedPlaylist.id)}`} target="_blank" rel="noreferrer" title={t(uiLang, "openPlaylistYoutubeHint")}>{t(uiLang, "openPlaylistOnYoutube")}</a>
                      </div>
                      <div className="playlist-setting playlist-order-setting">
                        <span>{t(uiLang, "playlistCompositionOrder")}</span>
                        <strong>{t(uiLang, "playlistVideosCount", { count: selectedPlaylist.itemCount ?? currentPlaylistContents?.items?.length ?? 0 })}</strong>
                        <small>{t(uiLang, "playlistOrderHint")}</small>
                      </div>
                      {playlistQuickDirty ? (
                        <YoutubeStagedSave
                          uiLang={uiLang}
                          count={1}
                          saving={playlistSaving}
                          writeMode={writeMode}
                          onDiscard={discardPlaylistQuickChanges}
                          onSave={savePlaylistQuickChanges}
                          saveHint="playlistQuickSaveHint"
                          className="playlist-quick-save"
                        />
                      ) : null}
                    </aside>
                  ) : null}
                  <div className="playlist-summary-footer">
                    <div className="playlist-summary-meta">
                      <span>{t(uiLang, "videoVisibility")}: {selectedPlaylist.privacy ? t(uiLang, ({ public: "filterPublic", private: "filterPrivate", unlisted: "filterUnlisted" })[selectedPlaylist.privacy] || "playlistVisibilityUnknown") : "—"}</span>
                      <span>{t(uiLang, "playlistVideoCountWithCount", { count: selectedPlaylist.localOnly ? (localPlaylistMemberships[selectedPlaylist.id] || []).length : (selectedPlaylist.itemCount ?? "—") })}</span>
                      {selectedPlaylist.publishedAt ? <span>{t(uiLang, "playlistDateLabel")}: <time dateTime={selectedPlaylist.publishedAt}>{formatPlaylistDate(selectedPlaylist.publishedAt, uiLang) || "—"}</time></span> : null}
                      {selectedPlaylist.id ? <span className="playlist-id-value">{t(uiLang, "playlistIdLabel")}: <code>{selectedPlaylist.id}</code></span> : null}
                    </div>
                    {selectedPlaylist.id && selectedPlaylist.localOnly ? <div className="playlist-id-tools"><button className="text-button danger-text" type="button" onClick={deleteLocalPlaylist}>{t(uiLang, "playlistDeleteLocal")}</button></div> : null}
                  </div>
                  {playlistIdCopyStatus ? <span className="playlist-copy-status" role="status">{playlistIdCopyStatus}</span> : null}
                </div>
              </header>
            ) : <header className="workspace-heading"><h2 id="playlist-content-title">{t(uiLang, "selectPlaylist")}</h2></header>}
            {currentPlaylistContents?.loading && !currentPlaylistContents.items.length ? (
              <p className="empty" role="status">{t(uiLang, "playlistItemsLoading")}</p>
            ) : null}
            {currentPlaylistContents?.error ? (
              <p className="empty playlist-error" role="alert">
                <span>{currentPlaylistContents.error}</span>
                <button className="text-button" type="button" onClick={() => setPlaylistContentsRetry((current) => current + 1)}>{t(uiLang, "playlistsRetry")}</button>
              </p>
            ) : null}
            {!currentPlaylistContents?.loading && !currentPlaylistContents?.error && selectedPlaylist && !currentPlaylistContents?.items.length ? (
              <p className="empty">{t(uiLang, "playlistItemsEmpty")}</p>
            ) : null}
            <div className="playlist-video-tools">
              <input
                className="search"
                type="search"
                value={playlistVideoQuery}
                placeholder={t(uiLang, "playlistSearchVideos")}
                aria-label={t(uiLang, "playlistSearchVideos")}
                title={t(uiLang, "playlistSearchVideosHint")}
                onChange={(event) => { setPlaylistVideoQuery(event.target.value); setPlaylistPage(0); }}
              />
              <label title={t(uiLang, "playlistSortVideosHint")}>
                <span>{t(uiLang, "sortLabel")}</span>
                <select value={playlistVideoSort} onChange={(event) => { setPlaylistVideoSort(event.target.value); setPlaylistPage(0); }}>
                  <option value="position">{t(uiLang, "playlistSortPosition")}</option>
                  <option value="date">{t(uiLang, "sortDate")}</option>
                  <option value="title">{t(uiLang, "sortTitle")}</option>
                </select>
              </label>
            </div>
            <div className="playlist-list-controls">
              <div className="playlist-selection-controls">
                <label className="playlist-select-all" title={t(uiLang, "playlistSelectPageHint")}>
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
                  <button type="button" title={t(uiLang, "playlistAddToOtherPlaylistHint")} onClick={() => openPlaylistMembershipEditor("add")}>+ {t(uiLang, "playlistAddToOtherPlaylist")}</button>
                  <button type="button" disabled={!selectedPlaylist} title={t(uiLang, "playlistAddVideosHint")} onClick={openCurrentPlaylistVideoPicker}>+ {t(uiLang, "playlistAddVideos")}</button>
                  <button type="button" title={t(uiLang, "playlistMoveToPlaylistHint")} onClick={() => openPlaylistMembershipEditor("move")}>→ {t(uiLang, "playlistMoveToPlaylist")}</button>
                  <button type="button" disabled={!selectedPlaylistVideoIds.size || playlistSaving} title={!selectedPlaylist?.localOnly && !writeMode?.enabled ? t(uiLang, "saveToYoutubeWriteModeHint") : t(uiLang, "playlistRemoveFromPlaylistHint")} onClick={removeSelectedFromCurrentPlaylist}>− {t(uiLang, "playlistRemoveFromPlaylist")}</button>
                </div>
              </div>
              <label className="playlist-page-size" title={t(uiLang, "playlistPageSizeHint")}>
                {t(uiLang, "playlistPageSize")}
                <select value={playlistPageSize} onChange={(event) => {
                  const size = Number(event.target.value);
                  setPlaylistPageSize(size);
                  setPlaylistPage(0);
                }}>
                  {[10, 30, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              {playlistVideoPicker ? (
                <div className="playlist-video-picker" role="dialog" aria-label={t(uiLang, "playlistAddVideos")}>
                  <div className="playlist-video-picker-head">
                    <strong>{t(uiLang, "playlistChooseVideos")}</strong>
                    <input className="search" type="search" value={playlistVideoPicker.query} placeholder={t(uiLang, "searchVideos")} title={t(uiLang, "playlistVideoPickerSearchHint")} onChange={(event) => setPlaylistVideoPicker((current) => current ? { ...current, query: event.target.value } : current)} />
                  </div>
                  <div className="playlist-video-picker-list">
                    {videos.filter((video) => {
                      const needle = playlistVideoPicker.query.trim().toLocaleLowerCase();
                      return !needle || (catalogVideoDisplayTitle(video) || "").toLocaleLowerCase().includes(needle);
                    }).map((video) => {
                      const videoId = video.youtubeId;
                      const already = playlistVideoPicker.existing.has(videoId);
                      return (
                        <label key={video.id} className={already ? "already" : ""}>
                          <input type="checkbox" disabled={already || playlistVideoPicker.loading} checked={already || playlistVideoPicker.selected.has(videoId)} onChange={(event) => togglePlaylistPickerVideo(videoId, event.target.checked)} />
                          {video.thumb ? <img src={video.thumb} alt="" /> : <span className="playlist-thumb-placeholder" />}
                          <span><strong>{catalogVideoDisplayTitle(video) || t(uiLang, "untitledVideo")}</strong>{already ? <small>{t(uiLang, "playlistAlreadyAdded")}</small> : null}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="playlist-membership-actions">
                    <span>{t(uiLang, "playlistSelectedCount", { count: playlistVideoPicker.selected.size })}</span>
                    <button className="btn ghost" type="button" onClick={() => setPlaylistVideoPicker(null)}>{t(uiLang, "actionCancel")}</button>
                    <button className="btn" type="button" title={t(uiLang, "playlistAddSelectedHint")} disabled={!playlistVideoPicker.selected.size || playlistVideoPicker.loading} onClick={addPickedVideosToCurrentPlaylist}>{t(uiLang, "playlistAddSelected")}</button>
                  </div>
                </div>
              ) : null}
              {playlistMembershipEditor ? (
                <div className="playlist-membership-editor" role="dialog" aria-label={t(uiLang, "playlistMembershipTitle")}>
                  <strong>{t(uiLang, "playlistMembershipTitle")}</strong>
                  <p>{playlistMembershipEditor.loading ? t(uiLang, "playlistMembershipLoading") : t(uiLang, "playlistMembershipHelp")}</p>
                  <div className="playlist-membership-list">
                    {playlists.map((playlist) => (
                      <label key={playlist.id}>
                        <input type="checkbox" checked={playlistMembershipEditor.targets.has(playlist.id)} disabled={playlistMembershipEditor.loading} onChange={(event) => togglePlaylistMembershipTarget(playlist.id, event.target.checked)} />
                        <span>{playlist.title || t(uiLang, "untitledPlaylist")}{playlist.localOnly ? ` · ${t(uiLang, "playlistLocalBadge")}` : ""}</span>
                      </label>
                    ))}
                  </div>
                  <div className="playlist-membership-actions">
                    <button className="btn ghost" type="button" onClick={() => setPlaylistMembershipEditor(null)}>{t(uiLang, "actionCancel")}</button>
                    <button className="btn" type="button" title={t(uiLang, "playlistApplyLocallyHint")} disabled={playlistMembershipEditor.loading} onClick={applyLocalPlaylistMemberships}>{t(uiLang, "applyLocally")}</button>
                  </div>
                </div>
              ) : null}
            </div>

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
                        {playlistItemDate(item) ? <small><time dateTime={playlistItemDate(item)}>{formatPlaylistDate(playlistItemDate(item), uiLang) || "—"}</time>{cached?.slot ? ` · ${statusLabel(uiLang, "scheduled")}` : ""}</small> : <small>—</small>}
                        {!cached ? <small>{t(uiLang, selectable ? "playlistReadOnlyVideo" : "playlistVideoNotCached")}</small> : null}
                      </span>
                      {selectable ? <span className="playlist-open-video" title={t(uiLang, "playlistOpenVideoHint")}>{t(uiLang, "openInStudio")}</span> : null}
                    </button>
                    {!selectedPlaylist?.localOnly ? (
                      <span className="playlist-order-buttons" aria-label={t(uiLang, "playlistOrderControls")}>
                        <button type="button" disabled={playlistSaving || playlistVideoSort !== "position" || Number(item.position) <= 0} title={t(uiLang, playlistVideoSort === "position" ? "playlistMoveUpStageHint" : "playlistReorderPositionSortHint")} onClick={() => movePlaylistItem(item, -1)}>↑</button>
                        <button type="button" disabled={playlistSaving || playlistVideoSort !== "position" || Number(item.position) >= (currentPlaylistContents?.items?.length || 1) - 1} title={t(uiLang, playlistVideoSort === "position" ? "playlistMoveDownStageHint" : "playlistReorderPositionSortHint")} onClick={() => movePlaylistItem(item, 1)}>↓</button>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <nav className="playlist-pagination" aria-label={t(uiLang, "playlistPagination")}>
              <button className="btn ghost" type="button" disabled={playlistPage === 0 || currentPlaylistContents?.loading} title={t(uiLang, "playlistPreviousPageHint")} onClick={() => setPlaylistPage((page) => Math.max(0, page - 1))}>{t(uiLang, "playlistPreviousPage")}</button>
              <span>{t(uiLang, "playlistPageStatus", { page: playlistPage + 1, count: visiblePlaylistItems.length })}</span>
              <button className="btn ghost" type="button" disabled={!hasNextPlaylistPage || currentPlaylistContents?.loading} title={t(uiLang, "playlistNextPageHint")} onClick={() => loadPlaylistPage()}>
                {currentPlaylistContents?.loading ? t(uiLang, "playlistItemsLoading") : t(uiLang, "playlistNextPage")}
              </button>
            </nav>
          </section>
        </main>
      ) : null}

      {view === "calendar" ? (
        <main className={`calendar-workspace ${calendarQueueOpen ? "queue-open" : ""}`}>
          {calendarQueueOpen ? (
            <aside className="calendar-queue" aria-label={t(uiLang, "calendarQueue")}>
              <header>
                <div>
                  <h2>{t(uiLang, "calendarQueue")}</h2>
                  <span>{t(uiLang, "calendarQueueCount", { count: calendarQueueCount })}</span>
                </div>
                <button className="btn ghost" type="button" title={t(uiLang, "close")} aria-label={t(uiLang, "close")} onClick={() => setCalendarQueueOpen(false)}>×</button>
              </header>
              <input className="search" value={calendarQueueQuery} onChange={(event) => setCalendarQueueQuery(event.target.value)} placeholder={t(uiLang, "calendarQueueSearch")} aria-label={t(uiLang, "calendarQueueSearch")} />
              <p className="calendar-queue-help">{t(uiLang, "calendarQueueHelp")}</p>
              <div className="calendar-queue-list">
                {calendarQueueVideos.length ? calendarQueueVideos.map((video) => (
                  <button
                    key={video.id}
                    className={`calendar-queue-item ${video.id === selectedId ? "active" : ""}`}
                    type="button"
                    draggable
                    title={t(uiLang, "calendarQueueDragHint")}
                    onDragStart={(event) => event.dataTransfer.setData("text/calendar-video", String(video.id))}
                    onClick={() => {
                      setPlaylistSelectedVideo(null);
                      setSelectedId(video.id);
                      setCalendarContext(null);
                    }}
                  >
                    {video.thumb ? <img src={video.thumb} alt="" /> : <span className="calendar-queue-empty-thumb" />}
                    <span>
                      <strong>{catalogVideoDisplayTitle(video) || t(uiLang, "untitledVideo")}</strong>
                      <small>{t(uiLang, "filterPrivate")}</small>
                    </span>
                  </button>
                )) : <div className="calendar-queue-empty">{t(uiLang, calendarQueueQuery ? "calendarQueueNoResults" : "calendarQueueEmpty")}</div>}
              </div>
            </aside>
          ) : null}
          <section className="calendar-panel">
            <header className="calendar-heading">
              <h1>{t(uiLang, "calendarTab")}</h1>
              <div className="calendar-heading-actions">
                <button className={`btn ghost calendar-queue-toggle ${calendarQueueOpen ? "active" : ""}`} type="button" title={t(uiLang, "calendarQueueHint")} onClick={() => setCalendarQueueOpen((open) => !open)}>
                  {t(uiLang, "calendarQueue")} <span>{calendarQueueCount}</span>
                </button>
              </div>
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
                  <div
                    key={key}
                    className={`cal-cell ${day ? "" : "off"} ${day && localDateKey(day) === todayKey ? "today" : ""}`}
                    role="gridcell"
                    title={day && items.length ? t(uiLang, "calendarDayBrief", { count: items.length }) : undefined}
                    onDragOver={day ? (event) => event.preventDefault() : undefined}
                    onDrop={day ? (event) => {
                      event.preventDefault();
                      const videoId = Number(event.dataTransfer.getData("text/calendar-video"));
                      const video = effectiveCalendarVideos.find((item) => item.id === videoId);
                      if (video) stageCalendarDay(video, key);
                    } : undefined}
                  >
                    {day ? <b aria-current={monthHasToday && localDateKey(day) === todayKey ? "date" : undefined}>{day.getDate()}</b> : null}
                    {items.slice(0, 2).map((video) => (
                      <button
                        key={video.id}
                        type="button"
                        draggable={Boolean(video.slot)}
                        title={!video.slot ? t(uiLang, "calendarPublishedDragLockedHint") : t(uiLang, "calendarDragScheduledHint")}
                        className={`cal-event status-${video.status || video.privacy || "unknown"} ${video.calendarStaged ? "staged" : ""} ${video.id === selectedId ? "active" : ""}`}
                        onDragStart={(event) => event.dataTransfer.setData("text/calendar-video", String(video.id))}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setPlaylistSelectedVideo(null);
                          setSelectedId(video.id);
                          setCalendarContext({ videoId: video.id, x: event.clientX, y: event.clientY });
                        }}
                        onClick={() => {
                          setPlaylistSelectedVideo(null);
                          setSelectedId(video.id);
                          setCalendarContext(null);
                        }}
                      >
                        <span className="cal-event-title">{catalogVideoDisplayTitle(video) || t(uiLang, "untitledVideo")}</span>
                        <span className="calendar-hover-card" aria-hidden="true">
                          {video.thumb ? <img src={video.thumb} alt="" /> : null}
                          <strong>{catalogVideoDisplayTitle(video) || t(uiLang, "untitledVideo")}</strong>
                          <small>{formatStudioDate(video.slot || video.publishedAt || "", uiLang) || "—"}</small>
                          <small>{statusLabel(uiLang, video.status || video.privacy)}</small>
                          <small>{t(uiLang, "videoDuration")}: {formatStudioDuration(video.duration) || "—"}</small>
                          <small>{t(uiLang, "videoViews")}: {video.views ?? "—"} · {t(uiLang, "videoLikes")}: {video.likes ?? "—"} · {t(uiLang, "videoComments")}: {video.comments ?? "—"}</small>
                        </span>
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
            {calendarContext ? (() => {
              const video = effectiveCalendarVideos.find((item) => item.id === calendarContext.videoId);
              if (!video) return null;
              const date = new Date(video.slot || video.publishedAt || Date.now());
              const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
              return (
                <div className="calendar-context-menu" style={{ left: calendarContext.x, top: calendarContext.y }} role="menu">
                  {video.slot ? (
                    <label>
                      <span>{t(uiLang, "calendarChangeTime")}</span>
                      <input type="time" defaultValue={time} onChange={(event) => stageCalendarTime(video, event.target.value)} />
                    </label>
                  ) : null}
                  <button type="button" role="menuitem" onClick={() => { stageCalendarChange(video, { privacy: "public", publishAt: null }); setCalendarContext(null); }}>{t(uiLang, "filterPublic")}</button>
                  <button type="button" role="menuitem" onClick={() => { stageCalendarChange(video, { privacy: "unlisted", publishAt: null }); setCalendarContext(null); }}>{t(uiLang, "filterUnlisted")}</button>
                  <button type="button" role="menuitem" onClick={() => { stageCalendarChange(video, { privacy: "private", publishAt: null }); setCalendarContext(null); }}>
                    {video.slot ? t(uiLang, "calendarCancelSchedule") : video.privacy === "public" ? t(uiLang, "calendarUnpublish") : t(uiLang, "filterPrivate")}
                  </button>
                  <button className="calendar-context-close" type="button" onClick={() => setCalendarContext(null)}>{t(uiLang, "close")}</button>
                </div>
              );
            })() : null}
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
                      draggable={Boolean(video.slot)}
                      title={!video.slot ? t(uiLang, "calendarPublishedDragLockedHint") : t(uiLang, "calendarDragScheduledHint")}
                      aria-pressed={video.id === selectedId}
                      onDragStart={(event) => event.dataTransfer.setData("text/calendar-video", String(video.id))}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setPlaylistSelectedVideo(null);
                        setSelectedId(video.id);
                        setCalendarDetailDay("");
                        setCalendarContext({ videoId: video.id, x: event.clientX, y: event.clientY });
                      }}
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
              draft={calendarSelected ? calendarDrafts[calendarSelected.id] : null}
              onStage={stageCalendarChange}
              onDate={stageCalendarDate}
              onTime={stageCalendarTime}
              pendingCount={Object.keys(calendarDrafts).length}
              saving={calendarSaving}
              saveStatus={calendarSaveStatus}
              writeMode={writeMode}
              onDiscard={discardCalendarChanges}
              onSave={saveCalendarChanges}
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
