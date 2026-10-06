"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { catalogVideosUrl } from "../lib/catalog-state.mjs";
import { t } from "../lib/i18n";

const PERIODS = ["7", "28", "90", "365", "lifetime"];

function formatNumber(value, locale) {
  return Number(value || 0).toLocaleString(locale);
}

function formatNullableNumber(value, locale) {
  return value == null ? "—" : Number(value).toLocaleString(locale);
}

function ChannelAvatar({ channel }) {
  const [failed, setFailed] = useState(false);
  const source = channel?.thumbnail_url || "";

  useEffect(() => setFailed(false), [source]);

  return (
    <span className="statistics-channel-avatar" aria-hidden="true">
      <span>{(channel?.title || "?").trim().slice(0, 1).toUpperCase()}</span>
      {source && !failed ? <img src={source} alt="" onError={() => setFailed(true)} /> : null}
    </span>
  );
}

function formatDuration(seconds, uiLang) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes ? `${minutes}:${String(rest).padStart(2, "0")}` : t(uiLang, "statisticsDurationSeconds", { count: rest });
}

export function StatisticsDashboard({
  uiLang,
  selectedChannelId,
  onChannelChange,
  playlists,
  onOpenStatus,
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
  const [catalogVideos, setCatalogVideos] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});
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

  useEffect(() => {
    if (!selectedChannelId) {
      setCatalogVideos([]);
      setCatalogTotal(0);
      setStatusCounts({});
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;

    async function loadCompleteCatalog() {
      const items = [];
      let cursor = "";
      let firstPage = true;
      do {
        const response = await apiFetch(catalogVideosUrl(selectedChannelId, { sort: "date", cursor }), { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.detail || "catalog unavailable");
        if (cancelled) return;
        items.push(...(data.items || []));
        if (firstPage) {
          setCatalogTotal(Number(data.total || 0));
          setStatusCounts(data.status_counts || {});
          firstPage = false;
        }
        cursor = data.next_cursor || "";
      } while (cursor && items.length < 10000);
      if (!cancelled) setCatalogVideos(items);
    }

    setCatalogVideos([]);
    setCatalogTotal(0);
    setStatusCounts({});
    loadCompleteCatalog().catch((error) => {
      if (error.name !== "AbortError" && !cancelled) {
        setCatalogVideos([]);
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedChannelId]);

  const remotePlaylists = useMemo(
    () => (playlists || []).filter((playlist) => !playlist.localOnly),
    [playlists],
  );
  const analyticsVideos = useMemo(
    () => catalogVideos.filter((video) => video.youtubeId),
    [catalogVideos],
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
  const subscriberMetricsAvailable = analytics?.subscribers_gained != null && analytics?.subscribers_lost != null;
  const netSubscribers = subscriberMetricsAvailable
    ? Number(analytics.subscribers_gained) - Number(analytics.subscribers_lost)
    : null;
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
        <h1>{t(uiLang, "statisticsTab")}</h1>
      </header>

      <section className="statistics-controls" aria-label={t(uiLang, "statisticsControls")}>
        <div className="statistics-control">
          <span>{t(uiLang, "statisticsChannel")}</span>
          <button className="statistics-channel-trigger" type="button" onClick={() => setChannelMenuOpen((value) => !value)} aria-expanded={channelMenuOpen} aria-haspopup="listbox" title={t(uiLang, "statisticsChannelHint")}>
            <ChannelAvatar channel={currentChannel} />
            <span><strong>{currentChannel?.title || "—"}</strong><small>{currentChannel?.youtube_channel_id || ""}</small></span>

          </button>
          {channelMenuOpen ? (
            <div className="statistics-channel-menu">
              {channels.map((channel) => (
                <button key={channel.id} type="button" className={String(channel.id) === String(selectedChannelId) ? "active" : ""} onClick={() => { setChannelMenuOpen(false); onChannelChange(String(channel.id)); }}>
                  <ChannelAvatar channel={channel} />
                  <span><strong>{channel.title}</strong><small>{channel.youtube_channel_id}</small></span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <label className="statistics-control">
          <span>{t(uiLang, "statisticsScope")}</span>
          <select value={scope} onChange={(event) => setScope(event.target.value)} title={t(uiLang, "statisticsScopeHint")}>
            <option value="channel">{t(uiLang, "statisticsScopeChannel")}</option>
            <option value="playlist">{t(uiLang, "statisticsScopePlaylist")}</option>
            <option value="video">{t(uiLang, "statisticsScopeVideo")}</option>
          </select>
        </label>

        {scope === "playlist" ? (
          <label className="statistics-control statistics-scope-target">
            <span>{t(uiLang, "statisticsPlaylist")}</span>
            <select value={playlistId} onChange={(event) => setPlaylistId(event.target.value)} title={t(uiLang, "statisticsPlaylistHint")}>
              <option value="">{t(uiLang, "statisticsChoosePlaylist")}</option>
              {remotePlaylists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.title}</option>)}
            </select>
          </label>
        ) : null}

        {scope === "video" ? (
          <label className="statistics-control statistics-scope-target">
            <span>{t(uiLang, "statisticsVideo")}</span>
            <select value={videoId} onChange={(event) => setVideoId(event.target.value)} title={t(uiLang, "statisticsVideoHint")}>
              <option value="">{t(uiLang, "statisticsChooseVideo")}</option>
              {analyticsVideos.map((video) => <option key={video.id} value={video.id}>{video.title}</option>)}
            </select>
          </label>
        ) : null}

        <div className="statistics-period-control" title={t(uiLang, "statisticsPeriodHint")}>
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
        <article><span>{t(uiLang, "statisticsAverageViewDuration")}</span><strong>{analytics ? formatDuration(analytics.average_view_duration, uiLang) : "—"}</strong><small>{analytics?.average_view_percentage != null ? t(uiLang, "statisticsAverageViewed", { count: Number(analytics.average_view_percentage).toFixed(1) }) : analytics && scope === "playlist" ? t(uiLang, "statisticsPlaylistMetricUnavailable") : periodLabel}</small></article>
        <article><span>{t(uiLang, "statisticsSubscribersNet")}</span><strong>{analytics ? formatNullableNumber(netSubscribers, locale) : "—"}</strong><small>{analytics && subscriberMetricsAvailable ? t(uiLang, "statisticsSubscribersDetail", { gained: analytics.subscribers_gained, lost: analytics.subscribers_lost }) : analytics && scope === "playlist" ? t(uiLang, "statisticsPlaylistMetricUnavailable") : periodLabel}</small></article>
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
            <div><span>{t(uiLang, "videoLikes")}</span><strong>{analytics ? formatNullableNumber(analytics.likes, locale) : "—"}</strong></div>
            <div><span>{t(uiLang, "videoComments")}</span><strong>{analytics ? formatNullableNumber(analytics.comments, locale) : "—"}</strong></div>
            <div><span>{t(uiLang, "statisticsShares")}</span><strong>{analytics ? formatNullableNumber(analytics.shares, locale) : "—"}</strong></div>
          </div>
        </section>
        <section className="statistics-panel statistics-content">
          <header><div><small>{t(uiLang, "statisticsContent")}</small><h2>{t(uiLang, "statisticsContentMix")}</h2></div><strong>{catalogTotal || 0}</strong></header>
          {Object.entries(counts).map(([key, value]) => (
            <button
              type="button"
              className="statistics-content-row statistics-status-link"
              key={key}
              onClick={() => onOpenStatus?.(key)}
              title={t(uiLang, "statisticsOpenStatusVideos", { status: t(uiLang, key === "public" ? "filterPublic" : key === "private" ? "filterPrivate" : key === "unlisted" ? "filterUnlisted" : "filterScheduled") })}
            >
              <span>{t(uiLang, key === "public" ? "filterPublic" : key === "private" ? "filterPrivate" : key === "unlisted" ? "filterUnlisted" : "filterScheduled")}</span>
              <b>{formatNumber(value, locale)}</b>
              <i><span style={{ width: `${Math.round((value / maxContent) * 100)}%` }} /></i>
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}
