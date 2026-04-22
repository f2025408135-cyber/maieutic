# Maieutic — MVP PRD (Hackathon Build)

**Author:** Paula Vásquez-Henríquez — Subdirectora, Ing. Civil Informática, UDD Concepción
**Target event:** Anthropic Builder Hackathon
**Model:** Claude Opus 4.7
**Document status:** Draft v1 — MVP scope only
**Out of scope for this PRD (explicitly deferred):** production deployment, LMS integration, longitudinal per-student view, data-governance/FERPA-equivalent framework, evasion detection, informed-consent design around private predictions.

---

## 1. Purpose

Maieutic is a pedagogical IDE that uses Claude Opus 4.7 as a structured interlocutor — not a code generator — to run the metacognitive loop an 80-student CS1 classroom cannot run manually. The MVP exists to demonstrate, in a hackathon setting, that frontier reasoning can do three things simultaneously that weaker models collapse: (i) gate student work behind an executable specification, (ii) compare spec, plan, and code to classify divergences while predicting student justifications, and (iii) give an instructor a live, compressed read of cognitive state across many students at once.

The MVP is judged by whether an external observer — watching the demo video, which pairs the student's screen with the private-reasoning view — can see the model doing cognitive work that an autocomplete-style tool structurally cannot.

## 2. MVP Scope

The MVP delivers, end to end, a system where **instructors author exercises** and students complete them:

- An **exercise authoring flow** where an instructor writes a prompt in a text box, Opus generates the pedagogical scaffolding (spec-gate dimensions and expected divergences), and the instructor reviews and edits before publishing.
- The full four-phase student loop (spec gate, intent declaration, constrained writing, intent-diff review).
- A **private-reasoning view** that exposes, for any given student session, Opus's internal classification, predicted justification, confidence, and alignment results. Not visible to the student; accessible to the instructor on demand.
- The live session view ("Who needs me right now?") populated by at least three simulated or concurrent student sessions.
- The per-exercise cohort view ("How did this exercise go?") populated by the sessions that have run against that exercise so far — no pre-seeded cohort data.

The instructor surface (live session view + per-exercise cohort view) lives on a single screen, toggleable between the two questions. The private-reasoning view is a third surface, opened from any student row. The exercise authoring flow is a fourth.

There is no LMS integration, no autograder hookup, and no student-account system beyond what is needed to attribute sessions in the demo.

### 2.1 Exercise Authoring Flow

The instructor creates a new exercise by:

1. **Writing the prompt** — a free-text box where the instructor states what the exercise should have the student build. Example: *"Write a function that counts vowels in a string."* No structured fields beyond a title.

2. **Opus generates pedagogical scaffolding** — on submission of the prompt, Opus produces four artifacts grounded in the prompt text:
   - **Spec-gate dimensions:** the list of commitments the student's spec must address before Opus can close Phase 1. For the vowel example: case sensitivity, whether `y` counts, empty-string behavior, non-string input.
   - **Expected divergences:** the drift / revision / bug patterns this exercise is likely to elicit, used by the cohort narrative generator in §5.2 as grounding.
   - **Phase 2 activation flag:** whether the exercise admits non-trivial implementation decisions. If yes, students will be required to submit an implementation plan before writing code (§4.2); if no, Phase 2 is skipped.
   - **Student level:** the expected experience level of the student working this exercise — `week_1_2`, `week_3_6`, or `week_7_plus`. Inferred by Opus from the prompt (e.g., *"count vowels"* → `week_1_2`; *"validate a password against multiple rules"* → `week_7_plus`) and editable by the instructor. This field calibrates the size of the spec-gate dimension list, the assertiveness of the Socratic examiner in Phase 1, the expected-justification baseline used by the Phase 4 classifier, and the vocabulary used in Phase 4 questions (see §4.4 and §4.5).

3. **Instructor reviews and edits** — both artifacts render as editable lists. The instructor can add, remove, or rewrite any entry. This review step is non-skippable: the "Publish" action is disabled until the instructor has explicitly confirmed the scaffolding (even if they accept every generated item as-is).

4. **Publish** — the exercise becomes available to students. Once published, the scaffolding is locked for that instance. (Re-editing a published exercise is out of scope for MVP.)

