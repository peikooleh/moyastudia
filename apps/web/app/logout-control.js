"use client";

import { useState } from "react";
import { apiFetch } from "../lib/api";
import { requestLogout, requestSessionState } from "../lib/auth-state.mjs";
import { t } from "../lib/i18n";
import { usePrefs } from "./providers";

export function LogoutControl() {
  const { uiLang } = usePrefs();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      if (!await requestLogout(apiFetch) && await requestSessionState(apiFetch) !== false) {
        throw new Error("Logout could not be confirmed");
      }
      window.location.replace("/");
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="logout-control">
      <button className="btn ghost" type="button" disabled={pending} onClick={logout}>
        {pending ? t(uiLang, "logoutPending") : t(uiLang, "logout")}
      </button>
      {error ? (
        <div className="logout-error" role="alert">
          <span>{t(uiLang, "logoutError")}</span>
          <button className="text-button" type="button" disabled={pending} onClick={logout}>
            {t(uiLang, "logoutRetry")}
          </button>
        </div>
      ) : null}
    </div>
  );
}