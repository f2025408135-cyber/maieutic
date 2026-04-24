import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, isLang, type Lang } from "./dict";
import { en, type Dict } from "./en";
import { es } from "./es";

const DICTS: Record<Lang, Dict> = { en, es };

export async function getLang(): Promise<Lang> {
  const store = await cookies();
  const v = store.get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
}

export async function getDict(): Promise<Dict> {
  return DICTS[await getLang()];
}

export function dictFor(lang: Lang): Dict {
  return DICTS[lang];
}
