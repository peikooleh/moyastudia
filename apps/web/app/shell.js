"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { t } from "../lib/i18n";
import { apiFetch } from "../lib/api";
import { UI_LANGS } from "../lib/prefs";
import { usePrefs } from "./providers";
import { ThemePicker } from "./theme-picker";
import { LogoutControl } from "./logout-control";

export function Shell({ children }) {
  const { prefs, uiLang, update } = usePrefs();
  const updateRef = useRef(update);
  updateRef.current = update;
  const path = usePathname();
  const router = useRouter();
  const inCabinet = path === "/cabinet" || path?.startsWith("/cabinet/");
  const [channels, setChannels] = useState([]);
  const [channel, setChannel] = useState(null);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelError, setChannelError] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState(null);
  const [quota, setQuota] = useState(null);
  const [writeMode, setWriteMode] = useState({ enabled: false, youtube_writes_available: false });
  const [writeModeBusy, setWriteModeBusy] = useState(false);
  const [interfaceOpen, setInterfaceOpen] = useState(false);
  const interfaceMenuRef = useRef(null);

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

  useEffect(() => {
    let cancelled = false;
    apiFetch("/write-mode")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "write mode unavailable");
        if (!cancelled) setWriteMode(data);
      })
      .catch(() => {
        if (!cancelled) setWriteMode({ enabled: false, youtube_writes_available: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleWriteMode() {
    if (writeModeBusy) return;
    const nextEnabled = !writeMode.enabled;
    if (nextEnabled && !window.confirm(t(uiLang, "writeModeConfirm"))) return;
    setWriteModeBusy(true);
    try {
      const response = await apiFetch("/write-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: nextEnabled,
          confirmation: nextEnabled ? "enable_youtube_writes" : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setWriteMode((current) => ({ ...current, error: data.detail || t(uiLang, "writeModeUpdateError") }));
        return;
      }
      setWriteMode(data);
      window.dispatchEvent(new CustomEvent("moyastudia:write-mode", { detail: data }));
    } catch {
      setWriteMode((current) => ({ ...current, error: t(uiLang, "writeModeUpdateError") }));
    } finally {
      setWriteModeBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const loadQuota = () => {
      apiFetch("/quota/today")
        .then(async (response) => {
          if (!response.ok) throw new Error("quota unavailable");
          return response.json();
        })
        .then((value) => {
          if (!cancelled) setQuota(value);
        })
        .catch(() => {
          if (!cancelled) setQuota(null);
        });
    };
    loadQuota();
    window.addEventListener("focus", loadQuota);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadQuota);
    };
  }, [channel?.id]);

  useEffect(() => {
    if (!interfaceOpen) return undefined;
    const closeInterfaceMenu = (event) => {
      if (!interfaceMenuRef.current?.contains(event.target)) setInterfaceOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setInterfaceOpen(false);
    };
    document.addEventListener("pointerdown", closeInterfaceMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeInterfaceMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [interfaceOpen]);

  const [workspaceView, setWorkspaceView] = useState("videos");

  useEffect(() => {
    const syncWorkspaceView = () => {
      const requestedView = new URLSearchParams(window.location.search).get("view");
      setWorkspaceView(["calendar", "playlists", "statistics"].includes(requestedView) ? requestedView : "videos");
    };
    syncWorkspaceView();
    window.addEventListener("popstate", syncWorkspaceView);
    return () => window.removeEventListener("popstate", syncWorkspaceView);
  }, [path]);

  function navigateWorkspace(view) {
    setWorkspaceView(view);
    router.push(view === "videos" ? "/?view=videos" : `/?view=${view}`);
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
        <nav className="workspace-nav" aria-label={t(uiLang, "studio")}>
          <button
            type="button"
            className={!inCabinet && workspaceView === "videos" ? "active" : ""}
            aria-current={!inCabinet && workspaceView === "videos" ? "page" : undefined}
            onClick={() => navigateWorkspace("videos")}
          >
            {t(uiLang, "videos")}
          </button>
          <button
            type="button"
            className={!inCabinet && workspaceView === "playlists" ? "active" : ""}
            aria-current={!inCabinet && workspaceView === "playlists" ? "page" : undefined}
            onClick={() => navigateWorkspace("playlists")}
          >
            {t(uiLang, "playlistsTab")}
          </button>
          <button
            type="button"
            className={!inCabinet && workspaceView === "calendar" ? "active" : ""}
            aria-current={!inCabinet && workspaceView === "calendar" ? "page" : undefined}
            onClick={() => navigateWorkspace("calendar")}
          >
            {t(uiLang, "calendarTab")}
          </button>
          <button
            type="button"
            className={!inCabinet && workspaceView === "statistics" ? "active" : ""}
            aria-current={!inCabinet && workspaceView === "statistics" ? "page" : undefined}
            onClick={() => navigateWorkspace("statistics")}
          >
            {t(uiLang, "statisticsTab")}
          </button>
        </nav>
        <div className="spacer" />
        <div className="header-system-status">
          <div className="header-write-mode">
              <span>{t(uiLang, "writeMode")}</span>
              <button
                className={`mode-switch ${writeMode.enabled ? "is-on" : "is-off"}`}
                type="button"
                role="switch"
                aria-checked={writeMode.enabled ? "true" : "false"}
                aria-label={t(uiLang, "writeMode")}
                disabled={writeModeBusy}
                onClick={toggleWriteMode}
                title={writeMode.enabled ? t(uiLang, "writeModeOn") : t(uiLang, "writeModeOff")}
              >
                <span aria-hidden="true" />
              </button>
            </div>
          <div className="sync-status" role="status" aria-label={t(uiLang, "syncStatus")}>
            <span>{t(uiLang, "syncStatus")}</span>
            <strong>{t(uiLang, syncStatusKey)}</strong>
          </div>
          {quota?.buckets?.general ? (
            <div className="sync-status quota-status" title={t(uiLang, "quotaTrackedTitle")}>
              <span>{t(uiLang, "quotaTracked")}</span>
              <strong>{quota.buckets.general.used} / {quota.buckets.general.limit}</strong>
            </div>
          ) : null}
        </div>
        <div className="header-interface" ref={interfaceMenuRef}>
          <button type="button" className={`btn ghost interface-trigger ${interfaceOpen ? "active" : ""}`} aria-expanded={interfaceOpen} aria-haspopup="dialog" onClick={() => setInterfaceOpen((open) => !open)}>
            {t(uiLang, "interface")}
          </button>
          {interfaceOpen ? (
            <div className="interface-popover" role="dialog" aria-label={t(uiLang, "interface")}>
              <section>
                <h2>{t(uiLang, "uiLangTitle")}</h2>
                <div className="interface-language-options">
                  {UI_LANGS.filter((language) => language.id !== "auto").map((language) => (
                    <button key={language.id} type="button" className={prefs.uiLang === language.id ? "active" : ""} onClick={() => update({ uiLang: language.id })}>
                      {language.label}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h2>{t(uiLang, "themeTitle")}</h2>
                <ThemePicker />
              </section>
            </div>
          ) : null}
        </div>
        <Link href="/cabinet" className="btn ghost cabinet-link">
          {t(uiLang, "cabinet")}
        </Link>
        <LogoutControl />
      </header>
      <div className="shell-content">
        {typeof children === "function"
          ? children({ view: workspaceView, onViewChange: navigateWorkspace, writeMode })
          : children}
      </div>
      <footer className="app-footer">
        <span>© {new Date().getFullYear()} {t(uiLang, "brand")}</span>
        <nav aria-label={t(uiLang, "legalLinks")}>
          <Link href="/privacy">{t(uiLang, "privacy")}</Link>
          <Link href="/terms">{t(uiLang, "terms")}</Link>
        </nav>
      </footer>
    </div>
  );
}
