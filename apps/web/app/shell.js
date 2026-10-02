"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { t } from "../lib/i18n";
import { apiFetch } from "../lib/api";
import { usePrefs } from "./providers";
import { LogoutControl } from "./logout-control";

export function Shell({ children }) {
  const { prefs, uiLang, update } = usePrefs();
  const updateRef = useRef(update);
  updateRef.current = update;
  const path = usePathname();
  const router = useRouter();
  const [channels, setChannels] = useState([]);
  const [channel, setChannel] = useState(null);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelError, setChannelError] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setChannelsLoading(true);
    apiFetch("/channels")
      .then(async (response) => {
        if (!response.ok) throw new Error("channel list unavailable");
        return response.json();
      })
      .then(async (rows) => {
        const id = prefs.selectedChannelId;
        let ch = rows.find((r) => String(r.id) === String(id)) || rows[0] || null;
        if (cancelled) return;
        setChannels(rows);
        setChannelsLoading(false);
        setChannelError(false);
        if (ch && String(ch.id) !== String(id)) {
          updateRef.current({ selectedChannelId: String(ch.id) });
        }
        if (ch && ch.has_token && (!ch.banner_url || !ch.thumbnail_url)) {
          const res = await apiFetch(`/channels/${ch.id}/refresh-profile`, { method: "POST" });
          if (res.ok) ch = { ...ch, ...(await res.json()) };
        }
        if (!cancelled) setChannel(ch);
      })
      .catch(() => {
        if (!cancelled) {
          setChannels([]);
          setChannel(null);
          setChannelsLoading(false);
          setChannelError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [prefs.selectedChannelId]);

  useEffect(() => {
    if (!channel?.id) {
      setCatalogStatus(null);
      return undefined;
    }
    const controller = new AbortController();
    setCatalogStatus(null);
    apiFetch(`/channels/${channel.id}/catalog/status`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog status unavailable");
        return response.json();
      })
      .then((status) => {
        if (!controller.signal.aborted) setCatalogStatus(status);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogStatus({ state: "UNAVAILABLE" });
      });
    return () => controller.abort();
  }, [channel?.id]);

  const [workspaceView, setWorkspaceView] = useState("videos");

  useEffect(() => {
    const syncWorkspaceView = () => {
      setWorkspaceView(new URLSearchParams(window.location.search).get("view") === "calendar" ? "calendar" : "videos");
    };
    syncWorkspaceView();
    window.addEventListener("popstate", syncWorkspaceView);
    return () => window.removeEventListener("popstate", syncWorkspaceView);
  }, [path]);

  function navigateWorkspace(view) {
    setWorkspaceView(view);
    router.push(view === "calendar" ? "/?view=calendar" : "/?view=videos");
  }

  const syncStatusKey = channelError
    ? "catalogUnknown"
    : !channel
      ? channelsLoading ? "catalogLoading" : "noChannelsSaved"
      : ({
          NOT_IMPORTED: "catalogNotImported",
          LOADING: "catalogLoading",
          PARTIAL: "catalogPartial",
          COMPLETE: "catalogComplete",
          STALE: "catalogStale",
          ERROR: "catalogError",
          EMPTY: "catalogEmpty",
          UNAVAILABLE: "catalogUnknown",
        })[catalogStatus?.state] || "catalogLoading";

  return (
    <div className="shell">
      <header className="top app-top">
        <Link href="/" className="brand">
          <img src="/logo.svg" alt="" className="brand-mark" />
          {t(uiLang, "brand")}
        </Link>
        <label className="channel-picker">
          {channel?.thumbnail_url ? (
            <img src={channel.thumbnail_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar" aria-hidden="true">{channel?.title?.slice(0, 1) || "?"}</span>
          )}
          <select
            value={channel ? String(channel.id) : ""}
            aria-label={t(uiLang, "channels")}
            disabled={!channels.length}
            onChange={(event) => update({ selectedChannelId: event.target.value })}
          >
            {channelError ? <option value="">{t(uiLang, "studioChannelLoadError")}</option> : null}
            {!channelError && channelsLoading ? <option value="">{t(uiLang, "catalogLoading")}</option> : null}
            {!channelError && !channelsLoading && !channels.length ? <option value="">{t(uiLang, "noChannelsSaved")}</option> : null}
            {channels.map((item) => (
              <option key={item.id} value={String(item.id)}>{item.title}</option>
            ))}
          </select>
        </label>
        <nav className="workspace-nav" aria-label={t(uiLang, "studio")}>
          <button
            type="button"
            className={workspaceView === "videos" ? "active" : ""}
            aria-current={workspaceView === "videos" ? "page" : undefined}
            onClick={() => navigateWorkspace("videos")}
          >
            {t(uiLang, "videos")}
          </button>
          <button
            type="button"
            className={workspaceView === "calendar" ? "active" : ""}
            aria-current={workspaceView === "calendar" ? "page" : undefined}
            onClick={() => navigateWorkspace("calendar")}
          >
            {t(uiLang, "calendarTab")}
          </button>
        </nav>
        <div className="sync-status" role="status" aria-label={t(uiLang, "syncStatus")}>
          <span>{t(uiLang, "syncStatus")}</span>
          <strong>{t(uiLang, syncStatusKey)}</strong>
        </div>
        <div className="spacer" />
        <Link href="/cabinet" className="btn ghost cabinet-link">
          {t(uiLang, "cabinet")}
        </Link>
        <LogoutControl />
      </header>
      {typeof children === "function"
        ? children({ view: workspaceView, onViewChange: navigateWorkspace })
        : children}
    </div>
  );
}
