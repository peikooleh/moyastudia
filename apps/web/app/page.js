"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { t } from "../lib/i18n";
import { Studio } from "./studio";
import { Landing } from "./landing";
import { Onboarding } from "./onboarding";
import { usePrefs } from "./providers";
import { Shell } from "./shell";
import { accountPrefsForUser, channelPreferencesForAvailableChannels } from "../lib/prefs";

export default function HomePage() {
  const { prefs, update, uiLang } = usePrefs();
  const [channels, setChannels] = useState(null);
  const [session, setSession] = useState(undefined);
  const [sessionError, setSessionError] = useState(false);
  const [channelsError, setChannelsError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("auth_error");
    const messages = {
      cancelled: "oauthCancelled",
      invalid_state: "oauthInvalidState",
      identity_failed: "oauthIdentityFailed",
      session_expired: "oauthSessionExpired",
      provider_failed: "oauthProviderFailed",
      provider_unavailable: "oauthProviderUnavailable",
    };
    setAuthError(messages[code] || "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/auth/session")
      .then(async (response) => {
        if (!response.ok) throw new Error("session unavailable");
        return response.json();
      })
      .then((status) => {
        if (!cancelled) {
          setSession(status);
          setSessionError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setSessionError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  useEffect(() => {
    if (session === undefined) return undefined;
    if (!session?.authenticated) {
      setChannels([]);
      setChannelsError(false);
      return;
    }
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
        if (!cancelled) setChannels(rows);
      })
      .catch((error) => {
        if (!cancelled) {
          if (error.status === 401) {
            setSession({ authenticated: false });
            setSessionError(false);
            setChannels([]);
            setChannelsError(false);
            return;
          }
          setChannels([]);
          setChannelsError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session, retry]);

  useEffect(() => {
    if (session?.authenticated) {
      const userId = String(session.user?.id || "");
      if (userId && prefs.accountUserId !== userId) {
        update(accountPrefsForUser(userId));
      }
    }
  }, [session, prefs.accountUserId, update]);

  useEffect(() => {
    if (channels === null || channelsError) return;
    const channelPrefs = channelPreferencesForAvailableChannels(prefs, channels);
    if (channelPrefs) update(channelPrefs);
  }, [channels, channelsError, prefs, update]);

  if (session === undefined && !sessionError) {
    return <div className="state-screen" role="status">{t(uiLang, "loadingAccount")}</div>;
  }
  if (sessionError) {
    return (
      <div className="state-screen" role="alert">
        <h1>{t(uiLang, "authSessionLoadError")}</h1>
        <button className="btn ghost" type="button" onClick={() => {
          setSession(undefined);
          setSessionError(false);
          setRetry((current) => current + 1);
        }}>{t(uiLang, "retry")}</button>
      </div>
    );
  }
  if (!session.authenticated) return <Landing authError={authError} />;
  if (channels === null) {
    return <div className="state-screen" role="status">{t(uiLang, "loadingChannels")}</div>;
  }
  if (channelsError) {
    return (
      <div className="state-screen" role="alert">
        <h1>{t(uiLang, "channelListLoadError")}</h1>
        <button className="btn ghost" type="button" onClick={() => {
          setChannels(null);
          setRetry((current) => current + 1);
        }}>{t(uiLang, "retry")}</button>
      </div>
    );
  }
  if (!prefs.onboarded || channels.length === 0) {
    return <Onboarding channels={channels} youtubeConnected={Boolean(session.user?.youtube_connected)} />;
  }
  return (
    <Shell>
      {({ view, onViewChange, writeMode }) => <Studio view={view} onViewChange={onViewChange} writeMode={writeMode} />}
    </Shell>
  );
}
