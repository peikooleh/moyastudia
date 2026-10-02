"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl } from "../../lib/api";
import { t } from "../../lib/i18n";
import {
  accountPrefsForUser,
  CHANNEL_LANGS,
  channelPreferencesForAvailableChannels,
  prefsAfterChannelRemoval,
  UI_LANGS,
} from "../../lib/prefs";
import { ThemePicker } from "../theme-picker";
import { usePrefs } from "../providers";
import { Shell } from "../shell";

const PICK_LANGS = UI_LANGS.filter((language) => language.id !== "auto");

export default function CabinetPage() {
  const { prefs, uiLang, update } = usePrefs();
  const router = useRouter();
  const [tab, setTab] = useState("profile");
  const [channels, setChannels] = useState(null);
  const [connections, setConnections] = useState(null);
  const [session, setSession] = useState(undefined);
  const [sessionError, setSessionError] = useState(false);
  const [sessionRetry, setSessionRetry] = useState(0);
  const [channelsError, setChannelsError] = useState(false);
  const [channelsRetry, setChannelsRetry] = useState(0);
  const [connectionsError, setConnectionsError] = useState(false);
  const [connectionsRetry, setConnectionsRetry] = useState(0);
  const [connectionError, setConnectionError] = useState("");
  const [connectionNotice, setConnectionNotice] = useState("");
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
    const params = new URLSearchParams(window.location.search);
    const connectionId = params.get("select_connection");
    if (connectionId && /^\d+$/.test(connectionId)) {
      setSelectionConnectionId(connectionId);
      setTab("channels");
    }
    const oauthError = params.get("connection_error");
    if (oauthError && [
      "cancelled", "invalid_state", "connection_conflict", "consent_required",
      "connection_failed", "session_expired", "provider_failed", "token_configuration",
      "connection_unavailable",
    ].includes(oauthError)) {
      setConnectionError(t(uiLang, `oauth${oauthError.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())}`));
      setTab("connections");
    }
    if (params.get("connection_status") === "connected") {
      setConnectionNotice(t(uiLang, "connectionSaved"));
    }
    if (oauthError || params.has("connection_status")) router.replace("/cabinet");
  }, [router, uiLang]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/auth/session")
      .then(async (response) => {
        if (!response.ok) throw new Error("session unavailable");
        return response.json();
      })
      .then((status) => {
        if (cancelled) return;
        setSession(status);
        setSessionError(false);
        if (!status.authenticated) router.replace("/");
      })
      .catch(() => {
        if (!cancelled) setSessionError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router, sessionRetry]);

  useEffect(() => {
    const userId = String(session?.user?.id || "");
    if (session?.authenticated && userId && prefs.accountUserId !== userId) {
      update(accountPrefsForUser(userId));
    }
  }, [session, prefs.accountUserId, update]);

  useEffect(() => {
    if (!session?.authenticated) return undefined;
    let cancelled = false;
    setChannels(null);
    setChannelsError(false);
    apiFetch("/channels")
      .then(async (response) => {
        if (!response.ok) {
          const error = new Error("channel list unavailable");
          error.status = response.status;
          throw error;
        }
        return response.json();
      })
      .then((rows) => {
        if (cancelled) return;
        setChannels(rows);
        rows.forEach((channel) => {
          if (!channel.has_token) return;
          apiFetch(`/channels/${channel.id}/refresh-profile`, { method: "POST" })
            .then((response) => (response.ok ? response.json() : null))
            .then((fresh) => {
              if (fresh && !cancelled) {
                setChannels((current) => current.map((item) => (
                  item.id === fresh.id ? { ...item, ...fresh } : item
                )));
              }
            })
            .catch(() => {});
        });
      })
      .catch((error) => {
        if (!cancelled && error.status === 401) {
          router.replace("/");
          return;
        }
        if (!cancelled) {
          setChannels([]);
          setChannelsError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session, channelsRetry, router]);

  useEffect(() => {
    if (!session?.authenticated) return undefined;
    let cancelled = false;
    setConnections(null);
    setConnectionsError(false);
    apiFetch("/google-connections")
      .then(async (response) => {
        if (!response.ok) {
          const error = new Error("Google connections unavailable");
          error.status = response.status;
          throw error;
        }
        return response.json();
      })
      .then((rows) => {
        if (!cancelled) setConnections(rows);
      })
      .catch((error) => {
        if (!cancelled && error.status === 401) {
          router.replace("/");
          return;
        }
        if (!cancelled) {
          setConnections([]);
          setConnectionsError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session, connectionsRetry, router]);

  useEffect(() => {
    if (!session?.authenticated || !selectionConnectionId) return undefined;
    let cancelled = false;
    setSelectionLoading(true);
    setSelectionError("");
    setSelectedYoutubeIds([]);
    apiFetch(`/google-connections/${selectionConnectionId}/available-channels`)
      .then(async (response) => {
        const data = await response.json();
        if (response.status === 401) {
          router.replace("/");
          throw new Error(t(uiLang, "oauthSessionExpired"));
        }
        if (!response.ok) {
          throw new Error(response.status === 400 || response.status === 404
            ? t(uiLang, "oauthConnectionUnavailable")
            : t(uiLang, "channelDiscoveryError"));
        }
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
  }, [session?.authenticated, selectionConnectionId, discoveryRetry, router, uiLang]);

  useEffect(() => {
    if (channels === null || channelsError) return;
    const channelPrefs = channelPreferencesForAvailableChannels(prefs, channels);
    if (channelPrefs) update(channelPrefs);
  }, [channels, channelsError, prefs, update]);

  async function saveChannelSelection() {
    setSelectionSaving(true);
    setSelectionError("");
    try {
      const response = await apiFetch(`/google-connections/${selectionConnectionId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_channel_ids: selectedYoutubeIds }),
      });
      const data = await response.json();
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok) {
        if (response.status === 409) throw new Error(t(uiLang, "channelSelectionConflict"));
        if (response.status === 422) throw new Error(t(uiLang, "channelSelectionUnavailable"));
        throw new Error(t(uiLang, "channelSelectionSaveError"));
      }
      const channelsResponse = await apiFetch("/channels");
      if (channelsResponse.status === 401) {
        router.replace("/");
        return;
      }
      if (!channelsResponse.ok) throw new Error(t(uiLang, "channelSelectionSaveError"));
      const rows = await channelsResponse.json();
      setChannels(rows);
      const connectionsResponse = await apiFetch("/google-connections");
      if (connectionsResponse.status === 401) {
        router.replace("/");
        return;
      }
      if (connectionsResponse.ok) {
        setConnections(await connectionsResponse.json());
        setConnectionsError(false);
      } else {
        setConnectionsError(true);
      }
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

  function selectConnectionChannels(connectionId) {
    setSelectionConnectionId(String(connectionId));
    setTab("channels");
    setSelectionError("");
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
        remainingChannels = (await channelsResponse.json()).filter((item) => String(item.id) !== removedId);
      } catch {
        refreshFailed = true;
        setRemoveError(t(uiLang, "removeChannelRefreshError"));
      }
      setChannels(remainingChannels);
      const connectionsResponse = await apiFetch("/google-connections");
      if (connectionsResponse.ok) setConnections(await connectionsResponse.json());
      update(prefsAfterChannelRemoval(prefs, removedId, remainingChannels));
      if (remainingChannels.length === 0) router.replace("/");
      else if (!refreshFailed) setSelectionNotice(t(uiLang, "removeChannelSuccess"));
    } catch (error) {
      setRemoveError(error.message || t(uiLang, "removeChannelError"));
    } finally {
      setRemovingChannelId("");
    }
  }

  if (sessionError) {
    return (
      <div className="state-screen" role="alert">
        <h1>{t(uiLang, "authSessionLoadError")}</h1>
        <button className="btn ghost" type="button" onClick={() => {
          setSessionError(false);
          setSession(undefined);
          setSessionRetry((current) => current + 1);
        }}>{t(uiLang, "retry")}</button>
      </div>
    );
  }
  if (session === undefined || !session.authenticated) return null;

  const ch = channels?.find((channel) => String(channel.id) === String(prefs.selectedChannelId)) || channels?.[0];
  const connectGoogleUrl = apiUrl(
    connectionError === "oauthConsentRequired"
      ? "/auth/youtube/login?consent_required=true"
      : "/auth/youtube/login",
  );

  return (
    <Shell>
      {channels === null || channelsError ? (
        <div className="state-screen" role={channelsError ? "alert" : "status"}>
          <h1>{t(uiLang, channelsError ? "channelListLoadError" : "loadingChannels")}</h1>
          {channelsError ? <button className="btn ghost" type="button" onClick={() => {
            setChannelsError(false);
            setChannels(null);
            setChannelsRetry((current) => current + 1);
          }}>{t(uiLang, "retry")}</button> : null}
        </div>
      ) : (
        <div className="cab">
          <aside className="side" aria-label={t(uiLang, "cabinet")}>
            {[["profile", "account"], ["connections", "connections"], ["channels", "channels"], ["interface", "interface"]].map(([id, key]) => (
              <button key={id} className={tab === id ? "on" : ""} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
                {t(uiLang, key)}
              </button>
            ))}
          </aside>
          <section className="main">
            {tab === "profile" ? (
              <div className="panel">
                <p className="section-kicker">{t(uiLang, "profileSection")}</p>
                <h1>{t(uiLang, "account")}</h1>
                <p className="panel-lead">{t(uiLang, "profileHint")}</p>
                <div className="profile-fields field">
                  <label>{t(uiLang, "email")}</label>
                  <input value={session.user?.email || ""} readOnly title={t(uiLang, "profileHint")} />
                </div>
              </div>
            ) : null}

            {tab === "connections" ? (
              <div className="panel">
                <h1>{t(uiLang, "connections")}</h1>
                <p className="panel-lead">{t(uiLang, "connectionsHint")}</p>
                {connectionError ? (
                  <p className="selection-error" role="alert">{t(uiLang, connectionError)}</p>
                ) : null}
                {connectionNotice ? <p className="selection-notice" role="status">{connectionNotice}</p> : null}
                <div className="connection-list">
                  {connections === null ? <p role="status">{t(uiLang, "loadingConnections")}</p> : null}
                  {connectionsError ? (
                    <div className="selection-error" role="alert">
                      <span>{t(uiLang, "connectionsLoadError")}</span>
                      <button className="btn ghost" type="button" onClick={() => setConnectionsRetry((value) => value + 1)}>{t(uiLang, "retry")}</button>
                    </div>
                  ) : null}
                  {connections?.map((connection) => (
                    <article className="connection-row" key={connection.id}>
                      <div>
                        <strong>{connection.email || t(uiLang, "connectionAccountUnknown")}</strong>
                        <span className={`connection-status ${connection.status}`}>
                          {t(uiLang, connection.status === "connected" ? "connectionStatusConnected" : "connectionStatusReauthorization")}
                        </span>
                        <span>{t(uiLang, "connectedChannelsCount", { count: connection.channel_count })}</span>
                      </div>
                      {connection.channels.length ? (
                        <ul className="connection-channels">
                          {connection.channels.map((channel) => <li key={channel.id}>{channel.title}</li>)}
                        </ul>
                      ) : <p>{t(uiLang, "connectionNoChannels")}</p>}
                      <div className="actions">
                        <button className="btn ghost" type="button" disabled={connectionsError || connection.status !== "connected"} onClick={() => selectConnectionChannels(connection.id)}>
                          {t(uiLang, "selectConnectionChannels")}
                        </button>
                        {connection.status === "reauthorization_required" ? (
                          <a className="btn ghost" href={apiUrl(`/auth/youtube/login?reconnect_connection_id=${connection.id}`)}>
                            {t(uiLang, "reauthorizeConnection")}
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))}
                  {connections?.length === 0 && !connectionsError ? <p className="empty-block">{t(uiLang, "noConnections")}</p> : null}
                </div>
                <a className="btn ghost" href={connectGoogleUrl}>{t(uiLang, connections?.length ? "connectAnother" : "connectBtn")}</a>
              </div>
            ) : null}

            {tab === "channels" ? (
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
                    {selectionError ? <div className="selection-error" role="alert"><span>{selectionError}</span><button className="btn ghost" type="button" onClick={() => setDiscoveryRetry((value) => value + 1)}>{t(uiLang, "channelSelectionRetry")}</button></div> : null}
                    {!selectionLoading && !selectionError && !availableChannels.length ? <p>{t(uiLang, "channelSelectionEmpty")}</p> : null}
                    <div className="channel-discovery-list">
                      {availableChannels.map((channel) => {
                        const selected = selectedYoutubeIds.includes(channel.youtube_channel_id);
                        return (
                          <label className={`channel-discovery-option ${selected ? "selected" : ""}`} key={channel.youtube_channel_id}>
                            <input type="checkbox" checked={selected} aria-label={channel.title} onChange={() => setSelectedYoutubeIds((current) => selected ? current.filter((id) => id !== channel.youtube_channel_id) : [...current, channel.youtube_channel_id])} />
                            {channel.thumbnail_url ? <img src={channel.thumbnail_url} alt="" referrerPolicy="no-referrer" /> : null}
                            <span><strong>{channel.title}</strong></span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="actions">
                      <button className="btn ghost" type="button" onClick={closeChannelSelection}>{t(uiLang, "channelSelectionCancel")}</button>
                      <button className="btn" type="button" disabled={selectionLoading || selectionSaving || !selectedYoutubeIds.length} onClick={saveChannelSelection}>{selectionSaving ? t(uiLang, "channelSelectionSaving") : t(uiLang, "channelSelectionSave")}</button>
                    </div>
                  </section>
                ) : null}
                <div className="channel-management">
                  <div className="channel-option-list">
                    {connections === null ? <p role="status">{t(uiLang, "loadingConnections")}</p> : null}
                    {connectionsError ? (
                      <div className="selection-error" role="alert">
                        <span>{t(uiLang, "connectionsLoadError")}</span>
                        <button className="btn ghost" type="button" onClick={() => setConnectionsRetry((value) => value + 1)}>{t(uiLang, "retry")}</button>
                      </div>
                    ) : null}
                    {connections?.map((connection) => (
                      <section className="channel-group" key={connection.id}>
                        <header>
                          <strong>{connection.email || t(uiLang, "connectionAccountUnknown")}</strong>
                          <span>{t(uiLang, "connectionStatusLabel")}: {t(uiLang, connection.status === "connected" ? "connectionStatusConnected" : "connectionStatusReauthorization")}</span>
                        </header>
                        {connection.channels.map((item) => {
                          const selected = String(item.id) === String(prefs.selectedChannelId);
                          const profile = channels?.find((channel) => String(channel.id) === String(item.id)) || item;
                          const subscriberCount = profile.hidden_subscribers
                            ? t(uiLang, "channelSubscribersHidden")
                            : profile.subscriber_count != null
                              ? t(uiLang, "channelSubscribersCount", { count: profile.subscriber_count })
                              : "";
                          const videoCount = profile.video_count != null
                            ? t(uiLang, "channelVideoCount", { count: profile.video_count })
                            : profile.catalog_video_count != null
                              ? t(uiLang, "catalogVideoCount", { count: profile.catalog_video_count })
                              : "";
                          return (
                            <button key={item.id} type="button" className={`channel-option ${selected ? "on" : ""}`} aria-pressed={selected} onClick={() => update({ selectedChannelId: String(item.id) })}>
                              {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" referrerPolicy="no-referrer" /> : <span className="avatar" aria-hidden="true">{(item.title || "?").slice(0, 1)}</span>}
                              <span className="channel-option-copy">
                                <strong>{item.title}</strong>
                                {subscriberCount ? <small>{subscriberCount}</small> : null}
                                {videoCount ? <small>{videoCount}</small> : null}
                              </span>
                              <span className="channel-option-status">{selected ? t(uiLang, "selected") : t(uiLang, "tipSelectChannel")}</span>
                            </button>
                          );
                        })}
                        {connection.channels.length === 0 ? <p className="empty-block">{t(uiLang, "connectionNoChannels")}</p> : null}
                        <button className="text-button" type="button" onClick={() => selectConnectionChannels(connection.id)}>{t(uiLang, "selectConnectionChannels")}</button>
                      </section>
                    ))}
                    {connectionsError ? <p className="selection-error" role="alert">{t(uiLang, "connectionsLoadError")}</p> : null}
                  </div>
                  <a className="btn ghost connect-channel-link" href={apiUrl("/auth/youtube/login")}>{t(uiLang, "connectAnother")}</a>
                  {ch ? (
                    <article className="chan-card">
                      <header className="channel-detail-heading">
                        {ch.thumbnail_url ? <img src={ch.thumbnail_url} alt="" referrerPolicy="no-referrer" /> : null}
                        <div><h2>{ch.title}</h2><span>{t(uiLang, "selected")}</span></div>
                      </header>
                      <label className="inline channel-language-control">{t(uiLang, "channelLanguage")}
                        <select value={prefs.channelLangs[String(ch.id)] || ""} onChange={(event) => update({ channelLangs: { ...prefs.channelLangs, [String(ch.id)]: event.target.value } })}>
                          <option value="">{t(uiLang, "notSet")}</option>
                          {CHANNEL_LANGS.map((language) => <option key={language.id} value={language.id}>{language.label}</option>)}
                        </select>
                      </label>
                      <details className="channel-details">
                        <summary>{t(uiLang, "channelDetails")}</summary>
                        {ch.banner_url ? <img className="chan-card-banner" src={ch.banner_url} alt={t(uiLang, "bannerAlt")} referrerPolicy="no-referrer" /> : null}
                        <dl className="inspector-data"><div><dt>{t(uiLang, "channelCreated")}</dt><dd>{ch.yt_published_at || "—"}</dd></div></dl>
                        <p className="chan-desc">{ch.description || t(uiLang, "channelDescriptionEmpty")}</p>
                      </details>
                      <div className="actions"><button className="btn ghost" type="button" disabled={Boolean(removingChannelId)} onClick={() => removeChannelFromMoya(ch)}>{removingChannelId === String(ch.id) ? t(uiLang, "removeChannelBusy") : t(uiLang, "removeChannelAction")}</button></div>
                    </article>
                  ) : null}
                  {!channels.length && !selectionConnectionId ? <div className="empty-state"><h2>{t(uiLang, "noChannelsSaved")}</h2><p>{t(uiLang, "channelListHint")}</p><a className="btn" href={connectGoogleUrl}>{t(uiLang, "connectBtn")}</a></div> : null}
                </div>
              </div>
            ) : null}

            {tab === "interface" ? (
              <div className="panel">
                <h1>{t(uiLang, "interface")}</h1>
                <div className="grid2">
                  <div><h2>{t(uiLang, "uiLangTitle")}</h2><div className="opt-list">{PICK_LANGS.map((language) => <button key={language.id} type="button" className={`opt ${prefs.uiLang === language.id ? "on" : ""}`} onClick={() => update({ uiLang: language.id })}><span className="radio" />{language.label}</button>)}</div></div>
                  <div><h2>{t(uiLang, "themeTitle")}</h2><ThemePicker /></div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </Shell>
  );
}