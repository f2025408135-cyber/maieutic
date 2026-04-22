# Maieutic — Execution Plan for Claude Code

**Target:** working MVP in 7 days, end-to-end, demo-ready.
**Reference docs:** `Project_Description`, `PRD`, `Tech_Spec_Doc` (in repo root / context).
**Model string:** `claude-opus-4-7` (Anthropic SDK, exact identifier).

---

## How to read this plan

This plan is divided into **7 phases** that must be executed sequentially. Each phase has:

- A **goal** — what "done" means in one sentence.
- A **task list** — the concrete work.
- **Acceptance criteria** — the test each phase must pass before moving to the next.
- A **STOP marker** — an explicit checkpoint where you must not proceed without human review of the acceptance criteria output. When you hit a STOP, summarize what was built, paste the acceptance-criteria evidence (test output, screenshots-as-text, fixture diffs), and wait.

**Do not skip STOPs.** The five load-bearing Opus prompts (PRD §6) are the only thing that distinguishes this product from a generic tutoring UI. Their quality is won by iterating against fixtures, not by writing them once. STOPs exist so Paula (the author) can evaluate prompt quality at the points where drift is still cheap to correct.

**Do not expand scope.** If something is listed as out-of-scope in PRD §8 or Tech Spec §0, do not build it, even if it seems easy. The PRD is the contract.

**When uncertain, favor simplicity.** This is a 7-day hackathon build. A working single-file route handler beats an elegant abstraction that takes a day to design. Abstractions are earned by the second use, not the first.

**Write in TypeScript throughout.** No Python. The stack is Next.js + TS per Tech Spec §1.1.

**Python for exercises, TS for the app.** The student-facing exercises are CS1 Python (PRD §2.2), but students only type Python into the Monaco editor as text — the app never executes it. No Python interpreter, no pyodide. The Monaco language mode is set to `python` for syntax highlighting only.

---

## Phase 0 — Environment and repo scaffolding (0.5 day)

### Goal

A Next.js 14 app boots locally with Prisma connected to SQLite, the Anthropic SDK installed and making one successful test call, and the directory structure from Tech Spec §1.3 laid out.

### Tasks

1. **Initialize Next.js 14 (app router) with TypeScript**
   ```
   npx create-next-app@latest maieutic --typescript --tailwind --app --src-dir --no-turbo --import-alias "@/*"
   ```
   Accept ESLint prompts. Do not use `/pages`.

2. **Install dependencies**
   ```
   npm install @anthropic-ai/sdk zod @tanstack/react-query zustand @monaco-editor/react
   npm install prisma @prisma/client
   npm install -D @types/node vitest @playwright/test
   ```

3. **Install shadcn/ui**
   ```
   npx shadcn@latest init
   npx shadcn@latest add button dialog tabs table card input textarea badge separator sheet scroll-area
   ```

4. **Create directory structure** per Tech Spec §1.3 exactly. Empty placeholder `page.tsx` files are fine for routes you won't implement until Phase 2+.

5. **Configure Prisma with SQLite**
   - `npx prisma init --datasource-provider sqlite`
   - Paste the schema from Tech Spec §2 verbatim into `prisma/schema.prisma`.
   - `npx prisma migrate dev --name init`
   - `npx prisma generate`

6. **Create `src/lib/db.ts`** with the standard Prisma singleton pattern for Next.js dev (global var trick to avoid hot-reload connection leaks).

7. **Create `.env.local`** with `ANTHROPIC_API_KEY=...` placeholder. Add `.env.local` to `.gitignore` if not already.

8. **Smoke-test the SDK.** Create `scripts/smoke.ts`:
   ```ts
   import Anthropic from "@anthropic-ai/sdk";
   const c = new Anthropic();
   const r = await c.messages.create({
     model: "claude-opus-4-7",
     max_tokens: 256,
     messages: [{ role: "user", content: "Reply with exactly: PONG" }],
   });
   console.log(r.content);
   ```
   Run with `npx tsx scripts/smoke.ts`. Must print a block containing "PONG".

### Acceptance criteria

- [ ] `npm run dev` serves a page at http://localhost:3000.
- [ ] `npx prisma studio` opens and shows empty Exercise / Session / SessionEvent tables.
- [ ] `npx tsx scripts/smoke.ts` returns a "PONG" response from `claude-opus-4-7`.
- [ ] Directory tree matches Tech Spec §1.3 (empty files acceptable).

### STOP 0 — confirm scaffolding works before writing a single prompt

Post: output of `npm run dev` starting, output of the smoke test, and the `tree src/` result. Wait for go-ahead.

---

## Phase 1 — Data layer and Zod schemas (0.5 day)

### Goal

Every JSON blob in the Prisma schema has a Zod counterpart in `src/lib/opus/schemas.ts`, and a set of factory functions can create/read/update sessions without touching LLM code.

