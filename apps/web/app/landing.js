"use client";

import { t } from "../lib/i18n";
import { usePrefs } from "./providers";

export function Landing() {
  const { uiLang, update } = usePrefs();
  return (
    <div className="land">
      <header className="land-top">
        <div className="brand"><img src="/logo.svg" alt="" className="brand-mark" />{t(uiLang, "brand")}</div>
        <button className="btn" type="button" onClick={() => update({ signedIn: true })}>
          {t(uiLang, "landCta")}
        </button>
      </header>
      <section className="land-hero">
        <h1>{t(uiLang, "landTitle")}</h1>
        <p>{t(uiLang, "landLead")}</p>
      </section>
      <section className="land-demo">
        <article>
          <b>128</b>
          <span>videos</span>
        </article>
        <article>
          <b>11</b>
          <span>reserve</span>
        </article>
        <article>
          <b>6</b>
          <span>scheduled</span>
        </article>
      </section>
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
