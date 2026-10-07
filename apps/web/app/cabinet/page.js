"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl } from "../../lib/api";
import { t } from "../../lib/i18n";
import {
  accountPrefsForUser,
  CHANNEL_LANGS,
  channelDisplayContext,
  channelDisplayLabel,
  channelPreferenceKey,
  channelPreferencesForAvailableChannels,
  prefsAfterChannelRemoval,
} from "../../lib/prefs";
import { usePrefs } from "../providers";
import { Shell } from "../shell";

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
  const [channelLanguageSaving, setChannelLanguageSaving] = useState(false);
  const [channelLanguageError, setChannelLanguageError] = useState("");
  const migratedChannelLanguages = useRef(new Set());
  const [aiConnections, setAiConnections] = useState([]);
  const [aiProvider, setAiProvider] = useState("openai");
  const [aiModel, setAiModel] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiTitlePrompt, setAiTitlePrompt] = useState("");
  const [aiDescriptionPrompt, setAiDescriptionPrompt] = useState("");
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiNotice, setAiNotice] = useState("");
  const [aiError, setAiError] = useState("");

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
      setTab("channels");
    }
    if (params.get("connection_status") === "connected") {
      setConnectionNotice(t(uiLang, "connectionSaved"));
      setTab("channels");
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

  useEffect(() => {
    if (!channels?.length) return;
    channels.forEach((channel) => {
      if (channel.working_language || migratedChannelLanguages.current.has(String(channel.id))) return;
      const savedLanguage = prefs.channelLangs[channelPreferenceKey(channel)] || "";
      if (!savedLanguage) return;
      migratedChannelLanguages.current.add(String(channel.id));
      apiFetch(`/channels/${channel.id}/working-language`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: savedLanguage }),
      })
        .then((response) => {
          if (!response.ok) return null;
          return response.json();
        })
        .then((updated) => {
          if (!updated?.working_language) return;
          setChannels((current) => current?.map((item) => (
            String(item.id) === String(channel.id)
              ? { ...item, working_language: updated.working_language }
              : item
          )));
        })
        .catch(() => {});
    });
  }, [channels, prefs.channelLangs]);

  useEffect(() => {
    if (!session?.authenticated) return undefined;
    let cancelled = false;
    apiFetch("/ai-connections")
      .then(async (response) => {
        if (!response.ok) throw new Error(t(uiLang, "aiLoadError"));
        return response.json();
      })
      .then((rows) => {
        if (cancelled) return;
        setAiConnections(rows);
        if (rows[0]) {
          setAiProvider(rows[0].provider);
          setAiModel(rows[0].model);
          setAiTitlePrompt(rows[0].title_prompt || "");
          setAiDescriptionPrompt(rows[0].description_prompt || "");
        }
      })
      .catch((error) => { if (!cancelled) setAiError(error.message); });
    return () => { cancelled = true; };
  }, [session?.authenticated, uiLang]);

  function selectAiModel(provider, model) {
    setAiProvider(provider);
    setAiModel(model);
    setAiApiKey("");
    const saved = aiConnections.find((item) => item.provider === provider && item.model === model);
    setAiTitlePrompt(saved?.title_prompt || "");
    setAiDescriptionPrompt(saved?.description_prompt || "");
    setAiNotice("");
    setAiError("");
  }

  function cancelAiSettings() {
    const saved = aiConnections.find(
      (item) => item.provider === aiProvider && item.model === aiModel.trim(),
    );
    setAiTitlePrompt(saved?.title_prompt || "");
    setAiDescriptionPrompt(saved?.description_prompt || "");
    setAiApiKey("");
    setAiError("");
    setAiNotice("");
    setAiSettingsOpen(false);
  }

  async function saveAiConnection() {
    if (!aiModel.trim()) {
      setAiError(t(uiLang, "aiModelRequired"));
      return;
    }
    const saved = aiConnections.find((item) => item.provider === aiProvider && item.model === aiModel.trim());
    if (!saved?.has_api_key && !aiApiKey.trim()) {
      setAiError(t(uiLang, "aiApiKeyRequired"));
      return;
    }
    setAiSaving(true);
    setAiError("");
    setAiNotice("");
    try {
      const response = await apiFetch("/ai-connections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel.trim(),
          api_key: aiApiKey.trim() || null,
          title_prompt: aiTitlePrompt,
          description_prompt: aiDescriptionPrompt,
        }),
      });
      if (!response.ok) throw new Error(t(uiLang, "aiSaveError"));
      const row = await response.json();
      setAiConnections((current) => [...current.filter((item) => item.id !== row.id), row]);
      setAiApiKey("");
      setAiNotice(t(uiLang, "aiSaved"));
    } catch (error) {
      setAiError(error.message || t(uiLang, "aiSaveError"));
    } finally {
      setAiSaving(false);
    }
  }

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

  async function saveChannelWorkingLanguage(channel, language) {
    const key = channelPreferenceKey(channel);
    const previousLanguage = channel.working_language || prefs.channelLangs[key] || "";
    setChannelLanguageSaving(true);
    setChannelLanguageError("");
    update({ channelLangs: { ...prefs.channelLangs, [key]: language } });
    setChannels((current) => current?.map((item) => (
      String(item.id) === String(channel.id) ? { ...item, working_language: language } : item
    )));
    try {
      const response = await apiFetch(`/channels/${channel.id}/working-language`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (!response.ok) throw new Error(t(uiLang, "channelLanguageSaveError"));
    } catch (error) {
      update({ channelLangs: { ...prefs.channelLangs, [key]: previousLanguage } });
      setChannels((current) => current?.map((item) => (
        String(item.id) === String(channel.id) ? { ...item, working_language: previousLanguage } : item
      )));
      setChannelLanguageError(error.message || t(uiLang, "channelLanguageSaveError"));
    } finally {
      setChannelLanguageSaving(false);
    }
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
      const nextPrefs = prefsAfterChannelRemoval(prefs, removedId, remainingChannels);
      const stablePreferenceKey = channelPreferenceKey(channel);
      if (stablePreferenceKey !== removedId) delete nextPrefs.channelLangs[stablePreferenceKey];
      update(nextPrefs);
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
        <div className="cab cabinet-workspace">
          <nav className="cabinet-tabs" aria-label={t(uiLang, "cabinet")}>
            {[["profile", "account"], ["channels", "channelsConnections"]].map(([id, key]) => (
              <button key={id} className={tab === id ? "on" : ""} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
                {t(uiLang, key)}
              </button>
            ))}
          </nav>
          <section className="main">
            {tab === "profile" ? (
              <div className="panel">
                <p className="section-kicker">{t(uiLang, "profileSection")}</p>
                <h1>{t(uiLang, "account")}</h1>
                <div className="profile-fields field">
                  <label>{t(uiLang, "email")}</label>
                  <div className="readonly-value" role="status">{session.user?.email || "—"}</div>
                </div>
                <section className="ai-connections-panel" aria-labelledby="ai-connections-title">
                  <h2 id="ai-connections-title">{t(uiLang, "aiConnections")}</h2>
                  <p className="panel-lead">{t(uiLang, "aiConnectionsHint")}</p>
                  <div className="ai-connection-grid">
                    <label title={t(uiLang, "aiProviderHint")}>{t(uiLang, "aiProvider")}<select value={aiProvider} onChange={(event) => selectAiModel(event.target.value, "")}><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="anthropic">Anthropic</option></select></label>
                    <label title={t(uiLang, "aiModelHint")}>{t(uiLang, "aiModel")}<input value={aiModel} onChange={(event) => selectAiModel(aiProvider, event.target.value)} placeholder={t(uiLang, "aiModelPlaceholder")} /></label>
                    <label title={t(uiLang, "aiApiKeyHint")}>{t(uiLang, "aiApiKey")}<input type="password" value={aiApiKey} onChange={(event) => setAiApiKey(event.target.value)} placeholder={aiConnections.some((item) => item.provider === aiProvider && item.model === aiModel && item.has_api_key) ? t(uiLang, "aiApiKeySaved") : "••••••••••••"} autoComplete="off" /></label>
                    <button className={`btn ghost ai-settings-button ${aiSettingsOpen ? "active" : ""}`} type="button" title={t(uiLang, "aiSettings")} onClick={() => (aiSettingsOpen ? cancelAiSettings() : setAiSettingsOpen(true))} aria-expanded={aiSettingsOpen}>⚙ {t(uiLang, "aiSettings")}</button>
                  </div>
                  {aiSettingsOpen ? (
                    <div className="ai-model-settings">
                      <h3>{t(uiLang, "aiModelSettings")}</h3>
                      <label>{t(uiLang, "aiTitlePrompt")}<textarea value={aiTitlePrompt} onChange={(event) => setAiTitlePrompt(event.target.value)} placeholder={t(uiLang, "aiTitlePromptPlaceholder")} /></label>
                      <label>{t(uiLang, "aiDescriptionPrompt")}<textarea value={aiDescriptionPrompt} onChange={(event) => setAiDescriptionPrompt(event.target.value)} placeholder={t(uiLang, "aiDescriptionPromptPlaceholder")} /></label>
                    </div>
                  ) : null}
                  {aiError ? <p className="selection-error" role="alert">{aiError}</p> : null}
                  {aiNotice ? <p className="selection-notice" role="status">{aiNotice}</p> : null}
                  <div className="ai-connection-actions">{aiSettingsOpen ? <button className="btn ghost" type="button" disabled={aiSaving} onClick={cancelAiSettings}>{t(uiLang, "actionCancel")}</button> : null}<button className="btn" type="button" disabled={aiSaving} onClick={saveAiConnection}>{aiSaving ? t(uiLang, "aiSaving") : t(uiLang, "aiSave")}</button></div>
                </section>
              </div>
            ) : null}

            {tab === "channels" ? (
              <div className="panel">
                <h1>{t(uiLang, "channelsConnections")}</h1>
                <p className="panel-lead">{t(uiLang, "channelsConnectionsHint")}</p>
                {connectionError ? <p className="selection-error" role="alert">{t(uiLang, connectionError)}</p> : null}
                {connectionError === "oauthConsentRequired" ? (
                  <a className="btn ghost" href={apiUrl("/auth/youtube/login?consent_required=true")}>{t(uiLang, "oauthConsentRetry")}</a>
                ) : null}
                {connectionNotice ? <p className="selection-notice" role="status">{connectionNotice}</p> : null}
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
                            <span>
                              <strong>{channel.title}</strong>
                              <small>{channelDisplayContext(channel)}</small>
                            </span>
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
                    {connections?.filter((connection) => connection.channels.length > 0).map((connection) => (
                      <section className="channel-group" key={connection.id}>
                        <header>
                          <div className="channel-group-account">
                            <span className="channel-group-type">{t(uiLang, "googleAccountLabel")}</span>
                            <strong className="channel-group-email" title={connection.email || t(uiLang, "connectionAccountUnknown")}>{connection.email || t(uiLang, "connectionAccountUnknown")}</strong>
                            {connection.status === "reauthorization_required" ? (
                              <span className={`connection-status ${connection.status}`}>
                                {t(uiLang, "connectionStatusReauthorization")}
                              </span>
                            ) : null}
                            
                          </div>
                          <div className="channel-group-actions">
                            {connection.status === "reauthorization_required" ? (
                              <a className="btn ghost" href={apiUrl(`/auth/youtube/login?reconnect_connection_id=${connection.id}`)}>
                                {t(uiLang, "reauthorizeConnection")}
                              </a>
                            ) : null}
                            <button className="channel-add-button" type="button" title={t(uiLang, "addYoutubeChannelsHint")} aria-label={t(uiLang, "addYoutubeChannelsHint")} onClick={() => selectConnectionChannels(connection.id)}>+</button>
                          </div>
                        </header>
                        <div className="channel-group-list-label">{t(uiLang, "youtubeChannelsLabel")}</div>
                        {connection.channels.map((item) => {
                          const selected = String(item.id) === String(prefs.selectedChannelId);
                          const profile = channels?.find((channel) => String(channel.id) === String(item.id)) || item;
                          const createdAt = profile.yt_published_at || "";
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`channel-option ${selected ? "on" : ""}`}
                              aria-pressed={selected}
                              title={selected ? t(uiLang, "activeStudioChannel") : t(uiLang, "switchStudioChannel")}
                              onClick={() => {
                                if (selected || !window.confirm(t(uiLang, "confirmChannelSwitch", { channel: channelDisplayLabel(item) }))) return;
                                update({ selectedChannelId: String(item.id) });
                              }}
                            >
                              {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" referrerPolicy="no-referrer" /> : <span className="avatar" aria-hidden="true">{(item.title || "?").slice(0, 1)}</span>}
                              <span className="channel-option-copy">
                                <strong>{item.title}</strong>
                                <small>{channelDisplayContext(item)}</small>
                                {createdAt ? <small>{t(uiLang, "channelCreated")}: {String(createdAt).slice(0, 10)}</small> : null}
                              </span>
                            </button>
                          );
                        })}
                        {connection.channels.length === 0 ? <p className="empty-block">{t(uiLang, "connectionNoChannels")}</p> : null}
                      </section>
                    ))}
                    {connectionsError ? <p className="selection-error" role="alert">{t(uiLang, "connectionsLoadError")}</p> : null}
                    <div className="channel-list-footer">
                      <a className="text-button channel-connect-account" href={apiUrl("/auth/youtube/login")}>+ {t(uiLang, channels.length ? "connectAnother" : "connectBtn")}</a>
                    </div>
                  </div>
                  <div className="selected-channel-column">
                  {ch ? (
                    <article className="chan-card">
                      <header className="channel-detail-heading">
                        {ch.thumbnail_url ? <img src={ch.thumbnail_url} alt="" referrerPolicy="no-referrer" /> : null}
                        <div><div className="channel-current-badge">{t(uiLang, "activeStudioChannel")}</div><h2>{ch.title}</h2><small>{channelDisplayContext(ch)}</small></div>
                      </header>
                      {ch.banner_url ? <img className="chan-card-banner" src={ch.banner_url} alt={t(uiLang, "bannerAlt")} referrerPolicy="no-referrer" /> : null}
                      <dl className="channel-metrics">
                        <div><dt>{t(uiLang, "channelVideos")}</dt><dd>{ch.catalog_video_count ?? "—"}</dd></div>
                        <div><dt>{t(uiLang, "channelSubscribers")}</dt><dd>{ch.hidden_subscribers ? t(uiLang, "channelSubscribersHidden") : (ch.subscriber_count ?? "—")}</dd></div>
                        <div><dt>{t(uiLang, "channelLikes")}</dt><dd>{ch.catalog_like_count ?? "—"}</dd></div>
                      </dl>
                      <p className="chan-desc">{ch.description || t(uiLang, "channelDescriptionEmpty")}</p>
                    </article>
                  ) : null}
                  </div>
                  <div className="channel-settings-column">
                    {ch ? (
                      <section className="channel-settings-panel">
                        <h2>{t(uiLang, "channelSettings")}</h2>
                        <label className="inline channel-language-control">{t(uiLang, "channelLanguage")}
                          <select value={ch.working_language || prefs.channelLangs[channelPreferenceKey(ch)] || ""} disabled={channelLanguageSaving} onChange={(event) => saveChannelWorkingLanguage(ch, event.target.value)}>
                            <option value="">{t(uiLang, "notSet")}</option>
                            {CHANNEL_LANGS.map((language) => <option key={language.id} value={language.id}>{language.label}</option>)}
                          </select>
                        </label>
                        {channelLanguageError ? <p className="selection-error" role="alert">{channelLanguageError}</p> : null}
                        <div className="channel-remove-actions"><button className="btn ghost channel-remove-button" type="button" title={t(uiLang, "removeChannelHint")} disabled={Boolean(removingChannelId)} onClick={() => removeChannelFromMoya(ch)}>{removingChannelId === String(ch.id) ? t(uiLang, "removeChannelBusy") : t(uiLang, "removeChannelAction")}</button></div>
                      </section>
                    ) : null}
                  </div>
                  {!channels.length && !connections?.length && !selectionConnectionId ? <div className="empty-state"><h2>{t(uiLang, "noConnections")}</h2><p>{t(uiLang, "channelsConnectionsHint")}</p></div> : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </Shell>
  );
}
