# Maieutic
### A pedagogical IDE that trains the cognitive substrate LLM-native programmers will need

**Anthropic Builder Hackathon · Built on Claude Opus 4.7**
**Author:** Paula Vásquez-Henríquez — Subdirectora, Ing. Civil Informática, UDD Concepción · PhD student, AI

---

## 1. The problem, from inside the classroom

I am the subdirector of the School of Computer Engineering at UDD Concepción, I teach the introductory programming course, and every semester I sign off on final grades for roughly eighty students. For the past three semesters I have watched a specific failure mode grow: students pass the course — they submit working code, their tests go green, their grades are fine — without ever having done three things that define a working programmer. They cannot state a problem precisely before writing code. They cannot draft an explicit plan before touching the keyboard. They cannot read their own finished code and recognize where it diverged from what they intended.

This is not a talent problem or a teaching-effort problem. It is a *substitution* problem. The conversational autocomplete open in the other window delivers working code before the student has finished formulating the question. In an eighty-student classroom, I cannot sit next to each of them and ask "what is your program supposed to do, exactly, before you write it?" I cannot check whether the plan in their head actually matches the code they produced. The tool that *could* run that Socratic loop at scale — a frontier LLM — is currently deployed in the exact opposite role: accelerating past the loop, not running it.

Maieutic is the tool I would build if I could clone myself eighty times. It is a pedagogical IDE that uses Claude Opus 4.7 as a structured interlocutor, not an autocomplete. It runs the metacognitive loop that an 80-student classroom cannot run manually. And it is built by someone who spends every week inside the problem it is trying to solve.

**The name** is Socrates' term — literally "midwifery" — for drawing knowledge out of the learner through questions rather than depositing answers into them. That is exactly the inversion the tool performs: a conversational LLM that refuses to generate code and instead asks the questions that force the student to produce the reasoning themselves. "Anti-Copilot" was the working title; it was reactive and named the opponent rather than the method. Maieutic names what the tool *does*.

**Why this matters beyond my classroom.** The same failure mode is visible at every CS department that has let LLMs into the introductory sequence without pedagogical instrumentation — which, in practice, means most of them. The skills that are being eroded in CS1 are the same skills the profession will increasingly pay for: programmers in 2030 will spend less time writing code and more time specifying, reviewing, and debugging, and all three depend on a mental model precise enough that the gap between intent and output is detectable to the person holding it. Autocomplete-without-scaffolding erodes exactly this capacity during the formative years. Maieutic is a direct intervention, and the data it generates — granular traces of how novices reason about code they produce with LLM assistance — does not currently exist at scale and is directly relevant to questions CS education research is already asking.

## 2. Thesis in one sentence

Claude Opus 4.7, used as a structured interlocutor with students and a real-time cognitive-state reader for instructors, can run the metacognitive loop and the attention-allocation work that an 80-student CS1 classroom cannot run manually — and can do it in a way that *trains* specification, critical reading, and debugging as explicit skills rather than leaving them as accidental by-products of assignment completion.

## 3. The student's loop

Most LLM-for-education projects fail because they describe a philosophy and hand-wave the interaction. Here is the specific loop Maieutic runs, end to end, for a single CS1 exercise, from the student's point of view. The instructor-facing apparatus — live session view and per-exercise dashboard — is described separately in §4.

### Phase 1 — Specification gate
Student opens an exercise. The code editor is **disabled**. A specification panel is active. The student writes, in natural language, what the program must do: inputs, outputs, edge cases, expected behavior on bad input.

Opus 4.7 is invoked as a *Socratic examiner*, not a generator. It reads the spec and asks targeted questions — not suggestions, *questions* — that expose gaps: "What happens if the list is empty?" "You said 'sort the numbers' — ascending or descending? Stable?" "Your spec doesn't mention negatives; is that deliberate?"

The student revises the spec. The loop continues until Opus scores the spec as *executable* — meaning a competent programmer could implement it without making guesses. Only then does the editor unlock.

