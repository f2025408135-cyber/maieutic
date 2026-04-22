# Maieutic — Demo Script

**Total runtime:** ~7 minutes.
**Stack needed:** macOS + browser + terminal. No internet beyond the Anthropic API.

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

## Scene 1 — Authoring (≈90 s)

> **Goal:** show that an instructor writes a plain-text prompt and Opus produces concrete scaffolding the instructor can review.

On **Tab A**:

1. **Title**: `Count vowels — live demo`
2. **Prompt**: `Write a function that counts vowels in a string.`
3. Click **Generate scaffolding**. Wait ~7 s.
4. Read the three dimensions aloud (`case_sensitivity`, `y_as_vowel`, `empty_string`). Call out: *"These are specific questions, not 'handle edge cases' boilerplate."*
5. Note the `phase_2_required: false` and `student_level: week_1_2`.
6. Optional flex: edit one dimension's rationale to show the source badge flips to `Edited`.
7. Tick **I've reviewed the scaffolding**.
8. Click **Publish**. Copy the returned slug (should be `count-vowels-live-demo`).

**Narration beat:** *"This is the instructor half — a minute. Now the student half, where the actual pedagogy happens."*

---

## Scene 2 — Student completes with the classic drift (≈3 min)

> **Goal:** commit the drift live so the private-reasoning view in Scene 4 has something real to show.

Switch to **Tab B** and load `http://localhost:3000/exercise/count-vowels-live-demo`.

### Phase 1 — spec gate (~60 s)

1. Type a deliberately vague spec: `The function counts vowels in a string.`
2. Click **Submit spec for review**. Wait ~4 s.
3. Read Opus's two questions aloud. Point out the checklist on the right — nothing ticked yet.
4. Write a second spec that addresses case but **skips** empty-string deliberately:
   `The function counts vowels (both lowercase a,e,i,o,u and uppercase A,E,I,O,U). 'y' is not a vowel.`
5. Submit. Opus will ask about empty input.
6. Third spec — complete:
   `The function counts vowels (both lowercase a,e,i,o,u and uppercase A,E,I,O,U). 'y' is not a vowel. An empty string returns 0.`
7. Submit. Gate closes. Editor unlocks.

**Narration beat:** *"The editor was locked until the student wrote something concrete enough to implement. That's the specification muscle we're training."*

### Phase 3 — write the code with the drift (~90 s)

1. In the Monaco panel, type this deliberately lowercase-only function:
   ```python
   def count_vowels(s):
       count = 0
       for c in s:
           if c in 'aeiou':
               count = count + 1
       return count
   ```
2. (Optional, to show chat) In the chat panel, type `what's the syntax for a for loop over a string?` — Opus answers **directly** (reference question).
3. (Optional) Type `why does my count look wrong?` — Opus answers **interrogatively** (counter-question, no code).
4. Click **Submit for review**. You'll see *"Reviewing your work…"* for ~15–20 s.

### Phase 4 — the reveal (~30 s)

1. Opus asks one question about the drift. Answer: `I forgot about the capital letters.`
2. Click **Submit and finish**. Session closes.

**Narration beat:** *"That question Opus just asked wasn't accusatory. And I didn't just answer the question — the system was predicting what I'd say, before I said it. Let me show you."*

---

## Scene 3 — Live view, attention allocation (≈30 s)

Switch to **Tab C** (`/live`). Hard refresh (Cmd+Shift+R) if needed.

1. Point at **Carmen's row** (red border). Read her summary aloud: *"student wrote 'n >= 0' and 'negative inputs are handled' in the same spec — they're confused about what committing to behavior looks like, not about Fibonacci."*
2. Point at the help-requested badge.
3. Note Carmen's session is the one to intervene on — **not** the others.

**Narration beat:** *"In an 80-student lab, this is the thing I can't do manually. I cannot walk past every shoulder and guess who's productively stuck versus quietly given up. This tells me."*

---

## Scene 4 — Private reasoning (≈60 s)

Still on **Tab C**, click your just-finished session (the one at the top, yours). You'll land on `/reasoning/<sid>`.

1. **Left column** (what the student saw): your spec iterations, your code, your divergence question, your answer "I forgot about the capital letters."
2. **Right column** (what Opus was thinking):
   - Initial classification: `drift`, high confidence
   - **Predicted justification**: *"I forgot about the capital letters."*
   - Alignment: `aligned`
   - Final classification: `drift`

**Narration beat (this is the money shot):** *"Opus predicted what I would say before it asked me. When my actual answer matches the prediction, the system has evidence the student understands their own reasoning. When it diverges — and you saw that in the test suite — we surface a specific gap. That's the metacognitive signal no unit test produces."*

Back in **Tab C**, click **Carmen's row**. On her reasoning view, show that the right column has zero divergences (she hasn't gotten there) but the spec-iteration analysis shows her three rounds of trying to commit concretely. Opus called that out in the live summary.

---

## Scene 5 — Cohort narrative (≈30 s)

Switch to **Tab D** (`/cohort/vowels-demo`). The narrative loads in ~9 s.

1. Read the narrative aloud. Point to the specific recommendation.
2. Point at **most-missed dimensions** — the concrete data driving it.
3. Point at the divergence distribution bar — drift-heavy, as expected for a week_1_2 exercise that targets case-handling.

**Narration beat:** *"This is curriculum feedback grounded in cognitive telemetry. Not 'students struggled' — 'this specific exercise produces this specific drift 6 out of 8 times, here's a concrete fix.' That data does not currently exist at scale anywhere in CS education."*

---

## Closing line

*"Maieutic uses a frontier model in the opposite role it usually plays — not to generate code, but to generate structured reasoning about code the student is writing. Opus 4.7 is what makes the per-student cognitive read scale to 80 rows without collapsing into template language."*

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
