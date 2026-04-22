# Maieutic — Technical Specification (MVP, 1-week build)

**Author:** Paula Vásquez-Henríquez
**Scope:** One-week hackathon MVP. Decisions prescriptive.
**Model:** Claude Opus 4.7 (via Anthropic TypeScript SDK, model string `claude-opus-4-7`)
**Derived from:** Product Description + PRD v1

---

## 0. Document purpose and non-goals

This spec is the blueprint for building the Maieutic MVP in one week. It takes decisions — stack, schema, prompts, file structure — so construction can start on day one without further design meetings. Where the PRD left calibration questions open (executability thresholds, mode-selection edge cases, refresh cadences), this spec codes defaults and marks them as tunable.

**Non-goals of this document:** deployment to production, authentication beyond a dev-mode cookie, concurrency beyond the ~10 simultaneous sessions the demo requires, LMS integration, evasion detection, FERPA-equivalent data governance. All of these are explicitly deferred per PRD §8.

**What one week buys us:** a working end-to-end system with real persistence, tests on the classifier and scaffolding generator (the two highest-risk Opus surfaces), a demo script that exercises the full lifecycle, and a codebase another developer could extend. It does not buy us production hardening, multi-tenant isolation, or the longitudinal view.

---

## 1. Architecture overview

### 1.1 Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend + backend | **Next.js 14 (app router) + TypeScript** | Single app per user's decision. App router gives Route Handlers with streaming, server actions, and colocated UI/API. |
| UI library | **React 18 + Tailwind + shadcn/ui** | shadcn gives accessible primitives (Dialog, Tabs, Table) without a runtime framework; Tailwind for the rest. |
| Code editor | **Monaco Editor** (`@monaco-editor/react`) | VS Code's editor. `quickSuggestions: false` and `suggestOnTriggerCharacters: false` disable autocomplete trivially — this is a hard functional requirement of Phase 3. CodeMirror would work but integrates worse with shadcn and needs more config to fully kill autocomplete. |
| Database | **SQLite + Prisma** | Schema from PRD Appendices A/B fits SQLite comfortably. Prisma is the idiomatic TS ORM. Migration to Postgres is mechanical post-MVP. |
| LLM client | **`@anthropic-ai/sdk`** (official TS SDK) | Direct SDK, no LangChain/LlamaIndex. The five load-bearing prompts (PRD §6) need fine-grained control, not generic chains. |
| Real-time instructor view | **Server-Sent Events** via a Route Handler returning `ReadableStream` | Unidirectional server→client. Simpler than WebSockets, reconnects automatically, and supports both the 90s refresh cadence and event-driven refreshes (phase transitions, alignment failures). |
| State on client | **React Server Components + TanStack Query** for client-side fetching; **Zustand** for editor/spec-panel local state | RSC for anything the server owns (exercise definitions, session logs); TanStack for mutation flows; Zustand for ephemeral UI state that doesn't need persistence. |
| Validation | **Zod** | Runtime validation at every LLM response boundary. Non-negotiable: Opus outputs JSON, and the system cannot trust it without parsing through a schema. |
| Testing | **Vitest** + **Playwright** | Vitest for unit tests on the classifier and scaffolding generator against fixture sessions; Playwright for one end-to-end demo script. |
| Deployment | **Local dev server for the demo**, optionally **Vercel** for a shareable link | No production deployment. `npm run dev` on the demo machine is the target. |

### 1.2 Process model

Single Next.js process. No Redis, no queue, no separate worker. All Opus calls happen in Route Handlers, streamed back to the client. Long-running analyses (intent-diff, cohort narrative) run synchronously within the Route Handler and stream tokens.

The live session view reads from SQLite on a 90-second interval (driven by SSE `keepalive` events from the server), plus on-event pushes when a session's state changes. There is no separate "live state" store — SQLite is the source of truth, and the summary generation reads from it.

### 1.3 Directory layout

