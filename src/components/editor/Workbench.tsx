// Workbench is the Tab-bar + content + Status-bar chrome shared by all
// interactive pages (live dashboard, cohort, reasoning, authoring, exercise).
// Looks like a VSCode window but without CodeFrame's fake line numbers —
// the content is a real UI, not pretend-code.

import Link from "next/link";
import * as React from "react";

export interface Tab {
  fileName: string;
  active?: boolean;
  href?: string;
  dirty?: boolean;
}

export function Workbench({
  tabs,
  statusLeft,
  statusRight,
  children,
}: {
  tabs: Tab[];
  statusLeft?: React.ReactNode;
  statusRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#1e1e1e] text-[#d4d4d4]">
      <TopNav />
      <TabBar tabs={tabs} />
      <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
      <StatusBar left={statusLeft} right={statusRight} />
    </div>
  );
}

function TopNav() {
  return (
    <div className="flex items-center justify-between bg-[#3c3c3c] text-[#cccccc] text-[12px] h-8 px-3 border-b border-[#252526] shrink-0">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold hover:text-white"
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: "#007acc" }}
          />
          Maieutic
        </Link>
        <NavLink href="/exercises">Exercises</NavLink>
        <NavLink href="/live">Live</NavLink>
        <NavLink href="/authoring">Author</NavLink>
      </div>
      <div className="text-[11px] text-[#858585] font-mono">
        claude-opus-4-7
      </div>
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-2 py-0.5 rounded hover:bg-[#4a4a4a] hover:text-white transition-colors"
    >
      {children}
    </Link>
  );
}

function TabBar({ tabs }: { tabs: Tab[] }) {
  return (
    <div className="flex items-stretch bg-[#2d2d30] border-b border-[#252526] shrink-0">
      {tabs.map((tab, i) => (
        <TabItem key={i} tab={tab} />
      ))}
    </div>
  );
}

function TabItem({ tab }: { tab: Tab }) {
  const bg = tab.active ? "#1e1e1e" : "#2d2d30";
  const color = tab.active ? "#ffffff" : "#858585";
  const borderColor = tab.active ? "#007acc" : "transparent";

  const content = (
    <div
      className="flex items-center gap-2 px-4 py-2 text-[13px] border-t-2 transition-colors hover:text-white"
      style={{ backgroundColor: bg, color, borderTopColor: borderColor }}
    >
      <FileIcon />
      <span>{tab.fileName}</span>
      {tab.dirty && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: "#d4d4d4" }}
          aria-label="unsaved changes"
        />
      )}
    </div>
  );

  return tab.href && !tab.active ? (
    <Link href={tab.href}>{content}</Link>
  ) : (
    content
  );
}

function StatusBar({
  left,
  right,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between bg-[#007acc] text-white text-[12px] px-4 py-1.5 font-mono shrink-0">
      <div className="flex items-center gap-5">{left}</div>
      <div className="flex items-center gap-5">{right}</div>
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
