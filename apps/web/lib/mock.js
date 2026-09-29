export const MOCK_VIDEOS = [
  {
    id: "v1",
    youtubeId: "dQw000001",
    title: "A1 Verben — gehen, kommen, sehen",
    description: "Три формы глаголов. Уровень A1.",
    tags: "немецкий, A1, глаголы",
    category: "27",
    playlist: "A1 Verben",
    language: "ru",
    privacy: "private",
    slot: "2026-10-03T18:00",
    status: "private",
  },
  {
    id: "v2",
    youtubeId: "dQw000002",
    title: "A1 Nomen — Haus, Stadt, Weg",
    description: "",
    tags: "",
    category: "27",
    playlist: "A1 Nomen",
    language: "ru",
    privacy: "private",
    slot: "",
    status: "private",
  },
  {
    id: "v3",
    youtubeId: "dQw000003",
    title: "Shorts: wollen / können / müssen",
    description: "Модальные глаголы, 45 секунд.",
    tags: "shorts, модальные",
    category: "27",
    playlist: "Shorts",
    language: "uk",
    privacy: "unlisted",
    slot: "2026-10-04T09:30",
    status: "unlisted",
  },
  {
    id: "v4",
    youtubeId: "dQw000004",
    title: "B1 Adjektive — kompakt",
    description: "Сравнительная степень.",
    tags: "B1",
    category: "27",
    playlist: "",
    language: "ru",
    privacy: "private",
    slot: "2026-10-10T17:00",
    status: "scheduled",
  },
  {
    id: "v5",
    youtubeId: "dQw000005",
    title: "A2 Trennbare Verben",
    description: "anrufen, aufstehen, mitkommen.",
    tags: "A2, verben",
    category: "27",
    playlist: "A2 Verben",
    language: "ru",
    privacy: "private",
    slot: "",
    status: "private",
  },
];

export function readiness(video) {
  if (!video) return "empty";
  const core = video.title && video.description;
  const pack = core && video.playlist && video.language;
  const dated = pack && video.slot;
  if (dated) return "green";
  if (core) return "yellow";
  return "red";
}
