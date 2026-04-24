# Maieutic — Demo Script

**Total runtime:** ~7 minutes.
**Stack needed:** macOS + browser + terminal. No internet beyond the Anthropic API.

This demo tells one story in five scenes, mapped to the three pillars the
tool is built around:

| Scene | Pillar |
|---|---|
| 1 · Authoring | Classroom scale — compose an exercise in ninety seconds. |
| 2 · Student completes with a drift | Student skill — spec accuracy, autonomous debugging, plan-vs-implementation self-check, all in one session. |
| 3 · Live view | Classroom scale — triage 80 students in five seconds per row. |
| 4 · Private reasoning | Teacher insight — per-session evidence of a student's metacognition. |
| 5 · Cohort narrative | Teacher insight — curricular patterns grounded in data, not intuition. |

---

## Pre-demo checklist (do this 2 minutes before starting)

1. **Reset the DB and replay fixtures**
   ```bash
   cd maieutic
   npm run reset-demo
   ```
   You should see `Replaying 3 exercises...` and `Replaying 7 sessions...` in under 5 seconds.

2. **Start the dev server**
   ```bash
   npm run dev
   ```
   Wait for `Ready in X ms`.

3. **Open four browser tabs, each at a specific URL:**
   - Tab A: `http://localhost:3000/authoring` — you'll author an exercise here
   - Tab B: `http://localhost:3000/exercise/<tbd>` — the student view (URL filled in during Scene 2)
   - Tab C: `http://localhost:3000/live` — instructor dashboard
   - Tab D: `http://localhost:3000/cohort/vowels-demo` — cohort narrative

4. **Confirm tab C shows Carmen** — she's the one seeded active session. You should see a red card with the one-line summary about her Fibonacci spec.

5. **Clear the student cookie in Tab B's origin** so your Scene-2 session is fresh:
   - Cmd+Opt+I → Application tab → Cookies → localhost:3000 → delete `maieutic_student_id`.

---

## Scene 1 — Authoring (≈90 s) — *classroom scale*

> **Goal:** show that an instructor composes a pedagogically sound exercise
> from a plain-text prompt in about ninety seconds, with editorial control
> over what the spec gate will enforce.

On **Tab A**:

1. **Title**: `Count vowels — live demo`
2. **Instructions**: `Write a function that counts vowels in a string.`
3. Click **Generate scaffolding**. Wait ~7 s.
4. Read the three dimensions aloud (`case_sensitivity`, `y_as_vowel`, `empty_string`). Call out: *"These are specific questions, not 'handle edge cases' boilerplate."*
5. Note `phase_2_required: false` and `student_level: week_1_2`.
6. Optional flex: edit one dimension's rationale — the source badge flips from `Opus` to `Edited`. (Point: the instructor keeps editorial control.)
7. Tick **I've reviewed the scaffolding**.
8. Click **Publish**. Copy the returned slug (should be `count-vowels-live-demo`).

**Narration beat:** *"Authoring a full unit's worth of exercises is an afternoon, not a week. Now the student half — which is where the actual pedagogy happens."*

---

## Scene 2 — Student completes with the classic drift (≈3 min) — *student skill*

> **Goal:** in a single session, exercise all three student-facing skills —
> writing an accurate specification, thinking autonomously while debugging,
> and noticing the gap between what was planned and what was implemented.

Switch to **Tab B** and load `http://localhost:3000/exercise/count-vowels-live-demo`.

### Phase 1 — spec gate (~60 s) — *spec accuracy*

1. Type a deliberately vague spec: `The function counts vowels in a string.`
2. Click **Submit spec for review**. Wait ~4 s.
3. Read Opus's two questions aloud. Point out the checklist on the right — nothing ticked yet.
4. Write a second spec that addresses case but **skips** empty-string deliberately:
   `The function counts vowels (both lowercase a,e,i,o,u and uppercase A,E,I,O,U). 'y' is not a vowel.`
5. Submit. Opus will ask about empty input.
6. Third spec — complete:
   `The function counts vowels (both lowercase a,e,i,o,u and uppercase A,E,I,O,U). 'y' is not a vowel. An empty string returns 0.`
7. Submit. Gate closes. Editor unlocks.

**Narration beat:** *"The editor was locked until the student wrote something concrete enough to implement. Three rounds with Opus to get there. That's the specification muscle — pinning behavior down before writing code."*

### Phase 3 — writing the code, autonomously (~90 s) — *critical debugging thinking*

1. In the Monaco panel, type this deliberately lowercase-only function:
   ```python
   def count_vowels(s):
       count = 0
       for c in s:
           if c in 'aeiou':
               count = count + 1
       return count
   ```
2. Point out that **autocomplete is off** — no line-completion, no ghost text. The student is writing every character.
3. In the chat panel, type `what's the syntax for a for loop over a string?` — Opus answers **directly** (reference question, not load-bearing reasoning).
4. Type `why does my count look wrong?` — Opus answers **interrogatively**, with a counter-question, and refuses to debug the code for the student.
5. Click **Submit for review**. You'll see *"Reviewing your work…"* for ~15–20 s.

