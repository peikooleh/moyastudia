"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { Studio } from "./studio";
import { Landing } from "./landing";
import { Onboarding } from "./onboarding";
import { usePrefs } from "./providers";
import { Shell } from "./shell";

export default function HomePage() {
  const { prefs, update } = usePrefs();
  const [channels, setChannels] = useState([]);
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    apiFetch("/auth/session")
      .then((response) => (response.ok ? response.json() : { authenticated: false }))
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
  }, []);

  useEffect(() => {
    if (!session?.authenticated) {
      setChannels([]);
      return;
    }
    apiFetch("/channels")
      .then((response) => (response.ok ? response.json() : []))
      .then(setChannels)
      .catch(() => setChannels([]));
  }, [session]);

  useEffect(() => {
    if (channels[0] && !prefs.selectedChannelId) {
      update({ selectedChannelId: String(channels[0].id) });
    }
  }, [channels, prefs.selectedChannelId, update]);

  if (session === undefined) return null;
  if (!session.authenticated) return <Landing />;
  if (!prefs.onboarded || channels.length === 0) {
    return <Onboarding youtubeConnected={Boolean(session.user?.youtube_connected)} />;
  }
  return (
    <Shell>
      <Studio />
    </Shell>
  );
}
