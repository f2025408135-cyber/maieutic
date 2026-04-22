"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LiveSummary, LiveSummaryFlag } from "@/lib/opus/schemas";

interface SessionRow {
  sessionId: string;
  studentId: string;
  exerciseId: string;
  exerciseTitle: string;
  studentLevel: string;
  currentPhase: number;
  startedAt: string;
  mostRecentSummary: LiveSummary | null;
  iterationCount: number;
  helpRequestActive: boolean;
}

interface ExerciseRow {
  id: string;
  title: string;
  level: string;
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
  const [streamStatus, setStreamStatus] = useState<"connecting" | "open" | "closed">(
    "connecting",
  );
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
          [{ at: new Date(), kind: body.kind, sessionId: body.sessionId }, ...prev].slice(0, 20),
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
    <main className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-0 overflow-hidden">
      <section className="overflow-y-auto p-6 space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Who needs me right now?</h1>
          <StreamBadge status={streamStatus} />
          <span className="text-sm text-muted-foreground">
            {sessions.length} active {sessions.length === 1 ? "session" : "sessions"}
          </span>
        </div>

        {sessions.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground py-10 text-center">
              No active sessions. Open the student view at{" "}
              <code>/exercise/[id]</code> in another window to populate this.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <SessionCard key={s.sessionId} session={s} />
            ))}
          </div>
        )}
      </section>

      <aside className="border-l overflow-y-auto p-6 space-y-6 bg-muted/10">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exercises</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {exercises.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No published exercises yet.{" "}
                <Link href="/authoring" className="underline text-blue-700">
                  Author one.
                </Link>
              </div>
            ) : (
              exercises.map((e) => (
                <Link
                  key={e.id}
                  href={`/cohort/${e.id}`}
                  className="block border rounded p-2 hover:bg-muted/40"
                >
                  <div className="text-sm font-medium">{e.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.level} · {e.sessionCount} session
                    {e.sessionCount === 1 ? "" : "s"}
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent events</CardTitle>
          </CardHeader>
          <CardContent>
            {eventLog.length === 0 ? (
              <div className="text-sm text-muted-foreground">(none yet)</div>
            ) : (
              <ul className="space-y-1 text-xs font-mono">
                {eventLog.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground">
                      {e.at.toLocaleTimeString()}
                    </span>
                    <span>{e.kind}</span>
                    {e.sessionId && (
                      <span className="text-muted-foreground truncate">
                        {e.sessionId.slice(0, 8)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </aside>
    </main>
  );
}

function StreamBadge({ status }: { status: "connecting" | "open" | "closed" }) {
  const color =
    status === "open"
      ? "bg-green-500"
      : status === "connecting"
        ? "bg-yellow-500"
        : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      sse {status}
    </span>
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
  const stripeClass =
    priority === "red"
      ? "bg-red-500"
      : priority === "amber"
        ? "bg-amber-500"
        : priority === "green"
          ? "bg-emerald-500"
          : "bg-muted";

  return (
    <Link href={`/reasoning/${session.sessionId}`} className="block">
      <div className="group flex border rounded-lg bg-background hover:border-foreground/20 hover:shadow-sm transition overflow-hidden">
        <div className={`w-1 shrink-0 ${stripeClass}`} aria-hidden />
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">
                  {session.studentId.slice(0, 12)}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {session.studentLevel}
                </Badge>
                <PhaseBadge phase={session.currentPhase} />
                <span className="text-xs text-muted-foreground">
                  {minutes}m
                </span>
                {session.currentPhase === 1 && session.iterationCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    · iter {session.iterationCount}
                  </span>
                )}
              </div>
              <div className="mt-2 text-sm leading-relaxed text-foreground">
                {session.mostRecentSummary?.summaryText ?? (
                  <span className="text-muted-foreground italic">
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
            <div className="text-xs text-muted-foreground shrink-0 text-right">
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
  return <Badge variant="outline">Phase {phase}</Badge>;
}

function FlagBadge({ flag }: { flag: LiveSummaryFlag }) {
  const colors: Record<LiveSummaryFlag, string> = {
    help_requested: "bg-red-100 text-red-800 border-red-200",
    alignment_failure: "bg-amber-100 text-amber-800 border-amber-200",
    proactive_revision: "bg-blue-100 text-blue-800 border-blue-200",
    stuck_signal: "bg-red-100 text-red-800 border-red-200",
    high_performer: "bg-green-100 text-green-800 border-green-200",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 border rounded ${colors[flag]}`}
    >
      {flag.replace(/_/g, " ")}
    </span>
  );
}

