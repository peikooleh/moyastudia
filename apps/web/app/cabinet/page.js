"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl } from "../../lib/api";
import { t } from "../../lib/i18n";
import { CHANNEL_LANGS, prefsAfterChannelRemoval, UI_LANGS } from "../../lib/prefs";
import { ThemePicker } from "../theme-picker";
import { usePrefs } from "../providers";
import { Shell } from "../shell";
import { QuotaRings } from "../quota-rings";

const PICK_LANGS = UI_LANGS.filter((l) => l.id !== "auto");

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.round(x)));
}

export default function CabinetPage() {
  const { prefs, uiLang, update } = usePrefs();
  const router = useRouter();
  const [tab, setTab] = useState("profile");
  const [channels, setChannels] = useState([]);
  const [session, setSession] = useState(undefined);
  const [langEdit, setLangEdit] = useState("");
  const [selectionConnectionId, setSelectionConnectionId] = useState("");
  const [availableChannels, setAvailableChannels] = useState([]);
  const [selectedYoutubeIds, setSelectedYoutubeIds] = useState([]);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectionSaving, setSelectionSaving] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const [discoveryRetry, setDiscoveryRetry] = useState(0);
  const [removingChannelId, setRemovingChannelId] = useState("");
  const [removeError, setRemoveError] = useState("");

  useEffect(() => {
    const connectionId = new URLSearchParams(window.location.search).get("select_connection");
    if (connectionId && /^\d+$/.test(connectionId)) {
      setSelectionConnectionId(connectionId);
      setTab("channels");
    }
  }, []);

  useEffect(() => {
    apiFetch("/auth/session")
      .then((response) => (response.ok ? response.json() : { authenticated: false }))
      .then((status) => {
        setSession(status);
        if (!status.authenticated) router.replace("/");
      })
      .catch(() => {
        setSession({ authenticated: false });
        router.replace("/");
      });
  }, [router]);

  useEffect(() => {
    if (!session?.authenticated) return;
    apiFetch("/channels")
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        setChannels(rows);
      (rows || []).forEach((pick) => {
        if (!pick.has_token) return;
        apiFetch(`/channels/${pick.id}/refresh-profile`, { method: "POST" })
          .then((r) => (r.ok ? r.json() : null))
          .then((fresh) => {
            if (!fresh) return;
            setChannels((prev) => prev.map((c) => (c.id === fresh.id ? { ...c, ...fresh } : c)));
          })
          .catch(() => {});
      });
      })
      .catch(() => setChannels([]));
  }, [session]);

  useEffect(() => {
    if (!session?.authenticated || !selectionConnectionId) return;
    let cancelled = false;
    setSelectionLoading(true);
    setSelectionError("");
    setSelectedYoutubeIds([]);
    apiFetch(`/google-connections/${selectionConnectionId}/available-channels`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || t(uiLang, "channelSelectionLoadError"));
        return data;
      })
      .then((rows) => {
        if (!cancelled) setAvailableChannels(rows);
      })
      .catch((error) => {
        if (!cancelled) {
          setAvailableChannels([]);
          setSelectionError(error.message || t(uiLang, "channelSelectionLoadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setSelectionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.authenticated, selectionConnectionId, discoveryRetry, uiLang]);

  async function saveChannelSelection() {
    setSelectionSaving(true);
    setSelectionError("");
    try {
      const response = await apiFetch(
        `/google-connections/${selectionConnectionId}/channels`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtube_channel_ids: selectedYoutubeIds }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) throw new Error(t(uiLang, "channelSelectionConflict"));
        if (response.status === 422) throw new Error(t(uiLang, "channelSelectionUnavailable"));
        throw new Error(data.detail || t(uiLang, "channelSelectionSaveError"));
      }
      const channelsResponse = await apiFetch("/channels");
      if (!channelsResponse.ok) throw new Error(t(uiLang, "channelSelectionSaveError"));
      const rows = await channelsResponse.json();
      setChannels(rows);
      if (!prefs.selectedChannelId && data.channels?.[0]) {
        update({ selectedChannelId: String(data.channels[0].id) });
      }
      setSelectionNotice(t(uiLang, "channelSelectionSaved"));
      setSelectionConnectionId("");
      setAvailableChannels([]);
      setSelectedYoutubeIds([]);
      router.replace("/cabinet");
    } catch (error) {
      setSelectionError(error.message || t(uiLang, "channelSelectionSaveError"));
    } finally {
      setSelectionSaving(false);
    }
  }

  function closeChannelSelection() {
    setSelectionConnectionId("");
    setAvailableChannels([]);
    setSelectedYoutubeIds([]);
    setSelectionError("");
    router.replace("/cabinet");
  }

  async function removeChannelFromMoya(channel) {
    if (!window.confirm(t(uiLang, "removeChannelConfirm"))) return;
    const removedId = String(channel.id);
    setRemovingChannelId(removedId);
    setRemoveError("");
    setSelectionNotice("");
    try {
      const response = await apiFetch(`/channels/${channel.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(t(uiLang, "removeChannelError"));

      let remainingChannels = channels.filter((item) => String(item.id) !== removedId);
      let refreshFailed = false;
      try {
        const channelsResponse = await apiFetch("/channels");
        if (!channelsResponse.ok) throw new Error("channel list refresh failed");
        remainingChannels = (await channelsResponse.json()).filter(
          (item) => String(item.id) !== removedId,
        );
      } catch {
        refreshFailed = true;
        setRemoveError(t(uiLang, "removeChannelRefreshError"));
      }

      setChannels(remainingChannels);
      update(prefsAfterChannelRemoval(prefs, removedId, remainingChannels));
      setLangEdit("");
      if (remainingChannels.length === 0) {
        router.replace("/");
      } else if (!refreshFailed) {
        setSelectionNotice(t(uiLang, "removeChannelSuccess"));
      }
    } catch (error) {
      setRemoveError(error.message || t(uiLang, "removeChannelError"));
    } finally {
      setRemovingChannelId("");
    }
  }

  const ch = channels.find((c) => String(c.id) === String(prefs.selectedChannelId)) || channels[0];

  if (session === undefined || !session.authenticated) return null;

  return (
    <Shell>
      <div className="cab">
        <aside className="side">
          <button className={tab === "profile" ? "on" : ""} type="button" onClick={() => setTab("profile")}>
            {t(uiLang, "profile")}
          </button>
          <button className={tab === "channels" ? "on" : ""} type="button" onClick={() => setTab("channels")}>
            {t(uiLang, "channels")}
          </button>
          <button className={tab === "interface" ? "on" : ""} type="button" onClick={() => setTab("interface")}>
            {t(uiLang, "interface")}
          </button>
        </aside>
        <section className="main">
          {tab === "profile" && (
            <div className="panel">
              <p className="section-kicker">{t(uiLang, "profileSection")}</p>
              <h1>{t(uiLang, "profile")}</h1>
              <p className="panel-lead">{t(uiLang, "profileHint")}</p>
              <div className="profile-row">
                <div className="profile-fields">
                  <div className="field">
                    <label>{t(uiLang, "email")}</label>
                    <input value={session.user?.email || ""} readOnly title={t(uiLang, "profileHint")} />
                  </div>
                </div>
                <QuotaRings
                  editsCap={prefs.dailyEdits || 20}
                  editsUsed={prefs.usedEdits || 0}
                  uploadsCap={prefs.dailyUploads || 10}
                  uploadsUsed={prefs.usedUploads || 0}
                />
              </div>
              <h2>{t(uiLang, "aiModelsTitle")}</h2>
              <p className="hint">{t(uiLang, "comingLater")}</p>
              <div className="mock-grid">
                {["OpenAI", "Anthropic", "Google Gemini"].map((provider) => (
                  <div className="provider-row" key={provider} title={t(uiLang, "comingLater")}>
                    <span>{provider}</span>
                    <small>{t(uiLang, "comingLater")}</small>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "channels" && (
            <div className="panel">
              <h1>{t(uiLang, "channels")}</h1>
              <p className="panel-lead">{t(uiLang, "channelListHint")}</p>
              {selectionNotice ? <p className="selection-notice" role="status">{selectionNotice}</p> : null}
              {removeError ? <p className="selection-error" role="alert">{removeError}</p> : null}
              {selectionConnectionId ? (
                <section className="channel-selection" aria-labelledby="channel-selection-title">
                  <h2 id="channel-selection-title">{t(uiLang, "channelSelectionTitleShort")}</h2>
                  <p className="hint">{t(uiLang, "channelSelectionHint")}</p>
                  {selectionLoading ? <p role="status">{t(uiLang, "channelSelectionLoading")}</p> : null}
                  {selectionError ? (
                    <div className="selection-error" role="alert">
                      <span>{selectionError}</span>
                      <button className="btn ghost" type="button" onClick={() => setDiscoveryRetry((n) => n + 1)}>
                        {t(uiLang, "channelSelectionRetry")}
                      </button>
                    </div>
                  ) : null}
                  {!selectionLoading && !selectionError && availableChannels.length === 0 ? (
                    <p>{t(uiLang, "channelSelectionEmpty")}</p>
                  ) : null}
                  <div className="channel-discovery-list">
                    {availableChannels.map((channel) => {
                      const selected = selectedYoutubeIds.includes(channel.youtube_channel_id);
                      return (
                        <label
                          className={`channel-discovery-option ${selected ? "selected" : ""}`}
                          key={channel.youtube_channel_id}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            aria-label={channel.title}
                            onChange={() =>
                              setSelectedYoutubeIds((current) =>
                                selected
                                  ? current.filter((id) => id !== channel.youtube_channel_id)
                                  : [...current, channel.youtube_channel_id],
                              )
                            }
                          />
                          {channel.thumbnail_url ? (
                            <img src={channel.thumbnail_url} alt="" referrerPolicy="no-referrer" />
                          ) : null}
                          <span>
                            <strong>{channel.title}</strong>
                            <small>{channel.youtube_channel_id}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="actions">
                    <button className="btn ghost" type="button" onClick={closeChannelSelection}>
                      {t(uiLang, "channelSelectionCancel")}
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={selectionLoading || selectionSaving || selectedYoutubeIds.length === 0}
                      onClick={saveChannelSelection}
                    >
                      {selectionSaving ? t(uiLang, "channelSelectionSaving") : t(uiLang, "channelSelectionSave")}
                    </button>
                  </div>
                </section>
              ) : null}
              {!selectionConnectionId && channels.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-state-mark" aria-hidden="true">+</span>
                  <h2>{t(uiLang, "noChannelsSaved")}</h2>
                  <p>{t(uiLang, "channelListHint")}</p>
                  <a className="btn" href={apiUrl("/auth/youtube/login")} title={t(uiLang, "tipConnectAnother")}>
                    {t(uiLang, "connectBtn")}
                  </a>
                </div>
              ) : null}
              <div className="chan-split">
                <div className="tiles">
                {channels.map((item) => {
                  const on = String(item.id) === String(prefs.selectedChannelId);
                  return (
                    <div
                      key={item.id}
                      className={`tile ${on ? "on" : ""}`}
                      title={on ? t(uiLang, "selected") : t(uiLang, "tipSelectChannel")}
                      onClick={() => {
                        if (!on) update({ selectedChannelId: String(item.id) });
                      }}
                    >
                      {item.thumbnail_url ? (
                        <img className="tile-logo" referrerPolicy="no-referrer" src={item.thumbnail_url} alt={t(uiLang, "thumbnailAlt")} />
                      ) : (
                        <span className="avatar">{(item.title || "?").slice(0, 1)}</span>
                      )}
                      <strong className="tile-name">{item.title}</strong>
                      <div className="tile-meta">
                        <div className="tile-id-row">
                          <span>ID</span>
                          <em title={item.youtube_channel_id}>{item.youtube_channel_id}</em>
                          <button
                            type="button"
                            className="ico"
                            title={t(uiLang, "tipCopyChannelId")}
                            aria-label={t(uiLang, "tipCopyChannelId")}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(item.youtube_channel_id || "").catch(() => {});
                            }}
                          >
                            ⎘
                          </button>
                        </div>
                        <div>{t(uiLang, "channelCreated")} {item.yt_published_at || "—"}</div>
                        <div>
                          {t(uiLang, "channelLanguage")}{" "}
                          {(CHANNEL_LANGS.find((l) => l.id === (prefs.channelLangs[String(item.id)] || "")) || { label: t(uiLang, "notSet") }).label}
                        </div>
                      </div>
                      <div className="tile-foot">
                        <button
                          type="button"
                          className="ico"
                          title={t(uiLang, "tipSetChannelLanguage")}
                          aria-label={t(uiLang, "tipSetChannelLanguage")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLangEdit(langEdit === String(item.id) ? "" : String(item.id));
                          }}
                        >
                          A
                        </button>
                        {langEdit === String(item.id) ? (
                          <select
                            className="tile-lang-edit"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            value={prefs.channelLangs[String(item.id)] || ""}
                            onChange={(e) => {
                              update({
                                channelLangs: {
                                  ...prefs.channelLangs,
                                  [String(item.id)]: e.target.value,
                                },
                              });
                              setLangEdit("");
                            }}
                          >
                            <option value="">{t(uiLang, "notSet")}</option>
                            {CHANNEL_LANGS.map((lang) => (
                              <option key={lang.id} value={lang.id}>
                                {lang.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {selectionConnectionId || channels.length > 0 ? (
                  <a className="tile add" href={apiUrl("/auth/youtube/login")} title={t(uiLang, "tipConnectAnother")} aria-label={t(uiLang, "tipConnectAnother")}>
                    +
                  </a>
                ) : null}
                </div>
                {ch ? (
                  <article className="chan-card">
                    {ch.banner_url ? (
                      <img className="chan-card-banner" referrerPolicy="no-referrer" src={ch.banner_url} alt={t(uiLang, "bannerAlt")} />
                    ) : null}
                    <div className="chan-card-body">
                      <div className="chan-title-row">
                        <h2 className="chan-name">{ch.title}</h2>
                        <div className="chan-created">
                          <span>{t(uiLang, "channelCreated")}</span>
                          <b>{ch.yt_published_at || "—"}</b>
                        </div>
                      </div>
                      <div className="chan-kpis">
                        <div>
                          <b>{ch.video_count ?? "—"}</b>
                          <span>{t(uiLang, "channelVideos")}</span>
                        </div>
                        <div>
                          <b>{ch.hidden_subscribers ? t(uiLang, "hiddenSubscribers") : (ch.subscriber_count ?? 0)}</b>
                          <span>{t(uiLang, "channelSubscribers")}</span>
                        </div>
                      </div>
                      <p className="chan-desc">{ch.description || t(uiLang, "channelDescriptionEmpty")}</p>
                      <div className="actions">
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={Boolean(removingChannelId)}
                          onClick={() => removeChannelFromMoya(ch)}
                        >
                          {removingChannelId === String(ch.id)
                            ? t(uiLang, "removeChannelBusy")
                            : t(uiLang, "removeChannelAction")}
                        </button>
                      </div>
                    </div>
                  </article>
                ) : null}
              </div>
            </div>
          )}

          {tab === "interface" && (
            <div className="panel">
              <h1>{t(uiLang, "interface")}</h1>
              <div className="grid2">
                <div>
                  <h2>{t(uiLang, "uiLangTitle")}</h2>
                  <div className="opt-list">
                    {PICK_LANGS.map((lang) => (
                      <button
                        key={lang.id}
                        type="button"
                        className={`opt ${prefs.uiLang === lang.id ? "on" : ""}`}
                        title={t(uiLang, "languageHint")}
                        onClick={() => update({ uiLang: lang.id })}
                      >
                        <span className="radio" />
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h2>{t(uiLang, "themeTitle")}</h2>
                  <ThemePicker />
                </div>
              </div>
              <section className="interface-note">
                <h2>{t(uiLang, "studioLayoutTitle")}</h2>
                <p>{t(uiLang, "studioLayoutHint")}</p>
              </section>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
