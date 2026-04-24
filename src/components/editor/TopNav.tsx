// Shared top nav used on every page: small Maieutic wordmark (with the
// blinking blue cursor) on the left, optional back link beside it.

import Link from "next/link";
import * as React from "react";

export function TopNav({
  back,
  left,
  right,
}: {
  /** Optional "← {label}" link shown after the logo. */
  back?: { href: string; label: string };
  /** Optional content rendered beside the logo (e.g. nav links). */
  left?: React.ReactNode;
  /** Optional right-aligned content (e.g. a Help I'm stuck button). */
  right?: React.ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-[#3e3e42] px-6 py-3.5 bg-[#1e1e1e] sticky top-0 z-30">
      <div className="flex items-center gap-5">
        <Link
          href="/"
          className="flex items-end gap-2 hover:opacity-85 transition-opacity"
          aria-label="Maieutic home"
        >
          <span
            className="inline-block w-3 h-3 rounded-full mb-1.5"
            style={{ backgroundColor: "#007acc" }}
          />
          <span className="text-2xl font-bold tracking-tight leading-none">
            Maieutic
          </span>
          <span
            className="animate-pulse inline-block mb-1"
            style={{
              width: "3px",
              height: "18px",
              backgroundColor: "#007acc",
            }}
            aria-hidden
          />
        </Link>
        {back && (
          <>
            <span className="text-[#3e3e42] text-xl font-light">·</span>
            <Link
              href={back.href}
              className="text-sm text-[#858585] hover:text-white transition-colors"
            >
              ← {back.label}
            </Link>
          </>
        )}
        {left && (
          <>
            <span
              className="text-[#3e3e42] text-xl font-light"
              aria-hidden
            >
              ·
            </span>
            {left}
          </>
        )}
        {right && <div className="ml-auto">{right}</div>}
      </div>
    </header>
  );
}
