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

function FeatureMini({ index, uiLang }) {
  if (index === 0) return <div className="feature-mini feature-mini-video"><span className="fm-thumb">ALPS</span><span><b>{t(uiLang,"landDemoVideo1")}</b><small>{t(uiLang,"landDemoScheduled")} · 17:00</small></span></div>;
  if (index === 1) return <div className="feature-mini feature-mini-playlists"><span>ALPS <b>12</b></span><span>CITY <b>8</b></span><span>ROAD <b>15</b></span></div>;
  if (index === 2) return <div className="feature-mini feature-mini-calendar">{["17","18","19","20","21"].map((d,i)=><span key={d}><b>{d}</b>{i===1||i===3?<i>{i===1?"09:00":"17:00"}</i>:null}</span>)}</div>;
  if (index === 3) return <div className="feature-mini feature-mini-stats"><span><b>18 742</b><small>{t(uiLang,"landDemoViews")}</small></span><div>{[3,5,4,7,6,9,8,11].map((h,i)=><i key={i} style={{height:`${h*3}px`}} />)}</div></div>;
  if (index === 4) return <div className="feature-mini feature-mini-ai"><span><small>{t(uiLang,"title")}</small><b>{t(uiLang,"landDemoVideo1")}</b></span><button type="button">✦ {t(uiLang,"landDemoImproveAi")}</button></div>;
  return <div className="feature-mini feature-mini-channels"><span className="active">A</span><span>T</span><span>C</span><b>Atlas Studio</b></div>;
}

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
            <h1>{t(uiLang, "landHeroTitleLine1")}<br />{t(uiLang, "landHeroTitleLine2")}<br /><em>{t(uiLang, "landHeroTitleAccent")}</em></h1>
            <p className="land-lead">{t(uiLang, "landHeroLeadRefined")}</p>
            <p className="land-ai-note">{t(uiLang, "landHeroAiRefined")}</p>
            {authError ? <p className="selection-error" role="alert">{t(uiLang, authError)}</p> : null}
            <div className="land-actions">
              <a className="btn primary" href={loginUrl}>{t(uiLang, "landCtaGoogle")}</a>
              <a className="btn ghost" href="#product">{t(uiLang, "landSeeInterface")}</a>
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
                <FeatureMini index={index} uiLang={uiLang} />
                <h3>{index === 2 ? <a href="#product">{t(uiLang, title)}</a> : index === 4 ? <a href="#ai">{t(uiLang, title)}</a> : index === 5 ? <a href="#workflow">{t(uiLang, title)}</a> : t(uiLang, title)}</h3>
                <p>{t(uiLang, text)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="land-product land-section" id="product">
          <div className="land-product-copy">
            <span className="land-kicker">{t(uiLang, "landProductKicker")}</span>
            <h2>{t(uiLang, "landProductTitle")}</h2>
            <p>{t(uiLang, "landCalendarLead")}</p>
          </div>
          <DemoCalendar uiLang={uiLang} />
        </section>

        <section className="land-ai-section land-section" id="ai">
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
            {[1,2,3].map((step) => <article key={step}>
              <div className="land-step-top"><span>0{step}</span><span className="land-step-icon" aria-hidden="true">{step === 1 ? "G" : step === 2 ? "▶" : "✓"}</span></div>
              <h3>{t(uiLang, `landStep${step}Title`)}</h3>
              <p>{t(uiLang, `landStep${step}Text`)}</p>
            </article>)}
          </div>
        </section>

        <section className="land-security-v2 land-section" id="security">
          <div>
            <span className="land-kicker">{t(uiLang, "landSecurityKicker")}</span>
            <h2>{t(uiLang, "landSecurityTitle")}</h2>
            <p>{t(uiLang, "landSecurityLead")}</p>
          </div>
          <div className="land-security-list">
            {[1,2,3,4].map((item) => <article key={item}><span aria-hidden="true">✓</span><div><b>{t(uiLang, `landSecurity${item}Title`)}</b><p>{t(uiLang, `landSecurity${item}`)}</p></div></article>)}
          </div>
        </section>

        <section className="land-final">
          <span className="land-kicker">{t(uiLang, "landFinalKicker")}</span>
          <h2>{t(uiLang, "landFinalTitle")}</h2>
          <p>{t(uiLang, "landFinalLead")}</p>
          <a className="btn primary" href={loginUrl}>{t(uiLang, "landCtaGoogle")}</a>
          <small>{t(uiLang, "landFinalNote")}</small>
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
    { code: "KYOTO", time: "17:00", views: "86 420", variant: "sunset" },
    { code: "TOKYO", time: "16:30", views: "51 880", variant: "city" },
    { code: "FUJI", time: "14:20", views: "74 160", variant: "alps" },
    { code: "SEOUL", time: "12:00", views: "39 740", variant: "road" },
    { code: "BALI", time: "11:15", views: "32 610", variant: "falls" },
    { code: "ROME", time: "10:00", views: "68 930", variant: "lake" },
  ],
};

