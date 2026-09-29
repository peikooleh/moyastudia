"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function HomePage() {
  const [health, setHealth] = useState(null);
  const [channels, setChannels] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError("API не отвечает. Запущен ли uvicorn на :8000?"));

    fetch(`${API}/channels`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setChannels)
      .catch(() => {});
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 20px" }}>
      <p style={{ letterSpacing: "0.12em", color: "#9aa0a6", fontSize: 12 }}>
        MOYASTUDIA
      </p>
      <h1 style={{ fontWeight: 600, marginTop: 8 }}>Кабинет канала</h1>
      <p style={{ color: "#9aa0a6", lineHeight: 1.5 }}>
        Подключаем уже лежащие на YouTube ролики. Загрузки MP4 здесь нет.
      </p>

      <section
        style={{
          marginTop: 28,
          padding: 16,
          border: "1px solid #2a2f38",
          borderRadius: 12,
        }}
      >
        <div>API: {health ? (health.ok ? "живой" : "ошибка") : "проверяю…"}</div>
        <div>База: {health ? (health.db ? "подключена" : "нет связи") : "—"}</div>
        <div>
          Google:{" "}
          {health
            ? health.google_configured
              ? "ключи на месте"
              : "нет Client ID"
            : "—"}
        </div>
        {error ? <p style={{ color: "#f28b82" }}>{error}</p> : null}
      </section>

      <a
        href={`${API}/auth/youtube/login`}
        style={{
          display: "inline-block",
          marginTop: 24,
          background: "#8ab4f8",
          color: "#0f1115",
          padding: "10px 16px",
          borderRadius: 8,
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Подключить YouTube-канал
      </a>

      <h2 style={{ marginTop: 36, fontSize: 18 }}>Каналы</h2>
      {channels.length === 0 ? (
        <p style={{ color: "#9aa0a6" }}>Пока ни одного. Нажмите кнопку выше.</p>
      ) : (
        <ul>
          {channels.map((ch) => (
            <li key={ch.id}>
              {ch.title}{" "}
              <span style={{ color: "#9aa0a6" }}>({ch.youtube_channel_id})</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