### Tasks

1. **Write `src/lib/opus/schemas.ts`** with Zod schemas for every shape in PRD Appendix A and Appendix B. Use the Tech Spec §2 excerpt as starting point but complete it for **all** fields:
   - `Exercise` (persistent) and `ExerciseInput` (authoring-time, pre-publish).
   - `SpecDimension`, `ExpectedDivergence`, `StudentLevel`.
   - `Phase1Iteration`, `Phase1Data`, `HelpRequest`.
   - `Phase2Data`.
   - `Phase3Exchange`, `Phase3Revision`, `Phase3Data`.
   - `Divergence` (all fields including nullable post-hoc ones), `Phase4Data`.
   - `LiveSummary`.
   - `SessionEventPayload` (discriminated union on `kind`).
   - Output shapes for every Opus prompt (`ScaffoldingOutput`, `SpecExaminerOutput`, `IntentDiffOutput`, `PostHocOutput`, `LiveSummaryOutput`, `CohortNarrativeOutput`).

2. **Derive TS types** with `z.infer<typeof X>` and export them alongside the schemas.

3. **Write `src/lib/sessions.ts`** — a thin module of functions that wrap Prisma:
   - `createSession(exerciseId, studentId) → Session`
   - `appendPhase1Iteration(sessionId, iter) → void`
   - `setPhase2Plan(sessionId, planText) → void`
   - `appendPhase3Exchange(sessionId, ex) → void`
   - `appendPhase3Revision(sessionId, rev) → void`
   - `setPhase4Divergences(sessionId, divergences) → void`
   - `recordDivergenceResponse(sessionId, divergenceId, response, alignment, final) → void`
   - `appendLiveSummary(sessionId, summary) → void`
   - `appendSessionEvent(sessionId, kind, payload) → void` — this function **also** emits on the in-process event bus (Tech Spec §9).
   - `advancePhase(sessionId, to: 1|2|3|4|5) → void`
   - Read helpers: `getSession`, `getSessionFull`, `listActiveSessions`, `getExercise`, `listCompletedSessionsForExercise`.

4. **Write `src/lib/events.ts`** — module-scoped `EventEmitter` exported as `sessionEventBus`. That's it. ~10 lines.

5. **Zod-parse on every write.** Every setter validates its input against the appropriate schema before hitting Prisma. If validation fails, throw a clear error with the Zod issue list.

### Acceptance criteria

- [ ] `tsc --noEmit` passes on the whole repo.
- [ ] A throwaway script `scripts/smoke-session.ts` can: create an Exercise, create a Session against it, append a fake Phase1Iteration, read back the session, and the JSON matches the Zod schema on round-trip.
- [ ] Trying to append malformed data throws a readable error (not a silent Prisma error).

### STOP 1 — data layer sanity

Post `scripts/smoke-session.ts` output. Wait for go-ahead.

---

## Phase 2 — Opus client wrapper and Prompt 1 (scaffolding generation) (1 day)

### Goal

The authoring flow works end-to-end: instructor types a prompt in a textbox, Opus generates scaffolding, instructor can edit every field, and clicking "Publish" persists the exercise. The scaffolding meets the quality bar in PRD §3 criterion 2 (proportional to complexity, concrete, no "handle edge cases" generic entries).

### Tasks

1. **Write `src/lib/opus/client.ts`** exactly per Tech Spec §8. Key details:
   - Model constant: `const MODEL = "claude-opus-4-7"`.
   - `callOpus` and `streamOpus` functions as specified.
   - `stripFences` helper for `expectJson: true` callers.
   - Do **not** set `temperature`, `top_p`, or `top_k` — Opus 4.7 rejects non-default values with 400 (verified against Anthropic docs, Apr 2026).
   - Retry policy: on Zod validation failure, one retry with a follow-up user message `"Your previous output failed validation: <zod error summary>. Please output valid JSON per the schema, with no preamble or fences."` On second failure, throw.
   - Log every call: model, prompt name, token counts from the response, duration in ms. Write to `console.log` as structured JSON — good enough for MVP.

2. **Write `src/lib/opus/prompts/scaffolding.ts`** containing the system prompt from Tech Spec §3.1 as a `const SYSTEM` string, plus a `buildUserMessage(prompt: string, title: string)` function that produces the user turn including the three few-shot examples from Tech Spec §3.2 (Examples A, B, C). The few-shot examples go inline in the user turn, followed by `PROMPT: {prompt}` for the real input.

3. **Write `POST /api/author/generate-scaffolding/route.ts`**. Non-streaming (scaffolding is a one-shot call, not conversational). Returns the parsed `ScaffoldingOutput` on success, 400 + error on validation failure.

