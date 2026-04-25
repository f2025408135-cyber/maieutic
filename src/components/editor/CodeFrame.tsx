// VSCode-looking chrome used by the landing + exercises list. The caller
// supplies the body (one <Line> per editor line); the frame renders the tab
// bar, gutter, and status bar.
//
// Dark+ palette (#1e1e1e / #d4d4d4 / #6a9955 / #569cd6 / #ce9178 / #dcdcaa /
// #4ec9b0 / #b5cea8 / #858585 / #007acc) to match stock VSCode.

import * as React from "react";
import { TopNav } from "./TopNav";
import { StatusBar } from "./StatusBar";

export const SYNTAX = {
  comment: "#6a9955",
  docstring: "#ce9178",
  keyword: "#569cd6",
  string: "#ce9178",
  number: "#b5cea8",
  function: "#dcdcaa",
  type: "#4ec9b0",
  text: "#d4d4d4",
  muted: "#858585",
  bracket: "#ffd700",
  decorator: "#c586c0",
} as const;

export function CodeFrame({
  fileName = "welcome.py",
  language = "Python",
  statusLeft,
  statusRight,
  banner,
  back,
  topNavRight,
  hideTopNav,
  children,
}: {
  fileName?: string;
  language?: string;
  statusLeft?: React.ReactNode;
  statusRight?: React.ReactNode;
  banner?: React.ReactNode;
  /** Optional "← {label}" link in the top nav. */
  back?: { href: string; label: string };
  /** Right-aligned content inside the top nav — e.g. a tiny control
   * that doesn't deserve its own full-width banner. */
  topNavRight?: React.ReactNode;
  /** Suppress the top bar entirely — useful when the body already
   * provides the Maieutic wordmark (e.g. the landing page). */
  hideTopNav?: boolean;
  children: React.ReactNode;
}) {
  const lines = React.Children.toArray(children);
  const LINE_H = 24; // px — tight but readable
  return (
    <div
      className="min-h-screen flex flex-col bg-[#1e1e1e] text-[#d4d4d4] font-mono text-[15px]"
      style={{ lineHeight: `${LINE_H}px` }}
    >
      {!hideTopNav && <TopNav back={back} right={topNavRight} />}
      <TabBar fileName={fileName} />
      {banner && <div className="px-8 pt-10 pb-6">{banner}</div>}
      <div className="flex-1 flex overflow-auto">
        <div
          className="select-none shrink-0 pt-2 pb-6 pr-4 text-right tabular-nums text-[13px]"
          style={{ color: SYNTAX.muted, minWidth: "4rem" }}
        >
          {lines.map((_, i) => (
            <div key={i} style={{ height: `${LINE_H}px` }}>
              {i + 1}
            </div>
          ))}
        </div>
        <div className="flex-1 pt-2 pb-6 pr-8">
          {lines.map((child, i) => (
            <div
              key={i}
              className="whitespace-pre"
              style={{ height: `${LINE_H}px` }}
            >
              {child}
            </div>
          ))}
        </div>
      </div>
      <StatusBar left={statusLeft} right={statusRight ?? language} />
    </div>
  );
}

function TabBar({ fileName }: { fileName: string }) {
  return (
    <div className="flex items-stretch bg-[#2d2d30] border-b border-[#252526]">
      <div
        className="flex items-center gap-2 px-4 py-2.5 text-[13px] border-t-2"
        style={{
          backgroundColor: "#1e1e1e",
          color: SYNTAX.text,
          borderTopColor: "#007acc",
        }}
      >
        <FileIcon />
        <span>{fileName}</span>
        <span className="text-[#858585] ml-1">×</span>
      </div>
    </div>
  );
}

function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M13 4.5L9.5 1H3.5v14H13V4.5Z"
        stroke="#6ba5d9"
        strokeWidth="1"
      />
      <path d="M9.5 1v3.5H13" stroke="#6ba5d9" strokeWidth="1" />
    </svg>
  );
}

// ─── Convenience spans for syntax-colored text ───────────────────────────

type SpanProps = { children: React.ReactNode };

export const Comment = ({ children }: SpanProps) => (
  <span style={{ color: SYNTAX.comment }}>{children}</span>
);
export const DocString = ({ children }: SpanProps) => (
  <span style={{ color: SYNTAX.docstring, fontStyle: "italic" }}>
    {children}
  </span>
);
export const Keyword = ({ children }: SpanProps) => (
  <span style={{ color: SYNTAX.keyword }}>{children}</span>
);
export const Str = ({ children }: SpanProps) => (
  <span style={{ color: SYNTAX.string }}>{children}</span>
);
export const Num = ({ children }: SpanProps) => (
  <span style={{ color: SYNTAX.number }}>{children}</span>
);
export const Fn = ({ children }: SpanProps) => (
  <span style={{ color: SYNTAX.function }}>{children}</span>
);
export const Ty = ({ children }: SpanProps) => (
  <span style={{ color: SYNTAX.type }}>{children}</span>
);
export const Punct = ({ children }: SpanProps) => (
  <span style={{ color: SYNTAX.text }}>{children}</span>
);
export const Decorator = ({ children }: SpanProps) => (
  <span style={{ color: SYNTAX.decorator }}>{children}</span>
);
