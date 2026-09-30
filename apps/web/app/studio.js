"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrefs } from "./providers";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const VIEWS = [
  { id: "catalog", label: "Каталог" },
  { id: "playlists", label: "Плейлисты" },
  { id: "grid", label: "Сетка" },
];
const FILTERS = [
  { id: "all", label: "Все" },
  { id: "public", label: "Public" },
  { id: "private", label: "Private" },
  { id: "unlisted", label: "Unlisted" },
  { id: "scheduled", label: "Сетка" },
];
const SORTS = [
  { id: "date", label: "Дата" },
  { id: "title", label: "Название" },
  { id: "status", label: "Статус" },
];

function lightOf(v) {
  if (!v) return "red";
  if (v.title && v.description && v.playlist && v.language && v.slot) return "green";
  if (v.title && v.description) return "yellow";
  return "red";
}

function monthMatrix(anchor) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < start; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(y, m, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function Studio() {
  const { prefs } = usePrefs();
  const [view, setView] = useState("catalog");
  const [videos, setVideos] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("date");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [pickedPl, setPickedPl] = useState("");
  const [err, setErr] = useState("");
  const [ch, setCh] = useState(null);
  const [month, setMonth] = useState(() => new Date());
  const [coverName, setCoverName] = useState("");
  const [subName, setSubName] = useState("");

  useEffect(() => {
    fetch(`${API}/channels`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const id = prefs.selectedChannelId;
        setCh(rows.find((r) => String(r.id) === String(id)) || rows[0] || null);
      })
      .catch(() => setCh(null));
  }, [prefs.selectedChannelId]);

  useEffect(() => {
    const id = prefs.selectedChannelId;
    if (!id) return;
    fetch(`${API}/channels/${id}/videos`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || "read fail");
        return data;
      })
      .then((rows) => {
        setVideos(rows);
        if (rows[0]) setSelectedId(rows[0].id);
        setErr("");
      })
      .catch((e) => setErr(String(e.message || e)));
    fetch(`${API}/channels/${id}/playlists`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        setPlaylists(rows);
        if (rows[0]) setPickedPl(rows[0].id);
      })
      .catch(() => setPlaylists([]));
  }, [prefs.selectedChannelId]);

  const selected = videos.find((v) => v.id === selectedId) || null;
  const playlist = playlists.find((p) => p.id === pickedPl) || null;
  const visible = useMemo(() => {
    const rows = videos.filter((v) => {
      if (filter !== "all" && v.status !== filter) return false;
      if (query && !v.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "status") return (a.status || "").localeCompare(b.status || "");
      return (b.publishedAt || b.slot || "").localeCompare(a.publishedAt || a.slot || "");
    });
    return copy;
  }, [videos, filter, query, sort]);

  const light = lightOf(selected);
  const counts = videos.reduce((acc, v) => {
    const k = v.status || "other";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const now = new Date().toISOString().slice(0, 16);
  const upcoming = videos
    .filter((v) => v.status === "scheduled" && v.slot && v.slot > now)
    .sort((a, b) => a.slot.localeCompare(b.slot))[0];
  const last = videos
    .filter((v) => v.publishedAt)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  const cells = monthMatrix(month);
  const byDay = {};
  videos.forEach((v) => {
    const key = (v.slot || v.publishedAt || "").slice(0, 10);
    if (!key) return;
    byDay[key] = byDay[key] || [];
    byDay[key].push(v);
  });
  const quotaLeft = Math.max(0, (prefs.dailyEdits || 20) - (prefs.usedEdits || 0));

  return (
    <div className="studio-wrap">
      <div className="studio-head">
        {ch && ch.thumbnail_url ? (
          <img className="studio-logo" referrerPolicy="no-referrer" src={ch.thumbnail_url} alt="" />
        ) : (
          <span className="avatar">{(ch && ch.title ? ch.title : "?").slice(0, 1)}</span>
        )}
        <div className="channel-banner">
          {ch && ch.banner_url ? (
            <img referrerPolicy="no-referrer" src={ch.banner_url} alt="" />
          ) : null}
        </div>
        <div className="studio-stats">
          <div>{["public", "private", "unlisted", "scheduled"].map((k) => `${k} ${counts[k] || 0}`).join(" · ")}</div>
          <div title={upcoming ? upcoming.title : ""}>ближайшая {upcoming ? upcoming.slot.replace("T", " ") : "—"}</div>
          <div title={last ? last.title : ""}>последняя {last ? last.publishedAt.replace("T", " ") : "—"}</div>
          <div>квота правок {quotaLeft}/{prefs.dailyEdits || 20}</div>
        </div>
      </div>

      <div className="studio-tabs">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" className={view === v.id ? "on" : ""} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {view === "catalog" ? (
        <div className="studio">
          <aside className="studio-list">
            <div className="studio-tools">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" className={`chip ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
              <select value={sort} onChange={(e) => setSort(e.target.value)} title="Сортировка">
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <input className="search" placeholder="поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="list">
              {err ? <div className="empty">{err}</div> : null}
              {visible.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`item ${v.id === selectedId ? "active" : ""}`}
                  onClick={() => setSelectedId(v.id)}
                >
                  <div className="item-title">{v.title}</div>
                  <div className="item-meta">
                    <span>{v.status}</span>
                    <span>{(v.slot || v.publishedAt || "").replace("T", " ")}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>
          <section className="studio-card">
            {!selected ? (
              <div className="empty">Выберите ролик</div>
            ) : (
              <>
                {selected.thumb ? <img className="cover" src={selected.thumb} alt="" /> : null}
                <div className={`light ${light}`}>{light}</div>
                <h2>{selected.title}</h2>
                <div className="meta-grid">
                  <label>Title<input value={selected.title} readOnly /></label>
                  <label>Язык<input value={selected.language || "—"} readOnly /></label>
                  <label className="wide">Description<textarea value={selected.description} readOnly /></label>
                  <label className="wide">Tags<input value={selected.tags} readOnly /></label>
                  <label>Плейлисты<input value={selected.playlist || "—"} readOnly /></label>
                  <label>Категория<input value={selected.category || "—"} readOnly /></label>
                  <label>Приватность<input value={selected.privacy || selected.status || "—"} readOnly /></label>
                  <label>Слот<input value={selected.slot || "—"} readOnly /></label>
                  <label>Опубликован<input value={(selected.publishedAt || "").replace("T", " ") || "—"} readOnly /></label>
                  <label>Длительность<input value={selected.duration || "—"} readOnly /></label>
                  <label>Просмотры<input value={selected.views ?? "—"} readOnly /></label>
                  <label>Лайки<input value={selected.likes ?? "—"} readOnly /></label>
                  <label>Комментарии<input value={selected.comments ?? "—"} readOnly /></label>
                  <label>Субтитры на YouTube<input value={selected.captions ? "есть" : "нет"} readOnly /></label>
                  <label>Для детей<input value={selected.madeForKids === true ? "да" : selected.madeForKids === false ? "нет" : "—"} readOnly /></label>
                </div>
                <div className="studio-actions">
                  <label className="btn ghost file-btn">
                    Обложка{coverName ? `: ${coverName}` : ""}
                    <input type="file" accept="image/*" hidden onChange={(e) => setCoverName(e.target.files?.[0]?.name || "")} />
                  </label>
                  <label className="btn ghost file-btn">
                    Субтитры{subName ? `: ${subName}` : ""}
                    <input type="file" accept=".srt,.vtt" hidden onChange={(e) => setSubName(e.target.files?.[0]?.name || "")} />
                  </label>
                  <button type="button" className="btn ghost" onClick={() => {
                    const blob = new Blob([JSON.stringify({ videos }, null, 2)], { type: "application/json" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "content-plan.json";
                    a.click();
                  }}>Экспорт плана</button>
                  <label className="btn ghost file-btn">
                    Импорт плана
                    <input type="file" accept="application/json" hidden onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const data = JSON.parse(await f.text());
                      if (Array.isArray(data.videos)) setVideos(data.videos);
                    }} />
                  </label>
                </div>
                <div className="previews">
                  <div>
                    <span>Desktop</span>
                    <div className="snip">
                      {selected.thumb ? <img src={selected.thumb} alt="" /> : null}
                      <b>{selected.title}</b>
                      <p>{(selected.description || "").slice(0, 90)}</p>
                    </div>
                  </div>
                  <div>
                    <span>Mobile</span>
                    <div className="snip mob">
                      {selected.thumb ? <img src={selected.thumb} alt="" /> : null}
                      <b>{selected.title}</b>
                    </div>
                  </div>
                </div>
                <button className="btn" type="button" disabled title="запись включим следующим шагом">
                  Записать на YouTube
                </button>
              </>
            )}
          </section>
        </div>
      ) : null}

      {view === "playlists" ? (
        <div className="studio">
          <aside className="studio-list">
            <div className="studio-tools">
              <button className="chip" type="button" disabled>+ полка</button>
            </div>
            <div className="list">
              {playlists.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`item ${p.id === pickedPl ? "active" : ""}`}
                  onClick={() => setPickedPl(p.id)}
                >
                  <div className="item-title">{p.title}</div>
                </button>
              ))}
              {!playlists.length ? <div className="empty">Плейлистов нет или API не отдал список</div> : null}
            </div>
          </aside>
          <section className="studio-card">
            {!playlist ? (
              <div className="empty">Выберите плейлист</div>
            ) : (
              <>
                {playlist.thumb ? <img className="cover" src={playlist.thumb} alt="" /> : null}
                <h2>{playlist.title}</h2>
                <div className="meta-grid">
                  <label>Название<input value={playlist.title} readOnly /></label>
                  <label>Роликов<input value={playlist.itemCount ?? 0} readOnly /></label>
                  <label className="wide">Описание<textarea value={playlist.description || ""} readOnly /></label>
                  <label>Создан<input value={playlist.publishedAt || "—"} readOnly /></label>
                  <label>Приватность<input value={playlist.privacy || "—"} readOnly /></label>
                </div>
                <div className="studio-actions">
                  <label className="btn ghost file-btn">Обложка полки<input type="file" accept="image/*" hidden /></label>
                  <button type="button" className="btn" disabled>Создать полку</button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      {view === "grid" ? (
        <div className="studio-grid">
          <div className="cal-nav">
            <button type="button" className="btn ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
            <strong>
              {month.toLocaleString("ru", { month: "long", year: "numeric" })}
            </strong>
            <button type="button" className="btn ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
          </div>
          <div className="cal">
            {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((d) => (
              <div key={d} className="cal-h">{d}</div>
            ))}
            {cells.map((day, i) => {
              const key = day ? day.toISOString().slice(0, 10) : `e${i}`;
              const items = day ? byDay[key] || [] : [];
              return (
                <div key={key} className={`cal-cell ${day ? "" : "off"}`}>
                  {day ? <b>{day.getDate()}</b> : null}
                  {items.slice(0, 3).map((v) => (
                    <span key={v.id} title={v.title}>{v.title}</span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