The design constraint is that the instructor must always see and own the scaffolding. Opus is a first-pass generator, not the authority. If the generated dimensions are poor, the instructor catches it in review; if the instructor accepts poor dimensions without reading them, that is a human failure the system makes visible (the Publish gate forces the confirmation) rather than invisible.

**Multi-part prompts.** The authoring flow accepts atomic prompts (*"count vowels in a string"*) and multi-part prompts (*"read a sales file, compute totals by salesperson, print the top 3 descending, and handle the missing-file case"*) alike. Opus produces spec dimensions over the full prompt as a single flat list, regardless of internal structure. Explicit decomposition into sub-tasks — where the student would work each part under its own spec gate — is out of scope for MVP. The pedagogical cost of this simplification is acknowledged in §9.

**Failure mode the MVP accepts:** if the instructor writes a vague prompt, Opus will produce vague scaffolding, and the resulting exercise will train students poorly. This is documented as a known limitation. The MVP does not attempt to coach the instructor into better prompts.

**Quality floor for generation.** The scaffolding generator must produce, on a reasonable instructor prompt, scaffolding whose size is **proportional to the complexity of the exercise** — not a fixed minimum. A trivial exercise (*"count vowels"*) warrants 2–3 spec-gate dimensions; a complex one (*"validate a password against a rule set"*) warrants 5–7. Over-generating dimensions on simple exercises is as much a failure as under-generating on complex ones, because the spec-gate friction should be proportional to the pedagogical work the exercise is trying to produce. Each generated entry must be concrete enough to be actionable — generic outputs ("handle edge cases", "student might write inefficient code") fail regardless of exercise complexity. This is the same quality requirement applied elsewhere in the system: specific-and-actionable, not template-and-generic.

### 2.2 Exercise Scope Constraints

Exercises should stay within standard CS1 Python: primitive types, strings, lists, dictionaries, conditionals, loops, and function definitions. No classes, no external libraries beyond the standard library, no file I/O beyond `input()` / `print()`.

The MVP does not enforce this constraint programmatically. The authoring flow does not validate that the instructor's prompt is in-scope for CS1. If an instructor writes *"implement a graph traversal with NetworkX"*, Opus will generate scaffolding for it, and the exercise will run. Validation of exercise difficulty/scope is out of scope for MVP.

### 2.3 Exercise Record

Each authored exercise is stored with the following fields. Full schema in Appendix B.

```
exercise_id
title
instructor_prompt_text           # the free-text box input
spec_gate_dimensions (list)      # Opus-generated, instructor-edited
expected_divergences (list)      # Opus-generated, instructor-edited
phase_2_required (bool)          # Opus-generated, instructor-editable
student_level (enum)             # Opus-generated, instructor-editable
published_at
```

## 3. Success Criteria for the Demo

1. A judge can watch a student complete one exercise end-to-end and see Opus refuse to generate code at every phase where refusal is the pedagogically correct move.
2. A judge can watch the exercise authoring flow: an instructor writes a prompt, Opus generates scaffolding, the instructor reviews and publishes. The generated scaffolding meets the specificity bar stated in §2.1 — concrete spec-gate dimensions and concrete expected divergences, not generic template output.
3. The private-reasoning view visibly shows Opus's prediction *before* the student answers, and the alignment result *after*. The prediction is specific enough (grounded in what a student at the exercise's declared level could plausibly say) that a judge can tell it is not boilerplate.
4. The live session view produces, for each active student, a one-line summary that a TA could act on in under five seconds. "Stated happy path three times, hasn't considered empty input" passes. "Student is in Phase 1" fails.
5. The per-exercise cohort view produces an Opus-generated narrative that names a specific curricular problem and a specific fix, grounded in the aggregate data. Generic observations ("students struggled with this exercise") fail the bar.
6. At least one of the student trajectories in the demo shows a prediction-alignment *failure* — the student answered something different from what Opus predicted — and that failure is visible in the private-reasoning view and flagged on the instructor dashboard.

## 4. Student Loop — Functional Requirements

### 4.1 Phase 1 — Specification Gate

