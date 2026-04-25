# Maieutic — Feature Description

A complete, implementation-grounded inventory of what Maieutic does and how.
The [README](./README.md) covers the pedagogical bet; this document is the
detailed surface map: every screen, every Opus call, every behavior that's
actually shipped.

---

## 1. What the product is

Maieutic is a web app that guides introductory Python students through a
five-stage workflow — specification → plan → code → divergence review →
finalization — while giving instructors a live window into each student's
reasoning, a per-session replay, and cohort-level curricular diagnostics.
Opus is invoked at seven specific moments; everything else runs on a small
Next.js 16 + Prisma 6 + SQLite stack.

The product has two audiences reached from a single landing page:

- **Students** — one active session per (student, exercise) pair. The
  landing page and every exercise tile are language-switchable between
  English and Spanish.
- **Instructors** — no student selection required; every instructor view
  is a live, read-only cross-section of whatever students are doing.

---

## 2. The student journey, phase by phase

Every session is a row in `Session` with `currentPhase ∈ {1, 2, 3, 4, 5}`.
Advancing a phase is a one-way door — the only way to start over is the
"Start fresh" button in phase 5, which creates a *new* session and
preserves the old one in the database.

### Phase 1 — Specification gate

**Goal.** Force the student to describe the behavior they intend to
implement, in prose, before they touch code.

**Behavior.**

- The student types a specification into a textarea. No editor is
  available yet — the Monaco editor is literally not on the page.
- On submit, the server calls the `spec-examiner` Opus prompt, which
  evaluates the spec against two artifacts stored on the exercise:
  - `specGateDimensions` — the dimensions the instructor wanted addressed
    (or that Opus generated at authoring time).
  - An implicit "emergent gaps" channel for things the instructor didn't
    anticipate but that a reasonable implementer would still ask about.
- The response is either **pass** (advance to phase 2 or 3) or **more
  rounds needed**, in which case Opus returns one or more clarifying
  questions ("what should happen if the input is empty?"). Each round is
  appended to `phase1Data.iterations` and rendered in a hints panel
  beneath the textarea.
- Every round records which dimensions the iteration addressed; the
  cumulative addressed set persists across rounds so a student doesn't
  need to re-answer a previously-cleared question.
- The student can abandon the spec attempt at any time by clicking
  "Help, I'm stuck" — see §5.5.

**Transition trigger.** The spec-examiner returns `passed: true`. The
server then advances to phase 2 if `exercise.phase2Required`, otherwise
straight to phase 3.

### Phase 2 — Plan (optional)

**Goal.** Make the student write an implementation plan before the editor
unlocks.

**Behavior.**

- Only present when `exercise.phase2Required === true`. Week-1/2
  exercises skip this phase; week-7+ always require it.
