import { LiveDashboard } from "@/components/instructor/LiveDashboard";
import { prisma } from "@/lib/db";
import { Phase1Data, LiveSummary } from "@/lib/opus/schemas";

async function getInitialSnapshot() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const sessions = await prisma.session.findMany({
    where: { completedAt: null, startedAt: { gte: cutoff } },
    include: { exercise: true },
    orderBy: { startedAt: "desc" },
  });
  return sessions.map((s) => {
    const summaries = (s.liveSummaries as unknown as LiveSummary[]) ?? [];
    const mostRecentSummary = summaries.length
      ? summaries[summaries.length - 1]
      : null;
    const phase1 = Phase1Data.parse(s.phase1Data);
    return {
      sessionId: s.id,
      studentId: s.studentId,
      exerciseId: s.exerciseId,
      exerciseTitle: s.exercise.title,
      studentLevel: s.exercise.studentLevel,
      unit: s.exercise.unit,
      currentPhase: s.currentPhase,
      startedAt: s.startedAt.toISOString(),
      mostRecentSummary,
      iterationCount: phase1.iterations.length,
      helpRequestActive: phase1.helpRequests.some((h) => h.resolution === null),
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