### Phase 2 — Intent declaration
Before the editor opens fully, the student writes a short plan: the data structures they'll use, the order of operations, the functions they'll define. This is stored. It's the *prediction* against which their code will be checked — their own prediction, not the professor's rubric.

### Phase 3 — Writing (with constrained assistance)
Autocomplete is off. Opus is available but only in *interrogative* mode: the student can ask questions ("why does my loop terminate early?") and Opus answers with counter-questions or diagnostic pointers, not code. The student writes the code themselves.

### Phase 4 — Intent-diff review
When the student submits, Opus does two things in a single reasoning pass: it compares the specification, the intent declaration, and the actual code to classify each divergence into one of three categories, and — critically — it **predicts what the student will say when asked about that divergence**, before the student answers.

The three categories:

- **Drift** — the code does less than intended, or fails to address something the spec required. *"Your spec required handling empty input; your code doesn't. Was this deliberate?"* This is the failure mode we want to catch.
- **Revision** — the code implements a coherent alternative strategy that still satisfies the spec. *"Your plan described a two-pass algorithm; your implementation is single-pass. Can you articulate why the new approach is better?"* This is the case where the student changed their mind mid-task and often changed it for the right reasons. Articulating *why* the new approach is better is exactly the critical-reading skill the tool exists to train. Revisions with good justification are a **positive signal**, not a flag to explain away.
- **Bug** — the code attempts what was planned but fails. Standard debugging scaffolding: Opus asks diagnostic questions rather than fixing the code.

The prediction is held privately — the student sees only the question, not what Opus expected them to say. After the student responds, the system compares the prediction to the actual response. When they align, it is evidence the student understands their own reasoning. When they diverge, that gap is itself diagnostic — and it's surfaced to the instructor dashboard, not the student. A student who implements a single-pass algorithm, where Opus predicts they will justify it by amortized cost, and who instead answers "I don't know, it just felt cleaner," is telling us something specific: they produced working code without a model of why it works. That is exactly the failure mode a grade on a unit test cannot catch.

The student responds to each item before submission is accepted. Responses and prediction-alignment are logged. This is where the metacognitive reps happen — the student is forced to *notice* the gap between intent and output, and, when they've revised, to *defend the revision on its merits*.

Students can also flag a revision proactively while writing, via a "revise plan" action that pauses the editor and captures the amendment with a short Opus-led exchange ("is the new approach faster, simpler, or more correct — and why?"). Proactive revision is itself a metacognitive habit worth rewarding; the dashboard tracks it separately.

**Why this is the hard part.** Two reasoning tasks in one pass — classifying the divergence *and* modeling what a novice at this stage could plausibly articulate about it — is where Opus 4.7 separates from weaker models. The classification alone is already non-trivial (distinguishing a coherent alternative strategy from an abandoned plan that happens to pass tests). Adding a calibrated prediction of the student's reasoning requires the model to hold the spec, the plan, the code, and an inferred model of the student's cognitive state simultaneously, and to ground the prediction in what a CS1 student at week six could actually be expected to articulate — not what a senior engineer would say. A weaker model collapses this into generic justifications ("the student will mention efficiency") that align with anything and diagnose nothing.

**Director's-cut mode.** In production, the prediction stays private from the student — revealing it would contaminate the very measurement we're making. But in a demo context, a director's-cut view shows the student's screen and Opus's private reasoning side by side: the classification, the predicted justification, the actual student response, and the alignment score, all rendered in real time. This is the view that makes the tool's cognitive work visible to an outside observer. It is also, incidentally, the view that will matter when this kind of tool is evaluated — by researchers, by instructors deciding whether to adopt it, by Anthropic teams thinking about educational use of frontier models. The audience for the director's cut is anyone who needs to see what the model actually does before trusting it.

### Why this loop and not the alternatives

Spec-gate alone is gameable — a student can write a plausible-sounding spec without engaging, and a weaker LLM will approve it. Intent-diff alone arrives too late; by the time the code is written, the student has already spent the session in autocomplete-acceptance mode and the metacognitive damage is done. The synthesis closes both holes: spec-gate forces engagement *before* code is written, and intent-diff forces reflection *after*, with the student's own earlier statements as the measuring stick. The student is always held accountable to themselves, not to the professor.

