"use client";

import { useState } from "react";
import { t } from "../lib/i18n";
import { apiUrl } from "../lib/api";
import { CHANNEL_LANGS, UI_LANGS } from "../lib/prefs";
import { ThemePicker } from "./theme-picker";
import { usePrefs } from "./providers";
import { LogoutControl } from "./logout-control";

export function Onboarding({ channels = [], youtubeConnected = false }) {
  const { prefs, uiLang, update } = usePrefs();
  const [step, setStep] = useState(0);

  const main = channels[0];
  const selected = (main && prefs.channelLangs[String(main.id)]) || "";

  return (
    <div className="onb">
      <div className="onb-card">
        <div className="onb-logo">{t(uiLang, "brand")}</div>
        <nav className="onb-account-nav" aria-label={t(uiLang, "account") }>
          <a className="btn ghost" href="/cabinet">{t(uiLang, "openCabinet")}</a>
          <LogoutControl />
        </nav>
        <div
          className="onb-dots"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={step + 1}
          aria-label={t(uiLang, "onboardingStep", {
            current: step + 1,
            total: 3,
            name: t(uiLang, ["stepLanguage", "stepAppearance", "stepConnect"][step]),
          })}
        >
          {[0, 1, 2].map((n) => <i key={n} className={n <= step ? "on" : ""} />)}
        </div>

        {step === 0 && (
          <>
            <h1>{t(uiLang, "uiLangTitle")}</h1>
            <p className="onb-hint">{t(uiLang, "languageHint")}</p>
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
            <p className="onb-hint">{t(uiLang, "appearanceHint")}</p>
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
            <p className="onb-hint">{t(uiLang, "connectHint")}</p>
            {youtubeConnected ? <p>{t(uiLang, "connectionSaved")}</p> : null}
            <div className="onb-readonly" title={t(uiLang, "secureReadOnlyHint")}>
              <span aria-hidden="true">RO</span>
              <div>
                <strong>{t(uiLang, "secureReadOnly")}</strong>
                <small>{t(uiLang, "secureReadOnlyHint")}</small>
              </div>
            </div>
            <div className="actions">
              <button className="btn ghost" type="button" onClick={() => setStep(1)}>
                {t(uiLang, "back")}
              </button>
              {!youtubeConnected ? (
                <a className="btn" href={apiUrl("/auth/youtube/login")}>
                  {t(uiLang, "connectBtn")}
                </a>
              ) : null}
              <a className="btn ghost" href="/cabinet">{t(uiLang, "openCabinet")}</a>
            </div>
          </>
        )}

        {step === 2 && main && (
          <>
            <h1>{t(uiLang, "channelLangTitle")}</h1>
            <p className="onb-hint">{t(uiLang, "channelLanguageHint")}</p>
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
                onClick={() => update({ onboarded: true })}
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
