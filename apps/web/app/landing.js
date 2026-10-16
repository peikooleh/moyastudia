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
            <h1>{t(uiLang, "landHeroTitleLine1")}<br />{t(uiLang, "landHeroTitleLine2")}<br /><em>{t(uiLang, "landHeroTitleAccent")}</em></h1>
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
          <div className="land-feature-grid land-feature-grid-render">
            {FEATURES.map(([title, text, number], index) => (
              <article className="land-feature-card" key={title}>
                <span>{number}</span>
                <i aria-hidden="true">{["▣","☷","□","▥","✦","◫"][index]}</i>
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
          <DemoCalendar uiLang={uiLang} />
        </section>

        <section className="land-ai-section land-section">
          <div>
            <span className="land-kicker">AI</span>
            <h2>{t(uiLang, "landAiSectionTitle")}</h2>
            <p>{t(uiLang, "landAiSectionLead")}</p>
          </div>
          <div className="land-ai-side">
            <DemoAiControl uiLang={uiLang} />
            <div className="land-ai-points">
            <p><b>{t(uiLang, "landAiPoint1Title")}</b><span>{t(uiLang, "landAiPoint1Text")}</span></p>
            <p><b>{t(uiLang, "landAiPoint2Title")}</b><span>{t(uiLang, "landAiPoint2Text")}</span></p>
            <p><b>{t(uiLang, "landAiPoint3Title")}</b><span>{t(uiLang, "landAiPoint3Text")}</span></p>
            </div>
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

      <a className="land-back-top" href="#top" aria-label={t(uiLang, "landBackTop")} title={t(uiLang, "landBackTop")}>↑</a>

      <footer className="app-footer land-footer">
        <span>© {new Date().getFullYear()} {t(uiLang, "brand")} · {t(uiLang, "landIndependent")}</span>
        <nav aria-label={t(uiLang, "legalLinks")}><a href="/privacy">{t(uiLang, "privacy")}</a><a href="/terms">{t(uiLang, "terms")}</a></nav>
      </footer>
    </div>
  );
}

const DEMO = {
  videos: [
    { code: "ALPS", time: "17:00", views: "128 740", variant: "alps" },
    { code: "CITY", time: "16:30", views: "64 320", variant: "city" },
    { code: "48H", time: "14:20", views: "95 680", variant: "lake" },
    { code: "ROAD", time: "12:00", views: "42 190", variant: "road" },
    { code: "FALLS", time: "11:15", views: "38 450", variant: "falls" },
    { code: "SUN", time: "10:00", views: "71 230", variant: "sunset" },
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
              <div><b>{t(uiLang, `landDemoVideo${i + 1}`)}</b><small>{video.views} {t(uiLang, "views").toLowerCase()} · {video.time}</small></div>
            </div>
          ))}
        </aside>
        <section className="demo-video-editor">
          <div className="demo-video-head">
            <DemoThumb code="ALPS" variant="alps" large />
            <div className="demo-video-summary"><h3>{t(uiLang, "landDemoVideo1")}</h3><p>{t(uiLang, "filterScheduled")} · 18.10.2026, 17:00</p><button type="button">{t(uiLang, "landDemoChangeCover")}</button></div>
          </div>
          <div className="demo-editor-cols">
            <div>
              <DemoField label={t(uiLang, "title")} value={t(uiLang, "landDemoVideo1")} />
              <DemoField label={t(uiLang, "description")} value={t(uiLang, "landDemoDescription")} tall />
              <DemoField label={t(uiLang, "tags")} value="travel, Alps, weekend, guide" />
            </div>
            <div className="demo-settings">
              <DemoField label={t(uiLang, "videoLanguage")} value={t(uiLang, "landDemoLanguage")} />
              <DemoField label={t(uiLang, "videoCategory")} value={t(uiLang, "landDemoTravelCategory")} />
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

function DemoCalendar({ uiLang }) {
  const items = ["ALPS","CITY","48H","ROAD","LAKE","TRIP"];
  let n = 0;
  return <div className="land-calendar-demo land-real-demo" aria-label={t(uiLang, "calendar")}>
    <DemoChrome uiLang={uiLang} active="calendar" compact />
    <div className="demo-calendar-head"><b>{t(uiLang, "calendar")}</b><span>October 2026</span><button type="button">{t(uiLang, "today")}</button></div>
    <div className="demo-calendar-week">{["M","T","W","T","F","S","S"].map((d,i)=><span key={i}>{d}</span>)}</div>
    <div className="demo-calendar-grid">{Array.from({length:28},(_,i)=>{
      const show=[2,4,7,9,11,14,16,18,21,23,25].includes(i);
      const code=show?items[n++%items.length]:"";
      return <div key={i}><small>{i+1}</small>{show?<span><b>{["09:00","12:00","17:00"][i%3]}</b> {code}</span>:null}</div>
    })}</div>
  </div>;
}

function DemoAiControl({ uiLang }) {
  return <div className="land-ai-demo land-real-demo" aria-label="AI">
    <div className="land-ai-demo-head"><span>AI</span><b>{t(uiLang, "landAiPoint1Title")}</b></div>
    <label><span>{t(uiLang, "landAiPoint1Title")}</span><div>Gemini 3.6 Flash <b>⌄</b></div></label>
    <label><span>{t(uiLang, "title")}</span><div>{t(uiLang, "landDemoVideo1")}</div></label>
    <button type="button">✦ {t(uiLang, "landDemoImproveAi")}</button>
    <small>{t(uiLang, "landAiPoint3Text")}</small>
  </div>;
}

function DemoChrome({ uiLang, active, compact = false }) {
  return <><div className="land-demo-bar"><span className="demo-back">‹</span><span>Atlas Studio</span><span className="demo-chevron">⌄</span><b>{t(uiLang, "landDemoBadge")}</b><i className="demo-avatar">A</i></div><div className={`land-demo-nav ${compact ? "compact" : ""}`}><b>M</b>{["videos","playlists","calendar","statistics"].map(key=><span className={active===key?"active":""} key={key}>{t(uiLang,key)}</span>)}</div></>;
}

function DemoThumb({ code, variant = "alps", large = false }) {
  return <div className={`demo-thumb demo-thumb-${variant} ${large ? "large" : ""}`}>
    <span className="demo-thumb-scene" aria-hidden="true"><i className="demo-sun" /><i className="demo-mountain-back" /><i className="demo-mountain-front" /><i className="demo-water" /><i className="demo-road" /></span>
    <span className="demo-thumb-copy"><small>ATLAS</small><strong>{code}</strong></span>
    <span className="demo-duration">{large ? "12:34" : code === "CITY" ? "10:21" : code === "48H" ? "8:15" : code === "ROAD" ? "11:02" : code === "FALLS" ? "9:48" : "13:26"}</span>
  </div>;
}

function DemoField({ label, value, tall = false }) {
  return <label className="demo-field"><span>{label}</span><div className={tall ? "tall" : ""}>{value}</div></label>;
}