## 4. The instructor surface

Maieutic generates signal the physical classroom cannot produce. The instructor surface is where that signal lives. It has two screens, named by the question each answers: *Who needs me right now? How did this exercise go?*

The two serve different moments. The first runs during the session, answering where to direct attention in real time. The second is opened after an exercise closes, when deciding whether the exercise itself is pedagogically sound or needs revision for next semester. A third view — per-student longitudinal trajectories across a full semester — is the natural next build once there is semester-scale data to populate it; it is not in scope for the MVP, because a longitudinal view of one session is a dot, not a trajectory.

### Screen 1 — "Who needs me right now?" (live session view)

An 80-student CS1 lab session has one instructor and typically two or three TAs circulating through the room. The bottleneck in that room is not pedagogical knowledge — the instructor knows the common misconceptions and the TAs have been trained on them. The bottleneck is **attention allocation across many simultaneous students.** You cannot see which student right now is stuck in a way that a 30-second intervention would unstick, versus which student is productively struggling and should be left alone, versus which student has quietly given up. By the time you have walked a full lap of the room looking over shoulders, the window to help several students has closed.

The live session view runs on a separate screen, visible to the instructor and the TAs. For each student currently working in Maieutic, it shows a single row: the student's name, which phase they are in, how long they have been there, and — the part that matters — an Opus-generated one-line summary of *what seems to be happening in their head right now*, updated every few minutes. Not a status code. A sentence an instructor can act on in two seconds: *"Writing spec; has stated the happy path three times, hasn't considered empty input."* *"In Phase 3; code compiles but their intent declaration said hashmap and they wrote nested loops — likely a revision, worth a check."* *"Prediction-alignment just failed on a boundary-condition question; student answered 'I don't know.' High-value intervention target."*

**Why Opus 4.7 specifically.** Producing each one-line summary is a cognitive-assessment task, not a status readout. For each student, the model reads the current phase state, the recent interactions with Maieutic (specs, questions, revisions, prediction-alignment results), the time signatures, and the code in flight, and produces a compressed sentence that answers the instructor's actual question: *"Is this student stuck in a way I should act on?"* The compression is what requires frontier reasoning. A weaker model outputs "student is in Phase 1 spec gate" — correct and useless. Opus produces "stated the happy path three times, hasn't considered empty input" — the sentence a TA can walk over and address in thirty seconds. Doing this simultaneously across students, refreshing as state changes, without the summaries drifting into generic template language, is the hard part.

### Screen 2 — "How did this exercise go?" (per-exercise cohort view)

One row per exercise, opened after the exercise closes. The instructor sees aggregate patterns across all students who completed it: distribution of spec-iteration counts (was the spec gate too strict or too loose for this exercise?), distribution of divergence categories in Phase 4 (did this exercise produce mostly drift, suggesting it is confusing; mostly coherent revisions, suggesting it is well-designed and productively challenging; or mostly bugs, suggesting technical rather than conceptual difficulty?), the divergences the classifier flagged most often, the spec questions students most often failed to address.

The use cases, again, are specific. At semester's end, the instructor sees which exercises are pedagogically broken — Exercise 7 produces the same confusion in 60% of students every semester, and that is the signal to rewrite Exercise 7. Mid-semester, the instructor sees that an exercise they thought was routine actually produced widespread drift, and decides to revisit the underlying concept in the next lecture. This is curriculum design informed by cognitive telemetry, which does not currently exist anywhere.

**Why Opus 4.7 specifically.** The top section of the view is an Opus-generated narrative: two to three sentences summarizing *what this exercise actually tested and where it broke down*, grounded in the aggregate data. *"This exercise was intended to test loop invariants, but 70% of divergences were drift on input validation, suggesting students treated the problem as parsing rather than iteration. Consider rewriting the prompt to make the iteration requirement explicit."* This is the move that requires frontier reasoning — the model reading the aggregate pattern and producing a specific, actionable curricular recommendation, not a generic report.


*Maieutic is what I would build for my own classroom. Opus 4.7 is what makes it possible.*