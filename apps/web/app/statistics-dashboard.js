"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { catalogVideosUrl, continueCatalogSyncPage, statisticsCatalogSyncAction } from "../lib/catalog-state.mjs";
import { t } from "../lib/i18n";
import { loadPrefs, savePrefs } from "../lib/prefs";

const PERIODS = ["7", "28", "90", "lifetime"];

function formatNumber(value, locale) {
  return Number(value || 0).toLocaleString(locale);
}

function formatNullableNumber(value, locale) {
  return value == null ? "—" : Number(value).toLocaleString(locale);
}

function ChannelAvatar({ channel, onImageError }) {
  const [failed, setFailed] = useState(false);
  const source = channel?.thumbnail_url || "";

  useEffect(() => setFailed(false), [source]);

  return (
    <span className="statistics-channel-avatar" aria-hidden="true">
      <span>{(channel?.title || "?").trim().slice(0, 1).toUpperCase()}</span>
      {source && !failed ? (
        <img
          src={source}
          alt=""
          onError={() => {
            setFailed(true);
            onImageError?.(channel);
          }}
        />
      ) : null}
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
  const [period, setPeriod] = useState(() => {
    const saved = loadPrefs().statisticsPeriod;
    return PERIODS.includes(String(saved)) ? String(saved) : "28";
  });
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [activeKpi, setActiveKpi] = useState("views");
  const [catalogVideos, setCatalogVideos] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const [catalogSyncError, setCatalogSyncError] = useState("");
  const requestId = useRef(0);
  const channelMenuRef = useRef(null);
  const channelTriggerRef = useRef(null);
  const profileRefreshAttempts = useRef(new Set());
  const locale = t(uiLang, "calendarLocale");

  useEffect(() => {
    if (!channelMenuOpen) return undefined;
    const closeOnPointerDown = (event) => {
      if (!channelMenuRef.current?.contains(event.target) && !channelTriggerRef.current?.contains(event.target)) setChannelMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") { setChannelMenuOpen(false); channelTriggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnPointerDown); document.removeEventListener("keydown", closeOnEscape); };
  }, [channelMenuOpen]);

  async function refreshChannelProfile(channel, signal) {
    if (!channel?.id || profileRefreshAttempts.current.has(String(channel.id))) return;
    profileRefreshAttempts.current.add(String(channel.id));
    try {
      const response = await apiFetch(`/channels/${channel.id}/refresh-profile`, { method: "POST", signal });
      const refreshed = await response.json().catch(() => ({}));
      if (!response.ok) return;
      setChannels((current) => current.map((item) => (
        String(item.id) === String(channel.id)
          ? { ...item, ...refreshed, thumbnail_url: refreshed.thumbnail_url || item.thumbnail_url || "" }
          : item
      )));
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/channels", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("channels unavailable");
        return response.json();
      })
      .then((rows) => {
        const next = rows || [];
        setChannels(next);
        next.filter((channel) => !channel.thumbnail_url).forEach((channel) => {
          refreshChannelProfile(channel, controller.signal);
        });
      })
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

    async function ensureCompleteCatalog() {
      setCatalogSyncing(true);
      setCatalogSyncError("");
      try {
        let statusResponse = await apiFetch(`/channels/${selectedChannelId}/catalog/status`, { signal: controller.signal });
        let status = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(status?.detail || "catalog status unavailable");

        const syncAction = statisticsCatalogSyncAction(status);
        if (syncAction === "initial" || syncAction === "incremental") {
          const startResponse = await apiFetch(`/channels/${selectedChannelId}/catalog/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: syncAction }),
            signal: controller.signal,
          });
          status = await startResponse.json();
          if (!startResponse.ok) throw new Error(status?.detail || "catalog sync unavailable");
        }

        while (["LOADING", "PARTIAL"].includes(status.state)) {
          if (cancelled) return;
          status = await continueCatalogSyncPage(
            selectedChannelId,
            apiFetch,
            "catalog sync unavailable",
            () => {},
          );
        }
      } catch (error) {
        if (error.name === "AbortError" || cancelled) return;
        setCatalogSyncError(String(error.message || error));
      } finally {
        if (!cancelled) setCatalogSyncing(false);
      }
    }

    async function loadCompleteCatalog() {
      await ensureCompleteCatalog();
      if (cancelled) return;
      const items = [];
      let cursor = "";
      let firstPage = true;
      do {
        const response = await apiFetch(catalogVideosUrl(selectedChannelId, { sort: "date_desc", cursor }), { signal: controller.signal });
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
    setCatalogSyncError("");
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
    () => catalogVideos
      .filter((video) => video.youtubeId && video.status === "public" && video.availability === "available")
      .sort((a, b) => {
        const aTime = Date.parse(a.publishedAt || "");
        const bTime = Date.parse(b.publishedAt || "");
        if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return Number(b.id || 0) - Number(a.id || 0);
        if (!Number.isFinite(aTime)) return 1;
        if (!Number.isFinite(bTime)) return -1;
        return bTime - aTime || Number(b.id || 0) - Number(a.id || 0);
      }),
    [catalogVideos],
  );
  const scopeReady = scope === "channel" || (scope === "video" && videoId) || (scope === "playlist" && playlistId);

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

    setAnalytics(null);
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
  const analyticsDataUnavailable = Boolean(analytics && analytics.has_data === false);
  const subscriberMetricsAvailable = !analyticsDataUnavailable && analytics?.subscribers_gained != null && analytics?.subscribers_lost != null;
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
  const currentSubscriberTotal = analytics?.current_subscriber_count != null
    ? Number(analytics.current_subscriber_count)
    : null;
  const kpiDefinitions = {
    views: {
      label: t(uiLang, "videoViews"),
      value: analyticsDataUnavailable ? "—" : analytics ? formatNumber(analytics.views, locale) : "—",
      detail: analyticsDataUnavailable
        ? analytics?.current_statistics?.views != null && scope === "video"
          ? t(uiLang, "statisticsCurrentYouTubeViewsPendingAnalytics", { count: formatNumber(analytics.current_statistics.views, locale) })
          : t(uiLang, "statisticsAnalyticsDataPending")
        : analytics?.current_statistics?.views != null && scope === "video"
          ? t(uiLang, "statisticsCurrentYouTubeViews", { count: formatNumber(analytics.current_statistics.views, locale), period: periodLabel })
          : periodLabel,
      seriesValue: (point) => Number(point.views || 0),
      seriesTitle: (point) => `${point.date}: ${formatNumber(point.views, locale)}`,
      chartTitle: t(uiLang, "statisticsViewsOverTime"),
    },
    watchTime: {
      label: t(uiLang, "statisticsWatchTime"),
      value: analyticsDataUnavailable ? "—" : analytics ? t(uiLang, "statisticsWatchTimeValue", { count: Math.round(Number(analytics.estimated_minutes_watched || 0) / 60) }) : "—",
      detail: analyticsDataUnavailable ? t(uiLang, "statisticsAnalyticsDataPending") : periodLabel,
      seriesValue: (point) => Number(point.estimated_minutes_watched || 0),
      seriesTitle: (point) => `${point.date}: ${t(uiLang, "statisticsWatchTimeValue", { count: (Number(point.estimated_minutes_watched || 0) / 60).toFixed(1) })}`,
      chartTitle: t(uiLang, "statisticsWatchTimeOverTime"),
    },
    averageDuration: {
      label: t(uiLang, "statisticsAverageViewDuration"),
      value: analyticsDataUnavailable ? "—" : analytics ? formatDuration(analytics.average_view_duration, uiLang) : "—",
      detail: analyticsDataUnavailable ? t(uiLang, "statisticsAnalyticsDataPending") : analytics?.average_view_percentage != null ? t(uiLang, "statisticsAverageViewed", { count: Number(analytics.average_view_percentage).toFixed(1) }) : analytics && scope === "playlist" ? t(uiLang, "statisticsPlaylistMetricUnavailable") : periodLabel,
      seriesValue: (point) => point.average_view_duration == null ? null : Number(point.average_view_duration),
      seriesTitle: (point) => `${point.date}: ${formatDuration(point.average_view_duration, uiLang)}`,
      chartTitle: t(uiLang, "statisticsAverageDurationOverTime"),
    },
    subscribers: {
      label: t(uiLang, scope === "channel" ? "statisticsSubscribersTotal" : "statisticsSubscribersChange"),
      value: analytics ? (scope === "channel" ? formatNullableNumber(currentSubscriberTotal, locale) : analyticsDataUnavailable ? "—" : formatNullableNumber(netSubscribers, locale)) : "—",
      detail: analyticsDataUnavailable ? t(uiLang, "statisticsAnalyticsDataPending") : analytics && subscriberMetricsAvailable ? t(uiLang, "statisticsSubscribersDetail", { gained: analytics.subscribers_gained, lost: analytics.subscribers_lost }) : analytics && scope === "playlist" ? t(uiLang, "statisticsPlaylistMetricUnavailable") : periodLabel,
      seriesValue: (point) => point.subscribers_gained == null || point.subscribers_lost == null ? null : Number(point.subscribers_gained) - Number(point.subscribers_lost),
      seriesTitle: (point) => `${point.date}: ${Number(point.subscribers_gained || 0) - Number(point.subscribers_lost || 0)} (${t(uiLang, "statisticsSubscribersDetail", { gained: point.subscribers_gained || 0, lost: point.subscribers_lost || 0 })})`,
      chartTitle: t(uiLang, "statisticsSubscribersOverTime"),
    },
  };
  const activeMetric = kpiDefinitions[activeKpi] || kpiDefinitions.views;
  const chartPoints = (analytics?.series || []).map((point) => ({ point, value: activeMetric.seriesValue(point) })).filter(({ value }) => value != null);
  const chartValues = chartPoints.map(({ value }) => Number(value));
  const chartMin = Math.min(0, ...chartValues);
  const chartMax = Math.max(0, ...chartValues);
  const chartRange = Math.max(1, chartMax - chartMin);
  const positiveShare = chartMin < 0 ? (chartMax / chartRange) * 100 : 100;

  return (
    <main className="statistics-workspace">
      <header className="statistics-heading">
        <h1>{t(uiLang, "statisticsTab")}</h1>
      </header>

      <section className="statistics-controls" aria-label={t(uiLang, "statisticsControls")}>
        <div className="statistics-control">
          <span>{t(uiLang, "statisticsChannel")}</span>
          <button ref={channelTriggerRef} className="statistics-channel-trigger" type="button" onClick={() => setChannelMenuOpen((value) => !value)} aria-expanded={channelMenuOpen} aria-haspopup="menu" title={t(uiLang, "statisticsChannelHint")}>
            <ChannelAvatar channel={currentChannel} onImageError={(channel) => refreshChannelProfile(channel)} />
            <span><strong>{currentChannel?.title || "—"}</strong><small>{currentChannel?.youtube_channel_id || ""}</small></span>

          </button>
          {channelMenuOpen ? (
            <div ref={channelMenuRef} className="statistics-channel-menu" role="menu">
              {channels.map((channel) => (
                <button key={channel.id} type="button" role="menuitemradio" aria-checked={String(channel.id) === String(selectedChannelId)} className={String(channel.id) === String(selectedChannelId) ? "active" : ""} onClick={() => { setChannelMenuOpen(false); onChannelChange(String(channel.id)); channelTriggerRef.current?.focus(); }}>
                  <ChannelAvatar channel={channel} onImageError={(item) => refreshChannelProfile(item)} />
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

        <label className="statistics-control statistics-period-control">
          <span>{t(uiLang, "statisticsPeriod")}</span>
          <select value={period} onChange={(event) => { const next = event.target.value; setPeriod(next); savePrefs({ statisticsPeriod: next }); }} title={t(uiLang, "statisticsPeriodHint")}>
            {PERIODS.map((value) => (
              <option key={value} value={value}>
                {value === "lifetime" ? t(uiLang, "statisticsPeriodLifetime") : t(uiLang, "statisticsPeriodShort", { count: value })}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="statistics-status-slot" aria-live="polite">
        {!scopeReady ? <span>{scope === "video" ? t(uiLang, "statisticsChooseVideoHint") : t(uiLang, "statisticsChoosePlaylistHint")}</span> : null}
        {catalogSyncing ? <span>{t(uiLang, "statisticsCatalogUpdating")}</span> : null}
        {catalogSyncError ? <span className="statistics-error">{t(uiLang, "statisticsCatalogUpdateFailed")}</span> : null}
        {analyticsLoading ? <span>{t(uiLang, "statisticsUpdating")}</span> : null}
        {analyticsError ? <span className="statistics-error">{t(uiLang, analyticsError)}</span> : null}
        {analytics?.analytics_last_reported_date ? (
          <span title={t(uiLang, "statisticsLastReportedDateHint")}>
            {t(uiLang, "statisticsLastReportedDate", { date: analytics.analytics_last_reported_date })}
          </span>
        ) : null}
      </div>

      <section className="statistics-kpis">
        {Object.entries(kpiDefinitions).map(([key, metric]) => (
          <button key={key} type="button" className={`statistics-kpi ${activeKpi === key ? "active" : ""}`} onClick={() => setActiveKpi(key)} aria-pressed={activeKpi === key}>
            <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small>
          </button>
        ))}
      </section>

      <section className="statistics-panel statistics-trend">
        <header><div><small>{t(uiLang, "statisticsTrend")}</small><h2>{activeMetric.chartTitle}</h2></div><span>{scopeLabel} · {periodLabel}</span></header>
        <div className="statistics-chart-stage">
          {chartPoints.length ? (
            <div className={`statistics-bars ${chartMin < 0 ? "signed" : ""}`} aria-hidden="true">
              {chartMin < 0 ? <span className="statistics-zero-line" style={{ bottom: `${positiveShare}%` }} /> : null}
              {chartPoints.map(({ point, value }) => {
                const positive = Number(value) >= 0;
                const size = Math.max(2, Math.round((Math.abs(Number(value)) / Math.max(1, positive ? chartMax : Math.abs(chartMin))) * (chartMin < 0 ? (positive ? positiveShare : 100 - positiveShare) : 100)));
                return <i key={point.date} className={positive ? "positive" : "negative"} style={chartMin < 0 ? (positive ? { height: `${size}%`, bottom: `${100 - positiveShare}%` } : { height: `${size}%`, top: `${positiveShare}%` }) : { height: `${size}%` }} title={activeMetric.seriesTitle(point)} />;
              })}
            </div>
          ) : <div className="statistics-chart-empty">{scopeReady && !analyticsLoading ? t(uiLang, analyticsDataUnavailable ? "statisticsAnalyticsDataPendingDetail" : activeKpi === "subscribers" && scope === "playlist" ? "statisticsPlaylistMetricUnavailable" : "statisticsNoAnalyticsData") : ""}</div>}
        </div>
        {chartPoints.length ? <ul className="visually-hidden" aria-label={activeMetric.chartTitle}>{chartPoints.map(({ point }) => <li key={point.date}>{activeMetric.seriesTitle(point)}</li>)}</ul> : null}
        <p>{t(uiLang, "statisticsAnalyticsNote", { scope: scopeLabel, period: periodLabel })}</p>
      </section>

      <div className="statistics-lower-grid">
        <section className="statistics-panel">
          <header><div><small>{t(uiLang, "statisticsEngagement")}</small><h2>{t(uiLang, "statisticsEngagementTitle")}</h2></div></header>
          <div className="statistics-engagement-grid">
            <div><span>{t(uiLang, "videoLikes")}</span><strong>{analytics && !analyticsDataUnavailable ? formatNullableNumber(analytics.likes, locale) : "—"}</strong></div>
            <div><span>{t(uiLang, "videoComments")}</span><strong>{analytics && !analyticsDataUnavailable ? formatNullableNumber(analytics.comments, locale) : "—"}</strong></div>
            <div><span>{t(uiLang, "statisticsShares")}</span><strong>{analytics && !analyticsDataUnavailable ? formatNullableNumber(analytics.shares, locale) : "—"}</strong></div>
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
              <span className="statistics-status-name">{t(uiLang, key === "public" ? "filterPublic" : key === "private" ? "filterPrivate" : key === "unlisted" ? "filterUnlisted" : "filterScheduled")}<i aria-hidden="true">→</i></span>
              <b>{formatNumber(value, locale)}</b>
              <i><span style={{ width: `${Math.round((value / maxContent) * 100)}%` }} /></i>
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}
