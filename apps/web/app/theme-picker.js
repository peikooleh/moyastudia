"use client";

import { t } from "../lib/i18n";
import { usePrefs } from "./providers";

const ITEMS = [
  { id: "auto", key: "themeAuto", hint: "themeAutoHint" },
  { id: "light", key: "themeLight", hint: "themeLightHint" },
  { id: "dark", key: "themeDark", hint: "themeDarkHint" },
];

export function ThemePicker() {
  const { prefs, uiLang, update } = usePrefs();
  return (
    <div className="opt-list">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          title={t(uiLang, item.hint)}
          className={`opt ${prefs.theme === item.id ? "on" : ""}`}
          onClick={() => update({ theme: item.id })}
        >
          <span className="radio" />
          {t(uiLang, item.key)}
        </button>
      ))}
    </div>
  );
}