The code editor is disabled. A specification panel is active. The student writes, in natural language, the program's inputs, outputs, edge cases, and behavior on bad input.

Opus 4.7 acts as a Socratic examiner. It reads the spec and asks targeted questions that expose gaps. It does not suggest content. It does not rewrite the student's spec. It asks questions whose answer is a concrete commitment the student must add to the spec themselves.

The spec gate closes when Opus scores the spec as *executable* — meaning a competent programmer could implement it without guesses. The executability criterion is determined by a combination of:

- **Per-exercise instructor configuration** — each authored exercise carries a list of spec dimensions that must be addressed (e.g., empty-input handling, ordering direction, type assumptions), produced by the authoring flow in §2.1. Opus cannot approve the spec until every listed dimension has a concrete commitment in the student's text.
- **Opus autonomous judgment** — beyond the instructor-configured list, Opus may identify additional gaps it considers material and ask about them, but cannot block the gate on them alone once the configured list is satisfied.

This hybrid resolves the risk that Opus approves loose specs (the instructor list is a floor) and the risk of infinite loops where the student cannot identify what is missing (Opus cannot invent new blockers once the floor is met).

**Level calibration.** The assertiveness of the Socratic examiner and the size of the instructor-configured floor are calibrated by the exercise's `student_level` field (§2.1). For `week_1_2`, the floor is shorter and the examiner uses simpler vocabulary, asking about concrete cases (*"what should happen when the input is empty?"*) rather than abstract properties (*"what are the invariants you want to preserve?"*). For `week_7_plus`, the floor is longer and the examiner can surface subtler gaps. The goal is that the spec-gate friction stays proportional to what a student at that level can reasonably engage with.

**Escape hatch.** At any point during Phase 1, the student can invoke "Ask for help", which routes a notification to the instructor dashboard with the student's current spec state and the sequence of Opus questions they have not been able to resolve. The phase remains paused until the instructor or TA responds. This is the failsafe against students stuck for 40 minutes in spec iteration.

### 4.2 Phase 2 — Intent Declaration

Merged into the same screen as Phase 1 rather than presented as a separate page. Once the spec gate closes, the spec panel expands to include an "Implementation plan" section where the student writes the data structures they will use, the order of operations, and the functions they will define. The editor remains disabled until this section is submitted.

This is the prediction against which the student's own code will be checked in Phase 4. It is the student's prediction, not the instructor's rubric.

Opus does not examine the plan the way it examined the spec. The plan is captured as-is and stored. The design intent is to minimize perceived bureaucracy — the student has just iterated a spec with Opus and is cognitively loaded; the plan is a short, low-friction artifact, not a second Socratic round.

**Activation rule.** Phase 2 is not mandatory for every exercise. It activates only when the exercise admits **non-trivial implementation decisions** — multiple valid strategies, meaningful data-structure choices, or a non-obvious order of operations. For atomic exercises where the spec essentially determines the implementation (a single loop with a counter, a direct formula application), Phase 2 is skipped and the editor unlocks immediately after the spec gate closes. Whether Phase 2 activates is a per-exercise property determined by Opus during the authoring flow (§2.1) and stored as a boolean on the exercise record; the instructor can override it during review. The pedagogical cost of skipping Phase 2 on trivial exercises is low — there is little "plan" worth declaring — while the friction cost of *not* skipping it is high, because the student spends cognitive effort on a ceremonial step whose Phase 4 payoff is near zero. For exercises where Phase 2 is skipped, Phase 4 intent-diff operates against the spec alone; the divergence classification remains valid with two sources of comparison (spec, code) rather than three.

### 4.3 Phase 3 — Writing with Constrained Assistance

Editor unlocks. Autocomplete is off. Opus is available in a chat panel.

Opus operates in two modes that it selects between on each student message:

- **Interrogative mode** — triggered when the student asks about *their own code* ("why does my loop terminate early?", "is my approach correct?"). Opus answers with counter-questions and diagnostic pointers, not code. The purpose is to keep the student in the reasoning seat.
- **Direct mode** — triggered when the student asks a *factual reference question* independent of their reasoning ("what is the syntax of a dictionary in Python?", "how do I read a file line by line?"). Opus answers directly. Refusing reference questions makes the tool hostile and drives students to an external LLM, which defeats the entire purpose.

