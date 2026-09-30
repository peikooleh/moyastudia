"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  applyTheme,
  loadPrefs,
  resolveTheme,
  resolveUiLang,
  savePrefs,
} from "../lib/prefs";

const Ctx = createContext(null);

export function PrefsProvider({ children }) {
  const [prefs, setPrefs] = useState(null);

  useEffect(() => {
    const loaded = loadPrefs();
    setPrefs(loaded);
    applyTheme(resolveTheme(loaded));
  }, []);

  useEffect(() => {
    if (!prefs) return;
    applyTheme(resolveTheme(prefs));
  }, [prefs]);

  const api = useMemo(() => {
    if (!prefs) return null;
    return {
      prefs,
      uiLang: resolveUiLang(prefs),
      theme: resolveTheme(prefs),
      update(patch) {
        const next = savePrefs(patch);
        setPrefs(next);
        return next;
      },
    };
  }, [prefs]);

  if (!api) return null;
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePrefs outside provider");
  return ctx;
}
