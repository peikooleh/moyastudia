"use client";

const AI_MODEL_CATALOG = {
  gemini: [
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", description: "Экономичная · доступность бесплатного тарифа зависит от проекта" },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", description: "Быстрая универсальная · тариф зависит от аккаунта" },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", description: "Предыдущее поколение · доступность зависит от проекта" },
  ],
  openai: [
    { id: "gpt-5-mini", name: "GPT-5 mini", description: "Экономичная · платный API" },
    { id: "gpt-5", name: "GPT-5", description: "Мощная · платный API" },
  ],
  anthropic: [
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", description: "Быстрая · платный API" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", description: "Качественная универсальная · платный API" },
  ],
  groq: [
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", description: "GroqCloud · бесплатный тариф с лимитами" },
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", description: "GroqCloud · бесплатный тариф с лимитами" },
  ],
  xai: [
    { id: "grok-4.3", name: "Grok 4.3", description: "Быстрая · платный API" },
    { id: "grok-4.7", name: "Grok 4.7", description: "Флагманская · платный API" },
  ],
};

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

function connectionDisplayName(connection) {
  const email = String(connection?.email || "").trim();
  if (/@pages\./i.test(email)) {
    return connection?.channels?.[0]?.title || email.split("@")[0] || email;
  }
  return email;
}

