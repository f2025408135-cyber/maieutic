"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/editor/TopNav";
import { FileTabBar } from "@/components/editor/FileTab";
import { StatusBar } from "@/components/editor/StatusBar";
import { InstructorNav } from "@/components/instructor/InstructorNav";
import type { LiveSummary, LiveSummaryFlag } from "@/lib/opus/schemas";
import {
  UNIT_ROMAN,
  UNIT_TITLE,
  isUnit,
  type Unit,
} from "@/lib/units";

interface SessionRow {
  sessionId: string;
  studentId: string;
  exerciseId: string;
  exerciseTitle: string;
  studentLevel: string;
  unit: string;
  currentPhase: number;
  startedAt: string;
  lastActiveAt: string;
  mostRecentSummary: LiveSummary | null;
  iterationCount: number;
  helpRequestActive: boolean;
  helpRequestedAt: string | null;
}

type Presence = "live" | "stepped_away" | "left";

function derivePresence(lastActiveAt: string): Presence {
  const ms = Date.now() - new Date(lastActiveAt).getTime();
  if (ms < 2 * 60_000) return "live";
  if (ms < 5 * 60_000) return "stepped_away";
  return "left";
}

type PresenceFilter = "active" | "all";

export function LiveDashboard({ initial }: { initial: SessionRow[] }) {
  const [sessions, setSessions] = useState<SessionRow[]>(initial);
  const [streamStatus, setStreamStatus] = useState<
    "connecting" | "open" | "closed"
  >("connecting");
  const [presenceFilter, setPresenceFilter] =
    useState<PresenceFilter>("active");
  // sessionId → the lastActiveAt value at the moment the user dismissed it.
  // When a later snapshot shows a newer lastActiveAt (i.e. the student came
  // back), we auto-unundismiss; see the effect below.
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const sourceRef = useRef<EventSource | null>(null);

  // Clean up the dismissed map whenever sessions change: drop entries whose
  // heartbeat has ticked forward, and entries whose session is no longer on
  // the snapshot (completed or fell off the 30-min cutoff).
  useEffect(() => {
    setDismissed((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of sessions) {
        const at = next[s.sessionId];
        if (at && s.lastActiveAt > at) {
          delete next[s.sessionId];
          changed = true;
        }
      }
      for (const id of Object.keys(next)) {
        if (!sessions.some((s) => s.sessionId === id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [sessions]);

  const dismiss = useCallback((session: SessionRow) => {
    setDismissed((prev) => ({
      ...prev,
      [session.sessionId]: session.lastActiveAt,
    }));
  }, []);

  const restoreDismissed = useCallback(() => setDismissed({}), []);

  const visibleSessions = useMemo(() => {
    const afterDismissal = sessions.filter((s) => !dismissed[s.sessionId]);
    if (presenceFilter === "all") return afterDismissal;
    // "Active" = present right now OR with an unresolved help request (that
    // we don't want to hide just because the heartbeat slipped).
    return afterDismissal.filter(
      (s) =>
        derivePresence(s.lastActiveAt) === "live" || s.helpRequestActive,
    );
  }, [sessions, presenceFilter, dismissed]);
  const hiddenCount = sessions.length - visibleSessions.length;
  const dismissedCount = sessions.filter((s) => dismissed[s.sessionId]).length;

  // Presence totals drawn from every row (not just visible) — the strip is
  // meant to show the full classroom at a glance, regardless of filter.
  const stats = useMemo(() => {
    let live = 0;
    let stepped = 0;
    let left = 0;
    let help = 0;
    for (const s of sessions) {
      switch (derivePresence(s.lastActiveAt)) {
        case "live":
          live++;
          break;
        case "stepped_away":
          stepped++;
          break;
        case "left":
          left++;
          break;
      }
      if (s.helpRequestActive) help++;
    }
    return { live, stepped, left, help };
  }, [sessions]);

  useEffect(() => {
    const source = new EventSource("/api/live/stream");
    sourceRef.current = source;
    source.addEventListener("open", () => setStreamStatus("open"));
    source.addEventListener("error", () => setStreamStatus("closed"));

    source.addEventListener("snapshot", (ev) => {
      try {
        const body = JSON.parse((ev as MessageEvent).data) as {
          sessions: SessionRow[];
        };
        setSessions(body.sessions);
      } catch {
        /* ignore */
      }
    });

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, []);

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#1e1e1e] text-[#d4d4d4] flex flex-col">
      <TopNav left={<InstructorNav current="live" />} />
      <FileTabBar fileName="live.md" />

      <div className="shrink-0 px-8 py-6 border-b border-[#3e3e42] bg-[#1e1e1e]">
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono text-[#4ec9b0] tracking-wider uppercase mb-2">
              Instructor · Live
            </div>
            <h1 className="text-2xl font-semibold tracking-tight leading-tight">
              Who needs me right now?
            </h1>
            <p className="mt-2 text-sm text-[#d4d4d4]/85 leading-relaxed">
              One row per active student. Click any row for the private
              reasoning trail.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatPill color="#4ec9b0" label="live" count={stats.live} />
              <StatPill
                color="#dcdcaa"
                label="stepped away"
                count={stats.stepped}
                muted={stats.stepped === 0}
              />
              <StatPill
                color="#858585"
                label="left"
                count={stats.left}
                muted={stats.left === 0}
              />
              {stats.help > 0 && (
                <StatPill
                  color="#f14c4c"
                  label={stats.help === 1 ? "needs help" : "need help"}
                  count={stats.help}
                />
              )}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-3 text-xs font-mono text-[#858585] pt-1">
            <StreamBadge status={streamStatus} />
          </div>
        </div>
      </div>

      <section className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <HelpRequestBanner sessions={sessions} />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-lg font-semibold tracking-tight text-[#d4d4d4]">
                Active sessions
              </h2>
              <div className="flex items-center gap-3">
                {hiddenCount > 0 && (
                  <span className="text-xs text-[#858585] font-mono">
                    {hiddenCount} hidden
                  </span>
                )}
                {dismissedCount > 0 && (
                  <button
                    onClick={restoreDismissed}
                    className="text-xs font-mono text-[#569cd6] hover:text-white underline decoration-dotted underline-offset-2 transition-colors"
                  >
                    Restore dismissed ({dismissedCount})
                  </button>
                )}
                <PresenceFilterToggle
                  value={presenceFilter}
                  onChange={setPresenceFilter}
                />
              </div>
            </div>
            {sessions.length === 0 ? (
              <EmptyState />
            ) : visibleSessions.length === 0 ? (
              <div className="border border-dashed border-[#3e3e42] rounded p-10 text-center">
                <div className="text-sm text-[#858585]">
                  {presenceFilter === "active"
                    ? "No live sessions right now."
                    : "Every session is dismissed."}{" "}
                  {dismissedCount > 0 ? (
                    <button
                      onClick={restoreDismissed}
                      className="underline hover:text-white"
                    >
                      Restore dismissed ({dismissedCount})
                    </button>
                  ) : (
                    <button
                      onClick={() => setPresenceFilter("all")}
                      className="underline hover:text-white"
                    >
                      Show stepped-away ({hiddenCount})
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleSessions.map((s) => (
                  <SessionCard
                    key={s.sessionId}
                    session={s}
                    onDismiss={() => dismiss(s)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <StatusBar
        left={
          <>
            <span>✓ claude-opus-4-7</span>
            <span>
              {presenceFilter === "active" && hiddenCount > 0
                ? `${visibleSessions.length} of ${sessions.length} session${sessions.length === 1 ? "" : "s"}`
                : `${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
            </span>
          </>
        }
        right={<span>Snapshot 10s · summary 10s</span>}
      />
    </div>
  );
}

function StatPill({
  color,
  label,
  count,
  muted,
}: {
  color: string;
  label: string;
  count: number;
  muted?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#3e3e42] bg-[#252526] text-xs font-mono ${
        muted ? "opacity-50" : ""
      }`}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-[#d4d4d4]">{count}</span>
      <span className="text-[#858585]">{label}</span>
    </span>
  );
}

function PresenceFilterToggle({
  value,
  onChange,
}: {
  value: PresenceFilter;
  onChange: (next: PresenceFilter) => void;
}) {
  const options: { id: PresenceFilter; label: string }[] = [
    { id: "active", label: "Live only" },
    { id: "all", label: "All" },
  ];
  return (
    <div
      role="tablist"
      className="inline-flex items-center p-0.5 rounded border border-[#3e3e42] bg-[#252526] text-xs font-mono"
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`px-2.5 py-1 rounded transition-colors ${
              active
                ? "bg-[#007acc] text-white"
                : "text-[#858585] hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}



function HelpRequestBanner({ sessions }: { sessions: SessionRow[] }) {
  const pending = sessions.filter((s) => s.helpRequestActive);
  if (pending.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded border border-[#f14c4c] bg-[#3a1616] p-4 space-y-2"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-[#f48771]">
        <span aria-hidden>🙋</span>
        <span>
          {pending.length === 1
            ? "1 student needs help"
            : `${pending.length} students need help`}
        </span>
      </div>
      <ul className="space-y-1">
        {pending.map((s) => (
          <li key={s.sessionId}>
            <Link
              href={`/reasoning/${s.sessionId}`}
              className="flex items-center justify-between gap-3 px-2 py-1.5 rounded bg-[#2a0e0e] hover:bg-[#4a1c1c] transition-colors"
            >
              <div className="flex items-center gap-2 text-xs font-mono min-w-0">
                <span className="text-[#d4d4d4] truncate">
                  {s.studentId.slice(0, 16)}
                </span>
                <PhaseBadge phase={s.currentPhase} />
                <span className="text-[#858585] truncate">
                  {s.exerciseTitle}
                </span>
              </div>
              <span className="text-xs text-[#f48771] shrink-0">
                {formatAgo(s.helpRequestedAt)} · Open →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatAgo(iso: string | null): string {
  if (!iso) return "just now";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "1 hr ago" : `${hours} hr ago`;
}

function StreamBadge({
  status,
}: {
  status: "connecting" | "open" | "closed";
}) {
  const color =
    status === "open"
      ? "#4ec9b0"
      : status === "connecting"
        ? "#dcdcaa"
        : "#f14c4c";
  const label =
    status === "open"
      ? "live"
      : status === "connecting"
        ? "connecting"
        : "disconnected";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-[#3e3e42] rounded p-10 text-center">
      <div className="text-sm text-[#858585]">
        No active sessions. Open a student view at{" "}
        <code className="bg-[#2d2d30] px-1.5 py-0.5 rounded text-[#ce9178]">
          /exercise/[id]
        </code>{" "}
        in another window to populate this.
      </div>
    </div>
  );
}

function SessionCard({
  session,
  onDismiss,
}: {
  session: SessionRow;
  onDismiss: () => void;
}) {
  const flags = useMemo(
    () => (session.mostRecentSummary?.flags ?? []) as LiveSummaryFlag[],
    [session.mostRecentSummary],
  );
  const minutes = Math.floor(
    (Date.now() - new Date(session.startedAt).getTime()) / 60000,
  );
  const presence = derivePresence(session.lastActiveAt);
  const priority = decidePriority(flags, session);
  const stripe =
    priority === "red"
      ? "#f14c4c"
      : priority === "amber"
        ? "#dcdcaa"
        : priority === "green"
          ? "#4ec9b0"
          : "#3e3e42";
  const dimmed = presence !== "live" && !session.helpRequestActive;
  // Only offer dismissal for rows that have gone quiet. We deliberately keep
  // help-requested rows undismissable — those require action regardless of
  // presence.
  const canDismiss = presence !== "live" && !session.helpRequestActive;

  return (
    <Link href={`/reasoning/${session.sessionId}`} className="block">
      <div
        className={`group flex rounded border border-[#3e3e42] bg-[#252526] hover:border-[#007acc] transition-colors overflow-hidden ${dimmed ? "opacity-60" : ""}`}
      >
        <div className="w-1 shrink-0" style={{ backgroundColor: stripe }} aria-hidden />
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="font-mono text-[#858585]">
                  {session.studentId.slice(0, 12)}
                </span>
                <UnitBadge unit={session.unit} />
                <PhaseBadge phase={session.currentPhase} />
                <PresenceBadge
                  presence={presence}
                  lastActiveAt={session.lastActiveAt}
                />
                <span className="text-[#858585]">{minutes}m</span>
                {session.currentPhase === 1 && session.iterationCount > 0 && (
                  <span className="text-[#858585]">
                    · iter {session.iterationCount}
                  </span>
                )}
              </div>
              <div className="mt-2 text-sm leading-relaxed">
                {session.mostRecentSummary?.summaryText ?? (
                  <span className="text-[#858585] italic">
                    Awaiting first summary…
                  </span>
                )}
              </div>
              {flags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {flags.map((f) => (
                    <FlagBadge key={f} flag={f} />
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0 flex items-start gap-2">
              <div className="text-xs text-[#858585] text-right font-mono pt-0.5">
                {session.exerciseTitle}
              </div>
              {canDismiss && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDismiss();
                  }}
                  aria-label="Dismiss this session"
                  title="Hide until the student's next heartbeat"
                  className="w-5 h-5 rounded text-[#858585] hover:text-white hover:bg-[#3e3e42] transition-colors text-sm leading-none flex items-center justify-center"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function decidePriority(
  flags: LiveSummaryFlag[],
  session: SessionRow,
): "red" | "amber" | "green" | "none" {
  if (session.helpRequestActive) return "red";
  if (flags.includes("stuck_signal")) return "red";
  if (flags.includes("help_requested")) return "red";
  if (flags.includes("alignment_failure")) return "amber";
  if (flags.includes("proactive_revision")) return "amber";
  if (flags.includes("high_performer")) return "green";
  return "none";
}

function PhaseBadge({ phase }: { phase: number }) {
  const labels: Record<number, string> = {
    1: "specification",
    2: "plan",
    3: "writing",
    4: "review",
    5: "closed",
  };
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#3e3e42] bg-[#1e1e1e]">
      <span className="text-[#858585]">phase</span>
      <span className="text-[#569cd6]">{phase}</span>
      <span className="text-[#858585]">· {labels[phase] ?? "?"}</span>
    </span>
  );
}

function PresenceBadge({
  presence,
  lastActiveAt,
}: {
  presence: Presence;
  lastActiveAt: string;
}) {
  if (presence === "live") return null;
  const ago = formatAgo(lastActiveAt);
  const label =
    presence === "stepped_away" ? `Stepped away · ${ago}` : `Left session · ${ago}`;
  const color =
    presence === "stepped_away"
      ? { bg: "#4f3b17", fg: "#dcdcaa" }
      : { bg: "#2d2d30", fg: "#858585" };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono"
      style={{ backgroundColor: color.bg, color: color.fg }}
    >
      {label}
    </span>
  );
}

function UnitBadge({ unit }: { unit: string }) {
  const label = isUnit(unit) ? `Unit ${UNIT_ROMAN[unit as Unit]}` : unit;
  const title = isUnit(unit) ? UNIT_TITLE[unit as Unit] : undefined;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#3e3e42] bg-[#1e1e1e] text-[#4ec9b0]"
      title={title}
    >
      {label}
    </span>
  );
}

function FlagBadge({ flag }: { flag: LiveSummaryFlag }) {
  const palette: Record<LiveSummaryFlag, { bg: string; fg: string }> = {
    help_requested: { bg: "#5a1d1d", fg: "#f48771" },
    alignment_failure: { bg: "#4f3b17", fg: "#dcdcaa" },
    proactive_revision: { bg: "#1f3a5c", fg: "#75beff" },
    stuck_signal: { bg: "#5a1d1d", fg: "#f48771" },
    high_performer: { bg: "#1e3a2a", fg: "#89d185" },
  };
  const { bg, fg } = palette[flag];
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
      style={{ backgroundColor: bg, color: fg }}
    >
      {flag.replace(/_/g, " ")}
    </span>
  );
}