4. **Build the authoring page** at `src/app/(instructor)/authoring/page.tsx`:
   - Title input.
   - Free-text textarea for the prompt.
   - "Generate scaffolding" button → POSTs to the API, shows a loading state.
   - On success: render four editable sections:
     - Spec-gate dimensions: list of `{id, description, rationale}` rows, each editable, with add/remove buttons. Track `source` (`opus` | `instructor_edited` | `instructor_added`) automatically — if the user edits a generated row, mark it `instructor_edited`; new rows are `instructor_added`.
     - Expected divergences: list of `{category, pattern}` rows, category is a select.
     - `phase_2_required`: checkbox.
     - `student_level`: radio group.
   - If `prompt_quality_note` is non-null, render it as a yellow warning banner above the lists.
   - "Publish" button — disabled until the instructor has **explicitly confirmed** by either editing at least one field or clicking a separate "I've reviewed the scaffolding" checkbox (PRD §2.1: the Publish gate forces confirmation). Publish POSTs to `POST /api/author/publish` which writes the Exercise row with `publishedAt = now()` and preserves the Opus first-pass output in the `authoringTrace` fields per Tech Spec schema.

5. **Write unit test `tests/unit/scaffolding.test.ts`** per Tech Spec §11:
   - 6 exercise prompts covering trivial/medium/complex and one vague.
   - For each, call the real scaffolding API (these tests hit Opus — they're slow, run with `npm run test:opus`, not the default test command).
   - Assert proportionality: trivial → 2–3 dimensions, medium → 3–5, complex → 5–7.
   - Assert no dimension description matches `/edge case/i`, `/handle errors/i`, `/as needed/i`, `/appropriate/i` — generic markers.
   - Assert `studentLevel` classification is plausible (trivial → `week_1_2`, complex → `week_7_plus`). Use `.toBeOneOf` where there's legitimate ambiguity.
   - The vague prompt test asserts `promptQualityNote !== null`.

### Acceptance criteria

- [ ] Visiting `/authoring`, typing "Write a function that counts vowels in a string" and hitting Generate produces scaffolding where every dimension is a concrete question (not "handle edge cases"), and the student level is `week_1_2`.
- [ ] Editing a dimension and republishing persists the edit, and the exercise row in the DB has `source: "instructor_edited"` for that row and preserves the original in `opusGeneratedDimensions`.
- [ ] `npm run test:opus -- scaffolding` passes.
- [ ] Latency of the generate call is under ~15s. If it's consistently slower, consider `effort: "high"` as the default instead of `xhigh`.

### STOP 2 — **prompt quality review by Paula**

This is the first load-bearing prompt. Post:
- 3 real scaffolding outputs: one trivial, one complex, one vague.
- The test output.
- Observed latency range.

Paula will read the outputs and either approve or return with specific edits to the system prompt or few-shots. **Do not proceed to Phase 3 until she approves.** If she approves with tweaks, apply the tweaks, re-run the 3 samples, and re-confirm.

---

## Phase 3 — Student Phase 1 and Phase 2 (spec gate + intent declaration) (1 day)

### Goal

A student can open a published exercise, iterate their spec with Opus until the gate closes, optionally submit a plan (when `phase_2_required`), and land on a disabled-editor state ready for Phase 3.

### Tasks

1. **Prompt 2 — spec examiner.** Write `src/lib/opus/prompts/spec-examiner.ts` with the system prompt from Tech Spec §4.1 and a `buildUserMessage(exercise, priorIterations, currentSpec)` function. Include the few-shot example from §4.3.

2. **Route `POST /api/session/[sid]/spec/route.ts`**:
   - Body: `{ specText: string }`.
   - Loads session + exercise.
   - Calls Opus with spec-examiner prompt, `max_tokens: 1024`.
   - Zod-parses result against `SpecExaminerOutput`.
   - Appends the iteration to `phase1Data.iterations` with `passed` = `gaps_still_open.length === 0` (Tech Spec §4.4 — pure function, not a heuristic).
   - If passed: advance phase (to 2 if `phase_2_required`, to 3 otherwise), emit `phase_transition` event.
   - Returns the full iteration object to the client.

3. **Route `POST /api/session/[sid]/plan/route.ts`**:
   - Body: `{ planText: string }`.
   - No Opus call — just persist and advance to phase 3, emit `phase_transition`.

4. **Route `POST /api/session/[sid]/help/route.ts`**:
   - Body: `{ phaseState: object }`.
   - Writes a `HelpRequest` into `phase1Data.helpRequests` and emits a `help_request` event. The instructor dashboard picks it up from the event bus.

5. **Student exercise page** at `src/app/(student)/exercise/[id]/page.tsx`:
   - Server component loads exercise and creates a session (studentId: for MVP, read a `studentId` cookie; if absent, generate a random ID and set it). This is the trust assumption in Tech Spec §7 (no auth beyond a dev-mode cookie).
   - Client component renders based on `session.currentPhase`.
   - **Phase 1 UI:**
     - Left panel: the exercise prompt (read-only).
     - Center: a textarea for the spec, with "Submit spec for review" button.
     - After the first submission: show iteration history (student's spec + Opus's questions) in a chat-like scroll.
     - Right panel: Monaco editor, **disabled** (`readOnly: true`, ghosted styling).
     - "Ask for help" button bottom-right. Modal: "This will notify the instructor. Type what you're stuck on." → POSTs to `/help`.
   - **Phase 2 UI** (conditional on `phase_2_required`): same layout but the center panel adds an "Implementation plan" textarea below the now-frozen spec. Submit → advances to Phase 3. Plan is stored as-is (PRD §4.2 — no Socratic round).

6. **Monaco config.** When the editor becomes interactive in Phase 3, it must have `quickSuggestions: false`, `suggestOnTriggerCharacters: false`, `parameterHints: { enabled: false }`, `wordBasedSuggestions: 'off'`, `tabCompletion: 'off'`, `inlineSuggest: { enabled: false }`. Set these in the `options` prop. Language: `"python"`. Verify in Phase 3.

### Acceptance criteria

- [ ] A student can submit a vague spec for the vowels exercise (e.g., "it counts vowels") and Opus asks targeted questions about case, `y`, and empty input.
- [ ] After addressing all three instructor-configured dimensions, the gate closes and the UI advances (to plan or directly to Phase 3 depending on `phase_2_required`).
- [ ] The "Ask for help" button writes a help-request event that shows up in the DB (verify in Prisma Studio).
- [ ] If the student addresses 2 of 3 dimensions, `passed` is `false` and the remaining gap is specifically surfaced.

### STOP 3 — **spec-examiner quality review**

The spec examiner's calibration is subtle — it's supposed to be strict without being pedantic, and level-appropriate. Post:
- A full iteration transcript for a `week_1_2` exercise (vowels).
- A full iteration transcript for a `week_7_plus` exercise (password validator).
- One transcript where a student tried to address a dimension vaguely and Opus correctly held the line.

Wait for Paula's review before Phase 4.

---

## Phase 4 — Student Phase 3 (constrained writing) and Phase 4 (intent-diff) (2 days)

### Goal

The highest-value phase of the build. A student writes code with Opus available in two modes, submits, and receives a list of neutrally-phrased divergence questions. The private-reasoning view shows the full internal state (classification, prediction, confidence, alignment).

### Tasks

1. **Phase 3 chat — mode selection.** Add `src/lib/opus/prompts/phase3-chat.ts`. This prompt wraps **every** student chat message with a system prompt that instructs Opus to:
   - Determine the mode (interrogative vs. direct) from the message + the current code context.
   - Respond accordingly.
   - Return a structured output: `{ mode: "interrogative" | "direct", response: string }`.
   - The system prompt explicitly defines the rule from PRD §4.3: interrogative when answering would substitute for the student's reasoning about their own program; direct when it's a language/library reference question. Edge cases (e.g., "syntax for a list comprehension that filters evens") resolve to direct for genuine language reference, interrogative for disguised implementation requests.

   Implementation note: the system prompt says "output JSON with `mode` and `response`" and the response is shown to the student. The `mode` label is logged but not displayed.

2. **Route `POST /api/session/[sid]/chat/route.ts`**:
   - Streaming. Tech Spec §8 `streamOpus` pattern.
   - Body: `{ message: string }`.
   - Loads full session context (spec, plan, current code from an `editorState` ephemeral field — store `currentCode` in `phase3Data` and update it on a debounced client-side save, every 2s of inactivity).
   - Returns Server-Sent-Events or a streamed JSON-lines response. Choose SSE for consistency with the dashboard; each chunk is `data: {"delta": "..."}\n\n`, final chunk is `data: {"done": true, "mode": "...", "full_response": "..."}\n\n`.
   - On completion, append the exchange to `phase3Data.opusExchanges`.

3. **Route `POST /api/session/[sid]/revise/route.ts`**:
   - Body: `{ amendment: string, justification: string }`.
   - Calls Opus with a short follow-up prompt: "A student is proactively revising their plan mid-writing. Original plan: X. Amendment: Y. Justification: Z. Ask one short question about whether the change is faster, simpler, or more correct, and why. Return JSON `{ question: string, followup_question: string | null }`."
   - Appends to `phase3Data.revisions` and emits a `revision` event.

4. **Route `POST /api/session/[sid]/autosave/route.ts`** — dead-simple endpoint that updates `phase3Data.currentCode`. No Opus call. Debounced client-side.

5. **Prompt 3 — intent-diff.** Write `src/lib/opus/prompts/intent-diff.ts` with the system prompt from Tech Spec §5.1 and a `buildUserMessage` function. Include **all** three few-shots from §5.2 and §5.3 (week_1_2 drift, week_7_plus revision). Actually — add a third few-shot for a bug classification at `week_3_6`, because the provided examples don't cover that cell and it matters. Claude Code: write this third example yourself, modeled on the two existing ones, and flag it for Paula's review.

6. **Route `POST /api/session/[sid]/submit/route.ts`**:
   - Body: `{ finalCode: string }`.
   - Calls Opus with intent-diff prompt, `max_tokens: 4096`. This is the most expensive call in the system; budget 15–25s.
   - Zod-parses against `IntentDiffOutput`.
   - Persists the divergences to `phase4Data.divergences` with `studentResponse`, `alignment`, `finalClassification` all `null`.
   - Advances phase to 4.
   - Returns only the student-facing fields: `[{ divergenceId, studentFacingQuestion }]` — never the classification or prediction.

7. **Prompt 3b — post-hoc re-classifier.** Write `src/lib/opus/prompts/post-hoc.ts` with the prompt from Tech Spec §5.4. Short prompt, `max_tokens: 512`.

8. **Route `POST /api/session/[sid]/divergence-response/route.ts`**:
   - Body: `{ divergenceId: string, response: string }`.
   - Loads the divergence, calls the post-hoc prompt.
   - Updates the divergence row with `studentResponse`, `alignment`, `finalClassification`, `finalClassificationReason`.
   - If `alignment === "diverged"`, emit an `alignment_failure` event with payload `{ divergenceId, prediction, response }`.
   - If all divergences are now answered, advance phase to 5 (closed), set `completedAt`.

9. **Phase 3 UI:**
   - Spec panel (frozen, collapsed but viewable).
   - Plan panel (frozen, if Phase 2 ran).
   - Monaco editor, fully enabled (with autocomplete off per the Phase 3 config above).
   - Chat panel to the right. User types, messages stream in.
   - "Revise plan" button that opens a modal with amendment + justification fields.
   - "Submit" button. On submit, show a "reviewing your work" state (PRD §7 latency allowance for Phase 4).

10. **Phase 4 UI:**
    - One divergence at a time, shown as a question with a textarea for the response. Student cannot see classification or prediction.
    - "Next" advances to the next divergence. "Previous" goes back (read-only). No skip.
    - On the final response, "Submit and finish."

### Acceptance criteria

- [ ] Phase 3: typing `what is the syntax of a dictionary in Python` returns a direct answer. Typing `why does my loop terminate early` returns counter-questions.
- [ ] The Monaco editor has no autocomplete, no ghost text, no parameter hints — verify by pressing `.` after a variable and confirming nothing pops up.
- [ ] Submitting the vowels exercise with code that only handles lowercase (when the spec committed to both cases) produces a divergence classified `drift` (`high` confidence), with a predicted justification containing something like "I forgot" or "I didn't think about".
- [ ] Submitting a `week_7_plus` password validator where the plan said "four booleans in one loop" and the code uses `any(...)` three times produces a divergence classified `revision` (not drift), confirming the bias rule is active.
- [ ] When the student answers the drift question with "I forgot about the capital letters," alignment is `aligned` and `finalClassification` stays `drift`.
- [ ] When the student answers the revision question with a coherent justification, alignment is `aligned` and `finalClassification` stays `revision`.
- [ ] All of this appears in the DB and will be surfaced to the private-reasoning view in Phase 5.

11. **Unit test `tests/unit/intent-diff.test.ts`** per Tech Spec §11:
    - ~12 hand-crafted `(spec, plan, code)` fixtures covering drift/revision/bug × each level.
    - Structural assertions:
      - Classification matches expected.
      - For `week_1_2` drift: predicted justification matches regex `/forgot|didn't|don't know|wasn't sure/i`.
      - For `week_7_plus` revision: predicted justification length > 80 chars and references a trade-off or strategic word (`trade-off|strategy|simpler|cleaner|complexity|amortized|any of: hashmap|loop|pass|efficient`).
      - Student-facing question never contains `required|must|failed|wrong|should have` (the accusation markers from PRD §4.5.B).
    - Run with `npm run test:opus`.

### STOP 4 — **intent-diff and phase 3 mode selection review**

This is the core of the product. Post:
- 5 full intent-diff outputs across levels and classifications.
- 3 phase-3 chat transcripts — one interrogative case, one direct case, one edge case.
- Full unit test output.

Paula will review carefully. Expect this STOP to require 1–2 iterations on the prompts.

---

## Phase 5 — Instructor surface: live view, cohort view, private-reasoning view (1.5 days)

### Goal

The three instructor screens from PRD §5 are populated from real session data and render correctly. The live view updates in real time via SSE.

### Tasks

1. **Prompt 4 — live summary.** Write `src/lib/opus/prompts/live-summary.ts` per Tech Spec §6.1 with the exact register requirements. Write `buildUserMessage(session, exercise, recentEvents)` per §6.2. `max_tokens: 512`.

2. **Summary refresh logic.** Write `src/lib/opus/summaries.ts`:
   - `refreshSummaryForSession(sessionId) → LiveSummaryOutput` — loads session state, calls the prompt, appends to `liveSummaries`, emits `summary_refresh` event.
   - `refreshAllActiveSessions()` — iterates over sessions where `completedAt IS NULL AND startedAt > now() - 30 min` and calls `refreshSummaryForSession` on each. Concurrency limit of 4 to avoid hammering the API.

3. **SSE route** at `src/app/api/live/stream/route.ts` per Tech Spec §9, with the three triggers (90s timer, event bus, 30s keepalive). Use `NextRequest.signal` for cleanup.

4. **Live view** at `src/app/(instructor)/live/page.tsx`:
   - Client component that opens the SSE `EventSource` on mount.
   - Table with columns per PRD §5.1: student, phase, time in phase, summary, flags (render as badges).
   - Each row is clickable → navigates to `/reasoning/[sid]`.
   - Initial snapshot from SSR; SSE updates append/update rows.
   - Visual indicator: rows with `alignment_failure` or `help_requested` flag turn amber; rows with `stuck_signal` turn red.

5. **Prompt 5 — cohort narrative.** Write `src/lib/opus/prompts/cohort-narrative.ts` per Tech Spec §7.1, with all three few-shots from §7.2.

6. **Aggregation helper** `src/lib/cohort.ts`:
   - `aggregateExercise(exerciseId) → AggregateData` — computes the stats the narrative prompt needs: session count, spec-iteration distribution, divergence counts by category, most-flagged divergences (by `finalClassificationReason` clustering — for MVP, just list the top 5 literal strings), most-missed dimensions, alignment failure count, proactive revision count.

7. **Route `POST /api/cohort/[id]/narrative/route.ts`**:
   - Calls `aggregateExercise`, passes to the narrative prompt.
   - Streams the narrative (UX: show the aggregate stats immediately, stream the narrative at the top).

8. **Cohort view** at `src/app/(instructor)/cohort/[id]/page.tsx`:
   - Server component loads exercise + aggregates.
   - Narrative at top (streamed in from the API route).
   - Below: histograms and counts. Keep it simple — Tailwind divs with widths proportional to counts is enough. No chart library.
   - Small-sample case (< 3 sessions): the narrative will correctly say so; also render a yellow banner.

9. **Private-reasoning view** at `src/app/(instructor)/reasoning/[sid]/page.tsx`:
   - Server component loads the full session.
   - Two columns: left is "what the student saw" (spec iterations, chat, divergence questions, their responses); right is "what Opus was thinking" (per-iteration gap analysis, per-divergence initial classification + confidence + predicted justification + alignment result + final classification + reason).
   - Timestamps on every entry.
   - This is the surface that, paired with a student's screen, makes Opus's cognitive work legible to a judge (Tech Spec §10, PRD §5.3). It must be readable, not a JSON dump. Use cards, not tables.

10. **Instructor layout.** The live view and cohort view share a header with a tab-like toggle (PRD §5 note). Private-reasoning is a full-screen modal-ish view, accessible from any row.

### Acceptance criteria

- [ ] With 3 fake concurrent sessions (create via the Phase 6 fixture script, but skip the replay part — just seed sessions in various states), the live view renders all 3 rows with non-generic summaries.
- [ ] Summaries refresh when a session's state changes (confirm by moving a session from phase 1 to phase 2 manually in Prisma Studio and watching the row update within 2–3s via the event bus, not 90s).
- [ ] Cohort view for an exercise with 3+ completed sessions produces a narrative that names a specific pattern (not "students struggled"). With 1–2 sessions, narrative says "provisional."
- [ ] Private-reasoning view side-by-side with the student view: for the vowels-drift trajectory, the prediction "I forgot about the capital letters" is clearly visible on the instructor side, the student never saw it, and the alignment result is "aligned."

### STOP 5 — **live summary and cohort narrative review**

Post:
- 5 live summaries produced for different student states (spec iteration, phase 3 writing, phase 4 alignment failure, high performer, stuck).
- 2 cohort narratives (one small-sample, one clear-pattern).
- A screenshot-description of the private-reasoning view side-by-side with a student trajectory.

Wait for Paula's review.

---

## Phase 6 — Demo fixtures and demo script (0.75 day)

### Goal

Three pre-recorded student sessions are captured from real Opus runs and replayable via a seed script, plus one live trajectory is guaranteed to work during the demo recording.

**Dependency:** this phase cannot start until Phase 5 is complete and calibrated, because the fixtures must be produced by running real sessions through the real system (Tech Spec §10 — "not fake, captured from real usage").

### Tasks

1. **Produce the three fixture sessions by hand.**
   - **Ana — week_1_2 vowel drift.** Run through the system: submit vague spec, iterate 2–3 times through the gate, write code that handles only lowercase, submit, answer the divergence with "I forgot about the capital letters." Capture the full `Session` + associated `SessionEvent` rows as JSON.
   - **Beto — week_7_plus password revision.** Spec passes in 2 iterations. Plan says four booleans in one loop. Code uses `any(...)` three times. Answer the divergence with a coherent efficiency/simplicity justification.
   - **Carmen — week_3_6 stuck on spec.** Spec iteration 4, same gap unresolved (choose an exercise like "return the nth Fibonacci number" with `empty_input`-style gap). Carmen clicks "Ask for help" on round 4.

2. **Write `scripts/capture-fixture.ts`** — no-op; fixtures are captured by just running the real UI and then `sqlite3 dev.db .dump` or a Prisma query to export the Session+Events as JSON. Paste each into `tests/fixtures/sessions/{name}.json`.

3. **Write `scripts/replay-fixtures.ts`** per Tech Spec §10:
   - Reads each fixture JSON.
   - Rewrites timestamps so the session looks like it's been running for ~15 min.
   - Inserts into the DB.
   - Optionally: for Ana, replay state forward on a timer (phase 1 → 2 → 3 → 4 over ~3 minutes of wall time) so the live view shows motion during the demo.

4. **Write `scripts/reset-demo.ts`** — drops all data, re-seeds one exercise (the vowels one), runs `replay-fixtures` for the three above, and leaves the system ready for a live run.

5. **Demo script (written, not code).** Write `DEMO_SCRIPT.md` with:
   - Pre-demo checklist (reset DB, open 4 tabs: authoring, student, live, private-reasoning).
   - Scene 1: author the vowel exercise from scratch (~90s).
   - Scene 2: complete the vowel exercise live, committing the classic lowercase drift (~3 min).
   - Scene 3: switch to live view showing Ana, Beto, Carmen + the presenter's session (~30s).
   - Scene 4: open private-reasoning for the presenter's session, pair with the student screen, show the prediction + alignment (~60s).
   - Scene 5: open cohort view for the vowels exercise, show the narrative (~30s).
   - Total: ~7 min, well within a typical hackathon demo slot.

6. **E2E test `tests/e2e/demo.spec.ts`** per Tech Spec §11 — Playwright script that automates Scene 1 and Scene 2 as a sanity check that the demo happy path hasn't regressed.

### Acceptance criteria

- [ ] `npm run reset-demo` produces a clean state with one exercise and three visible sessions in the live view within 5 seconds.
- [ ] Running the demo script manually end-to-end takes < 8 min and does not hit any error paths.
- [ ] `npm run test:e2e` passes.

### STOP 6 — **demo rehearsal**

Post: recording (or detailed written run-through) of the full demo. Paula runs the demo at least once and flags any brittleness.

---

## Phase 7 — Hardening, polish, and buffer (0.75 day)

### Goal

The system is demo-robust. Known edge cases are handled. The UI is presentable. Remaining time buffers against surprise bugs.

### Tasks

1. **Error handling audit.** Every Opus call path has a visible error state if the call fails. No silent swallow. No "Something went wrong" — use the actual error when safe (`zod` validation errors are fine to show).

2. **Loading states.** Every async action has a visible pending state. Phase 4 submission is the most important one — show a "Reviewing your work…" state with a progress indicator for up to 25s.

3. **Latency cache (optional, demo-only).** If any prompt consistently takes > 20s during local testing, cache the response for the demo fixtures so the demo is snappy. Add a `DEMO_CACHE=1` env flag that routes to cache. **Do not ship this in the pilot.**

4. **Styling pass.** The UI is functional but not decorative. Check: consistent spacing, readable typography, no debug text leaking, mobile-ish width not required (demo is on a laptop).

5. **Null checks.** Every read of `phase2Data`, `phase4Data`, `phase3Data.revisions` must null-guard. Exercises without Phase 2 are the single most common regression vector.

6. **Error-recovery smoke test.** Kill the Anthropic API key, refresh the live view. The UI should show an error, not crash. Restore the key, reload, it should recover.

7. **README.** Write a one-page `README.md`: what it is, how to run it, what's MVP vs. deferred. Link to the PRD.

### Acceptance criteria

- [ ] The demo can be run 3 times in a row without a DB reset without visible bugs. (Use 3 separate student IDs; each run writes new sessions.)
- [ ] A deliberately malformed scaffolding response (simulate by tweaking the prompt to return invalid JSON) surfaces a user-visible error, retries once, and fails cleanly.
- [ ] Killing + restoring the API key does not leave the app in a broken state.

### STOP 7 — **final review**

Post: a final checklist confirming every acceptance criterion from Phases 0–7 is green, plus the full demo recording.

---

## Global constraints and conventions

### Model & SDK specifics (verified Apr 2026)

- Model string: **`claude-opus-4-7`**. Not `claude-opus-4-7-YYYYMMDD` unless pinning is required for reproducibility; the unsuffixed string points to the latest snapshot.
- **Do not set `temperature`, `top_p`, or `top_k` on Opus 4.7** — any non-default value returns 400.
- **Thinking blocks are empty by default** on Opus 4.7. If extended thinking becomes useful (e.g., for the intent-diff prompt), opt in explicitly per the migration guide; otherwise ignore.
- **Tokenizer is ~1.0–1.35x the Opus 4.6 tokenizer.** The `max_tokens` values in Tech Spec §8 have headroom, but if outputs ever truncate, raise them first before prompt-engineering around it.
- **`effort` parameter.** Default for this app is unset (server default). For the intent-diff call specifically, consider `effort: "high"` or `"xhigh"` during Phase 4 calibration if quality is borderline. Do not set xhigh globally — latency cost is real.

### Code quality

- TypeScript strict mode on. No `any` except at LLM-output boundaries, and even there, Zod-parse within 3 lines.
- Every LLM prompt lives in a single file under `src/lib/opus/prompts/` with exports: `SYSTEM: string`, `buildUserMessage(...)`, and the corresponding Zod output schema.
- Every route handler is ≤ 80 lines. If it grows longer, extract to `src/lib/`.
- No premature abstractions. The first `useOpusStream` hook is written when a second component needs it, not before.

### Testing posture

- Unit tests that hit Opus are `.opus.test.ts` and run via `npm run test:opus` — not part of the default `npm test`.
- Default `npm test` runs shape/validation tests against mocked LLM outputs.
- One E2E Playwright test for the demo happy path.

### What "good" looks like per load-bearing prompt

Paula's review at each STOP is the source of truth, but here is the written bar:

| Prompt | The bar |
|---|---|
| Scaffolding (Phase 2 STOP) | Dimensions are concrete questions, not labels. Count is proportional to complexity. Vague prompts produce a `prompt_quality_note`. |
| Spec examiner (Phase 3 STOP) | Questions target real gaps. Vocabulary matches `student_level`. `passed` is false while any configured dimension is open and true immediately when all are closed — no approving under-specified specs. |
| Intent-diff (Phase 4 STOP) | Classification is right on clear cases. Predictions match the register of the level (short and forgetful for `week_1_2`, strategic for `week_7_plus`). Questions never accuse. Revision bias is visible on at least one ambiguous case. |
| Live summary (Phase 5 STOP) | Every summary is actionable in 5s. Never "Student is in Phase N." References concrete behavior from the session. |
| Cohort narrative (Phase 5 STOP) | Names a specific pattern grounded in the numbers. Recommends a concrete fix. Flags small samples explicitly. Never pads. |

### Failure modes to watch for

- **Opus approving a loose spec** because the student used the right words without committing. The `gaps_still_open` check is a pure function — don't regress this to a heuristic.
- **Phase 4 predictions drifting articulate** for `week_1_2` students. If predictions start mentioning "trade-offs" for an 8-year-old's spec, the few-shots need more weight.
- **Live summaries regressing to status-readouts.** "In phase 3" means the prompt is failing. Check whether session context is actually reaching the prompt — the fix is usually data, not prompt.
- **Cohort narratives padding** with generic CS education platitudes. If the narrative says "this highlights the importance of spec-driven development," it's a failure. The narrative must be about the **exercise**, not about pedagogy.
- **Phase 3 mode selection defaulting to interrogative** because that's what the product "wants." Students asking legitimate syntax questions must get direct answers or they leave for ChatGPT.


### What to do when stuck

- A prompt returns output that validates but is bad → do NOT try to parse around it. Fix the prompt. The few-shots are the most reliable lever.
- A prompt returns output that doesn't validate → check the system prompt's "Output format" section literally matches the Zod schema. Mismatches are usually field names (camelCase vs snake_case).
- The SDK throws a 400 → the first suspect is a non-default `temperature` / `top_p` / `top_k`. Remove them.
- SSE doesn't update → `EventEmitter` bus isn't imported from a shared module (each import creates a new instance). The bus must live in a module-scope singleton.
- `phase2Data` undefined crash → the session was created for a `phase_2_required: false` exercise. Always null-guard Phase 2 reads.

---

*End of plan.*