```
maieutic/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                       # seeds the cached demo students
├── src/
│   ├── app/
│   │   ├── (instructor)/
│   │   │   ├── authoring/page.tsx    # exercise authoring flow
│   │   │   ├── live/page.tsx         # "Who needs me right now?"
│   │   │   ├── cohort/[id]/page.tsx  # "How did this exercise go?"
│   │   │   └── reasoning/[sid]/page.tsx  # private-reasoning view
│   │   ├── (student)/
│   │   │   └── exercise/[id]/page.tsx    # the four-phase loop
│   │   ├── api/
│   │   │   ├── author/
│   │   │   │   └── generate-scaffolding/route.ts   # POST, streams
│   │   │   ├── session/
│   │   │   │   ├── [sid]/spec/route.ts             # POST spec iteration
│   │   │   │   ├── [sid]/chat/route.ts             # POST phase-3 message
│   │   │   │   ├── [sid]/submit/route.ts           # POST final code
│   │   │   │   └── [sid]/divergence-response/route.ts  # POST student answer
│   │   │   ├── live/stream/route.ts                # GET SSE
│   │   │   └── cohort/[id]/narrative/route.ts      # POST, streams
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── opus/
│   │   │   ├── client.ts             # SDK wrapper, retries, logging
│   │   │   ├── prompts/
│   │   │   │   ├── scaffolding.ts    # §3
│   │   │   │   ├── spec-examiner.ts  # §4
│   │   │   │   ├── intent-diff.ts    # §5
│   │   │   │   ├── live-summary.ts   # §6
│   │   │   │   └── cohort-narrative.ts  # §7
│   │   │   └── schemas.ts            # Zod schemas for every LLM response
│   │   ├── db.ts                     # Prisma singleton
│   │   └── sse.ts                    # SSE helpers
│   └── components/
│       ├── student/
│       ├── instructor/
│       └── ui/                       # shadcn
├── tests/
│   ├── unit/
│   │   ├── intent-diff.test.ts
│   │   └── scaffolding.test.ts
│   ├── fixtures/
│   │   └── sessions/                 # hand-crafted session fixtures
│   └── e2e/
│       └── demo.spec.ts
├── .env.local                        # ANTHROPIC_API_KEY
├── package.json
└── tsconfig.json
```

### 1.4 Data flow for one student session

```
Student opens /exercise/[id]
  → SSR loads exercise record + creates session row
  → Phase 1 active, editor disabled
Student submits spec
  → POST /api/session/[sid]/spec
    → prompts/spec-examiner.ts runs, streams response
    → Zod-parses { passed: bool, questions: string[], gaps_addressed: [] }
    → writes iteration to phase_1_spec_gate.iterations
    → if passed: advances phase, returns
  → client updates, loops until passed
[if exercise.phase_2_required]
  Student submits plan
    → POST /api/session/[sid]/plan (no Opus call — plan is stored as-is)
    → advances phase
Phase 3 begins, editor unlocks
  → chat messages POST /api/session/[sid]/chat
    → prompts/spec-examiner in interrogative mode OR direct mode
    → streamed back
    → logged to phase_3_writing.opus_exchanges
Student submits code
  → POST /api/session/[sid]/submit
    → prompts/intent-diff.ts runs (single pass: classify + predict + questions)
    → returns divergences array, each with a student-facing question
    → student-facing questions shown; classifications/predictions hidden
  → Student answers each question
    → POST /api/session/[sid]/divergence-response per answer
    → alignment scored, final_classification revised via post-hoc pass
  → Session closes
Throughout: writing any phase transition or alignment failure pushes an event
  to the SSE stream consumed by /live
```

---

## 2. Data model (Prisma schema)

The PRD Appendices A/B define the logical schema. Here is the concrete Prisma version. SQLite doesn't support native JSON indexing, so list/object fields are stored as `Json` (SQLite stores it as TEXT). Queries that filter on JSON fields are acceptable at MVP scale.

```prisma
// prisma/schema.prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

generator client {
  provider = "prisma-client-js"
}

model Exercise {
  id                   String   @id  // slug
  title                String
  instructorPromptText String
  authoredAt           DateTime @default(now())
  publishedAt          DateTime?

  // Final, post-edit
  specGateDimensions   Json     // SpecDimension[]
  expectedDivergences  Json     // ExpectedDivergence[]
  phase2Required       Boolean
  studentLevel         String   // "week_1_2" | "week_3_6" | "week_7_plus"

  // Authoring trace — Opus first-pass output, preserved
  opusGeneratedDimensions      Json
  opusGeneratedDivergences     Json
  opusGeneratedPhase2Required  Boolean
  opusGeneratedStudentLevel    String

  sessions             Session[]
}

model Session {
  id            String   @id @default(cuid())
  studentId     String   // free-form string for MVP; no auth
  exerciseId    String
  exercise      Exercise @relation(fields: [exerciseId], references: [id])
  startedAt     DateTime @default(now())
  completedAt   DateTime?
  currentPhase  Int      // 1, 2, 3, 4, or 5 (closed)

  phase1Data    Json     // Phase1Data
  phase2Data    Json?    // Phase2Data
  phase3Data    Json     // Phase3Data (starts empty)
  phase4Data    Json?    // Phase4Data
  liveSummaries Json     // LiveSummary[] (append-only)

  events        SessionEvent[]

  @@index([exerciseId])
  @@index([completedAt])
}

model SessionEvent {
  id        String   @id @default(cuid())
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id])
  kind      String   // "phase_transition" | "alignment_failure" | "help_request" | "revision" | "summary_refresh"
  payload   Json
  createdAt DateTime @default(now())

  @@index([createdAt])
  @@index([sessionId, createdAt])
}
```

