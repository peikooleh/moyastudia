"use client";

import { useEffect, useState } from "react";
import { Studio } from "./studio";
import { Landing } from "./landing";
import { Onboarding } from "./onboarding";
import { usePrefs } from "./providers";
import { Shell } from "./shell";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function HomePage() {
  const { prefs, update } = usePrefs();
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    fetch(`${API}/channels`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        setChannels(rows);
        if (rows[0] && !prefs.selectedChannelId) {
          update({ selectedChannelId: String(rows[0].id) });
        }
      })
      .catch(() => setChannels([]));
  }, []);

  if (!prefs.signedIn) return <Landing />;
  if (!prefs.onboarded || channels.length === 0) return <Onboarding />;
  return (
    <Shell>
      <Studio />
    </Shell>
  );
}
