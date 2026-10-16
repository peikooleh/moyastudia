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
          <span className="active">{t(uiLang, "landDemoNavVideos")}</span>
          <span>{t(uiLang, "landDemoNavPlaylists")}</span>
          <span>{t(uiLang, "landDemoNavCalendar")}</span>
          <span>{t(uiLang, "landDemoNavStatistics")}</span>
        </nav>
        <aside className="demo-video-list">
          <div className="demo-sync-mini"><b>{t(uiLang, "landDemoSynced")}</b><span>36</span></div>
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
            <DemoThumb code="KYOTO" variant="sunset" large />
            <div className="demo-video-summary"><h3>{t(uiLang, "landDemoVideo1")}</h3><div className="demo-video-facts"><span><b>{t(uiLang, "landDemoStatusLabel")}</b>{t(uiLang, "filterScheduled")}</span><span><b>{t(uiLang, "landDemoPublishedLabel")}</b>18.10.2026 · 17:00</span><span><b>{t(uiLang, "landDemoDurationLabel")}</b>12:34</span></div><button type="button">{t(uiLang, "landDemoChangeCover")}</button></div>
          </div>
          <div className="demo-editor-cols">
            <div>
              <DemoField label={t(uiLang, "title")} value={t(uiLang, "landDemoVideo1")} />
              <DemoField label={t(uiLang, "description")} value={t(uiLang, "landDemoDescription")} tall />
              <div className="demo-field"><span>{t(uiLang, "tags")}</span><div className="demo-tag-row"><i>{t(uiLang,"landDemoTag1")} ×</i><i>{t(uiLang,"landDemoTag2")} ×</i><i>{t(uiLang,"landDemoTag3")} ×</i><i>{t(uiLang,"landDemoTag4")} ×</i></div></div>
            </div>
            <div className="demo-settings">
              <DemoField label={t(uiLang, "videoLanguage")} value={t(uiLang, "landDemoLanguage")} />
              <DemoField label={t(uiLang, "videoCategory")} value={t(uiLang, "landDemoTravelCategory")} />
              <DemoField label={t(uiLang, "videoVisibility")} value={t(uiLang, "filterScheduled")} />
              <DemoField label={t(uiLang, "landDemoDateTime")} value="18.10.2026 · 17:00" />
              <button type="button">✦ {t(uiLang, "landDemoImproveAi")}</button>
            </div>
          </div>
          <div className="demo-editor-actions"><button type="button">{t(uiLang, "cancel")}</button><button type="button" className="primary">{t(uiLang, "save")}</button></div>
        </section>
      </div>
    </div>
  );
}

function DemoCalendar({ uiLang }) {
  const videos = DEMO.videos;
  const schedule = {
    1:[0,"17:00"], 3:[1,"12:00"], 5:[2,"09:00"], 8:[3,"17:00"],
    10:[4,"12:00"], 12:[5,"17:00"], 15:[0,"09:00"], 17:[1,"17:00"],
    19:[2,"09:00"], 22:[3,"17:00"], 24:[4,"12:00"], 26:[5,"17:00"]
  };
  const days = Array.from({length:42},(_,i)=> {
    if (i < 3) return { day: 28 + i, muted: true, key: `prev-${i}` };
    if (i < 34) return { day: i - 2, muted: false, key: `oct-${i}` };
    return { day: i - 33, muted: true, key: `next-${i}` };
  });
  return <div className="land-calendar-demo land-real-demo" aria-label={t(uiLang, "calendar")}>
    <DemoChrome uiLang={uiLang} active="calendar" compact />
    <div className="demo-calendar-workspace">
      <div className="demo-calendar-main">
        <div className="demo-calendar-titlebar">
          <b>{t(uiLang, "calendar")}</b>
          <span className="demo-calendar-queue">{t(uiLang, "landDemoQueue")} <i>12</i></span>
          <div className="demo-calendar-month"><button type="button">←</button><strong>{t(uiLang,"landDemoOctober")} 2026</strong><button type="button">→</button><button type="button">{t(uiLang, "landDemoToday")}</button></div>
        </div>
        <div className="demo-calendar-filter"><span>{t(uiLang,"searchVideos")}</span><b>{t(uiLang,"landDemoAll")}</b></div>
        <div className="demo-calendar-sync"><b>{t(uiLang,"landDemoSynced")}</b><span>{t(uiLang,"landDemoCache")} 36</span></div>
        <div className="demo-calendar-week">{["landDemoMon","landDemoTue","landDemoWed","landDemoThu","landDemoFri","landDemoSat","landDemoSun"].map(key=><span key={key}>{t(uiLang,key)}</span>)}</div>
        <div className="demo-calendar-grid">{days.map((cell,i)=>{
          const item=!cell.muted ? schedule[cell.day] : null;
          const video=item ? videos[item[0]] : null;
          return <div className={`${cell.muted?"muted ":""}${cell.day===17&&!cell.muted?"selected":""}`} key={cell.key}><small>{cell.day}</small>{video?<span title={t(uiLang,`landDemoVideo${item[0]+1}`)}><b>{item[1]}</b> {video.code}</span>:null}</div>
        })}</div>
      </div>
      <aside className="demo-calendar-inspector">
        <DemoThumb code="KYOTO" variant="sunset" />
        <b>{t(uiLang,"landDemoVideo1")}</b>
        <small>{t(uiLang,"landDemoScheduled")}</small>
        <DemoField label={t(uiLang,"landDemoDate")} value="17.10.2026" />
        <DemoField label={t(uiLang,"landDemoTime")} value="09:00" />
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

