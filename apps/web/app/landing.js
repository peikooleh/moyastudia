"use client";

import { t } from "../lib/i18n";
import { apiUrl } from "../lib/api";
import { usePrefs } from "./providers";

const FEATURES = [
  ["landVideoTitle", "landVideoText", "01"],
  ["landPlaylistsTitle", "landPlaylistsText", "02"],
  ["landCalendarTitle", "landCalendarText", "03"],
  ["landStatsTitle", "landStatsText", "04"],
  ["landAiTitle", "landAiText", "05"],
  ["landChannelsTitle", "landChannelsText", "06"],
];

export function Landing({ authError = "" }) {
  const { uiLang } = usePrefs();
  const loginUrl = apiUrl("/auth/google/login");

  return (
    <div className="land land-v2">
      <header className="land-top">
        <a className="brand" href="#top" aria-label={t(uiLang, "brand")}>
          <img src="/logo.svg" alt="" className="brand-mark" />
          {t(uiLang, "brand")}
        </a>
        <nav className="land-nav" aria-label={t(uiLang, "landNavLabel")}>
          <a href="#features">{t(uiLang, "landNavFeatures")}</a>
          <a href="#workflow">{t(uiLang, "landNavHow")}</a>
          <a href="#security">{t(uiLang, "landNavSecurity")}</a>
        </nav>
        <a className="btn land-login" href={loginUrl} title={t(uiLang, "tipLogin")}>{t(uiLang, "landCta")}</a>
      </header>

      <main id="top">
        <section className="land-hero-v2">
          <div className="land-hero-copy">
            <span className="land-eyebrow">{t(uiLang, "landEyebrow")}</span>
            <h1>{t(uiLang, "landTitleV2")}</h1>
            <p className="land-lead">{t(uiLang, "landLeadV2")}</p>
            <p className="land-ai-note">{t(uiLang, "landAiNote")}</p>
            {authError ? <p className="selection-error" role="alert">{t(uiLang, authError)}</p> : null}
            <div className="land-actions">
              <a className="btn primary" href={loginUrl}>{t(uiLang, "landCtaGoogle")}</a>
              <a className="btn ghost" href="#product">{t(uiLang, "landSeeProduct")}</a>
            </div>
            <p className="land-microcopy">{t(uiLang, "landHeroNote")}</p>
          </div>
          <DemoWorkspace uiLang={uiLang} />
        </section>

        <section className="land-section" id="features">
          <div className="land-section-heading">
            <span className="land-kicker">{t(uiLang, "landFeaturesKicker")}</span>
            <h2>{t(uiLang, "landFeaturesTitle")}</h2>
            <p>{t(uiLang, "landFeaturesLead")}</p>
          </div>
          <div className="land-feature-grid">
            {FEATURES.map(([title, text, number]) => (
              <article className="land-feature-card" key={title}>
                <span>{number}</span>
                <h3>{t(uiLang, title)}</h3>
                <p>{t(uiLang, text)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="land-product land-section" id="product">
          <div className="land-product-copy">
            <span className="land-kicker">{t(uiLang, "landProductKicker")}</span>
            <h2>{t(uiLang, "landProductTitle")}</h2>
            <p>{t(uiLang, "landProductLead")}</p>
            <div className="land-product-tabs" aria-hidden="true">
              <span className="active">{t(uiLang, "videos")}</span>
              <span>{t(uiLang, "playlists")}</span>
              <span>{t(uiLang, "calendar")}</span>
              <span>{t(uiLang, "statistics")}</span>
            </div>
          </div>
          <DemoStatistics uiLang={uiLang} />
        </section>

        <section className="land-ai-section land-section">
          <div>
            <span className="land-kicker">AI</span>
            <h2>{t(uiLang, "landAiSectionTitle")}</h2>
            <p>{t(uiLang, "landAiSectionLead")}</p>
          </div>
          <div className="land-ai-points">
            <p><b>{t(uiLang, "landAiPoint1Title")}</b><span>{t(uiLang, "landAiPoint1Text")}</span></p>
            <p><b>{t(uiLang, "landAiPoint2Title")}</b><span>{t(uiLang, "landAiPoint2Text")}</span></p>
            <p><b>{t(uiLang, "landAiPoint3Title")}</b><span>{t(uiLang, "landAiPoint3Text")}</span></p>
          </div>
        </section>

        <section className="land-section" id="workflow">
          <div className="land-section-heading">
            <span className="land-kicker">{t(uiLang, "landHowKicker")}</span>
            <h2>{t(uiLang, "landHowTitle")}</h2>
          </div>
          <div className="land-steps">
            {[1,2,3].map((step) => <article key={step}><span>0{step}</span><h3>{t(uiLang, `landStep${step}Title`)}</h3><p>{t(uiLang, `landStep${step}Text`)}</p></article>)}
          </div>
        </section>

        <section className="land-security-v2 land-section" id="security">
          <div>
            <span className="land-kicker">{t(uiLang, "landSecurityKicker")}</span>
            <h2>{t(uiLang, "landSecurityTitle")}</h2>
            <p>{t(uiLang, "landSecurityLead")}</p>
          </div>
          <div className="land-security-list">
            {[1,2,3,4].map((item) => <p key={item}><span aria-hidden="true">✓</span>{t(uiLang, `landSecurity${item}`)}</p>)}
          </div>
        </section>

        <section className="land-final">
          <h2>{t(uiLang, "landFinalTitle")}</h2>
          <p>{t(uiLang, "landFinalLead")}</p>
          <a className="btn primary" href={loginUrl}>{t(uiLang, "landCtaGoogle")}</a>
        </section>
      </main>

      <footer className="app-footer land-footer">
        <span>© {new Date().getFullYear()} {t(uiLang, "brand")} · {t(uiLang, "landIndependent")}</span>
        <nav aria-label={t(uiLang, "legalLinks")}><a href="/privacy">{t(uiLang, "privacy")}</a><a href="/terms">{t(uiLang, "terms")}</a></nav>
      </footer>
    </div>
  );
}

function DemoWorkspace({ uiLang }) {
  return (
    <div className="land-demo-frame" aria-label={t(uiLang, "landDemoLabel")}>
      <div className="land-demo-bar"><i /><i /><i /><span>Demo Channel</span><b>{t(uiLang, "landDemoBadge")}</b></div>
      <div className="land-demo-nav"><b>M</b><span className="active">{t(uiLang, "videos")}</span><span>{t(uiLang, "playlists")}</span><span>{t(uiLang, "calendar")}</span><span>{t(uiLang, "statistics")}</span></div>
      <div className="land-demo-body">
        <aside><strong>{t(uiLang, "videos")}</strong>{["A1", "B1", "Shorts", "Grammar"].map((x,i)=><div className={i===0?"active":""} key={x}><i /> <span>{x} · German</span></div>)}</aside>
        <section>
          <div className="land-demo-video">
            <div className="land-demo-thumb"><span>DEUTSCH B1</span><strong>100</strong><b>WÖRTER</b></div>
            <div><h3>{t(uiLang, "landDemoVideoTitle")}</h3><p>{t(uiLang, "landDemoScheduled")}</p><small>18.10.2026 · 17:00</small></div>
          </div>
          <div className="land-demo-fields"><label>{t(uiLang, "title")}<i /></label><label>{t(uiLang, "description")}<i className="large" /></label><label>{t(uiLang, "tags")}<i /></label></div>
        </section>
      </div>
    </div>
  );
}

function DemoStatistics({ uiLang }) {
  const bars=[28,38,31,52,44,67,61,76,58,82,71,91];
  return <div className="land-stats-demo" aria-label={t(uiLang, "landDemoStatsLabel")}>
    <div className="land-stats-top"><b>{t(uiLang, "statistics")}</b><span>28 {t(uiLang, "days")}</span></div>
    <div className="land-stat-cards"><article><span>{t(uiLang, "views")}</span><strong>18 742</strong><small>+12.4%</small></article><article><span>{t(uiLang, "watchTime")}</span><strong>1 286 h</strong><small>+8.7%</small></article><article><span>{t(uiLang, "subscribers")}</span><strong>+312</strong><small>+16.1%</small></article></div>
    <div className="land-bars">{bars.map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div>
    <div className="land-realtime"><span>{t(uiLang, "landDemoRealtime")}</span><b>326</b><small>60 min</small></div>
  </div>;
}