The TypeScript types for the JSON payloads are defined in `src/lib/opus/schemas.ts` as Zod schemas and derived types. This keeps runtime validation and compile-time types aligned from one source.

```ts
// src/lib/opus/schemas.ts — excerpt
import { z } from "zod";

export const StudentLevel = z.enum(["week_1_2", "week_3_6", "week_7_plus"]);

export const SpecDimension = z.object({
  id: z.string(),
  description: z.string(),
  rationale: z.string(),
  source: z.enum(["opus", "instructor_edited", "instructor_added"]),
});

export const ExpectedDivergence = z.object({
  category: z.enum(["drift", "revision", "bug"]),
  pattern: z.string(),
  source: z.enum(["opus", "instructor_edited", "instructor_added"]),
});

export const Phase1Iteration = z.object({
  timestamp: z.string(),
  studentSpecText: z.string(),
  opusQuestions: z.array(z.string()),
  gapsIdentified: z.array(z.string()),   // dimension ids still unaddressed
  gapsAddressedThisRound: z.array(z.string()),
  passed: z.boolean(),
});

export const Divergence = z.object({
  divergenceId: z.string(),
  initialClassification: z.enum(["drift", "revision", "bug"]),
  initialConfidence: z.enum(["high", "medium", "low"]),
  predictedJustification: z.string(),    // instructor-visible
  studentFacingQuestion: z.string(),     // student-visible
  evidenceFromSpec: z.string(),          // what part of the spec this tied to
  evidenceFromPlan: z.string().nullable(),
  evidenceFromCode: z.string(),
  studentResponse: z.string().nullable(),
  alignment: z.enum(["aligned", "partial", "diverged"]).nullable(),
  finalClassification: z.enum(["drift", "revision", "bug"]).nullable(),
  finalClassificationReason: z.string().nullable(),
});
```

---

## 3. Prompt 1 — Scaffolding generation (authoring flow)

**Where used:** §2.1 of PRD, `POST /api/author/generate-scaffolding`.
**Input:** instructor's free-text exercise prompt, optional title.
**Output:** four artifacts — spec-gate dimensions, expected divergences, `phase_2_required`, `student_level` — as a single JSON object.
**Model call:** single non-streaming `messages.create` with `response_format` forced via prompt (no native JSON mode at time of writing; parse + Zod validate).
**Quality floor:** proportional to exercise complexity (PRD §2.1). Specific, not template.

### 3.1 System prompt

```
You are a CS1 (introductory programming) pedagogy assistant. An instructor will
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
  and set a `prompt_quality_note` field describing the ambiguity. Do NOT refuse.

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
}
```

### 3.2 Few-shot examples (in the user turn, before the real prompt)

**Example A — trivial prompt:**

```
PROMPT: "Write a function that counts vowels in a string."

OUTPUT:
{
  "spec_gate_dimensions": [
    { "id": "case_sensitivity", "description": "Does the function count uppercase vowels (A, E, I, O, U) in addition to lowercase, or only one case?", "rationale": "Case handling is the most common unstated assumption in string-counting problems; forcing the student to commit surfaces whether they've thought about it." },
    { "id": "y_as_vowel", "description": "Does 'y' count as a vowel?", "rationale": "English teaches 'y is sometimes a vowel'; this has no objectively correct answer, so the spec must commit to one." },
    { "id": "empty_string", "description": "What should the function return when given an empty string?", "rationale": "Empty input is the canonical missed case in CS1; surfacing it in the spec gate is cheaper than surfacing it in a failed test." }
  ],
  "expected_divergences": [
    { "category": "drift", "pattern": "Student's spec commits to counting uppercase vowels but code only checks lowercase because they wrote `if c in 'aeiou'` without .lower()" },
    { "category": "revision", "pattern": "Plan uses an accumulator variable; code uses `sum(1 for c in s if ...)` — coherent Pythonic refactor" },
    { "category": "bug", "pattern": "Off-by-one or type-error when the input isn't a string, e.g. crashes on None" }
  ],
  "phase_2_required": false,
  "student_level": "week_1_2",
  "prompt_quality_note": null
}
```

