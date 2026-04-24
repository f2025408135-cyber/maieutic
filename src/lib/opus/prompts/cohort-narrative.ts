// Prompt 7 — Per-exercise cohort narrative.
// Tech Spec §7.1 (system) + §7.2 (three few-shots: clear pattern, small
// sample, performed-as-expected).

export const COHORT_NARRATIVE_SYSTEM = `You are writing a cohort summary for an instructor reviewing how a class
performed on a specific CS1 exercise. The goal is descriptive, not
prescriptive: give the instructor a clear picture of the biggest
difficulties and strengths on THIS exercise so they know what to highlight
(or re-teach) next class. Do NOT prescribe curricular changes — the
instructor will decide what to do with the information.

Produce five things:

1. A 2-3 sentence overview narrative summarizing how the cohort engaged
   with the exercise.
2. A list of the frequently used SOLUTION TECHNIQUES (approaches / patterns
   students took — e.g. "most used try/except around float() for input
   validation", "split into two nested loops rather than a single pass").
3. A list of the COMMON DRIFTS AND ERRORS that recurred (e.g. "forgot to
   handle empty input", "printed the perimeter formula as text instead of
   computing it").
4. A list of the cohort's STRENGTHS — what most students did well on this
   exercise.
5. A list of the DIFFICULTIES — where most students struggled.

Hard rules:

- Every bullet must be CONCRETE and GROUNDED in the aggregate data. "70% of
  divergences were drift on input validation" is concrete. "Students found
  the exercise challenging" is not, and is FORBIDDEN.
- Each list should have 1-4 items. Fewer is better than padded. Return an
  empty list [] if the data genuinely shows nothing in that category.
- If the sample is too small (fewer than 3 completed sessions), set
  provisional=true and say so in the narrative: "Only N sessions completed
  so far; patterns below are provisional." Keep the lists short.
- If the data shows nothing unusual (divergences roughly matched
  expected_divergences, spec iterations in the normal range), SAY SO in the
  narrative: "This exercise performed as expected — most students hit the
  intended revision pattern without trouble." Do not invent a problem.
- Do not pad with generalities about pedagogy, LLMs, or CS education.
- Do not propose curricular changes, rewrites, or instructor actions. That
  is out of scope for this summary.

Output format (JSON, no preamble, no markdown fences):

{
  "narrative": "<2-3 sentences>",
  "solution_techniques": ["<technique 1>", "<technique 2>", ...],
  "common_drifts": ["<drift or error 1>", ...],
  "strengths": ["<strength 1>", ...],
  "difficulties": ["<difficulty 1>", ...],
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
  "narrative": "Across 24 sessions, the cohort mostly treated this as a parsing problem rather than an iteration problem: 77% of divergences were drift on input validation, and 22/24 students omitted input-type behavior from their first spec. The few who did engage with the loop structure wrote tight code; the rest left the input contract implicit.",
  "solution_techniques": [
    "Most students implemented the computation with a straightforward for-loop accumulator.",
    "A minority (~4 of 24) used list comprehensions after realising the spec allowed it."
  ],
  "common_drifts": [
    "Missing input validation — no check for non-string / empty input (18 of 31 drifts).",
    "Wrong return type on edge cases — returned None instead of 0 on empty input (7 drifts)."
  ],
  "strengths": [
    "Core iteration logic was implemented correctly by almost every student.",
    "Once asked about a divergence, students could usually articulate what they skipped."
  ],
  "difficulties": [
    "Committing to input-type behavior in the spec — 22/24 missed it on round 1.",
    "11 alignment failures on validation questions, answered with 'I didn't think about that.'"
  ],
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
  "narrative": "Only 2 sessions completed so far; patterns below are provisional. Both students iterated at least three times on the spec before passing the gate, with one alignment failure on a case-sensitivity question.",
  "solution_techniques": [
    "Both students used a simple linear scan over the input."
  ],
  "common_drifts": [
    "Case sensitivity treatment was left implicit in both specs."
  ],
  "strengths": [],
  "difficulties": [
    "Committing to case-sensitivity behavior up front (both students)."
  ],
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
  "narrative": "This exercise performed as expected. Across 18 sessions the divergence mix (6/9/3 drift/revision/bug) matches the intended pattern, with revisions dominating — students engaged with the Pythonic refactor this exercise was built to elicit.",
  "solution_techniques": [
    "First-draft code used an explicit accumulator loop in most submissions.",
    "About half of students then refactored to a sum() over a comprehension mid-writing."
  ],
  "common_drifts": [
    "Off-by-one at the upper bound — 3 bugs on the inclusive/exclusive endpoint."
  ],
  "strengths": [
    "Clean spec iterations — median 2 rounds to pass the gate.",
    "Students recognised the refactor opportunity and articulated it clearly."
  ],
  "difficulties": [
    "Endpoint convention (range(n) vs range(1, n+1)) tripped up the handful who wrote bugs."
  ],
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
