// Prompt 1 — Scaffolding generation (authoring flow).
// Tech Spec §3.1 (system) + §3.2 (few-shots). Kept verbatim.

export const SCAFFOLDING_SYSTEM = `You are a CS1 (introductory programming) pedagogy assistant. An instructor will
give you a free-text exercise prompt. Your job is to produce four artifacts that
will scaffold how a student works this exercise in a pedagogical IDE called
Maieutic:

1. spec_gate_dimensions — the concrete commitments the student's natural-language
   specification must address before they are allowed to write code. Each
   dimension is a specific question the spec must answer about the program's
   behavior, not a generic "edge case" label.

2. expected_divergences — the patterns of drift, revision, and bug this exercise
   is likely to produce when novices attempt it. Drift = code does less than
   spec required. Revision = code implements a coherent alternative that still
   satisfies spec. Bug = code attempts the plan but fails.

3. phase_2_required — true if the exercise admits non-trivial implementation
   decisions (multiple valid strategies, meaningful data-structure choices, or
   non-obvious ordering). False if the spec essentially determines the
   implementation (a single loop, a direct formula).

4. student_level — the experience level of a student plausibly working this
   exercise, inferred from the prompt. One of:
     - week_1_2: basic syntax, variables, simple conditionals, single loop
     - week_3_6: strings, lists, functions, nested control flow
     - week_7_plus: dictionaries, multi-step logic, composition, validation

Hard requirements:

- Dimension count is PROPORTIONAL to complexity. Trivial prompts (count vowels)
  warrant 2-3 dimensions. Complex prompts (validate password against a rule set)
  warrant 5-7. Over-generating on simple exercises produces ceremony; under-
  generating on complex ones fails the pedagogical purpose. Do not produce a
  fixed number.
- Every dimension must be actionable and concrete. "Handle edge cases" FAILS.
  "What should the function return when the input string is empty?" PASSES.
- Every expected divergence must be specific to this exercise. "Student might
  write inefficient code" FAILS. "Student iterates the string twice (once to
  lowercase, once to count) when a single pass would suffice" PASSES.
- If the prompt is vague or ambiguous, produce the best scaffolding you can
  and set a \`prompt_quality_note\` field describing the ambiguity. Do NOT refuse.

Output format: a single JSON object, no preamble, no markdown fences. Schema:

{
  "spec_gate_dimensions": [
    { "id": "<snake_case_slug>", "description": "<concrete question>", "rationale": "<why this matters pedagogically>" }
  ],
  "expected_divergences": [
    { "category": "drift" | "revision" | "bug", "pattern": "<specific pattern>" }
  ],
  "phase_2_required": true | false,
  "student_level": "week_1_2" | "week_3_6" | "week_7_plus",
  "prompt_quality_note": "<string or null>"
}`;

