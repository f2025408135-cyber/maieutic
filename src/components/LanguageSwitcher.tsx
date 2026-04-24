"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LANG_LABEL, LANGS, type Lang } from "@/lib/i18n/dict";
import { useLang, useT } from "@/lib/i18n/client";

export function LanguageSwitcher({ className }: { className?: string }) {
  const current = useLang();
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function pick(lang: Lang) {
    if (lang === current || busy) return;
    setBusy(true);
    try {
      await fetch("/api/lang", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="group"
      aria-label={t.languageSwitcher.label}
      className={`inline-flex items-center gap-1 text-xs font-mono ${className ?? ""}`}
    >
      <span className="text-[#858585] mr-1" aria-hidden>
        🌐
      </span>
      {LANGS.map((l, i) => (
        <React.Fragment key={l}>
          {i > 0 && <span className="text-[#3e3e42]">·</span>}
          <button
            onClick={() => pick(l)}
            disabled={busy}
            aria-pressed={l === current}
            className={`px-1.5 py-0.5 rounded transition-colors disabled:opacity-60 ${
              l === current
                ? "text-white"
                : "text-[#858585] hover:text-white"
            }`}
          >
            {LANG_LABEL[l]}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