The mode selection is made by Opus per message based on whether answering directly would substitute for the student's reasoning about their own program. Edge cases (e.g., "what's the syntax for a list comprehension that filters evens?") are resolved in favor of direct mode when the question is genuinely about language reference, and interrogative when the question is a thinly disguised request for implementation.

The student can also invoke a "**Revise plan**" action while writing. This pauses the editor and opens a short Opus-led exchange: the student states what they want to change and why, and Opus asks whether the new approach is faster, simpler, or more correct. The amendment is captured and stored as a second-version intent declaration, timestamped. Proactive revision is tracked as a distinct signal in the instructor dashboard — it is a metacognitive habit worth rewarding, not a red flag.

### 4.4 Phase 4 — Intent-Diff Review

On submission, Opus performs a single reasoning pass over the spec, the intent declaration (including any revisions), and the final code. For each meaningful divergence, it produces:

1. A classification: **Drift**, **Revision**, or **Bug**.
2. A **predicted student justification** — what a student at this exercise's `student_level` (§2.1) would plausibly say when asked about this divergence. The prediction is grounded in what a novice *at that specific level* could articulate: for `week_1_2`, the predicted response might be *"I don't know, I just forgot"* or *"I didn't think about that case"*, which is realistic and diagnostically useful rather than a failure signal; for `week_7_plus`, the prediction can invoke strategy choices, trade-offs, or architectural reasoning. Calibrating the prediction to the student's level is what makes the alignment score a signal rather than noise — predicting week-6 reasoning for a week-1 student guarantees misalignment on every divergence and destroys the instrument.
3. A confidence level on the classification: **high**, **medium**, or **low**.
4. A **student-facing question** about the divergence. The question is phrased neutrally and does not reveal the classification. See §4.5 for the framing rules.

The student sees only the question. They do not see the classification, the prediction, or the confidence.

After the student responds to each question, Opus scores alignment between the predicted justification and the actual response as **aligned / partial / diverged**. The scored alignment, the prediction, and the student's response are all written to the session log and surfaced on the instructor dashboard. The classification is revised if the student's response warrants it (see §4.5, item E).

**Note on `week_1_2` exercises.** For early-week exercises, "I don't know" and "I just forgot" are the most common honest responses, and the system is designed to treat them as valid. Alignment is scored high when the prediction anticipated exactly this kind of response; the instructor dashboard surfaces the pattern as *signal about where students notice gaps vs. don't*, not as an indictment of the student's performance. Phase 4 at week 1-2 is not meant to produce deep conversations; it is meant to produce the minimum signal of whether the student *noticed* the divergence or not.

Submission is accepted only once the student has responded to every flagged divergence. There is no "skip" — but responding with "I don't know" is a valid and logged response, and is often the most diagnostic one.

### 4.5 Classifier Quality Requirements

The Drift / Revision / Bug classification is the most consequential piece of reasoning in the system. False-Drift errors (classifying a legitimate revision as drift) produce an accusatory question about something the student did correctly, which degrades trust in the tool. False-Revision errors (classifying actual drift as revision) are cheaper — at most a missed intervention.

The MVP encodes this asymmetry through four mechanisms:

**A. Classifier bias toward Revision.** The classification prompt explicitly instructs Opus: "when the evidence is ambiguous between drift and revision, classify as revision." Asymmetry lives in the prompt, not in post-processing.

**B. Uniform non-accusatory framing, calibrated to student level.** The question the student sees does not reveal the internal category. Rather than *"Your spec required handling empty input; your code doesn't. Was this deliberate?"* (presupposes drift), the framing is *"Your spec mentioned empty input and I don't see that case handled in the code. Walk me through what happened there."* This phrasing works equally well whether the divergence was drift the student missed or a revision the student made deliberately. The instructor-facing dashboard still carries the classification; the student-facing UX does not.

