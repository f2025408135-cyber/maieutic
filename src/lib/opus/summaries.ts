// Live-summary refresh logic. Two entry points:
//  - refreshSummaryForSession: called on events or on a timer for one session
//  - refreshAllActiveSessions: called by the 90s timer in the SSE stream

import { prisma } from "@/lib/db";
import { sessionEventBus } from "@/lib/events";
import { callOpusAndParse } from "@/lib/opus/client";
import {
  LIVE_SUMMARY_SYSTEM,
  buildLiveSummaryUserMessage,
} from "@/lib/opus/prompts/live-summary";
import {
  Divergence,
  ExerciseRecord,
  LiveSummary,
  LiveSummaryOutput,
  Phase1Data,
  Phase2Data,
  type LiveSummaryFlag,
  type SessionEventKind,
} from "@/lib/opus/schemas";
import { appendLiveSummary, getExercise } from "@/lib/sessions";

export async function refreshSummaryForSession(
  sessionId: string,
): Promise<LiveSummary | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 10,
        where: {
          createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        },
      },
    },
  });
  if (!session) return null;
  if (session.completedAt) return null;
  // Skip sessions whose student has been silent for >5 min. Matches the
  // dashboard's "left session" threshold — once the heartbeat has stopped,
  // the summary is frozen by construction, so a fresh Opus call would just
  // spend tokens to restate the last one.
  const msSinceHeartbeat = Date.now() - session.lastActiveAt.getTime();
  if (msSinceHeartbeat > 5 * 60 * 1000) return null;

  const exercise = await getExercise(session.exerciseId);
  const phase1 = Phase1Data.parse(session.phase1Data);
  const phase2 = Phase2Data.parse(session.phase2Data);
  const phase3 = session.phase3Data
    ? (session.phase3Data as { divergences: Divergence[] }).divergences
    : null;

  // Resolve "time in phase" via the most recent phase_transition event,
  // falling back to startedAt.
  const lastTransition = await prisma.sessionEvent.findFirst({
    where: { sessionId, kind: "phase_transition" },
    orderBy: { createdAt: "desc" },
  });
  const phaseStartedAt = lastTransition?.createdAt ?? session.startedAt;
  const now = Date.now();
  const minutesInPhase = (now - phaseStartedAt.getTime()) / 60000;
  const minutesInSession = (now - session.startedAt.getTime()) / 60000;

  const out = await callOpusAndParse({
    promptName: "live-summary",
    system: LIVE_SUMMARY_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildLiveSummaryUserMessage({
          exercise: exercise as Pick<
            ExerciseRecord,
            "title" | "studentLevel" | "specGateDimensions"
          >,
          sessionId: session.id,
          studentId: session.studentId,
          currentPhase: session.currentPhase,
          minutesInPhase,
          minutesInSession,
          phase1,
          phase2,
          divergences: phase3,
          recentEvents: session.events.map((e: any) => ({
            kind: e.kind as SessionEventKind,
            createdAt: e.createdAt,
            payload: e.payload,
          })),
        }),
      },
    ],
    maxTokens: 512,
    schema: LiveSummaryOutput,
  });

  const summary: LiveSummary = {
    timestamp: new Date().toISOString(),
    summaryText: out.summary,
    flags: out.flags as LiveSummaryFlag[],
  };
  await appendLiveSummary(sessionId, summary);
  return summary;
}

export async function refreshAllActiveSessions(): Promise<{ refreshed: number }> {
  // Only refresh sessions whose student is actually present. The dashboard
  // treats >5 min of heartbeat silence as "left session"; Opus calls for
  // rows in that state just waste tokens — the summary won't change
  // meaningfully, and the dashboard has already dimmed the row.
  const presenceCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const sessions = await prisma.session.findMany({
    where: {
      completedAt: null,
      lastActiveAt: { gte: presenceCutoff },
    },
    select: { id: true },
  });

  // Simple concurrency limiter: process at most 4 in parallel.
  const CONCURRENCY = 4;
  let refreshed = 0;
  let idx = 0;
  async function worker() {
    while (idx < sessions.length) {
      const mine = idx++;
      try {
        const result = await refreshSummaryForSession(sessions[mine].id);
        if (result) refreshed++;
      } catch (err) {
        console.error(
          JSON.stringify({
            src: "summaries",
            sessionId: sessions[mine].id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, sessions.length) }, worker),
  );
  return { refreshed };
}

// Re-export the event bus so Route Handlers can share a single import.
export { sessionEventBus };
