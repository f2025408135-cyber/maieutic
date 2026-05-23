// Typed translation dictionary shared between server and client code.
// Cookie-based locale selection — see src/lib/i18n/server.ts and
// src/components/LanguageSwitcher.tsx.

export type Lang = "en" | "es" | "ur";

export const LANGS: readonly Lang[] = ["en", "es", "ur"] as const;
export const DEFAULT_LANG: Lang = "en";
export const LANG_COOKIE = "maieutic_lang";

export function isLang(v: string | undefined | null): v is Lang {
  return v === "en" || v === "es" || v === "ur";
}

// BCP-47 tag for the <html lang> attribute and prompt directives.
export const LANG_TAG: Record<Lang, string> = {
  en: "en",
  es: "es",
  ur: "ur",
};

// Name shown in the language switcher for each language, in the language
// itself (so a Spanish-speaker sees "Español").
export const LANG_LABEL: Record<Lang, string> = {
  en: "English",
  es: "Español",
  ur: "Roman Urdu",
};

// The name used in LLM directives ("Respond in English" / "Responde en
// español"). Kept separate from labels so the directive reads naturally.
export const LANG_DIRECTIVE_NAME: Record<Lang, string> = {
  en: "English",
  es: "Spanish",
  ur: "Roman Urdu (Urdu written in the Latin alphabet using English characters, commonly used for chatting in Pakistan. E.g. 'Aap ne loop dynamic bounds ke sath specify kiya hai')",
};