**Example B — complex prompt:**

```
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
    { "category": "drift", "pattern": "Code uses `>` instead of `>=` for length, rejecting valid 8-character passwords" },
    { "category": "revision", "pattern": "Plan describes four separate boolean checks; code uses `any(c.isdigit() for c in pw)`-style comprehensions — coherent simplification" },
    { "category": "revision", "pattern": "Plan describes nested ifs; code uses early returns — coherent restructure" },
    { "category": "bug", "pattern": "Correct logic but wrong return type (returning None or the string 'True')" },
    { "category": "bug", "pattern": "Uses `in` on a set of characters where the student meant membership but typed assignment" }
  ],
  "phase_2_required": true,
  "student_level": "week_7_plus",
  "prompt_quality_note": null
}
```

**Example C — vague prompt (demonstrates the `prompt_quality_note` path):**

```
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
}
```

### 3.3 Validation at the boundary

```ts
// src/app/api/author/generate-scaffolding/route.ts — core
const raw = await callOpus({
  system: SCAFFOLDING_SYSTEM_PROMPT,
  messages: [
    { role: "user", content: buildScaffoldingUserPrompt(prompt, title) },
  ],
});

const parsed = ScaffoldingOutput.safeParse(JSON.parse(raw));
if (!parsed.success) {
  // Log the malformed output, retry once with a "fix-your-JSON" follow-up
  return retryScaffolding(raw, parsed.error);
}
return parsed.data;
```

On retry failure, surface the error to the instructor UI rather than fabricating scaffolding. The instructor can always re-submit the prompt.

---

## 4. Prompt 2 — Spec-gate Socratic examiner (Phase 1)

**Where used:** PRD §4.1, `POST /api/session/[sid]/spec` on each iteration.
**Input:** exercise's spec_gate_dimensions, exercise's student_level, student's current spec text, prior iterations in this session.
**Output:** `{ passed: boolean, questions: string[], gaps_addressed: string[], gaps_still_open: string[] }`.
**Behavior:** questions only, never content. Cannot close the gate while any instructor-configured dimension is unaddressed. May surface additional emergent gaps but cannot block on them alone.

### 4.1 System prompt

```
You are a Socratic examiner for a pedagogical IDE. A CS1 student is writing a
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
alone once the configured list is satisfied — set `passed: true` in that case
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
not block passing.
```

### 4.2 User-turn template

```
EXERCISE PROMPT:
{exercise.instructor_prompt_text}

STUDENT LEVEL: {exercise.student_level}

CONFIGURED SPEC DIMENSIONS:
{for each dim in exercise.spec_gate_dimensions}
  - id: {dim.id}
    description: {dim.description}
    (internal rationale, do not quote to student: {dim.rationale})

PRIOR ITERATIONS IN THIS SESSION:
{for each prior iteration}
  Round {n}: student wrote: "{spec}"
             you asked: {questions}
             you identified gaps: {gaps}

STUDENT'S CURRENT SPEC (round {n+1}):
"""
{current_spec_text}
"""

Evaluate. Output JSON per schema.
```

### 4.3 Few-shot example (week_1_2)

```
EXERCISE PROMPT: "Write a function that counts vowels in a string."
STUDENT LEVEL: week_1_2
CONFIGURED DIMENSIONS:
  - case_sensitivity
  - y_as_vowel
  - empty_string

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
    "What should the function return if the input string is empty (the string \"\")?"
  ],
  "passed": false
}
```

Note the spec listed `a,e,i,o,u` — not `y` — so `y_as_vowel` is addressed (by omission: committing to only aeiou is itself a commitment). The examiner must recognize this. This is the kind of reading a weaker model fumbles.

### 4.4 Executability decision logic

`passed` is a pure function of `gaps_still_open.length === 0`. No heuristic. This keeps the gate predictable and prevents Opus from "approving" a spec that structurally still has holes — matches the PRD §4.1 requirement that the instructor-configured list is a floor.

---

## 5. Prompt 3 — Intent-diff classification + prediction (Phase 4)

**Where used:** PRD §4.4, `POST /api/session/[sid]/submit`.
**Input:** final spec, intent declaration (if Phase 2 ran), final code, exercise's student_level, exercise's expected_divergences (as grounding).
**Output:** array of Divergence objects (see §2 Zod schema).
**Behavior:** single reasoning pass. Classifies + predicts + generates student-facing question. Biased toward Revision on ambiguity (PRD §4.5.A). Confidence-aware (§4.5.C).

