"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { t } from "../lib/i18n";

const PERIODS = ["7", "28", "90", "365", "lifetime"];

function formatNumber(value, locale) {
  return Number(value || 0).toLocaleString(locale);
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes ? `${minutes}:${String(rest).padStart(2, "0")}` : `${rest} sec`;
}

export function StatisticsDashboard({
  uiLang,
  selectedChannelId,
  onChannelChange,
  videos,
  playlists,
  statusCounts,
  catalogTotal,
}) {
  const [channels, setChannels] = useState([]);
  const [channelMenuOpen, setChannelMenuOpen] = useState(false);
  const [scope, setScope] = useState("channel");
  const [videoId, setVideoId] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [period, setPeriod] = useState("28");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const requestId = useRef(0);
  const locale = t(uiLang, "calendarLocale");

  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/channels", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("channels unavailable");
        return response.json();
      })
      .then((rows) => setChannels(rows || []))
      .catch((error) => {
        if (error.name !== "AbortError") setChannels([]);
      });
    return () => controller.abort();
  }, []);

  const remotePlaylists = useMemo(
    () => (playlists || []).filter((playlist) => !playlist.localOnly),
    [playlists],
  );
  const analyticsVideos = useMemo(
    () => (videos || []).filter((video) => video.youtubeId),
    [videos],
  );
  const scopeReady = scope === "channel" || (scope === "video" && videoId) || (scope === "playlist" && playlistId);
  const currentChannel = channels.find((channel) => String(channel.id) === String(selectedChannelId)) || null;

  useEffect(() => {
    setVideoId("");
    setPlaylistId("");
    setScope("channel");
  }, [selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId || !scopeReady) {
      setAnalytics(null);
      setAnalyticsError("");
      setAnalyticsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const id = ++requestId.current;
    const params = new URLSearchParams();
    if (period !== "lifetime") params.set("days", period);
    if (scope === "video") params.set("video_id", videoId);
    if (scope === "playlist") params.set("playlist_id", playlistId);

    setAnalyticsLoading(true);
    setAnalyticsError("");
    apiFetch(`/channels/${selectedChannelId}/analytics/summary?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const code = data?.detail?.code || data?.detail || "youtube_analytics_unavailable";
          throw new Error(code);
        }
        return data;
      })
      .then((data) => {
        if (id === requestId.current && !controller.signal.aborted) setAnalytics(data);
      })
      .catch((error) => {
        if (error.name !== "AbortError" && id === requestId.current) setAnalyticsError(error.message || "youtube_analytics_unavailable");
      })
      .finally(() => {
        if (id === requestId.current) setAnalyticsLoading(false);
      });
    return () => controller.abort();
  }, [selectedChannelId, scope, videoId, playlistId, period, scopeReady]);

  const periodLabel = period === "lifetime"
    ? t(uiLang, "statisticsPeriodLifetime")
    : t(uiLang, "statisticsPeriodDays", { count: period });
  const scopeLabel = scope === "video"
    ? analyticsVideos.find((video) => String(video.id) === String(videoId))?.title || t(uiLang, "statisticsChooseVideo")
    : scope === "playlist"
      ? remotePlaylists.find((playlist) => String(playlist.id) === String(playlistId))?.title || t(uiLang, "statisticsChoosePlaylist")
      : t(uiLang, "statisticsScopeChannel");
  const maxViews = Math.max(1, ...(analytics?.series || []).map((point) => Number(point.views || 0)));
  const netSubscribers = Number(analytics?.subscribers_gained || 0) - Number(analytics?.subscribers_lost || 0);
  const counts = {
    public: Number(statusCounts?.public || 0),
    private: Number(statusCounts?.private || 0),
    unlisted: Number(statusCounts?.unlisted || 0),
    scheduled: Number(statusCounts?.scheduled || 0),
  };
  const maxContent = Math.max(1, ...Object.values(counts));

  return (
    <main className="statistics-workspace">
      <header className="statistics-heading">
        <div>
          <small>{t(uiLang, "statisticsOverview")}</small>
          <h1>{t(uiLang, "statisticsTab")}</h1>
          <p>{t(uiLang, "statisticsDashboardIntro")}</p>
        </div>
        <span className="statistics-catalog-badge">{t(uiLang, "statisticsCatalogCount", { count: catalogTotal || 0 })}</span>
      </header>

      <section className="statistics-controls" aria-label={t(uiLang, "statisticsControls")}>
        <div className="statistics-control">
          <span>{t(uiLang, "statisticsChannel")}</span>
          <button className="statistics-channel-trigger" type="button" onClick={() => setChannelMenuOpen((value) => !value)} aria-expanded={channelMenuOpen}>
            {currentChannel?.thumbnail_url ? <img src={currentChannel.thumbnail_url} alt="" /> : <span className="statistics-channel-placeholder" />}
            <span><strong>{currentChannel?.title || "—"}</strong><small>{currentChannel?.youtube_channel_id || ""}</small></span>
            <b aria-hidden="true">⌄</b>
          </button>
          {channelMenuOpen ? (
            <div className="statistics-channel-menu">
              {channels.map((channel) => (
                <button key={channel.id} type="button" className={String(channel.id) === String(selectedChannelId) ? "active" : ""} onClick={() => { setChannelMenuOpen(false); onChannelChange(String(channel.id)); }}>
                  {channel.thumbnail_url ? <img src={channel.thumbnail_url} alt="" /> : <span className="statistics-channel-placeholder" />}
                  <span><strong>{channel.title}</strong><small>{channel.youtube_channel_id}</small></span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <label className="statistics-control">
          <span>{t(uiLang, "statisticsScope")}</span>
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="channel">{t(uiLang, "statisticsScopeChannel")}</option>
            <option value="playlist">{t(uiLang, "statisticsScopePlaylist")}</option>
            <option value="video">{t(uiLang, "statisticsScopeVideo")}</option>
          </select>
        </label>

        {scope === "playlist" ? (
          <label className="statistics-control statistics-scope-target">
            <span>{t(uiLang, "statisticsPlaylist")}</span>
            <select value={playlistId} onChange={(event) => setPlaylistId(event.target.value)}>
              <option value="">{t(uiLang, "statisticsChoosePlaylist")}</option>
              {remotePlaylists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.title}</option>)}
            </select>
          </label>
        ) : null}

        {scope === "video" ? (
          <label className="statistics-control statistics-scope-target">
            <span>{t(uiLang, "statisticsVideo")}</span>
            <select value={videoId} onChange={(event) => setVideoId(event.target.value)}>
              <option value="">{t(uiLang, "statisticsChooseVideo")}</option>
              {analyticsVideos.map((video) => <option key={video.id} value={video.id}>{video.title}</option>)}
            </select>
          </label>
        ) : null}

        <div className="statistics-period-control">
          <span>{t(uiLang, "statisticsPeriod")}</span>
          <div>
            {PERIODS.map((value) => (
              <button key={value} type="button" className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>
                {value === "lifetime" ? t(uiLang, "statisticsPeriodLifetime") : t(uiLang, "statisticsPeriodShort", { count: value })}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="statistics-status-slot" aria-live="polite">
        {!scopeReady ? <span>{scope === "video" ? t(uiLang, "statisticsChooseVideoHint") : t(uiLang, "statisticsChoosePlaylistHint")}</span> : null}
        {analyticsLoading ? <span>{t(uiLang, "statisticsUpdating")}</span> : null}
        {analyticsError ? <span className="statistics-error">{t(uiLang, analyticsError)}</span> : null}
      </div>

      <section className="statistics-kpis">
        <article><span>{t(uiLang, "videoViews")}</span><strong>{analytics ? formatNumber(analytics.views, locale) : "—"}</strong><small>{periodLabel}</small></article>
        <article><span>{t(uiLang, "statisticsWatchTime")}</span><strong>{analytics ? t(uiLang, "statisticsWatchTimeValue", { count: Math.round(Number(analytics.estimated_minutes_watched || 0) / 60) }) : "—"}</strong><small>{periodLabel}</small></article>
        <article><span>{t(uiLang, "statisticsAverageViewDuration")}</span><strong>{analytics ? formatDuration(analytics.average_view_duration) : "—"}</strong><small>{analytics ? t(uiLang, "statisticsAverageViewed", { count: Number(analytics.average_view_percentage || 0).toFixed(1) }) : periodLabel}</small></article>
        <article><span>{t(uiLang, "statisticsSubscribersNet")}</span><strong>{analytics ? formatNumber(netSubscribers, locale) : "—"}</strong><small>{analytics ? t(uiLang, "statisticsSubscribersDetail", { gained: analytics.subscribers_gained || 0, lost: analytics.subscribers_lost || 0 }) : periodLabel}</small></article>
      </section>

      <section className="statistics-panel statistics-trend">
        <header><div><small>{t(uiLang, "statisticsTrend")}</small><h2>{t(uiLang, "statisticsViewsOverTime")}</h2></div><span>{scopeLabel} · {periodLabel}</span></header>
        <div className="statistics-chart-stage">
          {(analytics?.series || []).length ? (
            <div className="statistics-bars" aria-label={t(uiLang, "statisticsViewsOverTime")}>
              {analytics.series.map((point) => <i key={point.date} style={{ height: `${Math.max(2, Math.round((Number(point.views || 0) / maxViews) * 100))}%` }} title={`${point.date}: ${point.views}`} />)}
            </div>
          ) : <div className="statistics-chart-empty">{scopeReady && !analyticsLoading ? t(uiLang, "statisticsNoAnalyticsData") : ""}</div>}
        </div>
        <p>{t(uiLang, "statisticsAnalyticsNote", { scope: scopeLabel, period: periodLabel })}</p>
      </section>

      <div className="statistics-lower-grid">
        <section className="statistics-panel">
          <header><div><small>{t(uiLang, "statisticsEngagement")}</small><h2>{t(uiLang, "statisticsEngagementTitle")}</h2></div></header>
          <div className="statistics-engagement-grid">
            <div><span>{t(uiLang, "videoLikes")}</span><strong>{analytics ? formatNumber(analytics.likes, locale) : "—"}</strong></div>
            <div><span>{t(uiLang, "videoComments")}</span><strong>{analytics ? formatNumber(analytics.comments, locale) : "—"}</strong></div>
            <div><span>{t(uiLang, "statisticsShares")}</span><strong>{analytics ? formatNumber(analytics.shares, locale) : "—"}</strong></div>
          </div>
        </section>
        <section className="statistics-panel statistics-content">
          <header><div><small>{t(uiLang, "statisticsContent")}</small><h2>{t(uiLang, "statisticsContentMix")}</h2></div><strong>{catalogTotal || 0}</strong></header>
          {Object.entries(counts).map(([key, value]) => (
            <div className="statistics-content-row" key={key}>
              <span>{t(uiLang, key === "public" ? "filterPublic" : key === "private" ? "filterPrivate" : key === "unlisted" ? "filterUnlisted" : "filterScheduled")}</span>
              <b>{formatNumber(value, locale)}</b>
              <i><span style={{ width: `${Math.round((value / maxContent) * 100)}%` }} /></i>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
