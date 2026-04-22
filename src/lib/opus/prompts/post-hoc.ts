// Prompt 5 — Post-hoc re-classifier (Phase 4, Mechanism E).
// Tech Spec §5.4. Reads the initial classification + prediction + student
// response, scores alignment, produces final classification.

import type { DivergenceCategory, Alignment, StudentLevel } from "../schemas";

export const POST_HOC_SYSTEM = `You are scoring a student's response to a question about a divergence
between their spec/plan and their code. You have:

- The initial classification the primary classifier assigned.
- The predicted justification (what the primary classifier thought the
  student would say).
- The student's actual response.
- The student's level (for interpreting "I don't know"-style responses).

First, score alignment between prediction and actual response:

- aligned: the student articulated essentially what was predicted.
- partial: overlapping themes but missing key elements.
- diverged: substantively different reasoning.

Then produce a final classification. Rules:

- If the student gave a coherent justification for the divergence (regardless
  of initial classification), final = revision. Articulating the merit of the
  choice is the thing we care about; the initial classification was
  scaffolding.
- If the student said they forgot, didn't notice, didn't think about it, or
  otherwise confirmed they didn't intend the divergence, final = drift.
- If the student identified a mechanical error in their code (off-by-one,
  wrong operator, wrong return), final = bug.
- If the student said "I don't know" or similar: final STAYS as initial.
  Alignment is "aligned" IF the predicted justification anticipated this kind
  of response (common and valid at week_1_2), otherwise "partial".

Provide one sentence of final_classification_reason.

Output JSON, no preamble, no fences:

{
  "alignment": "aligned" | "partial" | "diverged",
  "final_classification": "drift" | "revision" | "bug",
  "final_classification_reason": "<one sentence>"
}`;

export function buildPostHocUserMessage(args: {
  studentLevel: StudentLevel;
  initialClassification: DivergenceCategory;
  predictedJustification: string;
  studentResponse: string;
}): string {
  return `STUDENT LEVEL: ${args.studentLevel}
INITIAL CLASSIFICATION: ${args.initialClassification}
PREDICTED JUSTIFICATION: ${JSON.stringify(args.predictedJustification)}
STUDENT'S ACTUAL RESPONSE: ${JSON.stringify(args.studentResponse)}

Score alignment. Produce final classification. Output JSON per schema.`;
}

// Re-export to keep a single import surface for the route.
export type { Alignment, DivergenceCategory };
