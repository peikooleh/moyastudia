"use client";

import { useEffect, useMemo, useState } from "react";
import { readiness } from "../lib/mock";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "private", label: "Private" },
  { id: "unlisted", label: "Unlisted" },
  { id: "scheduled", label: "Сетка" },
];

function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function isoDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function HomePage() {
  const [health, setHealth] = useState(null);
  const [channels, setChannels] = useState([]);
  const [videos, setVideos] = useState([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => new Date());

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, db: false, google_configured: false }));

    fetch(`${API}/channels`)
      .then((r) => (r.ok ? r.json() : []))
      .then(async (chs) => {
        setChannels(chs);
        if (!chs.length) {
          setLoading(false);
          return;
        }
        const res = await fetch(`${API}/channels/${chs[0].id}/videos`);
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.detail || "не удалось прочитать канал");
          setVideos([]);
        } else {
          setVideos(data);
          if (data[0]) setSelectedId(data[0].id);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoadError("API не отвечает");
        setLoading(false);
      });
  }, []);

  const selected = videos.find((v) => v.id === selectedId) || null;
  const light = readiness(selected);

  const visible = useMemo(() => {
    return videos.filter((v) => {
      if (filter !== "all" && v.status !== filter) return false;
      if (query && !v.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [videos, filter, query]);

  const days = monthMatrix(cursor.getFullYear(), cursor.getMonth());
  const slotted = new Set(videos.filter((v) => v.slot).map((v) => v.slot.slice(0, 10)));

  function patch(field, value) {
    if (!selected) return;
    setVideos((prev) =>
      prev.map((v) => (v.id === selected.id ? { ...v, [field]: value } : v))
    );
  }

  function pickDay(d) {
    if (!selected) return;
    const time = (selected.slot && selected.slot.slice(11, 16)) || "18:00";
    patch("slot", `${isoDay(d)}T${time}`);
  }

  const channelTitle = channels[0]?.title || "канал не выбран";

  return (
    <div className="app">
      <header className="top">
        <div className="brand">MOYASTUDIA</div>
        <div className="channel">{channelTitle}</div>
        <div className="spacer" />
        <div className="pills">
          <span className={`pill ${health?.ok ? "on" : "off"}`}>
            API {health?.ok ? "ок" : "нет"}
          </span>
          <span className={`pill ${health?.db ? "on" : "off"}`}>
            База {health?.db ? "ок" : "нет"}
          </span>
          <span className={`pill ${health?.google_configured ? "on" : "off"}`}>
            Google {health?.google_configured ? "ок" : "нет"}
          </span>
        </div>
        <a className="btn" href={`${API}/auth/youtube/login`}>
          Подключить канал
        </a>
      </header>

      <div className="body">
        <section className="col">
          <div className="col-head">
            <h2>Выпуски</h2>
            <div className="filters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`chip ${filter === f.id ? "active" : ""}`}
                  onClick={() => setFilter(f.id)}
                  type="button"
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              className="search"
              placeholder="Поиск по названию"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="list">
            {visible.length === 0 ? (
              <div className="empty">{loading ? "Читаю канал…" : loadError || "На канале нет роликов под фильтр."}</div>
            ) : (
              visible.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`item ${v.id === selectedId ? "active" : ""}`}
                  onClick={() => setSelectedId(v.id)}
                >
                  <div className="item-title">{v.title}</div>
                  <div className="item-meta">
                    <span>{v.status}</span>
                    <span>{v.slot ? v.slot.replace("T", " ") : "без слота"}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="col">
          <div className="card-wrap">
            {!selected ? (
              <div className="empty">Выберите выпуск слева.</div>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>{selected.title}</h2>
                <div className="item-meta" style={{ marginBottom: 16 }}>
                  <span>ID {selected.youtubeId}</span>
                  <span>{selected.privacy}</span>
                </div>
                <div className="lights">
                  <span className={`light ${light}`}>
                    {light === "red" && "Красный — нет названия или описания"}
                    {light === "yellow" && "Жёлтый — можно писать черновик"}
                    {light === "green" && "Зелёный — полный комплект"}
                    {light === "empty" && "Не выбран"}
                  </span>
                </div>
                <div className="field">
                  <label>Название</label>
                  <input value={selected.title} readOnly />
                </div>
                <div className="field">
                  <label>Описание</label>
                  <textarea value={selected.description} readOnly />
                </div>
                <div className="field">
                  <label>Теги</label>
                  <input value={selected.tags} readOnly />
                </div>
                <div className="row2">
                  <div className="field">
                    <label>Категория</label>
                    <select
                      value={selected.category}
                      onChange={(e) => patch("category", e.target.value)}
                    >
                      <option value="27">Education</option>
                      <option value="22">People & Blogs</option>
                      <option value="24">Entertainment</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Плейлист</label>
                    <input
                      value={selected.playlist}
                      onChange={(e) => patch("playlist", e.target.value)}
                    />
                  </div>
                </div>
                <div className="row2">
                  <div className="field">
                    <label>Язык</label>
                    <select
                      value={selected.language}
                      onChange={(e) => patch("language", e.target.value)}
                    >
                      <option value="ru">Русский</option>
                      <option value="uk">Українська</option>
                      <option value="de">Deutsch</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Доступ</label>
                    <select
                      value={selected.privacy}
                      onChange={(e) => patch("privacy", e.target.value)}
                    >
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Слот публикации</label>
                  <input
                    type="datetime-local"
                    value={selected.slot}
                    onChange={(e) => patch("slot", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Обложка</label>
                  {selected.thumb ? <img src={selected.thumb} alt="" style={{ width: "100%", borderRadius: 12 }} /> : <div className="thumb">нет обложки</div>}
                </div>
                <button className="btn" type="button" disabled>
                  Записать на YouTube
                </button>
                <p className="empty" style={{ paddingLeft: 0 }}>
                  Сейчас только чтение. На YouTube ничего не пишем.
                </p>
              </>
            )}
          </div>
        </section>

        <section className="col">
          <div className="col-head">
            <h2>Сетка</h2>
          </div>
          <div className="cal">
            <div className="cal-nav">
              <button
                className="btn ghost"
                type="button"
                onClick={() =>
                  setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
                }
              >
                ←
              </button>
              <strong>
                {cursor.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
              </strong>
              <button
                className="btn ghost"
                type="button"
                onClick={() =>
                  setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
                }
              >
                →
              </button>
            </div>
            <div className="cal-grid">
              {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((d) => (
                <div key={d} className="cal-dow">
                  {d}
                </div>
              ))}
              {days.map((d) => {
                const key = isoDay(d);
                const muted = d.getMonth() !== cursor.getMonth();
                const selectedDay = selected?.slot?.slice(0, 10) === key;
                return (
                  <button
                    key={key + String(muted)}
                    type="button"
                    className={`cal-day ${muted ? "muted" : ""} ${slotted.has(key) ? "has" : ""} ${selectedDay ? "selected" : ""}`}
                    onClick={() => pickDay(d)}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="slot-list">
              Клик по дню ставит дату в карточку. Подчёркнуты дни, где уже есть слот.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