The vocabulary of the question is calibrated to the exercise's `student_level`. For `week_1_2`, questions use simple concrete language (*"I noticed your code does X but you said it would do Y. Can you tell me why?"*) without technical vocabulary the student has not yet been exposed to. For `week_7_plus`, questions can reference strategy, data-structure choices, or complexity (*"Your plan used a hashmap but the code uses nested loops — was that a deliberate change?"*). Mismatched vocabulary produces the same broken alignment that mismatched predictions produce: the question becomes unanswerable not because the student lacks the insight but because they lack the words.

**C. Confidence threshold with abstention.** Classifications below the `high` confidence threshold are rendered in the dashboard as `unresolved` until the student's response clarifies them. The student-facing question in `low`-confidence cases is phrased in pure exploratory form ("I notice a difference between X and Y — can you tell me more?") without presupposing any category.

**E. Post-hoc classification from student response.** After the student responds, the response is fed back to the classifier for a final categorization. If the student articulates a coherent justification for the divergence, the final classification is Revision regardless of the initial one. The capacity to defend the decision is what we actually care about — the initial classification is scaffolding, the final one is signal.

(Mechanism D — two-pass self-critique — is considered out of scope for the MVP.)

## 5. Instructor Surface — Functional Requirements

Both screens live in a single view, toggleable between "Who needs me right now?" and "How did this exercise go?".

### 5.1 Live Session View — "Who needs me right now?"

One row per active student. Columns:

- Student identifier.
- Current phase (1 spec / 2 plan / 3 writing / 4 review).
- Time in current phase.
- **Opus-generated one-line cognitive summary**, refreshed at fixed intervals (target: every 90 seconds, or on significant state change — phase transition, prediction-alignment failure, revision action).
- Flag indicators: active "Ask for help" request, most recent prediction-alignment failure, proactive revision captured.

The cognitive summary is the central requirement of this screen. It must be a sentence an instructor can act on in under five seconds. It must not be a status readout. Examples of the required register:

- *"Writing spec; has stated the happy path three times, hasn't considered empty input."*
- *"Phase 3; code compiles but intent declaration said hashmap and they wrote nested loops — likely a revision, worth a check."*
- *"Prediction-alignment just failed on a boundary-condition question; student answered 'I don't know.' High-value intervention target."*

Summaries are produced per student, per refresh, from: current phase state, recent Opus exchanges, time signatures, and code in flight. Summary generation is the primary Opus cost driver in the live view and must be batched appropriately during the demo.

### 5.2 Per-Exercise Cohort View — "How did this exercise go?"

Opened after the exercise closes. One row per exercise. Shows:

- **Opus-generated narrative** (2–3 sentences) at the top: what the exercise actually tested, where it broke down in this cohort, and a specific curricular recommendation. Generic narratives fail the demo bar. The narrative must name a concrete pattern and a concrete fix.
- Distribution of spec-iteration counts (how many Opus rounds it took each student to pass the spec gate).
- Distribution of divergence categories in Phase 4 (drift / revision / bug, with the unresolved bucket shown separately).
- The divergences the classifier flagged most often.
- The spec-gate dimensions students most often failed to address on first submission.
- Rate of proactive revisions (Phase 3 "Revise plan" actions).
- Rate of prediction-alignment failures.

For the MVP, the cohort view renders against whatever real sessions have accumulated for an exercise during the demo — no pre-seeded synthetic data. This means that for freshly authored exercises the view will initially be sparse (3–5 sessions is a realistic demo number), and the Opus-generated narrative will operate on a small sample. The narrative quality bar from §3 (a concrete pattern and a concrete fix) still applies; small sample size is not an excuse for generic output. If the sample is genuinely too small to say anything specific, the narrative should say so explicitly rather than pad with generalities.

### 5.3 Private-Reasoning View

A third instructor-facing surface, opened from any student row in the live session view or from any session in the per-exercise cohort view. Renders, for the selected session:

- The current phase state and the recent Opus exchanges (what the student has seen).
- Opus's **internal** output for that session: each classification with its confidence, each predicted justification, each student response, and each alignment result.
- Timestamps on every entry so the sequence is reconstructable.

The distinction between this view and the rest of the instructor surface is that it exposes the fields marked `instructor-visible` in the session log (Appendix A) — specifically the predicted justifications and initial classifications — which are deliberately hidden from the student.

