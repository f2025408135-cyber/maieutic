// Server-Sent Events stream for the instructor live view.
// Tech Spec §9. Three triggers:
//  1. 90s timer — refresh all active-session LLM summaries (Opus calls)
//  2. 10s timer — rebuild + push snapshot from the DB (no LLM); also
//     doubles as the connection keepalive
//  3. Event-driven — phase_transition, alignment_failure, help_request,
//     revision, summary_refresh pushed on sessionEventBus

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sessionEventBus } from "@/lib/events";
import {
  refreshAllActiveSessions,
} from "@/lib/opus/summaries";
import { LiveSummary, Phase1Data } from "@/lib/opus/schemas";

interface ActiveSessionRow {
  sessionId: string;
  studentId: string;
  exerciseId: string;
  exerciseTitle: string;
  studentLevel: string;
  currentPhase: number;
  startedAt: string;
  lastActiveAt: string;
  mostRecentSummary: LiveSummary | null;
  iterationCount: number;
  helpRequestActive: boolean;
  helpRequestedAt: string | null;
}

async function buildSnapshot(): Promise<ActiveSessionRow[]> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const sessions = await prisma.session.findMany({
    where: { completedAt: null, lastActiveAt: { gte: cutoff } },
    include: { exercise: true },
    orderBy: { lastActiveAt: "desc" },
  });
  return sessions.map((s) => {
    const summaries = (s.liveSummaries as unknown as LiveSummary[]) ?? [];
    const mostRecentSummary = summaries.length
      ? summaries[summaries.length - 1]
      : null;
    const phase1 = Phase1Data.parse(s.phase1Data);
    const unresolved = phase1.helpRequests.filter((h) => h.resolution === null);
    const oldestUnresolved = unresolved.length
      ? unresolved.reduce((a, b) => (a.timestamp < b.timestamp ? a : b))
      : null;
    return {
      sessionId: s.id,
      studentId: s.studentId,
      exerciseId: s.exerciseId,
      exerciseTitle: s.exercise.title,
      studentLevel: s.exercise.studentLevel,
      currentPhase: s.currentPhase,
      startedAt: s.startedAt.toISOString(),
      lastActiveAt: s.lastActiveAt.toISOString(),
      mostRecentSummary,
      iterationCount: phase1.iterations.length,
      helpRequestActive: unresolved.length > 0,
      helpRequestedAt: oldestUnresolved?.timestamp ?? null,
    };
  });
}

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (data: unknown, event?: string) => {
        if (closed) return;
        const lines: string[] = [];
        if (event) lines.push(`event: ${event}`);
        lines.push(`data: ${JSON.stringify(data)}`);
        lines.push("", ""); // two newlines separate SSE frames
        try {
          controller.enqueue(encoder.encode(lines.join("\n")));
        } catch {
          closed = true;
        }
      };

      // 1. Initial snapshot
      try {
        const snapshot = await buildSnapshot();
        send({ sessions: snapshot }, "snapshot");
      } catch (err) {
        send({ error: err instanceof Error ? err.message : "snapshot failed" }, "error");
      }

      // 2a. 90s LLM-summary refresh timer (expensive: one Opus call per
      //     active session).
      const refreshTimer = setInterval(async () => {
        try {
          await refreshAllActiveSessions();
          const snapshot = await buildSnapshot();
          send({ sessions: snapshot }, "snapshot");
        } catch (err) {
          send(
            { error: err instanceof Error ? err.message : "refresh failed" },
            "error",
          );
        }
      }, 90_000);

      // 2b. 10s snapshot tick — rebuild row state (phase, iteration count,
      //     help-request status, time-since) from the DB without calling
      //     Opus. Cheap, keeps the UI feeling live.
      const snapshotTimer = setInterval(async () => {
        try {
          const snapshot = await buildSnapshot();
          send({ sessions: snapshot }, "snapshot");
        } catch (err) {
          send(
            { error: err instanceof Error ? err.message : "snapshot failed" },
            "error",
          );
        }
      }, 10_000);

      // 3. Event-bus push
      const onEvent = async (msg: {
        sessionId: string;
        kind: string;
        payload: unknown;
        createdAt: Date;
      }) => {
        send(msg, "session_event");
        // For events that change what the row shows, refresh just that session.
        if (
          msg.kind === "phase_transition" ||
          msg.kind === "alignment_failure" ||
          msg.kind === "help_request" ||
          msg.kind === "help_resolved" ||
          msg.kind === "revision" ||
          msg.kind === "summary_refresh"
        ) {
          try {
            const snapshot = await buildSnapshot();
            send({ sessions: snapshot }, "snapshot");
          } catch (err) {
            send(
              { error: err instanceof Error ? err.message : "targeted refresh failed" },
              "error",
            );
          }
        }
      };
      sessionEventBus.on("event", onEvent);

      // 4. Cleanup on abort. The 10s snapshot tick also serves as
      //    keepalive — no separate ping timer needed.
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(refreshTimer);
        clearInterval(snapshotTimer);
        sessionEventBus.off("event", onEvent);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
