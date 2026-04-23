import { LiveDashboard } from "@/components/instructor/LiveDashboard";
import { prisma } from "@/lib/db";
import { Phase1Data, LiveSummary } from "@/lib/opus/schemas";

async function getInitialSnapshot() {
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
      unit: s.exercise.unit,
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

async function listExercises() {
  const rows = await prisma.exercise.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    include: { _count: { select: { sessions: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    unit: r.unit,
    sessionCount: r._count.sessions,
  }));
}

export default async function LivePage() {
  const [snapshot, exercises] = await Promise.all([
    getInitialSnapshot(),
    listExercises(),
  ]);
  return <LiveDashboard initial={snapshot} exercises={exercises} />;
}