function aiModelDisplayName(connection) {
  const names = {
    "gemini-3.6-flash": "Gemini 3.6 Flash",
    "gemini-3.6-pro": "Gemini 3.6 Pro",
    "openai/gpt-oss-120b": "GPT-OSS 120B",
    "openai/gpt-oss-20b": "GPT-OSS 20B",
    "grok-4.3": "Grok 4.3",
  };
  return names[connection?.model] || connection?.model || "";
}

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
  const [writeMode, setWriteMode] = useState({ enabled: false });
  const [channelEditing, setChannelEditing] = useState(false);
  const [channelDescriptionDraft, setChannelDescriptionDraft] = useState("");
  const [channelKeywordsDraft, setChannelKeywordsDraft] = useState("");
  const [channelDescriptionSaving, setChannelDescriptionSaving] = useState(false);
  const [channelDescriptionError, setChannelDescriptionError] = useState("");
  const [channelShareNotice, setChannelShareNotice] = useState("");
  const migratedChannelLanguages = useRef(new Set());
  const [aiConnections, setAiConnections] = useState([]);
  const [selectedAiConnectionId, setSelectedAiConnectionId] = useState(null);
  const [aiImproveMenu, setAiImproveMenu] = useState("");
  const [aiProvider, setAiProvider] = useState("openai");
  const [aiModel, setAiModel] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiTitlePrompt, setAiTitlePrompt] = useState("");
  const [aiDescriptionPrompt, setAiDescriptionPrompt] = useState("");
  const [aiTagsPrompt, setAiTagsPrompt] = useState("");
  const [aiShortsTitlePrompt, setAiShortsTitlePrompt] = useState("");
  const [aiShortsDescriptionPrompt, setAiShortsDescriptionPrompt] = useState("");
  const [aiShortsTagsPrompt, setAiShortsTagsPrompt] = useState("");
  const [aiPromptTab, setAiPromptTab] = useState("long");
  const [aiBusy, setAiBusy] = useState("");
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiNotice, setAiNotice] = useState("");
  const [aiError, setAiError] = useState("");
  const AI_PROMPT_CHAR_LIMIT = 12000;
  const [aiBaseline, setAiBaseline] = useState(null);

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
    setChannelEditing(false);
    setChannelDescriptionDraft("");
    setChannelKeywordsDraft("");
    setChannelDescriptionError("");
    setChannelLanguageError("");
    setChannelShareNotice("");
  }, [prefs.selectedChannelId]);

  useEffect(() => {
    if (!session?.authenticated) return undefined;
    let cancelled = false;
    const syncWriteMode = (event) => {
      if (!cancelled && event.detail) setWriteMode(event.detail);
    };
    window.addEventListener("moyastudia:write-mode", syncWriteMode);
    apiFetch("/write-mode")
      .then((response) => (response.ok ? response.json() : { enabled: false }))
      .then((status) => { if (!cancelled) setWriteMode(status); })
      .catch(() => { if (!cancelled) setWriteMode({ enabled: false }); });
    return () => {
      cancelled = true;
      window.removeEventListener("moyastudia:write-mode", syncWriteMode);
    };
  }, [session?.authenticated]);

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
        const savedId = Number(window.localStorage.getItem("moyastudia.aiConnectionId") || 0);
        const improveConnection = rows.find((item) => item.id === savedId) || rows[0] || null;
        setSelectedAiConnectionId(improveConnection?.id || null);
        if (rows[0]) {
          setAiProvider(rows[0].provider);
          setAiModel(rows[0].model);
          setAiTitlePrompt(rows[0].title_prompt || "");
          setAiDescriptionPrompt(rows[0].description_prompt || "");
          setAiTagsPrompt(rows[0].tags_prompt || "");
          setAiShortsTitlePrompt(rows[0].shorts_title_prompt || "");
          setAiShortsDescriptionPrompt(rows[0].shorts_description_prompt || "");
          setAiShortsTagsPrompt(rows[0].shorts_tags_prompt || "");
          setAiBaseline({
            provider: rows[0].provider,
            model: rows[0].model,
            titlePrompt: rows[0].title_prompt || "",
            descriptionPrompt: rows[0].description_prompt || "",
            tagsPrompt: rows[0].tags_prompt || "",
            shortsTitlePrompt: rows[0].shorts_title_prompt || "",
            shortsDescriptionPrompt: rows[0].shorts_description_prompt || "",
            shortsTagsPrompt: rows[0].shorts_tags_prompt || "",
          });
        } else {
          setAiBaseline({ provider: "openai", model: "", titlePrompt: "", descriptionPrompt: "", tagsPrompt: "" });
        }
      })
      .catch((error) => { if (!cancelled) setAiError(error.message); });
    return () => { cancelled = true; };
  }, [session?.authenticated, uiLang]);

  function selectAiModel(provider, model) {
    setAiProvider(provider);
    setAiModel(model);
    setAiApiKey("");
    setAiNotice("");
    setAiError("");
  }

  function cancelAiSettings() {
    if (!aiBaseline) return;
    setAiProvider(aiBaseline.provider);
    setAiModel(aiBaseline.model);
    setAiTitlePrompt(aiBaseline.titlePrompt);
    setAiDescriptionPrompt(aiBaseline.descriptionPrompt);
    setAiTagsPrompt(aiBaseline.tagsPrompt || "");
    setAiShortsTitlePrompt(aiBaseline.shortsTitlePrompt || "");
    setAiShortsDescriptionPrompt(aiBaseline.shortsDescriptionPrompt || "");
    setAiShortsTagsPrompt(aiBaseline.shortsTagsPrompt || "");
    setAiApiKey("");
    setAiError("");
    setAiNotice("");
  }

  const aiDirty = Boolean(aiBaseline) && (
    aiProvider !== aiBaseline.provider
    || aiModel !== aiBaseline.model
    || aiTitlePrompt !== aiBaseline.titlePrompt
    || aiDescriptionPrompt !== aiBaseline.descriptionPrompt
    || aiTagsPrompt !== (aiBaseline.tagsPrompt || "")
    || aiShortsTitlePrompt !== (aiBaseline.shortsTitlePrompt || "")
    || aiShortsDescriptionPrompt !== (aiBaseline.shortsDescriptionPrompt || "")
    || aiShortsTagsPrompt !== (aiBaseline.shortsTagsPrompt || "")
    || Boolean(aiApiKey.trim())
  );

  function updateAiKey(value) {
    setAiApiKey(value);
    const provider = value.startsWith("sk-ant-") ? "anthropic" : value.startsWith("AIza") ? "gemini" : value.startsWith("sk-") ? "" : "";
    if (provider) {
      setAiProvider(provider);
      setAiModel("");
    }
  }

  async function improveChannelField(field, value) {
    if (aiBusy || channelDescriptionSaving) return;
    const channelId = String(prefs.selectedChannelId || "");
    setAiBusy(`channel:${field}`);
    setChannelDescriptionError("");
    try {
      const response = await apiFetch("/ai/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "channel", field, value, connection_id: selectedAiConnectionId || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(t(uiLang, data?.detail?.code || "aiImproveFailed"));
      if (String(prefs.selectedChannelId || "") !== channelId) return;
      if (field === "description") setChannelDescriptionDraft(data.value);
      else setChannelKeywordsDraft(data.value);
    } catch (error) {
      setChannelDescriptionError(error.message || t(uiLang, "aiImproveFailed"));
    } finally {
      setAiBusy("");
    }
  }

  async function deleteAiConnection() {
    const saved = aiConnections.find((item) => item.provider === aiProvider && item.model === aiModel);
    if (!saved?.id || aiSaving) return;
    if (!window.confirm(t(uiLang, "aiDeleteConnectionConfirm"))) return;
    setAiSaving(true);
    setAiError("");
    setAiNotice("");
    try {
      const response = await apiFetch(`/ai-connections/${saved.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`${t(uiLang, "aiDeleteConnectionError")} (HTTP ${response.status})`);
      const remaining = aiConnections.filter((item) => item.id !== saved.id);
      setAiConnections(remaining);
      const next = remaining[0];
      setAiProvider(next?.provider || "groq");
      setAiModel(next?.model || "");
      setAiApiKey("");
      setAiBaseline({ provider: next?.provider || "groq", model: next?.model || "",
        titlePrompt: aiTitlePrompt, descriptionPrompt: aiDescriptionPrompt, tagsPrompt: aiTagsPrompt });
      if (selectedAiConnectionId === saved.id) {
        setSelectedAiConnectionId(next?.id || null);
        if (next?.id) window.localStorage.setItem("moyastudia.aiConnectionId", String(next.id));
        else window.localStorage.removeItem("moyastudia.aiConnectionId");
      }
      setAiNotice(t(uiLang, "aiDeleteConnectionSuccess"));
    } catch (error) {
      setAiError(error.message || t(uiLang, "aiDeleteConnectionError"));
    } finally {
      setAiSaving(false);
    }
  }

  async function saveAiConnection() {
    if (!aiProvider && !aiApiKey.trim()) {
      setAiError(t(uiLang, "aiModelRequired"));
      return;
    }
    const saved = aiConnections.find((item) => item.provider === aiProvider && (!aiModel || item.model === aiModel.trim()));
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
          model: aiModel.trim() || null,
          api_key: aiApiKey.trim() || null,
          title_prompt: aiTitlePrompt,
          description_prompt: aiDescriptionPrompt,
          tags_prompt: aiTagsPrompt,
          shorts_title_prompt: aiShortsTitlePrompt,
          shorts_description_prompt: aiShortsDescriptionPrompt,
          shorts_tags_prompt: aiShortsTagsPrompt,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = body?.detail;
        const code = !Array.isArray(detail) && typeof detail === "object" ? detail?.code : detail;
        const validation = Array.isArray(detail) ? detail.map((item) => item?.msg).filter(Boolean).join("; ") : "";
        const description = typeof code === "string" ? code : validation || `HTTP ${response.status}`;
        throw new Error(`${t(uiLang, "aiSaveError")} (${description})`);
      }
      const row = body;
      setAiConnections((current) => [
        ...current.filter((item) => item.id !== row.id).map((item) => ({
          ...item,
          title_prompt: row.title_prompt || "",
          description_prompt: row.description_prompt || "",
          tags_prompt: row.tags_prompt || "",
          shorts_title_prompt: row.shorts_title_prompt || "",
          shorts_description_prompt: row.shorts_description_prompt || "",
          shorts_tags_prompt: row.shorts_tags_prompt || "",
        })),
        row,
      ]);
      setSelectedAiConnectionId(row.id);
      window.localStorage.setItem("moyastudia.aiConnectionId", String(row.id));
      setAiApiKey("");
      setAiProvider(row.provider);
      setAiModel(row.model);
      setAiBaseline({
        provider: row.provider,
        model: row.model,
        titlePrompt: row.title_prompt || "",
        descriptionPrompt: row.description_prompt || "",
        tagsPrompt: row.tags_prompt || "",
        shortsTitlePrompt: row.shorts_title_prompt || "",
        shortsDescriptionPrompt: row.shorts_description_prompt || "",
        shortsTagsPrompt: row.shorts_tags_prompt || "",
      });
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

  function beginChannelEditing(channel) {
    setChannelDescriptionDraft(channel.description || "");
    setChannelKeywordsDraft(channel.keywords || "");
    setChannelDescriptionError("");
    setChannelEditing(true);
  }

  function cancelChannelEditing() {
    setChannelEditing(false);
    setChannelDescriptionDraft("");
    setChannelKeywordsDraft("");
    setChannelDescriptionError("");
  }

  async function saveChannelDescription(channel) {
    if (!writeMode?.enabled || channelDescriptionSaving) return;
    setChannelDescriptionSaving(true);
    setChannelDescriptionError("");
    try {
      const response = await apiFetch(`/channels/${channel.id}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: channelDescriptionDraft, keywords: channelKeywordsDraft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(t(uiLang, response.status === 403 ? "saveToYoutubeWriteModeHint" : "channelDescriptionSaveError"));
      setChannels((current) => current?.map((item) => (
        String(item.id) === String(channel.id) ? { ...item, description: data.description ?? channelDescriptionDraft, keywords: data.keywords ?? channelKeywordsDraft } : item
      )));
      setChannelEditing(false);
      setChannelDescriptionDraft("");
    } catch (error) {
      setChannelDescriptionError(error.message || t(uiLang, "channelDescriptionSaveError"));
    } finally {
      setChannelDescriptionSaving(false);
    }
  }

  async function copyChannelLink(channel) {
    const url = `https://www.youtube.com/channel/${channel.youtube_channel_id}`;
    try {
      await navigator.clipboard.writeText(url);
      setChannelShareNotice(t(uiLang, "channelLinkCopied"));
    } catch {
      setChannelShareNotice(t(uiLang, "channelLinkCopyFailed"));
    }
    window.setTimeout(() => setChannelShareNotice(""), 1800);
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
              <div className="panel cabinet-account-panel">
                <div className="cabinet-account-layout">
                  <aside className="cabinet-account-summary">
                    <h1>{t(uiLang, "profileSection")}</h1>
                    <div className="profile-fields field">
                      <label>{t(uiLang, "email")}</label>
                      <div className="readonly-value" role="status">{session.user?.email || "—"}</div>
                      <p className="account-session-hint">{t(uiLang, "moyaStudiaAccountHint")}</p>
                    </div>
                  </aside>
                  <section className="ai-connections-panel" aria-labelledby="ai-connections-title">
                    <h2 id="ai-connections-title">{t(uiLang, "aiConnections")}</h2>
                    <p className="panel-lead">{t(uiLang, "aiConnectionsHint")}</p>
                    <div className="ai-connection-grid ai-connection-main">
                      <label title={t(uiLang, "aiProviderHint")}>{t(uiLang, "aiProvider")}<select value={aiProvider} onChange={(event) => selectAiModel(event.target.value, "")}><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="anthropic">Anthropic</option><option value="xai">xAI / Grok</option><option value="groq">GroqCloud</option></select></label>
                      <label className="ai-model-field" title={t(uiLang, "aiModelHint")}>{t(uiLang, "aiModel")}
                        <select value={(AI_MODEL_CATALOG[aiProvider] || []).some((item) => item.id === aiModel) ? aiModel : "custom"} onChange={(event) => setAiModel(event.target.value === "custom" ? "" : event.target.value)}>
                          <option value="custom">Своя модель (ввести ID)</option>
                          {(AI_MODEL_CATALOG[aiProvider] || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <small className="ai-model-description">{(AI_MODEL_CATALOG[aiProvider] || []).find((item) => item.id === aiModel)?.description || "Введите ID модели вручную. Доступность и стоимость зависят от провайдера."}</small>
                        {!(AI_MODEL_CATALOG[aiProvider] || []).some((item) => item.id === aiModel) ? <input value={aiModel} onChange={(event) => setAiModel(event.target.value)} placeholder={t(uiLang, "aiModelPlaceholder")} /> : null}
                      </label>
                      <label title={t(uiLang, "aiApiKeyHint")}>{t(uiLang, "aiApiKey")}<input type="password" value={aiApiKey} onChange={(event) => updateAiKey(event.target.value)} placeholder={aiConnections.some((item) => item.provider === aiProvider && item.model === aiModel && item.has_api_key) ? t(uiLang, "aiApiKeySaved") : "••••••••••••"} autoComplete="off" /></label>{aiConnections.some((item) => item.provider === aiProvider && item.model === aiModel && item.has_api_key) ? <button className="btn ghost" type="button" disabled={aiSaving} onClick={deleteAiConnection}>Удалить API-ключ</button> : null}
                    </div>
                    {aiError ? <p className="selection-error" role="alert">{aiError}</p> : null}
                    {aiNotice ? <p className="selection-notice" role="status">{aiNotice}</p> : null}
                  </section>
                  <aside className="ai-model-settings-column" aria-labelledby="ai-model-settings-title">
                    <h2 id="ai-model-settings-title">{t(uiLang, "aiModelSettings")}</h2>
                    <div className="ai-prompt-tabs" role="tablist" aria-label={t(uiLang, "aiModelSettings")}>
                      <button type="button" role="tab" aria-selected={aiPromptTab === "long"} className={aiPromptTab === "long" ? "active" : ""} onClick={() => setAiPromptTab("long")}>{t(uiLang, "aiLongPrompts")}</button>
                      <button type="button" role="tab" aria-selected={aiPromptTab === "shorts"} className={aiPromptTab === "shorts" ? "active" : ""} onClick={() => setAiPromptTab("shorts")}>{t(uiLang, "aiShortsPrompts")}</button>
                    </div>
                    <div className="ai-model-settings">
                      {aiPromptTab === "long" ? <>
                        <label>{t(uiLang, "aiTitlePrompt")}<textarea value={aiTitlePrompt} maxLength={AI_PROMPT_CHAR_LIMIT} onChange={(event) => setAiTitlePrompt(event.target.value)} placeholder={t(uiLang, "aiTitlePromptPlaceholder")} /><small className="ai-prompt-counter">{aiTitlePrompt.length} / {AI_PROMPT_CHAR_LIMIT}</small></label>
                        <label>{t(uiLang, "aiDescriptionPrompt")}<textarea value={aiDescriptionPrompt} maxLength={AI_PROMPT_CHAR_LIMIT} onChange={(event) => setAiDescriptionPrompt(event.target.value)} placeholder={t(uiLang, "aiDescriptionPromptPlaceholder")} /><small className="ai-prompt-counter">{aiDescriptionPrompt.length} / {AI_PROMPT_CHAR_LIMIT}</small></label>
                        <label>{t(uiLang, "aiTagsPrompt")}<textarea value={aiTagsPrompt} maxLength={AI_PROMPT_CHAR_LIMIT} onChange={(event) => setAiTagsPrompt(event.target.value)} placeholder={t(uiLang, "aiTagsPromptPlaceholder")} /><small className="ai-prompt-counter">{aiTagsPrompt.length} / {AI_PROMPT_CHAR_LIMIT}</small></label>
                      </> : <>
                        <label>{t(uiLang, "aiTitlePrompt")}<textarea value={aiShortsTitlePrompt} maxLength={AI_PROMPT_CHAR_LIMIT} onChange={(event) => setAiShortsTitlePrompt(event.target.value)} placeholder={t(uiLang, "aiShortsTitlePromptPlaceholder")} /><small className="ai-prompt-counter">{aiShortsTitlePrompt.length} / {AI_PROMPT_CHAR_LIMIT}</small></label>
                        <label>{t(uiLang, "aiDescriptionPrompt")}<textarea value={aiShortsDescriptionPrompt} maxLength={AI_PROMPT_CHAR_LIMIT} onChange={(event) => setAiShortsDescriptionPrompt(event.target.value)} placeholder={t(uiLang, "aiShortsDescriptionPromptPlaceholder")} /><small className="ai-prompt-counter">{aiShortsDescriptionPrompt.length} / {AI_PROMPT_CHAR_LIMIT}</small></label>
                        <label>{t(uiLang, "aiTagsPrompt")}<textarea value={aiShortsTagsPrompt} maxLength={AI_PROMPT_CHAR_LIMIT} onChange={(event) => setAiShortsTagsPrompt(event.target.value)} placeholder={t(uiLang, "aiShortsTagsPromptPlaceholder")} /><small className="ai-prompt-counter">{aiShortsTagsPrompt.length} / {AI_PROMPT_CHAR_LIMIT}</small></label>
                      </>}
                    </div>
                  </aside>
                  {aiDirty ? (
                    <div className="ai-dirty-actions" role="status">
                      <span>{t(uiLang, "unsavedChanges")}</span>
                      <div>
                        <button className="btn ghost" type="button" disabled={aiSaving} onClick={cancelAiSettings}>{t(uiLang, "actionCancel")}</button>
                        <button className="btn" type="button" disabled={aiSaving} onClick={saveAiConnection}>{aiSaving ? t(uiLang, "aiSaving") : t(uiLang, "aiSave")}</button>
                      </div>
                    </div>
                  ) : null}
                </div>
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
                            <strong className="channel-group-email" title={connection.email || t(uiLang, "connectionAccountUnknown")}>{connectionDisplayName(connection) || t(uiLang, "connectionAccountUnknown")}</strong>
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
                    <article className={`chan-card ${channelEditing ? "editing" : ""}`}>
                      <div className="channel-card-actions">
                        {!channelEditing ? <button className="channel-edit-metadata" type="button" title={t(uiLang, "channelEditDescriptionHint")} aria-label={t(uiLang, "channelEditDescriptionHint")} onClick={() => beginChannelEditing(ch)}>✎</button> : null}
                      </div>
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
                      {channelEditing ? (
                        <div className="channel-description-editor">
                          <label>
                            <span className="channel-editor-heading"><span>{t(uiLang, "channelDescription")}</span><span className="ai-improve-control"><button className="ai-improve-btn" type="button" disabled={channelDescriptionSaving || Boolean(aiBusy) || aiConnections.length === 0} title={aiConnections.length ? t(uiLang, "aiImprove") : t(uiLang, "ai_not_connected")} onClick={() => improveChannelField("description", channelDescriptionDraft)}>{aiBusy === "channel:description" ? t(uiLang, "aiImproving") : t(uiLang, "aiImproveAction")}</button>{aiConnections.length ? <span className="ai-model-picker"><button className="ai-model-picker-btn" type="button" aria-haspopup="menu" aria-expanded={aiImproveMenu === "description"} aria-label={t(uiLang, "aiModelForImprove")} title={t(uiLang, "aiModelForImproveHint")} disabled={Boolean(aiBusy)} onClick={() => setAiImproveMenu((open) => open === "description" ? "" : "description")}><span>{aiModelDisplayName(aiConnections.find((connection) => connection.id === selectedAiConnectionId) || aiConnections[0])}</span><span className="ai-model-picker-chevron" aria-hidden="true">⌄</span></button>{aiImproveMenu === "description" ? <span className="ai-model-picker-menu" role="menu">{aiConnections.map((connection) => <button className={`ai-model-picker-option ${connection.id === selectedAiConnectionId ? "selected" : ""}`} type="button" role="menuitemradio" aria-checked={connection.id === selectedAiConnectionId} key={connection.id} onClick={() => { setSelectedAiConnectionId(connection.id); window.localStorage.setItem("moyastudia.aiConnectionId", String(connection.id)); setAiImproveMenu(""); }}>{aiModelDisplayName(connection)}</button>)}</span> : null}</span> : null}</span></span>
                            <textarea rows={10} maxLength={1000} value={channelDescriptionDraft} disabled={channelDescriptionSaving} onChange={(event) => setChannelDescriptionDraft(event.target.value)} />
                          </label>
                          <small>{channelDescriptionDraft.length} / 1000</small>
                          <label>
                            <span className="channel-editor-heading"><span>{t(uiLang, "channelKeywords")}</span><span className="ai-improve-control"><button className="ai-improve-btn" type="button" disabled={channelDescriptionSaving || Boolean(aiBusy) || aiConnections.length === 0} title={aiConnections.length ? t(uiLang, "aiImprove") : t(uiLang, "ai_not_connected")} onClick={() => improveChannelField("keywords", channelKeywordsDraft)}>{aiBusy === "channel:keywords" ? t(uiLang, "aiImproving") : t(uiLang, "aiImproveAction")}</button>{aiConnections.length ? <span className="ai-model-picker"><button className="ai-model-picker-btn" type="button" aria-haspopup="menu" aria-expanded={aiImproveMenu === "keywords"} aria-label={t(uiLang, "aiModelForImprove")} title={t(uiLang, "aiModelForImproveHint")} disabled={Boolean(aiBusy)} onClick={() => setAiImproveMenu((open) => open === "keywords" ? "" : "keywords")}><span>{aiModelDisplayName(aiConnections.find((connection) => connection.id === selectedAiConnectionId) || aiConnections[0])}</span><span className="ai-model-picker-chevron" aria-hidden="true">⌄</span></button>{aiImproveMenu === "keywords" ? <span className="ai-model-picker-menu" role="menu">{aiConnections.map((connection) => <button className={`ai-model-picker-option ${connection.id === selectedAiConnectionId ? "selected" : ""}`} type="button" role="menuitemradio" aria-checked={connection.id === selectedAiConnectionId} key={connection.id} onClick={() => { setSelectedAiConnectionId(connection.id); window.localStorage.setItem("moyastudia.aiConnectionId", String(connection.id)); setAiImproveMenu(""); }}>{aiModelDisplayName(connection)}</button>)}</span> : null}</span> : null}</span></span>
                            <textarea rows={4} maxLength={500} value={channelKeywordsDraft} disabled={channelDescriptionSaving} onChange={(event) => setChannelKeywordsDraft(event.target.value)} />
                          </label>
                          <small>{channelKeywordsDraft.length} / 500</small>
                          {channelDescriptionError ? <p className="selection-error" role="alert">{channelDescriptionError}</p> : null}
                          {channelDescriptionDraft !== (ch.description || "") || channelKeywordsDraft !== (ch.keywords || "") ? (
                            <div className="youtube-change-preview">
                              <strong>{t(uiLang, "youtubeChangesPreview")}</strong>
                              {channelDescriptionDraft !== (ch.description || "") ? <div className="youtube-change-row"><span>{t(uiLang, "channelDescription")}</span><div><small>{t(uiLang, "youtubeValueBefore")}</small><code>{ch.description || "—"}</code></div><b aria-hidden="true">→</b><div><small>{t(uiLang, "youtubeValueAfter")}</small><code>{channelDescriptionDraft || "—"}</code></div></div> : null}
                              {channelKeywordsDraft !== (ch.keywords || "") ? <div className="youtube-change-row"><span>{t(uiLang, "channelKeywords")}</span><div><small>{t(uiLang, "youtubeValueBefore")}</small><code>{ch.keywords || "—"}</code></div><b aria-hidden="true">→</b><div><small>{t(uiLang, "youtubeValueAfter")}</small><code>{channelKeywordsDraft || "—"}</code></div></div> : null}
                            </div>
                          ) : null}
                          <div className="channel-description-actions">
                            <button className="btn ghost" type="button" disabled={channelDescriptionSaving} onClick={cancelChannelEditing}>{t(uiLang, "actionCancel")}</button>
                            <span className="youtube-write-tooltip" title={!writeMode?.enabled ? t(uiLang, "saveToYoutubeWriteModeHint") : t(uiLang, "channelDescriptionSaveHint")}>
                              <button className="btn youtube-write-action" type="button" disabled={!writeMode?.enabled || channelDescriptionSaving || channelDescriptionDraft === (ch.description || "") && channelKeywordsDraft === (ch.keywords || "")} onClick={() => saveChannelDescription(ch)}>{channelDescriptionSaving ? t(uiLang, "workingSaving") : t(uiLang, "saveToYoutube")}</button>
                            </span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="chan-desc">{ch.description || t(uiLang, "channelDescriptionEmpty")}</p>
                          <div className="channel-keywords-view">
                            <span>{t(uiLang, "channelKeywords")}</span>
                            <p>{ch.keywords || t(uiLang, "notSet")}</p>
                          </div>
                        </>
                      )}
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
                        <div className="channel-link-actions">
                          <a className="btn ghost" href={`https://www.youtube.com/channel/${ch.youtube_channel_id}`} target="_blank" rel="noreferrer" title={t(uiLang, "channelOpenHint")}>{t(uiLang, "channelOpen")}</a>
                          <button className="btn ghost" type="button" title={t(uiLang, "channelShareHint")} onClick={() => copyChannelLink(ch)}>{channelShareNotice || t(uiLang, "channelShare")}</button>
                        </div>
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
