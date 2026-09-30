"use client";

import { useEffect, useState } from "react";
import { usePrefs } from "./providers";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function ChannelBanner() {
  const { prefs } = usePrefs();
  const [url, setUrl] = useState("");

  useEffect(() => {
    fetch(`${API}/channels`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const id = prefs.selectedChannelId;
        const ch = rows.find((r) => String(r.id) === String(id)) || rows[0];
        setUrl((ch && ch.banner_url) || "");
      })
      .catch(() => setUrl(""));
  }, [prefs.selectedChannelId]);

  if (!url) return null;
  return (
    <div className="channel-banner">
      <img referrerPolicy="no-referrer" src={url} alt="" />
    </div>
  );
}