This is the highest-value and highest-risk prompt in the system.

### 5.1 System prompt

```
You are analyzing a CS1 student's completed work. You have their specification,
their implementation plan (possibly absent), and their final code. Your job is
to identify each meaningful divergence between what they said they would do and
what the code actually does, and for each one:

1. CLASSIFY it as drift, revision, or bug.
2. PREDICT what the student will plausibly say when asked about it, calibrated
   to their level.
3. GENERATE a neutrally-phrased question to ask the student, calibrated to
   their level. The question must NOT reveal the classification.
4. ESTIMATE your confidence in the classification: high, medium, or low.

Definitions:
- DRIFT: the code does less than spec/plan required, or omits something promised.
  Usually not deliberate.
- REVISION: the code implements a coherent alternative that still satisfies the
  spec. Often better than the original plan. The student changed their mind
  mid-task.
- BUG: the code attempts what was planned but fails mechanically. Syntactic,
  off-by-one, type error, etc.

BIAS RULE: when the evidence between drift and revision is ambiguous, classify
as REVISION. False-drift (accusing a legitimate revision) damages trust; false-
revision (missing a drift) at worst misses an intervention. Asymmetric costs.

What counts as "meaningful": a divergence is meaningful if a competent grader
would want the student to reflect on it. Do NOT flag stylistic choices (variable
names, whitespace), local optimizations that don't change behavior (list
comprehension vs. loop for the same output), or implementation details the spec
did not constrain. Flag divergences that cross a behavioral or strategic line.

PREDICTION CALIBRATION BY LEVEL:

- week_1_2: predictions should be short, concrete, often involve forgetting or
  not noticing. Realistic predictions:
    - "I forgot that case."
    - "I didn't think about empty input."
    - "I thought it was the same thing."
    - "I wasn't sure what to do so I skipped it."
  For this level, "I don't know" and "I forgot" are EXPECTED and diagnostic.
  Do NOT predict strategic reasoning, trade-off analysis, or complexity
  arguments at this level.

- week_3_6: predictions can involve partial reasoning about small trade-offs.
    - "I thought using a list would be easier than a dictionary here."
    - "I changed it because my first version had a bug I couldn't find."
    - "I used range(len(x)) because I needed the index too."

- week_7_plus: predictions can invoke strategy, complexity, trade-offs,
  architectural reasoning.
    - "A hashmap would have worked but the input is small so the nested
       loop's simplicity wins."
    - "I dropped the validation because the spec said inputs were
       pre-sanitized."

QUESTION PHRASING:
- Never presuppose a category. "Your spec required X; your code doesn't do X"
  presupposes drift and is FORBIDDEN.
- Use neutral framing: "I noticed [observation]. Walk me through what happened
  there." or "Your spec said X; your code does Y. Can you tell me about that?"
- Calibrate vocabulary to level. For week_1_2, never use "invariant", "amortized",
  "trade-off", "idempotent". For week_7_plus, technical vocabulary is fine.

CONFIDENCE:
- high: you are confident in the classification and the evidence supports it.
- medium: classification is plausible but a reasonable alternative exists.
- low: genuinely unclear. In this case, phrase the question in pure exploratory
  form and the post-hoc classifier will finalize after the student responds.

OUTPUT FORMAT: a single JSON object, no preamble, no markdown.

{
  "divergences": [
    {
      "divergence_id": "<short_slug>",
      "initial_classification": "drift" | "revision" | "bug",
      "initial_confidence": "high" | "medium" | "low",
      "predicted_justification": "<what student will say>",
      "student_facing_question": "<the neutral question>",
      "evidence_from_spec": "<quoted or paraphrased>",
      "evidence_from_plan": "<quoted or paraphrased, or null>",
      "evidence_from_code": "<quoted snippet>"
    }
  ]
}

If there are no meaningful divergences, return { "divergences": [] }. Do NOT
invent divergences to have something to show.
```

### 5.2 Few-shot example (week_1_2, drift case)

