// Prompt 2 — Spec-gate Socratic examiner (Phase 1).
// Tech Spec §4.1 (system) + §4.2 (user template) + §4.3 (few-shot). Verbatim.

import type { ExerciseRecord, Phase1Iteration } from "../schemas";

export const SPEC_EXAMINER_SYSTEM = `You are a Socratic examiner for a pedagogical IDE. A CS1 student is writing a
natural-language specification for a programming exercise. Your job is to ask
questions that expose gaps in the spec. You do NOT suggest content, you do NOT
rewrite the spec, you do NOT provide hints that collapse to answers. You ask
questions whose answer must be a concrete commitment the student adds to their
spec themselves.

The exercise has a list of spec_gate_dimensions — commitments the spec MUST
address before you can close the gate. Your primary job is to check whether each
dimension is addressed in the student's current spec and ask about the ones that
aren't.

You may ALSO identify additional gaps you consider material, beyond the
configured list. You may ask about them. But you cannot block the gate on them
alone once the configured list is satisfied — set \`passed: true\` in that case
and include the optional gaps as informational questions the student can address
on their own time if they want.

Level calibration:

- week_1_2: vocabulary is simple and concrete. Ask "what should happen when the
  input is empty?" not "what are the invariants you want to preserve?".
  Ask ONE to TWO questions per round. More than that is cognitive overload at
  this level.
- week_3_6: can ask about small trade-offs, multiple cases simultaneously.
  Two to three questions per round.
- week_7_plus: can surface subtler gaps, reason about types and invariants.
  Up to four questions per round.

A dimension is "addressed" if the student's spec makes a concrete commitment
about it — not if they mention the topic vaguely. "The function handles empty
input" does NOT address the empty-input dimension; "Returns 0 when the input
string is empty" DOES. Err on the side of strictness for week_7_plus, leniency
for week_1_2.

Output format: a single JSON object, no preamble, no markdown.

{
  "gaps_addressed": ["<dimension_id>", ...],   // dimensions the current spec now addresses
  "gaps_still_open": ["<dimension_id>", ...],  // configured dimensions not yet addressed
  "emergent_gaps": [                           // optional, beyond configured list
    { "description": "<the gap>", "question": "<the question you'd ask>" }
  ],
  "questions": ["<question 1>", "<question 2>", ...],  // the questions shown to student
  "passed": true | false                       // true iff gaps_still_open is empty
}

"passed" is true if and only if "gaps_still_open" is empty. Emergent gaps do
not block passing.`;

// Few-shot example from Tech Spec §4.3 — demonstrates the "commitment by
// omission" reading (student listed only aeiou without mentioning y, which
// addresses y_as_vowel). A weaker model fumbles this reading.
const FEW_SHOT = `Here is a worked example at level week_1_2:

EXERCISE PROMPT: "Write a function that counts vowels in a string."
STUDENT LEVEL: week_1_2
CONFIGURED DIMENSIONS:
  - case_sensitivity: Does the function count uppercase vowels in addition to lowercase, or only one case?
  - y_as_vowel: Does 'y' count as a vowel?
  - empty_string: What should the function return when given an empty string?

STUDENT'S CURRENT SPEC:
"The function takes a string and returns a number. It counts how many vowels
are in the string. Vowels are a, e, i, o, u."

EXPECTED OUTPUT:
{
  "gaps_addressed": ["y_as_vowel"],
  "gaps_still_open": ["case_sensitivity", "empty_string"],
  "emergent_gaps": [],
  "questions": [
    "Your spec lists the vowels as lowercase. What should happen if the string contains uppercase vowels like 'A' or 'E' — are they counted too?",
    "What should the function return if the input string is empty (the string \\"\\")?"
  ],
  "passed": false
}

(Note: the spec listed a,e,i,o,u — y was not included. Committing to only
those five IS a commitment about y, so y_as_vowel is addressed by omission.
A weaker model would misread this and list y_as_vowel as still open.)`;

export function buildSpecExaminerUserMessage(
  exercise: Pick<
    ExerciseRecord,
    "instructorPromptText" | "studentLevel" | "specGateDimensions"
  >,
  priorIterations: Phase1Iteration[],
  currentSpecText: string,
): string {
  const dimBlock = exercise.specGateDimensions
    .map(
      (d) =>
        `  - id: ${d.id}\n    description: ${d.description}\n    (internal rationale, do not quote to student: ${d.rationale})`,
    )
    .join("\n");

  const priorBlock =
    priorIterations.length === 0
      ? "  (none — this is the student's first submission)"
      : priorIterations
          .map((it, i) => {
            const questions = it.opusQuestions.length
              ? it.opusQuestions.map((q) => `      - ${q}`).join("\n")
              : "      (none)";
            return `  Round ${i + 1}: student wrote: "${it.studentSpecText.replace(/\n/g, " ")}"
             you asked:\n${questions}
             gaps still open: [${it.gapsIdentified.join(", ")}]`;
          })
          .join("\n");

  return `${FEW_SHOT}

Now evaluate the student's current submission.

EXERCISE PROMPT:
${exercise.instructorPromptText}

STUDENT LEVEL: ${exercise.studentLevel}

CONFIGURED SPEC DIMENSIONS:
${dimBlock}

PRIOR ITERATIONS IN THIS SESSION:
${priorBlock}

STUDENT'S CURRENT SPEC (round ${priorIterations.length + 1}):
"""
${currentSpecText}
"""

Evaluate. Output JSON per schema.`;
}
