// Prompt 6 — Live cognitive summary.
// Tech Spec §6.1 (system) + §6.2 (user template). Register requirement:
// an instructor scanning 80 students needs to act on the summary in under
// 5 seconds. "Student is in Phase 1" FAILS.

import type {
  ExerciseRecord,
  Phase1Data,
  Phase2Data,
  Divergence,
  SessionEventKind,
} from "../schemas";

export const LIVE_SUMMARY_SYSTEM = `You are generating a one-line cognitive summary for an instructor looking at a
live session dashboard. The instructor is running an 80-student CS1 lab and can
only spend ~5 seconds per row deciding whether to intervene.

Your output is ONE sentence describing what appears to be happening in the
student's head right now. It must:

- Describe a state or behavior, not a phase number. "In phase 1" is FORBIDDEN.
- Be specific enough that an instructor could walk over and say something
  useful in 30 seconds based on the summary alone.
- Reference concrete observations from the session (what they wrote, what Opus
  asked, what they haven't addressed, how long they've been stuck).
- Not speculate beyond the evidence. If a student has been idle for 4 minutes
  on spec iteration 3, say that; don't invent a psychological explanation.
- Never cite the absence of something that doesn't exist in the current
  phase. Each phase has different affordances:
    Phase 1 (specification): student submits a natural-language spec; Opus
      asks gap-filling questions; the student iterates. NO chat, NO code
      editor, NO divergences yet.
    Phase 2 (writing): code editor AND free-form chat with Opus exist;
      student may invoke "change of plan" to record a revision.
    Phase 3 (review): Opus poses divergence questions one at a time;
      student answers.
    Phase 4 (closed): session complete.
  So "no chat activity" in Phase 1 is FORBIDDEN (chat doesn't exist there).
  "No code written" in Phase 1 is FORBIDDEN. "No divergences answered" in
  Phase 1 or 2 is FORBIDDEN. Frame observations around what the phase
  actually offers.

Flag rules: return a \`flags\` list with any of:
- "help_requested": active ask-for-help
- "alignment_failure": the most recent divergence response diverged from prediction
- "proactive_revision": student invoked "revise plan" in phase 2
- "stuck_signal": >5 minutes with no state change in a phase that should have
  motion, or 3+ failed spec iterations on the same gap
- "high_performer": passed spec gate in one iteration AND code has no
  significant divergences (ok to show too — flag means "probably doesn't need
  help, focus attention elsewhere")

Output format:

{
  "summary": "<the one sentence>",
  "flags": ["<flag>", ...]
}

Register examples (copy this register, not these exact words):
- "Writing spec; has stated the happy path three times, hasn't considered empty input."
- "Phase 2; code compiles but spec said hashmap and they wrote nested loops — likely a revision, worth a check."
- "Prediction-alignment just failed on a boundary-condition question; student answered 'I don't know.' High-value intervention target."
- "Phase 1, iteration 4, same gap unresolved (empty input); 6 minutes since last submission."
- "Phase 2, 15 minutes in, no code written, chat log shows three questions about syntax — possibly stuck on how to start, not on what to write."`;

interface LiveSummaryContext {
  exercise: Pick<ExerciseRecord, "title" | "studentLevel" | "specGateDimensions">;
  sessionId: string;
  studentId: string;
  currentPhase: number;
  minutesInPhase: number;
  minutesInSession: number;
  phase1: Phase1Data;
  phase2: Phase2Data;
  divergences: Divergence[] | null;
  recentEvents: Array<{ kind: SessionEventKind; createdAt: Date; payload: unknown }>;
}

function formatPhase1(phase1: Phase1Data): string {
  if (phase1.iterations.length === 0) return "  (no spec submissions yet)";
  const last = phase1.iterations[phase1.iterations.length - 1];
  const lines = [
    `  Iterations: ${phase1.iterations.length}`,
    `  Dimensions addressed: [${phase1.instructorConfiguredDimensionsAddressed.join(", ") || "—"}]`,
    `  Most recent spec: ${JSON.stringify(last.studentSpecText.slice(0, 240))}`,
    `  Gaps still open on last round: [${last.gapsIdentified.join(", ") || "—"}]`,
    last.opusQuestions.length
      ? `  Most recent Opus questions:\n${last.opusQuestions.map((q) => `    - ${q}`).join("\n")}`
      : "  (no pending questions)",
  ];
  if (phase1.helpRequests.length)
    lines.push(`  Help requests: ${phase1.helpRequests.length} (active)`);
  return lines.join("\n");
}

function formatPhase2(phase2: Phase2Data): string {
  const lines = [
    `  Current code (${phase2.currentCode.length} bytes):`,
    "  ```",
    phase2.currentCode.slice(0, 800) || "(empty)",
    "  ```",
    `  Chat exchanges: ${phase2.opusExchanges.length}`,
    `  Revisions: ${phase2.revisions.length}`,
  ];
  if (phase2.opusExchanges.length) {
    const last = phase2.opusExchanges[phase2.opusExchanges.length - 1];
    lines.push(
      `  Last exchange — student: ${JSON.stringify(last.studentMessage.slice(0, 120))}`,
    );
    lines.push(`                 opus (${last.opusMode}): ${JSON.stringify(last.opusResponse.slice(0, 120))}`);
  }
  return lines.join("\n");
}

function formatPhase3(divergences: Divergence[] | null): string {
  if (!divergences || divergences.length === 0)
    return "  (no divergences recorded)";
  const answered = divergences.filter((d) => d.studentResponse !== null);
  const lines = [
    `  Divergences: ${divergences.length}  Answered: ${answered.length}`,
    `  Initial classifications: ${divergences.map((d) => d.initialClassification).join(", ")}`,
  ];
  if (answered.length) {
    const last = answered[answered.length - 1];
    lines.push(`  Most recent answer: ${JSON.stringify(last.studentResponse)}`);
    lines.push(`  Alignment: ${last.alignment}  Final: ${last.finalClassification}`);
  }
  return lines.join("\n");
}

export function buildLiveSummaryUserMessage(ctx: LiveSummaryContext): string {
  const eventsBlock = ctx.recentEvents.length
    ? ctx.recentEvents
        .slice(-6)
        .map(
          (e) =>
            `  - ${e.kind} @ ${e.createdAt.toISOString()}: ${JSON.stringify(e.payload).slice(0, 160)}`,
        )
        .join("\n")
    : "  (no recent events)";

  const phaseBlock = (() => {
    if (ctx.currentPhase === 1) return formatPhase1(ctx.phase1);
    if (ctx.currentPhase === 2) return formatPhase2(ctx.phase2);
    if (ctx.currentPhase === 3) return formatPhase3(ctx.divergences);
    return "  (session closed)";
  })();

  return `STUDENT: ${ctx.studentId}
EXERCISE: ${ctx.exercise.title} (level: ${ctx.exercise.studentLevel})
CURRENT PHASE: ${ctx.currentPhase}
TIME IN PHASE: ${ctx.minutesInPhase.toFixed(1)} min
TIME IN SESSION: ${ctx.minutesInSession.toFixed(1)} min

CONFIGURED SPEC DIMENSIONS:
${ctx.exercise.specGateDimensions.map((d) => `  - ${d.id}: ${d.description}`).join("\n")}

PHASE STATE:
${phaseBlock}

RECENT EVENTS (last 10 min):
${eventsBlock}

Generate the summary. Output JSON.`;
}

export type { LiveSummaryContext };
