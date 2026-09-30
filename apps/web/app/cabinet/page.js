"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "../../lib/i18n";
import { CHANNEL_LANGS, UI_LANGS } from "../../lib/prefs";
import { ThemePicker } from "../theme-picker";
import { usePrefs } from "../providers";
import { Shell } from "../shell";
import { QuotaRings } from "../quota-rings";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PICK_LANGS = UI_LANGS.filter((l) => l.id !== "auto");

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.round(x)));
}

export default function CabinetPage() {
  const { prefs, uiLang, update } = usePrefs();
  const router = useRouter();
  const [tab, setTab] = useState("profile");
  const [channels, setChannels] = useState([]);
  const [serverKeys, setServerKeys] = useState(false);
  const [stats, setStats] = useState({});
  const [langEdit, setLangEdit] = useState("");

  useEffect(() => {
    if (!prefs.signedIn) router.replace("/");
  }, [prefs.signedIn, router]);

  function loadChannels() {
    return fetch(`${API}/channels`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        setChannels(rows);
        return rows;
      })
      .catch(() => {
        setChannels([]);
        return [];
      });
  }

  useEffect(() => {
    loadChannels().then((rows) => {
      (rows || []).forEach((pick) => {
        if (!pick.has_token) return;
        fetch(`${API}/channels/${pick.id}/refresh-profile`, { method: "POST" })
          .then((r) => (r.ok ? r.json() : null))
          .then((fresh) => {
            if (!fresh) return;
            setChannels((prev) => prev.map((c) => (c.id === fresh.id ? { ...c, ...fresh } : c)));
          })
          .catch(() => {});
      });
    });
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((h) => setServerKeys(Boolean(h.google_configured)))
      .catch(() => setServerKeys(false));
  }, []);

  useEffect(() => {
    if (!prefs.selectedChannelId) return;
    fetch(`${API}/channels/${prefs.selectedChannelId}/videos`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const acc = { public: 0, private: 0, unlisted: 0, scheduled: 0 };
        for (const v of rows || []) {
          const k = v.status || "private";
          acc[k] = (acc[k] || 0) + 1;
        }
        setStats(acc);
      })
      .catch(() => setStats({}));
  }, [prefs.selectedChannelId]);

  const ch = channels.find((c) => String(c.id) === String(prefs.selectedChannelId)) || channels[0];

  return (
    <Shell>
      <div className="cab">
        <aside className="side">
          <button className={tab === "profile" ? "on" : ""} type="button" onClick={() => setTab("profile")}>
            {t(uiLang, "profile")}
          </button>
          <button className={tab === "channels" ? "on" : ""} type="button" onClick={() => setTab("channels")}>
            {t(uiLang, "channels")}
          </button>
          <button className={tab === "interface" ? "on" : ""} type="button" onClick={() => setTab("interface")}>
            {t(uiLang, "interface")}
          </button>
        </aside>
        <section className="main">
          {tab === "profile" && (
            <div className="panel">
              <h1>{t(uiLang, "profile")}</h1>
              <div className="profile-row">
                <div className="profile-fields">
                  <div className="field">
                    <label>{t(uiLang, "displayName")}</label>
                    <input
                      title={(prefs.displayName || t(uiLang, "tipName"))}
                      maxLength={80}
                      value={prefs.displayName}
                      onChange={(e) => update({ displayName: e.target.value.slice(0, 80) })}
                    />
                  </div>
                  <div className="field">
                    <label>{t(uiLang, "email")}</label>
                    <input
                      title={(prefs.email || ch?.owner_email || t(uiLang, "tipEmail"))}
                      maxLength={120}
                      value={prefs.email || ch?.owner_email || ""}
                      onChange={(e) => update({ email: e.target.value.slice(0, 120) })}
                    />
                  </div>
                  {serverKeys ? (
                    <div className="field" style={{ gridColumn: "1 / -1" }}>
                      <label>Google</label>
                      <input title={t(uiLang, "tipKeys")} value="ключи заданы на сервере" readOnly />
                    </div>
                  ) : (
                    <>
                      <div className="field">
                        <label>Client ID</label>
                        <input
                          value={prefs.googleClientId}
                          onChange={(e) => update({ googleClientId: e.target.value.trim() })}
                        />
                      </div>
                      <div className="field">
                        <label>Client secret</label>
                        <input
                          type="password"
                          value={prefs.googleClientSecret}
                          onChange={(e) => update({ googleClientSecret: e.target.value.trim() })}
                        />
                      </div>
                    </>
                  )}
                </div>
                <div title={t(uiLang, "tipQuota")}>
                <QuotaRings
                  editsCap={prefs.dailyEdits || 20}
                  editsUsed={prefs.usedEdits || 0}
                  uploadsCap={prefs.dailyUploads || 10}
                  uploadsUsed={prefs.usedUploads || 0}
                />
                </div>
              </div>
              <h2>ИИ-модели</h2>
              <div className="mock-grid">
                <label className="field">
                  OpenAI
                  <input placeholder="sk-…" disabled title="скоро" />
                </label>
                <label className="field">
                  Anthropic
                  <input placeholder="ключ Claude" disabled title="скоро" />
                </label>
                <label className="field">
                  Google Gemini
                  <input placeholder="ключ Gemini" disabled title="скоро" />
                </label>
              </div>
            </div>
          )}

          {tab === "channels" && (
            <div className="panel">
              <h1>{t(uiLang, "channels")}</h1>
              <div className="chan-split">
                <div className="tiles">
                {channels.slice(0, 5).map((item) => {
                  const on = String(item.id) === String(prefs.selectedChannelId);
                  return (
                    <div
                      key={item.id}
                      className={`tile ${on ? "on" : ""}`}
                      title={on ? t(uiLang, "selected") : t(uiLang, "tipSelect")}
                      onClick={() => {
                        if (!on) update({ selectedChannelId: String(item.id) });
                      }}
                    >
                                            {item.thumbnail_url ? (
                        <img className="tile-logo" referrerPolicy="no-referrer" src={item.thumbnail_url} alt="" />
                      ) : (
                        <span className="avatar">{(item.title || "?").slice(0, 1)}</span>
                      )}
                      <strong className="tile-name">{item.title}</strong>
                      <div className="tile-meta">
                        <div className="tile-id-row">
                          <span>ID</span>
                          <em title={item.youtube_channel_id}>{item.youtube_channel_id}</em>
                          <button
                            type="button"
                            className="ico"
                            title="Копировать ID"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(item.youtube_channel_id || "");
                            }}
                          >
                            ⎘
                          </button>
                        </div>
                        <div>Создан {item.yt_published_at || "—"}</div>
                        <div>
                          Язык{" "}
                          {(CHANNEL_LANGS.find((l) => l.id === (prefs.channelLangs[String(item.id)] || "")) || { label: t(uiLang, "notSet") }).label}
                        </div>
                      </div>
                      <div className="tile-foot">
                        <button
                          type="button"
                          className="ico"
                          title={t(uiLang, "tipLangChannel")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLangEdit(langEdit === String(item.id) ? "" : String(item.id));
                          }}
                        >
                          A
                        </button>
                        {langEdit === String(item.id) ? (
                          <select
                            className="tile-lang-edit"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            value={prefs.channelLangs[String(item.id)] || ""}
                            onChange={(e) => {
                              update({
                                channelLangs: {
                                  ...prefs.channelLangs,
                                  [String(item.id)]: e.target.value,
                                },
                              });
                              setLangEdit("");
                            }}
                          >
                            <option value="">{t(uiLang, "notSet")}</option>
                            {CHANNEL_LANGS.map((lang) => (
                              <option key={lang.id} value={lang.id}>
                                {lang.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          className="ico"
                          title={t(uiLang, "tipDisconnect")}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm(t(uiLang, "disconnect") + " — " + item.title)) return;
                            setChannels((prev) => prev.filter((c) => c.id !== item.id));
                            if (on) update({ selectedChannelId: "" });
                            await fetch(`${API}/channels/${item.id}`, { method: "DELETE" });
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
                {channels.length < 5 ? (
                  <a className="tile add" href={`${API}/auth/youtube/login`} title={t(uiLang, "tipAddChannel")}>
                    +
                  </a>
                ) : null}
                </div>
                {ch ? (
                  <article className="chan-card">
                    {ch.banner_url ? (
                      <img className="chan-card-banner" referrerPolicy="no-referrer" src={ch.banner_url} alt="" />
                    ) : null}
                    <div className="chan-card-body">
                      <div className="chan-title-row">
                        <h2 className="chan-name">{ch.title}</h2>
                        <div className="chan-created">
                          <span>создан</span>
                          <b>{ch.yt_published_at || "—"}</b>
                        </div>
                      </div>
                      <div className="chan-kpis">
                        <div>
                          <b>{ch.video_count ?? (stats.public || 0) + (stats.private || 0) + (stats.unlisted || 0) + (stats.scheduled || 0)}</b>
                          <span>ролики</span>
                        </div>
                        <div>
                          <b>{ch.hidden_subscribers ? "скрыто" : (ch.subscriber_count ?? 0)}</b>
                          <span>подписчики</span>
                        </div>
                      </div>
                      <p className="chan-desc">{ch.description || "Описание канала на YouTube пустое"}</p>
                    </div>
                  </article>
                ) : null}
              </div>
            </div>
          )}

          {tab === "interface" && (
            <div className="panel">
              <h1>{t(uiLang, "interface")}</h1>
              <div className="grid2">
                <div>
                  <h2>{t(uiLang, "uiLangTitle")}</h2>
                  <div className="opt-list">
                    {PICK_LANGS.map((lang) => (
                      <button
                        key={lang.id}
                        type="button"
                        className={`opt ${prefs.uiLang === lang.id ? "on" : ""}`}
                        title={t(uiLang, "tipUiLang")}
                        onClick={() => update({ uiLang: lang.id })}
                      >
                        <span className="radio" />
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h2>{t(uiLang, "themeTitle")}</h2>
                  <ThemePicker />
                </div>
              </div>
              <h2>Главная страница студии</h2>
              <p className="hint">Макет блоков студии: какие поля видны, порядок и скрытие. Пока заглушка.</p>
              <div className="mock-studio">
                <div className="mock-block on">Список роликов</div>
                <div className="mock-block on">Карточка видео</div>
                <div className="mock-block">Календарь</div>
                <div className="mock-block">Превью</div>
              </div>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
