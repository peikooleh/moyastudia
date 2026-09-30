"use client";

import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { CHANNEL_LANGS, UI_LANGS } from "../lib/prefs";
import { ThemePicker } from "./theme-picker";
import { usePrefs } from "./providers";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function Onboarding() {
  const { prefs, uiLang, update } = usePrefs();
  const [step, setStep] = useState(0);
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    fetch(`${API}/channels`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setChannels)
      .catch(() => setChannels([]));
  }, []);

  const main = channels[0];
  const selected = (main && prefs.channelLangs[String(main.id)]) || "";

  return (
    <div className="onb">
      <div className="onb-card">
        <div className="onb-logo">{t(uiLang, "brand")}</div>
        <div className="onb-dots">
          {[0, 1, 2].map((n) => (
            <i key={n} className={n <= step ? "on" : ""} />
          ))}
        </div>

        {step === 0 && (
          <>
            <h1>{t(uiLang, "uiLangTitle")}</h1>
            <div className="choices">
              {UI_LANGS.filter((l) => l.id !== "auto").map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  className={`choice ${prefs.uiLang === lang.id ? "on" : ""}`}
                  onClick={() => update({ uiLang: lang.id })}
                >
                  {lang.label}
                </button>
              ))}
            </div>
            <div className="actions">
              <button className="btn" type="button" onClick={() => setStep(1)}>
                {t(uiLang, "continue")}
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>{t(uiLang, "themeTitle")}</h1>
            <ThemePicker />
            <div className="actions">
              <button className="btn ghost" type="button" onClick={() => setStep(0)}>
                {t(uiLang, "back")}
              </button>
              <button className="btn" type="button" onClick={() => setStep(2)}>
                {t(uiLang, "continue")}
              </button>
            </div>
          </>
        )}

        {step === 2 && !main && (
          <>
            <h1>{t(uiLang, "connectTitle")}</h1>
            <div className="actions">
              <button className="btn ghost" type="button" onClick={() => setStep(1)}>
                {t(uiLang, "back")}
              </button>
              <a className="btn" href={`${API}/auth/youtube/login`}>
                {t(uiLang, "connectBtn")}
              </a>
            </div>
          </>
        )}

        {step === 2 && main && (
          <>
            <h1>{t(uiLang, "channelLangTitle")}</h1>
            <div className="onb-channel">{main.title}</div>
            <div className="choices">
              {CHANNEL_LANGS.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  className={`choice ${selected === lang.id ? "on" : ""}`}
                  onClick={() =>
                    update({
                      channelLangs: {
                        ...prefs.channelLangs,
                        [String(main.id)]: lang.id,
                      },
                    })
                  }
                >
                  {lang.label}
                </button>
              ))}
            </div>
            <div className="actions">
              <button className="btn ghost" type="button" onClick={() => setStep(1)}>
                {t(uiLang, "back")}
              </button>
              <button
                className="btn"
                type="button"
                disabled={!selected}
                onClick={() => update({ onboarded: true, signedIn: true })}
              >
                {t(uiLang, "finish")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
