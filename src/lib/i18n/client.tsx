"use client";

import * as React from "react";
import { en, type Dict } from "./en";
import { es } from "./es";
import type { Lang } from "./dict";

// The client provider only receives the selected `lang` from the server;
// the dictionaries themselves are imported here (client-side) because they
// contain helper functions (pluralizers) that cannot cross the
// server→client props boundary.
const DICTS: Record<Lang, Dict> = { en, es };

type Ctx = { lang: Lang; t: Dict };

const LanguageContext = React.createContext<Ctx | null>(null);

export function LanguageProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  const value = React.useMemo(
    () => ({ lang, t: DICTS[lang] }),
    [lang],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT(): Dict {
  const ctx = React.useContext(LanguageContext);
  if (!ctx)
    throw new Error("useT must be used inside <LanguageProvider>");
  return ctx.t;
}

export function useLang(): Lang {
  const ctx = React.useContext(LanguageContext);
  if (!ctx)
    throw new Error("useLang must be used inside <LanguageProvider>");
  return ctx.lang;
}
