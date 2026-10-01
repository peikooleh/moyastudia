"use client";

import { t } from "../lib/i18n";
import { apiUrl } from "../lib/api";
import { usePrefs } from "./providers";

export function Landing() {
  const { uiLang } = usePrefs();
  return (
    <div className="land">
      <header className="land-top">
        <div className="brand" aria-label={t(uiLang, "brand")}>
          <img src="/logo.svg" alt="" className="brand-mark" />
          {t(uiLang, "brand")}
        </div>
        <a className="btn" href={apiUrl("/auth/google/login")} title={t(uiLang, "tipLogin")}>
          {t(uiLang, "landCta")}
        </a>
      </header>
      <main className="land-main">
        <section className="land-hero">
          <span className="land-eyebrow">{t(uiLang, "secureReadOnly")}</span>
          <h1>{t(uiLang, "landTitle")}</h1>
          <p>{t(uiLang, "landLead")}</p>
          <div className="land-security">
            <span className="land-security-mark" aria-hidden="true">RO</span>
            <span>{t(uiLang, "secureReadOnlyHint")}</span>
          </div>
        </section>
        <section className="land-preview" aria-label={t(uiLang, "workspacePreview")}>
          <div className="land-preview-top">
            <div className="land-window-dots" aria-hidden="true"><i /><i /><i /></div>
            <span>{t(uiLang, "workspacePreview")}</span>
            <span className="land-preview-live">{t(uiLang, "secureReadOnly")}</span>
          </div>
          <div className="land-preview-content">
            <div className="land-preview-sidebar" aria-hidden="true">
              <i className="active" />
              <i />
              <i />
              <i />
            </div>
            <div className="land-preview-board">
              <div className="land-preview-heading">
                <b>{t(uiLang, "previewCatalog")}</b>
                <span>01 / 03</span>
              </div>
              <div className="land-preview-lines" aria-hidden="true">
                <i /><i /><i /><i />
              </div>
              <div className="land-preview-tabs">
                <span>{t(uiLang, "previewCatalog")}</span>
                <span>{t(uiLang, "previewPlaylists")}</span>
                <span>{t(uiLang, "previewCalendar")}</span>
              </div>
            </div>
          </div>
        </section>
      </main>
      <section className="land-feats">
        <div>
          <h2>{t(uiLang, "feat1")}</h2>
          <p>{t(uiLang, "feat1d")}</p>
        </div>
        <div>
          <h2>{t(uiLang, "feat2")}</h2>
          <p>{t(uiLang, "feat2d")}</p>
        </div>
        <div>
          <h2>{t(uiLang, "feat3")}</h2>
          <p>{t(uiLang, "feat3d")}</p>
        </div>
      </section>
    </div>
  );
}