- The final accepted spec is pinned in a read-only panel above a plain
  textarea. The student writes a natural-language plan ("I'll use a for
  loop to walk the list, keep a running max, then print it at the end").
- No Opus call happens here — the plan is accepted as-is and stored on
  `phase2Data.planText` with a timestamp. The discipline is in the
  *writing*, not in its evaluation.

**Transition trigger.** Student clicks submit. Server advances to phase 3.

### Phase 3 — Implementation

**Goal.** The student writes the actual Python code, with a constrained
kind of assistance.

**Behavior.**

- **Monaco editor** with autocomplete and IntelliSense explicitly
  disabled: `quickSuggestions`, `suggestOnTriggerCharacters`,
  `parameterHints`, `wordBasedSuggestions`, `snippetSuggestions`, inline
  suggestions and tab completion are all off. Minimap hidden.
- **Accepted spec and plan** are pinned beside the exercise title as
  collapsible side-cards; the student can reference them without leaving
  the editor.
- **Chat panel (right column)** — the student can ask Opus questions
  while coding. The `phase3-chat` prompt routes the message:
  - **Reference questions** ("what's the syntax for a for loop over a
    string?") get a direct answer.
  - **Reasoning questions** ("why doesn't my count look right?") get a
    counter-question, not an answer. The debugging thinking stays with
    the student.
  - Each exchange is persisted to `phase3Data.opusExchanges` with a
    `opusMode` tag (`"direct"` or the reasoning equivalent) that the
    instructor view surfaces later.
- **Autosave** — every keystroke debounces for 1.5s, then posts the
  buffer to `/api/session/[sid]/autosave`, which writes to
  `phase3Data.currentCode`. Reloading the tab restores exactly what was
  on screen.
- **Change of plan dialog** — a secondary button next to "Submit" opens
  a modal where the student can record a plan amendment plus a
  justification (faster / simpler / more correct / other). Written to
  `phase3Data.revisions`; this becomes the `revision` event in the
  dashboard's event log.
- **Submit for review** — posts the final code to `/api/session/[sid]/submit`,
  which persists it to `phase3Data.finalCode`, then calls the
  `intent-diff` Opus prompt with the spec, plan, and code together. The
  response is a list of `Divergence` records.

**Transition trigger.** If the `intent-diff` call returns zero
divergences, the server jumps straight to phase 5 (nothing to review).
Otherwise it advances to phase 4 with the divergences stored on
`phase4Data.divergences`.

### Phase 4 — Divergence review

**Goal.** Make the student read their own code critically against their
own stated intent and explain the gaps.

**Behavior.**

- For each divergence, Opus has already produced (privately) an
  `initialClassification` (`drift` | `revision` | `bug`), a confidence
  level, and a `predictedJustification` — what it thinks the student
  will say when asked. The student sees none of that; they see only the
  neutral `studentFacingQuestion`: *"In your spec you said X. In the code
  I see Y. What happened?"*.
- Questions are answered one at a time. Each answer posts to
  `/api/session/[sid]/divergence-response`, which calls the `post-hoc`
  Opus prompt. That prompt compares the student's actual answer to the
  `predictedJustification` and returns:
  - `alignment` ∈ `{aligned, partial, diverged}` — how close the student
    came to what Opus expected.
  - `finalClassification` ∈ `{drift, revision, bug}` — possibly refined
    from `initial` based on the student's explanation.
  - `finalClassificationReason` — prose Opus writes for the instructor.
- Once every divergence has an answer, the session does **not**
  automatically advance. Instead, a "revision pass" handoff appears.

**Revision pass (post-Q&A).**

- A small card asks: *"Want a pass at closing those gaps?"* with two
  buttons — **Revise my code** / **I'm done**.
- **I'm done** (skip) → `POST /api/session/[sid]/finalize` with an empty
  body. Records `revisionChoice: "skipped"` on `phase4Data` and advances
  to phase 5.
- **Revise my code** → swaps the page to a single-pass Monaco editor
  seeded with the original final code. The spec, plan, and the student's
  own divergence answers are pinned alongside as read-only references.
  Submitting posts `POST /finalize` with `{revisedCode}`. Records
  `revisionChoice: "revised"` and the revised buffer on `phase4Data`,
  then advances to phase 5.
- **What is preserved.** The original `phase3.finalCode` and every
  divergence answer + classification are frozen the moment phase 4 ends
  — the revision pass never rewrites the learning signal. There is only
  ever one revision pass per session; the finalize endpoint rejects a
  second call with `409 already_finalized`.

**Before-unload guard.** While any divergence is still unanswered, the
tab blocks accidental close/refresh with a browser confirmation prompt.

**Transition trigger.** `/finalize` is called. Server advances to phase 5
and sets `Session.completedAt`, which is what the `/exercises` list uses
to show a green check.

### Phase 5 — Closed / review

**Goal.** A permanent, read-only artifact of the completed session that
the student can revisit, and an entry point to try again.

**Behavior.**

- Every mutating control is gated off: heartbeat, autosave, chat, help
  button, divergence textareas, finalize button. The UI renders the
  spec iteration history, accepted spec, plan, submitted code, every
  divergence question + the student's answer, and — if they used the
  revision pass — a "✓ revised" badge.
- **Start fresh.** A button on the completion banner creates a brand-new
  session via `POST /api/exercise/[id]/reset`. The browser confirms
  ("Start a new attempt? Your answers above stay on record…"), reloads,
  and `findOrCreateSession` picks up the new session on the next load.
- **Revisit flow.** If the student clicks the exercise tile on
  `/exercises` after finishing, they land back on this view. The router
  rule is:
  1. A resumable in-progress session (phase > 1, or phase 1 with ≥ 1
     iteration) wins.
  2. Otherwise, the most recent completed session is reopened for
     review.
  3. Otherwise, a fresh session is created.
  This prevents a stray "Start fresh" click from hiding a valid completed
  review.

---

## 3. The student-facing shell

Everything on a student page shares four layout elements, independent of
which phase is rendering:

- **TopNav.** The Maieutic mark, a back link ("← Exercises"), and a
  right slot that houses the "Help, I'm stuck" button during phases
  1–4. Back is suppressed while divergences are unanswered, so
  students can't accidentally navigate away mid-Q&A.
- **File tab.** A VS Code-style tab showing `<exercise-slug>.py`. Purely
  decorative; it sets tone.
- **Status bar.** Bottom strip showing the current phase number + label,
  the unit (`Unit I · Python Fundamentals` etc.), a `✓ claude-opus-4-7`
  indicator, and the Markdown/UTF-8 meta.
- **Language switcher.** A tiny dropdown in the TopNav right slot on
  `/exercises` (and the landing page), posting to `/api/lang` to set the
  `maieutic_lang` cookie and reload.

### 3.1 Help, I'm stuck

- Available in phases 1–4 via the TopNav right slot.
- Click → a modal appears for the student to pre-write a message, or
  accept the default "(student pressed Help, I'm stuck)".
- Submit → `POST /api/session/[sid]/help` creates a record in
  `phase1Data.helpRequests` with `resolution: null` and emits a
  `help_request` session event. A `HelpPendingOverlay` covers the UI
  with a "Help is on the way" message.
- The student can dismiss the overlay themselves (`student_cancelled`)
  or wait for the instructor. The live dashboard surfaces a red 🙋
  badge on that student's row until the instructor clicks to resolve
  it, which posts `/help/resolve` with `help_arrived` and emits
  `help_resolved`.

### 3.2 Heartbeat and presence

- Every student page pings `POST /api/session/[sid]/heartbeat` every 15
  seconds while `document.visibilityState === "visible"`, and also
  immediately on tab refocus.
- The endpoint updates `Session.lastActiveAt`. The instructor live
  dashboard derives presence from that timestamp:
  - **Live** (<30s): green dot, "Just now".
  - **Stepped away** (<5min): yellow dot, idle minutes.
  - **Left session** (>5min): grey, session row eventually drops out of
    the 30-minute active window.
- Heartbeat is suppressed once the session is closed (phase 5).

---

## 4. The instructor's three views

### 4.1 Live class dashboard (`/live`)

**Purpose.** At-a-glance read of which students are productively stuck
vs. which need help now, for an eighty-student lab.

**Feed mechanics.** A pure Route Handler at `/api/live/stream` streams
Server-Sent Events from a module-scoped `EventEmitter` in
`src/lib/events.ts` — no Redis, single-process. Three write paths:

- **Event-driven.** Any API route that appends a `SessionEvent`
  simultaneously `emit`s on the bus, so transitions and help requests
  are pushed immediately.
- **10-second snapshot tick.** Rebuilds the active-session roster from
  the database — catches sessions that fell off the 30-minute window or
  just completed.
- **90-second live-summary tick.** Invokes the `live-summary` Opus
  prompt for every active session and appends each result to
  `Session.liveSummaries` (append-only), then emits.

**Row contents.**

- Truncated student ID, exercise title, and a phase badge.
- The latest live summary sentence ("the student wrote 'n >= 0' and
  'negative inputs are handled' in the same spec; they're confused
  about what committing to behavior looks like, not about Fibonacci").
- Presence indicator + idle time.
- A help badge if an unresolved `help_request` exists.
- A "Dismiss" affordance that hides the row locally; it reappears on the
  next student activity.

**Session event kinds pushed to the dashboard.**

`session_started`, `phase_transition`, `alignment_failure`,
`help_request`, `help_resolved`, `revision`, `summary_refresh`.

**Click-through.** Click a row → `/reasoning/[sid]`.

### 4.2 Reasoning view (`/reasoning/[sid]`)

**Purpose.** A two-column replay of one student's session: on the left,
exactly what the student saw; on the right, everything Opus was thinking
that the student never saw.

**Left column — student-visible trace.**

- Specification iterations — each round's text, timestamp, pass/fail
  badge, and the questions Opus asked that round.
- Plan text (if phase 2 ran).
- Phase 3 chat — every student message and Opus response, with the
  `opusMode` tag.
- Submitted code (monospace block).
- If the revision pass ran, a second "Revised after divergence review"
  panel shows the revised code, annotated that the classifications
  above refer to the **original** submission.
- Divergence questions "as shown" — the neutral questions and the
  student's answers.

**Right column — private reasoning (instructor-only).**

- Per-iteration spec-gate reasoning: which dimensions were addressed,
  which are still open, which emergent gaps Opus flagged.
- Per-divergence classifications — initial vs. final category (`drift` /
  `revision` / `bug`), confidence, alignment (`aligned` / `partial` /
  `diverged`), the `predictedJustification` Opus privately wrote, and
  Opus's reason for any refined classification.
- Evidence trail — the exact spec snippet, plan snippet (if any), and
  code snippet that Opus flagged as the divergence surface.
- Live-summary history — every snapshot ever generated for this
  session, with flags.
- Events timeline — the raw `SessionEvent` log, kind + truncated
  payload.

### 4.3 Cohorts and exercise library (`/cohorts`, `/cohort/[id]`)

- **`/cohorts`** lists every published exercise as a card with how many
  students started, how many finished, which spec-gate dimensions were
  most often missed, and the divergence category distribution.
- **`/cohort/[id]`** drills into one exercise. The instructor clicks a
  "Generate narrative" button, which posts to
  `/api/cohort/[id]/narrative`. That endpoint feeds every finished
  session's aggregate into the `cohort-narrative` Opus prompt and
  returns a short narrative with one concrete curricular suggestion —
  *"six of eight students missed case-sensitivity on their first spec;
  consider introducing it as an explicit dimension earlier in the
  unit."*

### 4.4 Authoring (`/authoring`)

**Purpose.** Turn a plain-text problem prompt into a publishable
exercise in minutes.

**Flow.**

1. Instructor types a title and an instructor prompt.
2. Clicks "Generate scaffolding" → `/api/author/generate-scaffolding`,
   which calls the `scaffolding` Opus prompt. The response has four
   pieces: the list of spec-gate dimensions (each with id, description,
   rationale), expected divergences (category + pattern), whether phase
   2 should be required, and the recommended student level.
3. Each field is editable side-by-side with Opus's original. Every
   value is tagged `opus`, `instructor_edited`, or `instructor_added`
   so the provenance stays visible.
4. Instructor picks a unit (Unit I–IV), optionally overrides the
   phase-2 toggle and student level, and clicks "Publish exercise".
5. `/api/author/publish` slug-ifies the title into an ID (auto-suffixed
   on collision), stores both the instructor-edited values **and**
   Opus's originals (`opusGeneratedDimensions`, `opusGeneratedDivergences`,
   `opusGeneratedPhase2Required`, `opusGeneratedStudentLevel`) as
   immutable evidence of the editorial trail.

---

## 5. Opus's seven moments

Every Opus call is a deliberately-prompted conversation; the prompts
themselves live in `src/lib/opus/prompts/` and are read-only artifacts
anyone can audit. Every response is validated with Zod at the boundary.

| # | Prompt file | Triggered by | What it produces |
|---|---|---|---|
| 1 | `spec-examiner.ts` | Student submits a spec (phase 1) | Pass/fail verdict, clarifying questions, which dimensions the iteration addressed, any emergent gaps |
| 2 | `phase3-chat.ts` | Student sends a chat message in phase 3 | Turn-by-turn routing: direct answer for reference questions, counter-question for reasoning questions |
| 3 | `intent-diff.ts` | Student submits code (phase 3 → 4) | List of `Divergence` records: neutral question, evidence snippets, predicted justification, initial classification + confidence |
| 4 | `post-hoc.ts` | Student answers a divergence question (phase 4) | Alignment verdict, refined classification, prose reason the instructor sees |
| 5 | `live-summary.ts` | 90s tick on every active session | One-sentence summary of where the student actually is, plus machine flags (e.g. `confused_about_spec_commitment`) |
| 6 | `cohort-narrative.ts` | Instructor clicks the narrative button on a cohort page | Short prose narrative + one concrete curricular suggestion |
| 7 | `scaffolding.ts` | Instructor clicks "Generate scaffolding" on the authoring page | Spec dimensions, expected divergences, phase-2 recommendation, student-level recommendation |

All seven prompts accept a `langDirective` so responses honor the
student's cookie-chosen language.

---

## 6. Data model

`prisma/schema.prisma` defines four models.

### Exercise

- **Identity.** `id` (URL slug), `title`, `instructorPromptText`,
  `authoredAt`, `publishedAt`.
- **Post-edit authoring.** `specGateDimensions` (JSON — the list the
  instructor actually published), `expectedDivergences`, `phase2Required`,
  `studentLevel`, `unit`.
- **Opus provenance (immutable).** `opusGeneratedDimensions`,
  `opusGeneratedDivergences`, `opusGeneratedPhase2Required`,
  `opusGeneratedStudentLevel`. Preserved exactly as returned by the
  scaffolding call even if the instructor rewrites them.
- **Relations.** `sessions`, `translations`.

### ExerciseTranslation

- Per-language cache of an exercise's student-visible text.
- Populated on demand the first time a student in that language opens
  the exercise; read from cache afterward. Invalidated by deleting
  rows — the `update-exercise-prompts.ts` script does this whenever it
  touches `instructorPromptText`.

### Session

- **Identity.** `id` (cuid), `studentId` (free-form string; no auth),
  `exerciseId`, `startedAt`, `lastActiveAt`, `completedAt` (nullable).
- **State.** `currentPhase` (1–5), `phase1Data`, `phase2Data`,
  `phase3Data`, `phase4Data`, `liveSummaries`.
- **Phase 3 data.** `currentCode` (autosave target), `finalCode`,
  `submittedAt`, `opusExchanges`, `revisions` (plan amendments).
- **Phase 4 data.** `divergences`, `startedAt`, `completedAt`,
  `revisionChoice` (`"skipped" | "revised" | null`), `revisedCode`,
  `revisedAt`.
- **Relations.** `exercise`, `events`.

### SessionEvent

- Append-only log. `id`, `sessionId`, `kind`, `payload` (JSON),
  `createdAt`.
- Kinds: `session_started`, `phase_transition`, `alignment_failure`,
  `help_request`, `help_resolved`, `revision`, `summary_refresh`.
- Every write also emits on the in-process `EventEmitter` so the live
  dashboard gets pushed an update without polling.

---

## 7. API surface

Grouped by audience.

### Authoring & publishing (instructor)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/author/generate-scaffolding` | Opus: produce dimensions + divergences from a prompt |
| POST | `/api/author/publish` | Store authored exercise, slug + publish |

### Cohort view (instructor)

| POST | `/api/cohort/[id]/narrative` | Opus: cohort-level narrative and curricular suggestion |

### Live dashboard (instructor)

| GET | `/api/live/stream` | SSE stream of session snapshots + events |

### Language preference (shared)

| POST | `/api/lang` | Persist `maieutic_lang` cookie (en / es) |

### Exercise lifecycle (student)

| POST | `/api/exercise/[id]/reset` | Create a brand-new session for the student |

### Session lifecycle (student)

| POST | `/api/session/[sid]/spec` | Opus: evaluate spec; advance phase on pass |
| POST | `/api/session/[sid]/plan` | Persist plan; advance to phase 3 |
| POST | `/api/session/[sid]/chat` | Opus: chat routing (direct / counter-question) |
| POST | `/api/session/[sid]/autosave` | Persist `phase3Data.currentCode` |
| POST | `/api/session/[sid]/submit` | Opus: intent-diff; advance to phase 4 or 5 |
| POST | `/api/session/[sid]/revise` | Phase-3 plan-amendment dialog |
| POST | `/api/session/[sid]/divergence-response` | Opus: post-hoc classify; record answer |
| POST | `/api/session/[sid]/finalize` | Record revision-pass choice; advance to phase 5 |
| POST | `/api/session/[sid]/heartbeat` | Update `lastActiveAt` |
| POST | `/api/session/[sid]/help` | Create `help_request` event |
| POST | `/api/session/[sid]/help/resolve` | Resolve the help request |

Every handler validates body shape with Zod and checks `currentPhase`
before mutating — stale tabs are rejected with `409 wrong_phase`.

---

## 8. Internationalization

- **Languages.** English and Spanish, typed in `src/lib/i18n/dict.ts`
  as `Lang = "en" | "es"`.
- **Canonical dictionary.** `src/lib/i18n/en.ts` defines the
  `Dict` type via `typeof en`. `es.ts` uses `satisfies Dict` so the
  compiler refuses to ship if a key is missing.
- **Dictionaries are organized by screen** — `common`, `home`,
  `exercises`, `phaseLabel`, `statusBar`, `help`, `phase1`, `phase2`,
  `phase3`, `phase4`.
- **Language selection.** `POST /api/lang` sets a cookie
  (`maieutic_lang`, max-age 365d). `getLang()` reads it server-side;
  `useT()` returns the dictionary client-side.
- **Translated exercise fields.** Only `title` and `instructorPromptText`
  are translated; the scaffolding dimensions stay in the authoring
  language (they're opaque to the student). Translations are cached
  per-exercise, per-language in `ExerciseTranslation`.
- **Opus-facing directives.** `langDirective` in
  `src/lib/i18n/prompt.ts` injects "Respond in English" / "Responde en
  español" into every prompt that produces student-facing text, so
  Opus's divergence questions, chat answers, and summaries match the
  student's UI language.

---

## 9. Demo and seed tooling

Everything lives in `scripts/`.

| Script | Purpose |
|---|---|
| `reset-demo.ts` | One command: wipe DB + replay captured fixtures (Ana, Beto, Carmen + cohort sessions) |
| `replay-fixtures.ts` | Replay captured session JSON; `--wipe` to reset first |
| `capture-fixtures.ts` | Record a running session for later replay |
| `recapture-demo-sessions.ts` | Regenerate the Ana/Beto/Carmen trio after prompt tuning |
| `add-exercises.ts` | Bulk-import `Exercise` rows from JSON fixtures |
| `backfill-units.ts` | Migrate `Exercise.unit` across existing rows |
| `rescaffold-prompts.ts` | Re-run the scaffolding call over existing exercises (e.g. after prompt edits) |
| `update-exercise-prompts.ts` | Bulk-update `instructorPromptText` in the live DB (idempotent; clears translation cache) |
| `smoke.ts`, `smoke-session.ts` | End-to-end session checks |
| `stop3-transcripts.ts`, `stop4-samples.ts`, `stop5-samples.ts` | Extract phase-specific data for offline analysis |

Fixtures live in `tests/fixtures/exercises/*.json` (exercise definitions)
and `tests/fixtures/sessions/` (replayable session traces). The demo
exercises cover Units I–IV and span week-1-2 through week-7-plus
difficulty.

---

## 10. Stack

- **Next.js 16** (app router, Turbopack), React 19, TypeScript strict.
- **Tailwind v4** + shadcn/ui; VS Code-inspired dark theme throughout.
- **Monaco** editor via `@monaco-editor/react`, configured with all
  forms of autocomplete disabled.
- **Prisma 6** with SQLite (`prisma/schema.prisma`). The Postgres
  migration is mechanical.
- **Server-Sent Events** via a plain Route Handler + in-process
  `EventEmitter` for the live dashboard. No Redis, no queue.
- **`@anthropic-ai/sdk`** configured to `claude-opus-4-7`.
- **Zod** at every Opus response boundary, plus inside API handler
  bodies.
- **Vitest** for unit tests (default suite, no network), a separate
  `*.opus.test.ts` suite that hits Opus for regression, and a
  **Playwright** e2e suite for the full student flow.

No authentication — `studentId` is a cookie-stamped UUID set on first
visit. Production-grade auth is a deliberate non-goal for the MVP; every
screen is scoped by cookie.

---

## 11. The author, and where this tool comes from

Maieutic was built by Paula Vásquez-Henríquez — Deputy Director of the
Computer Science program at Universidad del Desarrollo in Concepción,
Chile, and a PhD student studying how AI is reshaping society. She has
been a university teacher for six years, most of that time spent
introducing first- and second-year CS students to Python.

The design of this tool is not abstract. It's a direct response to
three patterns she has watched accumulate in that classroom, year over
year, and especially sharply since large language models became part of
how students relate to code:

- **Students copying code they don't understand.** Something gets
  pasted in, it happens to pass the tests, and the skill that was
  supposed to be built — reading code critically, noticing what it
  actually does — never develops. This is why Monaco ships with
  autocomplete and every form of suggestion explicitly disabled, and
  why the phase-3 chat refuses to answer reasoning questions with an
  answer. The friction is the point.
- **Not understanding basic exercise instructions.** Students skim a
  prompt, assume they know what's being asked, and discover the gap
  only when something misbehaves. This is what the phase-1
  specification gate is for. Before a single character of code is
  written, the student has to describe the program's behavior clearly
  enough that Opus can ask the obvious follow-up questions — *what
  about empty input? does case matter?* — and the spec must answer
  them before the editor unlocks.
- **Jumping straight into code without a plan.** The rush to type
  something — anything — into the editor bypasses the part of
  programming that is hardest to teach: choosing an approach. Phase 2
  forces the plan to be written down *as prose*, so it can be compared
  to what the student actually produces. Phase 4 then surfaces the gap
  between the two as a neutral question — not *"you did this wrong"*
  but *"you said you'd do X; I see Y; what happened?"*.

Each of those observations has a counterpart in the product. That's
deliberate: Maieutic is the formalization of a teacher's intuition about
where the real learning happens, and where the LLM era has made that
place harder to reach.

Her PhD work sits adjacent to this — a broader study of how AI is
reshaping society, with the pedagogical frontier as one thread: how we
form programmers when code itself is no longer the scarce thing.
Maieutic is a small, concrete answer to that question, in software,
because this is the moment to rethink how the programmers of tomorrow
are being formed.
