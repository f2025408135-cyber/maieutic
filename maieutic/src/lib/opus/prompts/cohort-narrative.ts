// Prompt 7 — Per-exercise cohort narrative.
// Tech Spec §7.1 (system) + §7.2 (three few-shots: clear pattern, small
// sample, performed-as-expected).

export const COHORT_NARRATIVE_SYSTEM = `You are writing a short narrative for an instructor reviewing how a cohort
performed on a specific CS1 exercise. The narrative is 2-3 sentences and must
answer two questions:

1. What did this exercise actually test, and where did it break down?
2. What specific change to the exercise or the curriculum would address the
   breakdown?

Hard rules:

- Name a CONCRETE pattern, grounded in the data. "70% of divergences were drift
  on input validation" is concrete. "Students found the exercise challenging"
  is not, and is FORBIDDEN.
- Recommend a CONCRETE fix. "Consider rewriting the prompt to make the
  iteration requirement explicit" is concrete. "Consider revisiting this
  exercise" is not.
- If the sample is too small (fewer than 3 sessions), SAY SO explicitly:
  "Only N sessions completed so far; patterns below are provisional." Do NOT
  generate confident claims from tiny samples.
- If the data shows nothing unusual (divergences roughly matched expected_
  divergences, spec iterations in the normal range), SAY SO: "This exercise
  performed as expected. No curricular change indicated." Do not invent a
  problem.
- Do not pad with generalities about pedagogy, LLMs, or CS education.

Output format:

{
  "narrative": "<2-3 sentences>",
  "pattern_summary": "<the specific pattern identified, one phrase>",
  "recommendation": "<the specific fix, one sentence>",
  "provisional": true | false
}`;

const FEW_SHOTS = `Example A — clear pattern:

AGGREGATE DATA:
  Sessions: 24 completed
  Spec iterations: median 4, max 9
  Divergence classifications: drift 31, revision 4, bug 8
  Most-flagged divergences: "input validation missing" (18x), "return type wrong" (7x)
  Most-missed spec dimensions (first submission): "non_string_input" (22x), "empty_input" (14x)
  Alignment failures: 11 (mostly on validation divergences, students answered "I didn't think about that")
  Proactive revisions: 2
  Expected divergences grounded: "student treats problem as parsing not iteration"

OUTPUT:
{
  "narrative": "This exercise was intended to test loop invariants, but 77% of divergences were drift on input validation, suggesting students treated the problem as parsing rather than iteration. Students consistently failed to commit to input-type behavior in their specs (22/24 on first pass), and alignment failures clustered on validation divergences with 'I didn't think about that' responses — the signal is that the prompt directs attention to the computation and away from the input contract. Consider rewriting the prompt to require the student to name the function's input type before describing the computation.",
  "pattern_summary": "students treat problem as parsing not iteration",
  "recommendation": "rewrite prompt to require input-type declaration before computation",
  "provisional": false
}

Example B — small sample:

AGGREGATE DATA:
  Sessions: 2 completed
  Spec iterations: 3 and 5
  Divergences: drift 2, revision 1, bug 0
  Alignment failures: 1

OUTPUT:
{
  "narrative": "Only 2 sessions completed so far; patterns below are provisional. Both students iterated on the empty-input dimension, and one prediction-alignment failure occurred on a case-sensitivity question. Defer cohort-level conclusions until more sessions have run.",
  "pattern_summary": "insufficient data",
  "recommendation": "wait for more sessions before acting",
  "provisional": true
}

Example C — exercise performed as expected:

AGGREGATE DATA:
  Sessions: 18 completed
  Spec iterations: median 2
  Divergences: drift 6, revision 9, bug 3
  Expected divergences grounded: revision pattern (accumulator -> sum comprehension) matched actual

OUTPUT:
{
  "narrative": "This exercise performed as expected. Divergence distribution (6/9/3 drift/revision/bug across 18 sessions) matches the expected pattern, with revisions dominating as designed — students engaged with the Pythonic refactor this exercise was built to elicit. No curricular change indicated.",
  "pattern_summary": "matches expected distribution",
  "recommendation": "no change needed",
  "provisional": false
}`;

export interface CohortAggregate {
  sessionCount: number;
  specIterations: number[];
  divergenceCategoryCounts: Record<"drift" | "revision" | "bug", number>;
  unresolvedCount: number;
  mostFlaggedDivergences: Array<{ key: string; count: number }>;
  mostMissedDimensions: Array<{ id: string; count: number }>;
  alignmentFailures: number;
  proactiveRevisions: number;
  expectedDivergences: Array<{ category: string; pattern: string }>;
}

export function buildCohortNarrativeUserMessage(args: {
  exerciseTitle: string;
  exercisePrompt: string;
  aggregate: CohortAggregate;
}): string {
  const a = args.aggregate;
  const mostFlagged =
    a.mostFlaggedDivergences.length === 0
      ? "  (none)"
      : a.mostFlaggedDivergences
          .map((d) => `  "${d.key}" (${d.count}x)`)
          .join("\n");
  const mostMissed =
    a.mostMissedDimensions.length === 0
      ? "  (none)"
      : a.mostMissedDimensions
          .map((d) => `  "${d.id}" (${d.count}x)`)
          .join("\n");
  const iterMedian = (() => {
    if (a.specIterations.length === 0) return "—";
    const sorted = [...a.specIterations].sort((x, y) => x - y);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? String(sorted[mid])
      : ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1);
  })();

  return `${FEW_SHOTS}

Now it is your turn. Here is the real cohort data.

EXERCISE: ${args.exerciseTitle}
PROMPT: ${args.exercisePrompt}

AGGREGATE DATA:
  Sessions: ${a.sessionCount} completed
  Spec iterations: median ${iterMedian}, max ${
    a.specIterations.length ? Math.max(...a.specIterations) : "—"
  }
  Divergence classifications: drift ${a.divergenceCategoryCounts.drift}, revision ${a.divergenceCategoryCounts.revision}, bug ${a.divergenceCategoryCounts.bug}
  Unresolved classifications (low-confidence or post-hoc pending): ${a.unresolvedCount}
  Most-flagged divergences:
${mostFlagged}
  Most-missed spec dimensions (first submission):
${mostMissed}
  Alignment failures: ${a.alignmentFailures}
  Proactive revisions: ${a.proactiveRevisions}
  Expected divergences defined by instructor:
${a.expectedDivergences.map((d) => `    - ${d.category}: ${d.pattern}`).join("\n") || "    (none)"}

Output JSON per schema.`;
}
