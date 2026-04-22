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

    if (s.phase4Data) {
      const phase4 = s.phase4Data as { divergences: Divergence[] };
      for (const d of phase4.divergences) {
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
  // parsing phase3Data per-session.
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
