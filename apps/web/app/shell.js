"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { t } from "../lib/i18n";
import { apiFetch } from "../lib/api";
import { usePrefs } from "./providers";

export function Shell({ children }) {
  const { prefs, uiLang } = usePrefs();
  const path = usePathname();
  const router = useRouter();
  const [channel, setChannel] = useState(null);

  useEffect(() => {
    apiFetch("/channels")
      .then((r) => (r.ok ? r.json() : []))
      .then(async (rows) => {
        const id = prefs.selectedChannelId;
        let ch = rows.find((r) => String(r.id) === String(id)) || rows[0] || null;
        if (ch && ch.has_token && (!ch.banner_url || !ch.thumbnail_url)) {
          const res = await apiFetch(`/channels/${ch.id}/refresh-profile`, { method: "POST" });
          if (res.ok) ch = { ...ch, ...(await res.json()) };
        }
        setChannel(ch);
      })
      .catch(() => setChannel(null));
  }, [prefs.selectedChannelId]);

  async function logout() {
    const response = await apiFetch("/auth/logout", { method: "POST" });
    if (response.ok) router.replace("/");
  }

  return (
    <div className="shell">
      <header className="top">
        <Link href="/" className="brand">
          <img src="/logo.svg" alt="" className="brand-mark" />
          {t(uiLang, "brand")}
        </Link>
        <div className="spacer" />
        {path.startsWith("/cabinet") ? null : (
        <Link
          href="/cabinet"
          className="icon-btn"
          title={t(uiLang, "tipGear")}
          aria-label={t(uiLang, "tipGear")}
        >
          {"\u2699"}
        </Link>
        )}
        <button className="btn ghost" type="button" onClick={logout} title={t(uiLang, "tipLogout")}>
          {t(uiLang, "logout")}
        </button>
      </header>
      {children}
    </div>
  );
}
