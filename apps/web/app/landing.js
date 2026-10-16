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
              <a className="btn ghost" href="#features">{t(uiLang, "landSeeProduct")}</a>
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

const DEMO = {
  videos: [
    { code: "B1", time: "17:00", views: "18 742", variant: "berlin" },
    { code: "A2", time: "16:30", views: "12 486", variant: "sky" },
    { code: "SHORTS", time: "12:00", views: "54 320", variant: "shorts" },
    { code: "GRAM", time: "15:45", views: "8 912", variant: "grammar" },
    { code: "A1–A2", time: "14:20", views: "22 481", variant: "flag" },
    { code: "B1", time: "11:10", views: "6 903", variant: "study" },
  ],
  bars: [28,38,31,52,44,67,61,76,58,82,71,91],
  calendar: [
    ["", "17:00", "", "09:00", "", "18:30", ""],
    ["12:00", "", "17:00", "", "09:00", "", "18:30"],
    ["", "09:00", "", "17:00", "", "12:00", ""],
    ["18:30", "", "09:00", "", "17:00", "", ""],
  ],
};

function DemoWorkspace({ uiLang }) {
  return (
    <div className="land-demo-frame land-real-demo" aria-label={t(uiLang, "landDemoLabel")}>
      <DemoChrome uiLang={uiLang} active="videos" />
      <div className="demo-app-grid">
        <nav className="demo-side-nav" aria-hidden="true">
          <b>M</b>
          <span className="active">{t(uiLang, "videos")}</span>
          <span>{t(uiLang, "playlists")}</span>
          <span>{t(uiLang, "calendar")}</span>
          <span>{t(uiLang, "statistics")}</span>
        </nav>
        <aside className="demo-video-list">
          <div className="demo-pane-title">{t(uiLang, "videos")} <span>24</span></div>
          <div className="demo-search">{t(uiLang, "searchVideos")}</div>
          {DEMO.videos.map((video, i) => (
            <div className={`demo-list-video ${i === 0 ? "active" : ""}`} key={video.code}>
              <DemoThumb code={video.code} variant={video.variant} />
              <div><b>{t(uiLang, `landDemoVideo${i + 1}`)}</b><small>{i === 0 ? t(uiLang, "filterScheduled") : t(uiLang, "filterPublic")} · {video.views}</small></div>
            </div>
          ))}
        </aside>
        <section className="demo-video-editor">
          <div className="demo-video-head">
            <DemoThumb code="B1" variant="berlin" large />
            <div className="demo-video-summary"><h3>{t(uiLang, "landDemoVideo1")}</h3><p>{t(uiLang, "filterScheduled")} · 18.10.2026, 17:00</p><button type="button">{t(uiLang, "landDemoChangeCover")}</button></div>
          </div>
          <div className="demo-editor-cols">
            <div>
              <DemoField label={t(uiLang, "title")} value={t(uiLang, "landDemoVideo1")} />
              <DemoField label={t(uiLang, "description")} value={t(uiLang, "landDemoDescription")} tall />
              <DemoField label={t(uiLang, "tags")} value="Deutsch, B1, Wortschatz, Lernen" />
            </div>
            <div className="demo-settings">
              <DemoField label={t(uiLang, "videoLanguage")} value="Deutsch" />
              <DemoField label={t(uiLang, "videoCategory")} value={t(uiLang, "landDemoEducation")} />
              <DemoField label={t(uiLang, "videoVisibility")} value={t(uiLang, "filterScheduled")} />
              <DemoField label={t(uiLang, "landDemoDateTime")} value="18.10.2026 · 17:00" />
              <button type="button">{t(uiLang, "landDemoImproveAi")}</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function DemoStatistics({ uiLang }) {
  return <div className="land-stats-demo land-real-demo" aria-label={t(uiLang, "landDemoStatsLabel")}>
    <DemoChrome uiLang={uiLang} active="statistics" compact />
    <div className="demo-stats-content">
      <div className="land-stat-cards"><article><span>{t(uiLang, "views")}</span><strong>18 742</strong><small>{t(uiLang, "landDemoData")}</small></article><article><span>{t(uiLang, "watchTime")}</span><strong>1 286 h</strong><small>{t(uiLang, "landDemoData")}</small></article><article><span>{t(uiLang, "subscribers")}</span><strong>+312</strong><small>{t(uiLang, "landDemoData")}</small></article></div>
      <div className="land-bars">{DEMO.bars.map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div>
      <div className="land-realtime"><span>{t(uiLang, "landDemoPeriod")}</span><b>28</b><small>{t(uiLang, "days")}</small></div>
    </div>
  </div>;
}

function DemoChrome({ uiLang, active, compact = false }) {
  return <><div className="land-demo-bar"><i /><i /><i /><span>Deutsch Studio</span><b>{t(uiLang, "landDemoBadge")}</b></div><div className={`land-demo-nav ${compact ? "compact" : ""}`}><b>M</b>{["videos","playlists","calendar","statistics"].map(key=><span className={active===key?"active":""} key={key}>{t(uiLang,key)}</span>)}</div></>;
}

function DemoThumb({ code, variant = "berlin", large = false }) {
  return <div className={`demo-thumb demo-thumb-${variant} ${large ? "large" : ""}`}>
    <span className="demo-thumb-scene" aria-hidden="true"><i /><i /><i /></span>
    <span className="demo-thumb-copy"><small>DEUTSCH</small><strong>{code}</strong><b>{variant === "shorts" ? "5 WÖRTER" : variant === "grammar" ? "WORTSTELLUNG" : "WORTSCHATZ"}</b></span>
  </div>;
}

function DemoField({ label, value, tall = false }) {
  return <label className="demo-field"><span>{label}</span><div className={tall ? "tall" : ""}>{value}</div></label>;
}