```
EXERCISE: "Write a function that counts vowels in a string."
STUDENT LEVEL: week_1_2
EXPECTED DIVERGENCES (grounding, for reference):
  - drift: code only counts lowercase despite spec committing to case-insensitive
  - revision: accumulator replaced with sum(...) comprehension

STUDENT SPEC:
"The function takes a string and returns a number. It counts a, e, i, o, u and
also A, E, I, O, U. If the string is empty, it returns 0."

STUDENT PLAN: (phase 2 not required)

STUDENT CODE:
def count_vowels(s):
    count = 0
    for c in s:
        if c in 'aeiou':
            count = count + 1
    return count

OUTPUT:
{
  "divergences": [
    {
      "divergence_id": "case_insensitive_drift",
      "initial_classification": "drift",
      "initial_confidence": "high",
      "predicted_justification": "I forgot about the capital letters.",
      "student_facing_question": "Your spec said the function counts vowels like A, E, I, O, U as well as lowercase. I noticed your code only checks for lowercase. Can you tell me what happened there?",
      "evidence_from_spec": "counts a, e, i, o, u and also A, E, I, O, U",
      "evidence_from_plan": null,
      "evidence_from_code": "if c in 'aeiou': — no uppercase handling"
    }
  ]
}
```

The predicted justification is exactly the kind of sentence a week-1 student says. A weaker model predicts "the student will explain that they intended to normalize case but forgot" — too articulate, guaranteed to misalign.

### 5.3 Few-shot example (week_7_plus, revision case — bias toward revision)

```
EXERCISE: "Validate a password: at least 8 chars, one digit, one uppercase, one special (!@#$%)."
STUDENT LEVEL: week_7_plus

STUDENT SPEC: (abbreviated — all six dimensions addressed)

STUDENT PLAN:
"I'll define four boolean variables, one for each rule. Loop through the string
once, updating each flag. At the end, return True only if all four are True,
plus the length check at the start."

STUDENT CODE:
def validate(pw):
    if not isinstance(pw, str) or len(pw) < 8:
        return False
    return (any(c.isdigit() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c in '!@#$%' for c in pw))

OUTPUT:
{
  "divergences": [
    {
      "divergence_id": "single_loop_to_three_any",
      "initial_classification": "revision",
      "initial_confidence": "high",
      "predicted_justification": "The any() form is cleaner and the performance difference is negligible for password-length strings.",
      "student_facing_question": "Your plan described four boolean flags updated in a single loop; your code uses three any() expressions instead. Can you tell me about that change?",
      "evidence_from_spec": "all four rules must pass",
      "evidence_from_plan": "four boolean variables ... loop through the string once",
      "evidence_from_code": "any(c.isdigit()...) and any(c.isupper()...) and any(c in '!@#$%'...)"
    }
  ]
}
```

Note: this iterates the string three times rather than once, which the plan optimized against. A weaker model sees "didn't do what the plan said" and classifies drift. The correct call is revision — the code satisfies the spec, and the efficiency loss is negligible for the input size. The bias rule in the system prompt makes this explicit.

### 5.4 Post-hoc re-classification (Phase 4, item E)

After the student responds to each divergence question, a second, lighter Opus call updates `final_classification`:

```
Given:
- The initial classification: {initial}
- The predicted justification: {predicted}
- The student's actual response: {response}

Score the alignment between predicted and actual:
- aligned: the student articulated essentially what was predicted
- partial: overlapping themes but missing key elements
- diverged: substantively different reasoning

Then, based on the student's response, produce a final classification. Rules:
- If the student gave a coherent justification for the divergence (regardless of
  initial classification), final = revision.
- If the student said they forgot, didn't notice, didn't think about it, or
  otherwise confirmed they didn't intend the divergence, final = drift.
- If the student identified a mechanical error in their code, final = bug.
- If the student said "I don't know": final stays as initial. Alignment is
  aligned IF the predicted_justification anticipated this kind of response
  (common at week_1_2), partial otherwise.

Output:
{
  "alignment": "aligned" | "partial" | "diverged",
  "final_classification": "drift" | "revision" | "bug",
  "final_classification_reason": "<one sentence>"
}
```

---

## 6. Prompt 4 — Live cognitive summary (instructor dashboard)

**Where used:** PRD §5.1, invoked on each refresh cycle (every 90s or on event).
**Input:** current session state — phase, time in phase, recent Opus exchanges, recent spec iterations, code in flight, recent events (alignment failures, revisions).
**Output:** one sentence, plus flags.
**Hard requirement:** actionable in under five seconds. "Student is in Phase 1" fails the demo bar.

### 6.1 System prompt