// Three few-shot examples from Tech Spec §3.2. Included in the user turn
// before the real prompt so the examples anchor register (especially the
// proportionality rule and the `prompt_quality_note` path for vague prompts).
const FEW_SHOTS = `Example A — trivial prompt:

PROMPT: "Write a function that counts vowels in a string."

OUTPUT:
{
  "spec_gate_dimensions": [
    { "id": "case_sensitivity", "description": "Does the function count uppercase vowels (A, E, I, O, U) in addition to lowercase, or only one case?", "rationale": "Case handling is the most common unstated assumption in string-counting problems; forcing the student to commit surfaces whether they've thought about it." },
    { "id": "y_as_vowel", "description": "Does 'y' count as a vowel?", "rationale": "English teaches 'y is sometimes a vowel'; this has no objectively correct answer, so the spec must commit to one." },
    { "id": "empty_string", "description": "What should the function return when given an empty string?", "rationale": "Empty input is the canonical missed case in CS1; surfacing it in the spec gate is cheaper than surfacing it in a failed test." }
  ],
  "expected_divergences": [
    { "category": "drift", "pattern": "Student's spec commits to counting uppercase vowels but code only checks lowercase because they wrote \`if c in 'aeiou'\` without .lower()" },
    { "category": "revision", "pattern": "Plan uses an accumulator variable; code uses \`sum(1 for c in s if ...)\` — coherent Pythonic refactor" },
    { "category": "bug", "pattern": "Off-by-one or type-error when the input isn't a string, e.g. crashes on None" }
  ],
  "phase_2_required": false,
  "student_level": "week_1_2",
  "prompt_quality_note": null
}

Example B — complex prompt:

PROMPT: "Write a function that validates a password. It must be at least 8 characters, contain at least one digit, at least one uppercase letter, and at least one special character from !@#$%. Return True if valid, False otherwise."

OUTPUT:
{
  "spec_gate_dimensions": [
    { "id": "exactly_8_behavior", "description": "Is a password of exactly 8 characters valid, or does 'at least 8' mean strictly more than 8?", "rationale": "Off-by-one on length is the most common drift in validation problems." },
    { "id": "non_string_input", "description": "What happens if the input is not a string (None, integer, list)?", "rationale": "Forcing commitment to a type-contract before coding prevents the student from crashing on type errors and calling it a bug rather than missing spec." },
    { "id": "unicode_letters", "description": "Do non-ASCII uppercase letters (Á, Ñ, Ü) count as uppercase, or only A-Z?", "rationale": "This is the kind of ambiguity a professional programmer would clarify with a product owner; surfacing it teaches the habit." },
    { "id": "special_char_set", "description": "Only !@#$% count as special, or is any non-alphanumeric character acceptable?", "rationale": "The prompt gave an explicit set, but students frequently interpret 'at least one special character' as 'any special character'. The spec must commit to one reading." },
    { "id": "empty_string", "description": "What should be returned for an empty string?", "rationale": "An empty string fails the length requirement; the spec should confirm the function returns False rather than raising." },
    { "id": "short_circuit_vs_all_rules", "description": "Should all rules be checked and a combined reason returned, or is returning False on the first failure sufficient?", "rationale": "The prompt says 'return True or False', so the answer is 'first failure', but students often over-engineer. Surfacing the simpler contract prevents that." }
  ],
  "expected_divergences": [
    { "category": "drift", "pattern": "Code checks length but forgets to check the digit/uppercase/special requirements, or vice versa — student fixated on one rule and dropped the others" },
    { "category": "drift", "pattern": "Code uses \`>\` instead of \`>=\` for length, rejecting valid 8-character passwords" },
    { "category": "revision", "pattern": "Plan describes four separate boolean checks; code uses \`any(c.isdigit() for c in pw)\`-style comprehensions — coherent simplification" },
    { "category": "revision", "pattern": "Plan describes nested ifs; code uses early returns — coherent restructure" },
    { "category": "bug", "pattern": "Correct logic but wrong return type (returning None or the string 'True')" },
    { "category": "bug", "pattern": "Uses \`in\` on a set of characters where the student meant membership but typed assignment" }
  ],
  "phase_2_required": true,
  "student_level": "week_7_plus",
  "prompt_quality_note": null
}

Example C — vague prompt (demonstrates the \`prompt_quality_note\` path):

PROMPT: "Make a program about animals."

OUTPUT:
{
  "spec_gate_dimensions": [
    { "id": "program_purpose", "description": "What is the program actually supposed to do with animals — store them, display them, compare them, simulate them?", "rationale": "The prompt does not define the task; the student cannot write a spec without first inventing a purpose." }
  ],
  "expected_divergences": [
    { "category": "drift", "pattern": "Student invents a purpose in their head, writes code for it, but never puts the invented purpose in the spec, so Phase 4 cannot diff intent against output" }
  ],
  "phase_2_required": true,
  "student_level": "week_3_6",
  "prompt_quality_note": "The prompt does not define a task. Scaffolding has been generated defensively, but pedagogical value will be low until the instructor specifies what the program should do."
}`;

export function buildScaffoldingUserMessage(
  promptText: string,
  title: string,
): string {
  return `${FEW_SHOTS}

Now it is your turn. Here is the instructor's real input.

TITLE: "${title}"
PROMPT: "${promptText}"

Generate the scaffolding. Output only the JSON object, no preamble, no markdown fences.`;
}