function DemoWorkspace({ uiLang }) {
  return (
    <div className="land-demo-frame land-real-demo" aria-label={t(uiLang, "landDemoLabel")}>
      <DemoChrome uiLang={uiLang} active="videos" />
      <div className="demo-real-video-page">
        <aside className="demo-video-list">
          <div className="demo-pane-title">{t(uiLang, "videos")} <span>36</span></div>
          <div className="demo-search">{t(uiLang, "searchVideos")}</div>
          {DEMO.videos.map((video, i) => (
            <div className={`demo-list-video ${i === 0 ? "active" : ""}`} key={video.code}>
              <DemoThumb code={video.code} variant={video.variant} />
              <div><b>{t(uiLang, `landDemoVideo${i + 1}`)}</b><small>{video.views} {t(uiLang, "views").toLowerCase()} · {video.time}</small></div>
            </div>
          ))}
        </aside>
        <section className="demo-real-video-editor">
          <div className="demo-real-video-head">
            <DemoThumb code="KYOTO" variant="sunset" large />
            <div><h3>{t(uiLang, "landDemoVideo1")}</h3><p>{t(uiLang, "filterScheduled")} · 18.10.2026, 17:00</p><button type="button">{t(uiLang, "landDemoChangeCover")}</button></div>
            <div className="demo-real-player"><DemoThumb code="KYOTO" variant="sunset" large /><span>▶</span></div>
          </div>
          <div className="demo-real-divider" />
          <div className="demo-real-editor-body">
            <div>
              <DemoField label={t(uiLang, "title")} value={t(uiLang, "landDemoVideo1")} />
              <DemoField label={t(uiLang, "description")} value={t(uiLang, "landDemoDescription")} tall />
              <DemoField label={t(uiLang, "tags")} value="travel, city guide, weekend, food, architecture" />
            </div>
            <div className="demo-settings">
              <DemoField label={t(uiLang, "videoLanguage")} value={t(uiLang, "landDemoLanguage")} />
              <DemoField label={t(uiLang, "videoCategory")} value={t(uiLang, "landDemoTravelCategory")} />
              <DemoField label={t(uiLang, "videoVisibility")} value={t(uiLang, "filterScheduled")} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function DemoCalendar({ uiLang }) {
  const entries = {2:["17:00","KYOTO"],4:["12:00","TOKYO"],7:["09:00","FUJI"],9:["17:00","SEOUL"],11:["12:00","BALI"],14:["17:00","ROME"],16:["09:00","KYOTO"],18:["17:00","TOKYO"],21:["09:00","FUJI"],23:["17:00","SEOUL"],25:["12:00","BALI"]};
  return <div className="land-calendar-demo land-real-demo" aria-label={t(uiLang, "calendar")}>
    <DemoChrome uiLang={uiLang} active="calendar" compact />
    <div className="demo-calendar-toolbar"><b>{t(uiLang,"calendar")}</b><span>‹</span><strong>{t(uiLang,"landDemoOctober")} 2026</strong><span>›</span><button type="button">{t(uiLang,"today")}</button></div>
    <div className="demo-calendar-workspace">
      <div className="demo-calendar-main">
        <div className="demo-calendar-week">{["1","2","3","4","5","6","7"].map((d,i)=><span key={i}>{t(uiLang,`weekdayShort${d}`)}</span>)}</div>
        <div className="demo-calendar-grid">{Array.from({length:28},(_,i)=>{const item=entries[i];return <div className={i===16?"selected":""} key={i}><small>{i+1}</small>{item?<span><b>{item[0]}</b> {item[1]}</span>:null}</div>})}</div>
      </div>
      <aside className="demo-calendar-inspector">
        <DemoThumb code="KYOTO" variant="sunset" />
        <b>{t(uiLang,"landDemoVideo1")}</b><small>{t(uiLang,"landDemoScheduled")}</small>
        <DemoField label={t(uiLang,"landDemoDate")} value="17.10.2026" /><DemoField label={t(uiLang,"landDemoTime")} value="09:00" />
        <button type="button">{t(uiLang,"landDemoScheduled")}</button>
      </aside>
    </div>
  </div>;
}

function DemoAiControl({ uiLang }) {
  return <div className="land-ai-demo land-real-demo" aria-label="AI">
    <div className="land-ai-demo-head"><span>AI</span><b>{t(uiLang, "landAiConnectTitle")}</b></div>
    <div className="land-ai-providers" aria-label={t(uiLang, "landAiProvidersLabel")}>
      <span>OpenAI</span><span>Gemini</span><span>Anthropic</span><span>xAI</span><span>Groq</span>
    </div>
    <label><span>{t(uiLang, "landAiApiKey")}</span><div>••••••••••••••••</div></label>
    <label><span>{t(uiLang, "landAiModel")}</span><div>Gemini 3.6 Flash <b>⌄</b></div></label>
    <button type="button">✦ {t(uiLang, "landDemoImproveAi")}</button>
    <small>{t(uiLang, "landAiDraftNote")}</small>
  </div>;
}

function DemoChrome({ uiLang, active, compact = false }) {
  return <><div className="demo-real-top"><b className="demo-real-logo">M</b><strong>Atlas Studio</strong>{["videos","playlists","calendar","statistics"].map(key=><span className={active===key?"active":""} key={key}>{t(uiLang,key)}</span>)}<i /> <small>{t(uiLang,"landDemoBadge")}</small></div><div className="demo-real-sync"><b>{t(uiLang,"landDemoData")}</b><span>36</span><i />18.10.2026 · 16:35</div></>;
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