```
You are generating a one-line cognitive summary for an instructor looking at a
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

Flag rules: return a `flags` list with any of:
- "help_requested": active ask-for-help
- "alignment_failure": the most recent divergence response diverged from prediction
- "proactive_revision": student invoked "revise plan" in phase 3
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
- "Phase 3; code compiles but intent declaration said hashmap and they wrote nested loops — likely a revision, worth a check."
- "Prediction-alignment just failed on a boundary-condition question; student answered 'I don't know.' High-value intervention target."
- "Phase 1, iteration 4, same gap unresolved (empty input); 6 minutes since last submission."
- "Phase 3, 15 minutes in, no code written, chat log shows three questions about syntax — possibly stuck on how to start, not on what to write."
```

### 6.2 User-turn template

```
STUDENT: {session.student_id}
EXERCISE: {exercise.title} (level: {exercise.student_level})
CURRENT PHASE: {session.current_phase}
TIME IN PHASE: {minutes}
TIME IN SESSION: {minutes}

RECENT ACTIVITY (last 5 minutes):

{if phase == 1}
  Spec iterations:
  {for it in recent_iterations}
    Round {n}: spec = "{truncated_spec}"
               opus asked: {questions}
               gaps still open: {gaps}

{if phase == 3}
  Code in editor (last saved):
  """
  {code}
  """
  Recent chat exchanges:
  {for ex in recent_chat}
    student: "{msg}"
    opus ({mode}): "{response_first_line}"
  Recent revisions: {revisions}

{if phase == 4}
  Divergences being reviewed: {count}
  Already answered: {count}
  Most recent response: "{response}"
  Most recent alignment: {alignment}

RECENT EVENTS:
{for e in recent_events}
  - {e.kind} at {e.timestamp}: {e.payload_summary}

Generate the summary.
```

Summaries are generated per student, per refresh. At demo scale (~10 sessions) this is affordable. In the real 80-student case, batching strategies are needed but are out of scope.

---

## 7. Prompt 5 — Cohort narrative (per-exercise view)

**Where used:** PRD §5.2, `POST /api/cohort/[id]/narrative`, streamed.
**Input:** aggregate data for one exercise — spec-iteration distribution, divergence classification counts, most-flagged divergences, most-missed spec dimensions, revision rates, alignment-failure rates, plus the exercise's expected_divergences for grounding.
**Output:** 2-3 sentences naming a concrete pattern and a concrete fix.
**Hard requirement:** specific. "Students struggled with this exercise" fails.

### 7.1 System prompt

```
You are writing a short narrative for an instructor reviewing how a cohort
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
  "provisional": true | false   // true if sample is small
}
```

### 7.2 Few-shot examples

```
EXAMPLE A — clear pattern:

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

EXAMPLE B — small sample:

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

EXAMPLE C — exercise performed as expected:

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
}
```

---

## 8. LLM client wrapper

Centralized in `src/lib/opus/client.ts`. One function per calling pattern (streaming vs non-streaming), all prompts go through it, all get logged.

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-opus-4-7";

export async function callOpus(args: {
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  expectJson?: boolean;   // if true, strip code fences before returning
}): Promise<string> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: args.maxTokens ?? 4096,
    system: args.system,
    messages: args.messages,
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");
  return args.expectJson ? stripFences(text) : text;
}

