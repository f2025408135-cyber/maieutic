"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Workbench } from "@/components/editor/Workbench";
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
  mostRecentSummary: LiveSummary | null;
  iterationCount: number;
  helpRequestActive: boolean;
}

interface ExerciseRow {
  id: string;
  title: string;
  unit: string;
  sessionCount: number;
}

export function LiveDashboard({
  initial,
  exercises,
}: {
  initial: SessionRow[];
  exercises: ExerciseRow[];
}) {
  const [sessions, setSessions] = useState<SessionRow[]>(initial);
  const [streamStatus, setStreamStatus] = useState<
    "connecting" | "open" | "closed"
  >("connecting");
  const [eventLog, setEventLog] = useState<
    { at: Date; kind: string; sessionId?: string }[]
  >([]);
  const sourceRef = useRef<EventSource | null>(null);

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

    source.addEventListener("session_event", (ev) => {
      try {
        const body = JSON.parse((ev as MessageEvent).data) as {
          kind: string;
          sessionId: string;
        };
        setEventLog((prev) =>
          [
            { at: new Date(), kind: body.kind, sessionId: body.sessionId },
            ...prev,
          ].slice(0, 20),
        );
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
    <Workbench
      tabs={[{ fileName: "live-dashboard", active: true }]}
      statusLeft={
        <>
          <StreamBadge status={streamStatus} />
          <span>
            {sessions.length} active session
            {sessions.length === 1 ? "" : "s"}
          </span>
        </>
      }
      statusRight={
        <>
          <span>Instructor · live</span>
          <span>Auto-refresh 90s</span>
        </>
      }
    >
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_22rem] overflow-hidden">
        <section className="overflow-y-auto p-6 space-y-4">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold">Who needs me right now?</h1>
            <p className="text-sm text-[#858585]">
              One row per active student. Click any row for the private
              reasoning trail.
            </p>
          </header>

          {sessions.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <SessionCard key={s.sessionId} session={s} />
              ))}
            </div>
          )}
        </section>

        <aside className="border-l border-[#3e3e42] overflow-y-auto bg-[#252526]">
          <Panel title="Exercises">
            {exercises.length === 0 ? (
              <div className="text-sm text-[#858585]">
                No published exercises yet.{" "}
                <Link
                  href="/authoring"
                  className="underline text-[#569cd6] hover:text-white"
                >
                  Author one.
                </Link>
              </div>
            ) : (
              <div className="space-y-1">
                {exercises.map((e) => (
                  <Link
                    key={e.id}
                    href={`/cohort/${e.id}`}
                    className="block border border-[#3e3e42] rounded p-2 bg-[#1e1e1e] hover:border-[#007acc] transition-colors"
                  >
                    <div className="text-sm font-medium">{e.title}</div>
                    <div className="text-xs text-[#858585] font-mono">
                      {isUnit(e.unit)
                        ? `Unit ${UNIT_ROMAN[e.unit]} · ${UNIT_TITLE[e.unit]}`
                        : e.unit}
                      {" · "}
                      {e.sessionCount} session
                      {e.sessionCount === 1 ? "" : "s"}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Recent events">
            {eventLog.length === 0 ? (
              <div className="text-xs text-[#858585]">
                (no events in this session yet)
              </div>
            ) : (
              <ul className="space-y-1 text-xs font-mono">
                {eventLog.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[#858585] shrink-0">
                      {e.at.toLocaleTimeString()}
                    </span>
                    <span className="text-[#569cd6]">{e.kind}</span>
                    {e.sessionId && (
                      <span className="text-[#858585] truncate">
                        {e.sessionId.slice(0, 8)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </Workbench>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#3e3e42]">
      <div className="px-4 pt-4 pb-2 text-[11px] font-semibold tracking-wider uppercase text-[#858585]">
        {title}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
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

function SessionCard({ session }: { session: SessionRow }) {
  const flags = useMemo(
    () => (session.mostRecentSummary?.flags ?? []) as LiveSummaryFlag[],
    [session.mostRecentSummary],
  );
  const minutes = Math.floor(
    (Date.now() - new Date(session.startedAt).getTime()) / 60000,
  );
  const priority = decidePriority(flags, session);
  const stripe =
    priority === "red"
      ? "#f14c4c"
      : priority === "amber"
        ? "#dcdcaa"
        : priority === "green"
          ? "#4ec9b0"
          : "#3e3e42";

  return (
    <Link href={`/reasoning/${session.sessionId}`} className="block">
      <div className="group flex rounded border border-[#3e3e42] bg-[#252526] hover:border-[#007acc] transition-colors overflow-hidden">
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
            <div className="text-xs text-[#858585] shrink-0 text-right font-mono">
              {session.exerciseTitle}
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