This is a product surface, not a demo-recording artifact. The side-by-side framing that makes Opus's cognitive work legible to an outside observer (the student's screen next to the private-reasoning view) is produced at video-recording time by capturing two windows simultaneously. It does not require a dedicated UI.

## 6. Opus 4.7 Usage — Where Frontier Reasoning Is Load-Bearing

Five places in the MVP where the model's capability is the gating factor:

1. **Spec-gate Socratic examination.** Asking targeted questions that expose genuine gaps without devolving into a checklist, and scoring executability against both the instructor-configured floor and emergent gaps. A weaker model produces generic checklists or approves vague specs.

2. **Intent-diff classification + prediction in a single pass.** Holding spec, plan, code, and an inferred model of a novice's cognitive state simultaneously; classifying divergences with calibrated confidence; predicting what a student at the exercise's declared level would say about each one. The prediction must be level-appropriate — what `week_1_2` students actually say ("I forgot", "I didn't think about it") is structurally different from what `week_7_plus` students say (strategy justifications, trade-off reasoning). Weaker models either collapse the prediction into generic "the student will mention efficiency" statements that align with anything and diagnose nothing, or apply a single anchor (e.g., always predicting senior-engineer reasoning) that guarantees misalignment at low levels.

3. **Live cognitive summaries at scale.** Producing per-student, actionable one-liners that compress phase state, interaction history, and code into the sentence an instructor can act on. Weaker models regress to status-readout language.

4. **Cohort-level curricular narrative.** Reading aggregate patterns across sessions and producing a specific, actionable recommendation about the exercise itself. Weaker models produce descriptive summaries without a recommendation.

5. **Exercise scaffolding generation.** Reading an instructor's free-text prompt and producing concrete spec-gate dimensions and expected divergences — the pedagogical spine of the exercise. The model must identify genuine ambiguities and failure modes in a problem statement, at a specificity level an instructor can actually review and accept. Weaker models produce template scaffolding ("handle edge cases") that satisfies the format but fails the pedagogy.

If any of these five degrade to weaker-model quality during the demo, the tool's case for frontier reasoning fails.

## 7. Non-Functional Requirements (MVP only)

- **Latency.** Spec-gate questions and Phase 3 chat responses should feel conversational (target: first token under 3 seconds). Intent-diff review can take longer (target: under 20 seconds end-to-end for the classification pass); the UI surfaces a "reviewing your work" state.
- **Demo reliability.** At least one scripted live student trajectory must be deterministic enough to guarantee the private-reasoning view renders the intended moments during video recording. The demo script should exercise the full exercise lifecycle: an instructor authoring an exercise (showing Opus generating scaffolding and the instructor editing), then students completing it, then the cohort view populating. If live Opus calls fail at any point, a cached fallback of the scripted trajectory is used.
- **Data persistence.** Session logs (spec iterations, Opus questions, student responses, classifications, predictions, alignment results, timestamps) are written to local storage and are exportable as JSON. Schema detail is in Appendix A.
- **Trust assumption.** Buddy-system evasion (a second LLM in another window) is assumed absent and is not detected. Documented as a known limitation.

## 8. Out of Scope for MVP

- LMS / autograder / GitHub Classroom integration.
- Student account system beyond what is needed for demo attribution.
- Per-student longitudinal trajectory view across a full semester.
- Evasion detection (paste-burst signals, typing-rhythm anomalies, stylistic inconsistency).
- Informed-consent flow for the private-prediction mechanism.
- Data-governance framework (retention, access, anonymization for research use).
- Two-pass self-critique classifier (mechanism D).
- Re-editing a published exercise (scaffolding is locked after publish).
- Validation that an instructor's exercise prompt is in-scope for CS1.
- Instructor-prompt coaching (helping the instructor write better prompts before generation).
- **Explicit decomposition of multi-part prompts into structured sub-tasks** (each with its own spec gate and intent-diff). Multi-part prompts are handled as flat spec-dimension lists in the MVP.
- Pre-seeded synthetic cohort data for the per-exercise view.

## 9. Open Questions (flagged for post-hackathon decisions)