**Narration beat:** *"Opus answers the syntax question directly — that's fine, it's reference. But for 'why is my code wrong' it refuses, because that's the thinking we actually want the student to do."*

### Phase 4 — the reveal (~30 s) — *plan vs. implementation*

1. Opus asks one neutral question about the drift — something like *"In your spec you committed to counting both lowercase and uppercase vowels. In the code I see only the lowercase five. What happened?"*
2. Answer: `I forgot about the capital letters.`
3. Click **Submit and finish**. Session closes.

**Narration beat:** *"That question wasn't accusatory — it's a side-by-side: spec said this, code did that, what happened? The student has to see the gap themselves. And the system was predicting what they'd say, before they said it. Let me show you."*

---

## Scene 3 — Live view (≈30 s) — *classroom scale*

Switch to **Tab C** (`/live`). Hard refresh (Cmd+Shift+R) if needed.

1. Point at **Carmen's row** (red border). Read her summary aloud: *"student wrote 'n >= 0' and 'negative inputs are handled' in the same spec — they're confused about what committing to behavior looks like, not about Fibonacci."*
2. Point at the help-requested badge and the timestamp.
3. Note the other rows — phase, last active, presence (`live` / `stepped_away` / `left`). Carmen is the one to intervene on; the others are productive.

**Narration beat:** *"In an 80-student lab, I cannot walk past every shoulder and guess who's productively stuck versus who's quietly given up. One row per student, one sentence each, five seconds to triage the whole room. That's what makes this scale."*

---

## Scene 4 — Private reasoning (≈60 s) — *teacher insight*

Still on **Tab C**, click your just-finished session (yours, at the top). You'll land on `/reasoning/<sid>`.

1. **Left column** (what the student saw): your three spec iterations, your final code, the divergence question, your answer *"I forgot about the capital letters."*
2. **Right column** (what Opus was thinking, marked private — never shown to the student):
   - Initial classification: `drift`, high confidence
   - **Predicted justification**: *"I forgot about the capital letters."*
   - Alignment: `aligned`
   - Final classification: `drift`

**Narration beat (this is the money shot):** *"Opus predicted what the student would say before it asked. When the answer matches the prediction, that's evidence the student understands their own reasoning — we have a metacognitive signal no unit test produces. When the answer diverges, we've surfaced a specific, named gap."*

Back in **Tab C**, click **Carmen's row**. On her reasoning view, the right column has zero divergences (she hasn't gotten to Phase 4) but the spec-iteration panel shows three rounds of trying to commit concretely — which is exactly what Opus called out in her live summary.

---

## Scene 5 — Cohort narrative (≈30 s) — *teacher insight at cohort scale*

Switch to **Tab D** (`/cohort/vowels-demo`). The narrative loads in ~9 s.

1. Read the narrative aloud. Point to the specific recommendation.
2. Point at **most-missed dimensions** — the concrete data driving it.
3. Point at the divergence distribution bar — drift-heavy, as expected for a `week_1_2` exercise that targets case-handling.

**Narration beat:** *"This is curriculum feedback grounded in cognitive telemetry. Not 'students struggled' — 'this specific exercise produces this specific drift six times out of eight, here's a concrete fix.' That data does not currently exist at scale anywhere in CS education."*

---

## Closing line

*"Three things: students build specification accuracy, autonomous debugging, and plan-vs-implementation awareness. Instructors get per-session and per-cohort visibility into those skills developing. And the whole thing runs at the scale of a real classroom because Opus is doing the per-student cognitive read in one sentence, not collapsing into template language. Frontier reasoning in the opposite role it usually plays — not generating code, but generating structured reasoning about code the student is writing."*

---

## Failure modes and recoveries

| What could go wrong | How to recover |
|---|---|
| Scaffolding in Scene 1 takes >20s | Narrate: *"this call takes the model about ten seconds — it's doing real work, generating pedagogy-grade scaffolding from a plain-text prompt."* |
| Intent-diff in Phase 4 takes >25 s | Same — PRD explicitly budgets 25 s for this. |
| A prompt returns invalid JSON and retries | The retry is silent. Continue. |
| Dev server reloads mid-demo | Cookie persists, session state is DB-backed — refresh and continue from where you were. |
| The live-view SSE doesn't show the session | Click the session manually via `/reasoning/<sid>` (copy sid from browser URL of Tab B). |
| Opus call fails (network/key) | Apologize, continue describing what would happen, and open the pre-captured fixture view (tab D already loaded). |
| Student cookie from a previous run | Pre-demo checklist step 5 clears it. If forgotten, open an Incognito window for Tab B. |

## One-line rehearsal checklist

Run `npm run reset-demo && npm run dev` then walk through all five scenes back-to-back. Target: under 8 minutes, no errors. If you can't do it clean two runs in a row, something upstream broke — check the server log.