export async function *streamOpus(args: {
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
}): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: args.maxTokens ?? 4096,
    system: args.system,
    messages: args.messages,
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
}
```

Retry policy: on Zod validation failure for JSON-expecting calls, one retry with a "your previous output was invalid, here is the error: X — please fix" follow-up. On second failure, error to the UI.

Cost guardrails: the spec-examiner and live-summary prompts are the highest-frequency calls. Both get `max_tokens: 1024`. The intent-diff and scaffolding prompts get 4096. The cohort narrative gets 2048. These caps are defaults; tune against observed traffic.

---

## 9. SSE implementation for the live view

One Route Handler at `/api/live/stream/route.ts`. The client opens a single EventSource; the server pushes updates on three triggers:

1. **90s timer** — refresh all live-summary entries for sessions active in the last 10 minutes.
2. **Event-driven** — whenever a `SessionEvent` row is written with kind in {`phase_transition`, `alignment_failure`, `help_request`, `revision`}, push a targeted refresh for that session.
3. **Keepalive** — every 30s, to prevent proxy timeout.

```ts
// src/app/api/live/stream/route.ts — core
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown, event?: string) => {
        const lines = [];
        if (event) lines.push(`event: ${event}`);
        lines.push(`data: ${JSON.stringify(data)}\n\n`);
        controller.enqueue(encoder.encode(lines.join("\n")));
      };

      // Initial snapshot
      const snapshot = await buildInitialSnapshot();
      send(snapshot, "snapshot");

      // Poll every 90s + listen to event table
      const timer = setInterval(async () => {
        const refreshed = await refreshActiveSummaries();
        send(refreshed, "summary_refresh");
      }, 90_000);

      const keepalive = setInterval(() => send({ ts: Date.now() }, "keepalive"), 30_000);

      // In-process event bus (EventEmitter or Node's native events)
      const onEvent = (e: SessionEvent) => send(e, "session_event");
      sessionEventBus.on("event", onEvent);

      req.signal.addEventListener("abort", () => {
        clearInterval(timer);
        clearInterval(keepalive);
        sessionEventBus.off("event", onEvent);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
```

The `sessionEventBus` is a module-scoped `EventEmitter` imported by the other Route Handlers. When a handler writes a `SessionEvent` row, it also emits on the bus. Single-process assumption — fine for demo, first thing to replace for the pilot.

---

## 10. Cached demo students

Three pre-recorded student sessions, stored as JSON fixtures, replayed into the system by a seed script. They populate the live view alongside the one live student.

```
tests/fixtures/sessions/
  ├── ana-vowel-drift.json       # week_1_2, drifts on case sensitivity, answers "I forgot"
  ├── beto-password-revision.json # week_7_plus, coherent refactor, good alignment
  └── carmen-stuck-on-spec.json  # week_3_6, stuck on spec iteration 4, help_requested flag
```

Each fixture is a full `Session` + associated `SessionEvent` rows, with timestamps rewritten at seed time so the live view shows plausible recency. A `scripts/replay-fixtures.ts` command inserts them and optionally advances their state on a timer (simulating Ana getting to Phase 4 mid-demo).

This is *not* fake — the fixtures are produced by running real sessions against the system ahead of time, capturing the real Opus outputs, and replaying them. The private-reasoning view for these sessions shows the actual predictions Opus made. This preserves the demo-quality bar in PRD §7 (Demo reliability) without seeding synthetic data in the sense §5.2 prohibits (the data was generated by real usage, not invented).

The one live session during the demo is the one driven by the presenter at the podium.

---

## 11. Testing

**Unit tests** (Vitest) target the two prompts whose correctness is hardest to eyeball:

- `tests/unit/intent-diff.test.ts` — for each of ~12 hand-crafted `(spec, plan, code)` fixtures at varying levels, assert the classification, confidence, and rough shape of the predicted justification (e.g., for week_1_2 drift, assert the prediction contains "forgot" or "didn't" or "don't know"). This is a regression net, not a correctness proof — LLM outputs vary across runs — but it catches the mode where a prompt edit silently regresses to generic output.
- `tests/unit/scaffolding.test.ts` — for ~6 exercise prompts (trivial through complex), assert the dimension count is in the proportional range (2-3 for trivial, 5-7 for complex), assert no dimension contains the string "edge case" or "handle errors" (generic markers), assert the student_level classification.

Both test files include a "golden" output per fixture. Test runs compare structurally (using Zod + shape assertions) rather than string-equal.

**E2E test** (Playwright): one scripted trajectory — author an exercise, student completes it with a known drift, instructor opens private-reasoning view, confirms prediction + alignment-failure visible. This is the demo happy path, automated.

---

---

## 12. Open decisions deferred to implementation

Enumerated so they don't block day 1:

1. **Monaco theme** — default vs. a custom theme. Default is fine for MVP.
2. **Rate limiting on Opus calls** — none for MVP (single-user demo). Add before pilot.
3. **Session timeout** — no automatic close for MVP; instructor closes manually or the student completes Phase 4.
4. **What counts as "significant state change" for event-driven SSE pushes** — implemented as a hardcoded set (§9). Tunable.
5. **Visual indication of `low`-confidence divergences on the student UI** — PRD §4.5.C says the student question is phrased exploratorily; implementation should match phrasing to confidence without labeling confidence on the student view.

---

## 13. What this spec is NOT

- Not a production architecture. The single-process, SQLite, no-auth, event-bus-in-memory design works for one week and ~10 concurrent sessions. It does not survive an 80-student lab. That's the pilot spec, not this one.
- Not a complete prompt library. The five prompts here are the load-bearing ones. Secondary prompts (e.g., the post-hoc classifier in §5.4, the Phase 3 mode selector) are described in the relevant section but not given full few-shot treatment — they are simple enough to write directly.
- Not a research methodology. The private-prediction mechanism has informed-consent implications (PRD §8 defers this) that any real-classroom deployment must address. The MVP is a capability demonstration, not a study instrument.

---

*End of spec.*