- Executability threshold calibration: the current design gives Opus autonomous authority above the configured floor, but the calibration of how aggressive Opus should be in finding additional gaps is unspecified and will be tuned against observed student behavior.
- Direct-vs-interrogative mode selection in Phase 3 is a per-message judgment by Opus. Edge cases will need review once real student traffic exists.
- Refresh cadence on the live session view (90s target) is a guess based on instructor attention patterns, not measured behavior.
- **Explicit sub-task decomposition for multi-part exercises.** The MVP handles multi-part prompts as a single flat list of spec dimensions, which is the right pragmatic choice for hackathon scope but is pedagogically suboptimal: a student facing a 4-part problem should ideally work each part under its own spec gate, which trains decomposition as an explicit skill rather than hiding it inside a long list. Post-MVP, the authoring flow should offer structured decomposition — either auto-detected by Opus or declared by the instructor — with the student loop working sub-tasks sequentially or in parallel. The schema impact (per-sub-task spec/plan/code, cross-sub-task divergence classification) is non-trivial and deferred.

---

## Appendix A — Session Log Schema (MVP)

Each student session produces a single JSON record with the following structure. Fields marked `instructor-visible` appear in the dashboard; all fields are written to storage.

```
session_id
student_id
exercise_id
started_at
completed_at
phase_1_spec_gate:
  iterations: [
    { timestamp, student_spec_text, opus_questions, gaps_identified, passed }
  ]
  final_spec_text
  instructor_configured_dimensions_addressed (list)
  help_requests: [ { timestamp, state_at_request, resolution } ]
phase_2_intent_declaration:
  plan_text
  submitted_at
phase_3_writing:
  opus_exchanges: [
    { timestamp, student_message, opus_mode (interrogative|direct), opus_response }
  ]
  revisions: [
    { timestamp, amendment_text, justification_text, opus_exchange }
  ]
  final_code
  submitted_at
phase_4_intent_diff:
  divergences: [
    {
      divergence_id,
      initial_classification (drift|revision|bug),
      initial_confidence (high|medium|low),
      predicted_justification,        # instructor-visible
      student_facing_question,
      student_response,
      alignment (aligned|partial|diverged),
      final_classification,            # post-hoc, instructor-visible
      final_classification_reason      # instructor-visible
    }
  ]
live_summaries: [
  { timestamp, summary_text, flags }
]
```

---

## Appendix B — Exercise Record Schema (MVP)

Each instructor-authored exercise is stored with the following structure. The schema captures the instructor's original prompt, the Opus-generated scaffolding, and any edits the instructor made during review — so the authoring pipeline is fully reconstructable after the fact.

```
exercise_id                # short stable slug derived from title
title                      # instructor-provided
instructor_prompt_text     # the free-text box input
authored_at
published_at
authoring_trace:
  opus_generated_dimensions:      # first-pass output from Opus
    [ { id, description, rationale } ]
  opus_generated_divergences:     # first-pass output from Opus
    [ { category, pattern } ]
  opus_generated_phase_2_required: bool  # first-pass output from Opus
  opus_generated_student_level: enum     # first-pass output from Opus
spec_gate_dimensions:      # final, post-instructor-edit
  [
    {
      id,                  # short slug, e.g. "empty_input"
      description,         # what the student needs to commit to
      rationale,           # why this dimension matters (used by Opus
                           # when asking about it, not shown verbatim)
      source               # "opus" | "instructor_edited" | "instructor_added"
    }
  ]
expected_divergences:      # final, post-instructor-edit
  [
    {
      category,            # drift | revision | bug
      pattern,             # short description
      source               # "opus" | "instructor_edited" | "instructor_added"
    }
  ]
phase_2_required: bool     # final, post-instructor-edit
student_level: enum        # final, post-instructor-edit
                           # "week_1_2" | "week_3_6" | "week_7_plus"
```

The `authoring_trace` fields preserve the Opus first-pass output as-generated, separately from the final `spec_gate_dimensions` and `expected_divergences` lists. This makes it possible, later, to evaluate how often instructors accepted Opus output unchanged, how often they edited, and how often they added entirely new items — useful signal both for improving the scaffolding generator and for research on human-AI authoring collaboration.

---

*End of MVP PRD. Version 1, draft.*