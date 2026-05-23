// Cohort-level aggregation helper. Reads completed sessions for one exercise
// and computes the stats the cohort-narrative prompt needs.

import { prisma } from "@/lib/db";
import {
  Divergence,
  Phase1Data,
  type ExpectedDivergence,
  type SpecDimension,
} from "@/lib/opus/schemas";
import type { CohortAggregate } from "@/lib/opus/prompts/cohort-narrative";

const TOP_N = 5;

export async function aggregateExercise(
  exerciseId: string,
): Promise<CohortAggregate & { exerciseTitle: string; exercisePrompt: string; specGateDimensions: SpecDimension[] }> {
  const exercise = await prisma.exercise.findUniqueOrThrow({
    where: { id: exerciseId },
  });
  const sessions = await prisma.session.findMany({
    where: { exerciseId, completedAt: { not: null } },
  });

  const specIterations: number[] = [];
  const divergenceCounts = { drift: 0, revision: 0, bug: 0 };
  let unresolved = 0;
  const divergenceClusters = new Map<string, number>();
  const missedDimensions = new Map<string, number>();
  let alignmentFailures = 0;
  let proactiveRevisions = 0;

  for (const s of sessions) {
    const phase1 = Phase1Data.parse(s.phase1Data);
    specIterations.push(phase1.iterations.length);

    // What was missing on the first iteration?
    const first = phase1.iterations[0];
    if (first) {
      for (const gapId of first.gapsIdentified) {
        missedDimensions.set(gapId, (missedDimensions.get(gapId) ?? 0) + 1);
      }
    }

    if (s.phase3Data) {
      const phase3 = s.phase3Data as { divergences: Divergence[] };
      for (const d of phase3.divergences) {
        const finalCat = d.finalClassification ?? d.initialClassification;
        if (finalCat) divergenceCounts[finalCat]++;
        if (d.initialConfidence === "low" && !d.finalClassification) unresolved++;
        if (d.alignment === "diverged") alignmentFailures++;

        // Cluster divergences by the leading fragment of their predicted
        // justification — cheap proxy for "same kind of miss". A production
        // system would do proper clustering.
        const clusterKey = d.predictedJustification.split(/[.!?]/)[0]?.slice(0, 80) ?? "—";
        divergenceClusters.set(
          clusterKey,
          (divergenceClusters.get(clusterKey) ?? 0) + 1,
        );
      }
    }

    // Proactive revisions (best-effort: count events of kind "revision")
  }

  // Count proactive revisions via SessionEvent rows — more authoritative than
  // parsing phase2Data per-session.
  proactiveRevisions = await prisma.sessionEvent.count({
    where: {
      kind: "revision",
      session: { exerciseId, completedAt: { not: null } },
    },
  });

  const mostFlaggedDivergences = [...divergenceClusters.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([key, count]) => ({ key, count }));

  const mostMissedDimensions = [...missedDimensions.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id, count]) => ({ id, count }));

  const expected = (exercise.expectedDivergences as unknown as ExpectedDivergence[]) ?? [];
  const dims = (exercise.specGateDimensions as unknown as SpecDimension[]) ?? [];

  return {
    sessionCount: sessions.length,
    specIterations,
    divergenceCategoryCounts: divergenceCounts,
    unresolvedCount: unresolved,
    mostFlaggedDivergences,
    mostMissedDimensions,
    alignmentFailures,
    proactiveRevisions,
    expectedDivergences: expected.map(({ category, pattern }) => ({ category, pattern })),
    exerciseTitle: exercise.title,
    exercisePrompt: exercise.instructorPromptText,
    specGateDimensions: dims,
  };
}

export interface ExerciseSummary {
  id: string;
  title: string;
  unit: string;
  publishedAt: string; // ISO
  sessionsStarted: number;
  sessionsCompleted: number;
  medianIterations: number | null;
  maxIterations: number | null;
  divergenceCounts: { drift: number; revision: number; bug: number };
  topMissedDimension: { id: string; count: number } | null;
  helpRequestsReceived: number;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Headline stats for every published exercise, for the /cohorts overview.
 * One query each for sessions and help-request events per exercise — fine
 * at classroom scale.
 */
export async function summarizeAllExercises(): Promise<ExerciseSummary[]> {
  const exercises = await prisma.exercise.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { publishedAt: "asc" },
  });

  const out: ExerciseSummary[] = [];
  for (const ex of exercises) {
    const sessions = await prisma.session.findMany({
      where: { exerciseId: ex.id },
    });
    const completed = sessions.filter((s: any) => s.completedAt !== null);

    const iterations: number[] = [];
    const divergenceCounts = { drift: 0, revision: 0, bug: 0 };
    const missed = new Map<string, number>();

    for (const s of completed) {
      const phase1 = Phase1Data.parse(s.phase1Data);
      iterations.push(phase1.iterations.length);
      const first = phase1.iterations[0];
      if (first) {
        for (const gapId of first.gapsIdentified) {
          missed.set(gapId, (missed.get(gapId) ?? 0) + 1);
        }
      }
      if (s.phase3Data) {
        const phase3 = s.phase3Data as { divergences: Divergence[] };
        for (const d of phase3.divergences) {
          const cat = d.finalClassification ?? d.initialClassification;
          if (cat) divergenceCounts[cat]++;
        }
      }
    }

    const helpRequestsReceived = await prisma.sessionEvent.count({
      where: { kind: "help_request", session: { exerciseId: ex.id } },
    });

    const topMissed = [...missed.entries()].sort((a, b) => b[1] - a[1])[0];

    out.push({
      id: ex.id,
      title: ex.title,
      unit: ex.unit,
      publishedAt: ex.publishedAt!.toISOString(),
      sessionsStarted: sessions.length,
      sessionsCompleted: completed.length,
      medianIterations: median(iterations),
      maxIterations: iterations.length ? Math.max(...iterations) : null,
      divergenceCounts,
      topMissedDimension: topMissed
        ? { id: topMissed[0], count: topMissed[1] }
        : null,
      helpRequestsReceived,
    });
  }
  return out;
}
