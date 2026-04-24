# Maieutic

A pedagogical IDE for CS1 programming exercises, built around three things that
don't usually fit on a coding tool's surface: the specific skills we actually
want students to develop, the signals an instructor needs to see those skills
growing, and the scale of a modern introductory programming classroom.

Claude Opus 4.7 plays the role of a structured interlocutor — **not** an
autocomplete. Opus gates student work behind an executable specification,
compares each student's code to their declared intent, and surfaces the
cognitive state of every active student to the instructor as a one-line
summary that can be acted on in five seconds.

---

## What it's for

### 1 · Students build three durable skills

- **Writing accurate specifications.** The code editor is locked until the
  student writes what the program should do in terms concrete enough to
  implement. In Phase 1 — the *spec gate* — Opus asks Socratic questions
  ("what if the input is empty?", "does this include uppercase?") until the
  spec commits to answers. The habit being trained is *pinning behavior down
  before writing code*.

- **Critical thinking for debugging their own code.** Students write in Monaco
  with autocomplete **off**. A chat panel lets them ask Opus questions while
  coding; Opus answers reference questions directly ("what's the syntax for a
  for loop over a string?") but returns counter-questions for reasoning
  questions ("why doesn't my count look right?"). The student does the
  debugging thinking; the model refuses to do it for them.

- **Noticing the gap between what was planned and what was implemented.** On
  submit, Opus compares the student's spec (and optional plan) to the code
  they wrote and surfaces any *divergences* — classified as drift, revision,
  or bug — each with a neutral question: *"In your spec you said X. In the
  code I see Y. What happened?"* Answering forces the student to see and
  articulate the difference themselves.

### 2 · Instructors can see those skills develop

- **`/live`** — a real-time dashboard, one row per active student, each with
  an Opus-generated one-sentence summary of their current cognitive state.
  Not "phase 3, 6 min idle" — *"student wrote 'n >= 0' and 'negative inputs
  are handled' in the same spec, they're confused about what committing to
  behavior looks like, not about Fibonacci."*

- **`/reasoning/[sid]`** — a per-session audit trail. Left column: what the
  student saw and wrote. Right column (instructor-only): what Opus privately
  classified, predicted the student would say, and how the student's actual
  answer aligned with that prediction. When the answer matches the
  prediction, that's evidence the student understands their own reasoning.
  When it diverges, that's a specific, named metacognitive gap.

- **`/cohort/[id]`** — per-exercise cohort narrative with a concrete
  curricular recommendation. Not "students struggled" — *"6 of 8 students
  missed `case_sensitivity` on the first spec round; consider adding it as an
  explicit dimension earlier in the unit."*

### 3 · It works at the scale of a real classroom

- **Triage at a glance.** Presence decay (`live` → `stepped_away` → `left`),
  help-request badges with timestamps, and one-line summaries let an
  instructor in an 80-student lab answer *who to help next* in seconds,
  rather than walking the room blind.

- **Exercise library with aggregates (`/cohorts`).** Every published exercise
  as a card: completion rate, divergence distribution, most-missed
  spec-gate dimension. Sortable by attempts, alphabetical, or unit.

- **Fast authoring (`/authoring`).** A plain-text problem prompt becomes
  reviewable spec-gate scaffolding in about seven seconds, with per-field
  source badges (`Opus` / `Edited` / `Added`) so the instructor keeps
  editorial control over what the gate enforces. A unit's worth of exercises
  is an afternoon, not a week.

---

## The four surfaces, mapped to the three pillars

| Surface | Pillar it serves |
|---|---|
| `/exercise/[id]` — spec gate → optional plan → code editor + chat → divergence review | **Student skill.** Spec accuracy, autonomous debugging, plan-vs-implementation self-check. |
| `/live` — SSE dashboard with one row per active student | **Classroom scale.** Triage in five seconds per row. |
| `/reasoning/[sid]` — student view vs. Opus's private reasoning | **Teacher insight.** Evidence of the student's metacognition, per session. |
| `/cohort/[id]` · `/cohorts` · `/authoring` | **Teacher insight + classroom scale.** Curricular patterns across the cohort, library of exercises, fast scaffolding. |

---

## Quick start

Prerequisites: Node 20+, `ANTHROPIC_API_KEY` in your environment.

```bash
# Install
npm install
npx prisma migrate dev --name init
npx prisma generate

# Paste your key into .env.local
#   ANTHROPIC_API_KEY=sk-ant-...

# Seed the demo fixtures (Ana/Beto/Carmen + cohort sessions)
npm run reset-demo

# Start dev server
npm run dev

# Open http://localhost:3000
```

The landing page asks the visitor whether they're a student or a teacher and
routes accordingly — no login. Students land on an exercise list grouped by
unit; teachers land on the live dashboard.

---

## Demo

Run `npm run reset-demo && npm run dev`, then walk through
[`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md). Five scenes, ~7 minutes total, each
scene mapped to one of the three pillars above.

If anything breaks: the script's failure-mode table covers the common cases.

---

## Tests

```bash
# Fast, no Opus calls
npm test

# Against real Opus (slow, costs tokens)
npm run test:opus

# End-to-end demo happy path (Playwright, ~20 s)
npm run test:e2e
```

`test:opus` covers scaffolding, intent-diff classification and prediction
register, phase-3 mode selection, and post-hoc re-classification.

---

## Stack

- Next.js 16 (app router) + React 19 + TypeScript strict
- Tailwind v4 + shadcn/ui + Monaco editor (autocomplete explicitly disabled)
- Prisma 6 + SQLite (local file, fine for MVP; Postgres swap is mechanical)
- `@anthropic-ai/sdk` (model: `claude-opus-4-7`)
- Server-Sent Events for the live dashboard (plain Route Handler + in-process
  `EventEmitter`, no Redis)
- Zod at every LLM response boundary

The full PRD, tech spec, and 7-phase execution plan are maintained separately.

---

## The seven Opus calls behind the pedagogy

Each prompt lives in `src/lib/opus/prompts/`. The first five are load-bearing
for the student-facing pedagogy; the last two drive the instructor surfaces.

| Prompt | What it does | Which pillar |
|---|---|---|
| `scaffolding.ts` | Instructor prompt → spec-gate dimensions + expected divergences + level + phase-2 flag | Classroom scale (fast authoring) |
| `spec-examiner.ts` | Student spec → Socratic questions, executability decision | Student skill · spec accuracy |
| `phase3-chat.ts` | Student chat message → mode (interrogative / direct) + response | Student skill · autonomous debugging |
| `intent-diff.ts` | Spec + plan + code → classified divergences + predicted justifications + neutrally-phrased questions | Student skill · plan-vs-implementation |
| `post-hoc.ts` | Student's answer → alignment score + possibly revised classification | Teacher insight · metacognitive signal |
| `live-summary.ts` | Session state → one sentence an instructor can act on in 5 s | Classroom scale · triage |
| `cohort-narrative.ts` | Aggregated session stats → 2–3 sentences with a concrete curricular fix | Teacher insight · curriculum patterns |

---

## What's out of scope

This is a capability demonstration, not a production system. Deferred (per
PRD §8):

- LMS / autograder / GitHub Classroom integration
- Student account system (MVP uses a dev-mode cookie)
- Per-student longitudinal trajectories across a full semester
- Buddy-system evasion detection (paste bursts, typing rhythm, stylistic
  inconsistency)
- Informed-consent flow for the private-prediction mechanism
- Data-governance framework (FERPA-equivalent retention, research use)
- Two-pass self-critique classifier (Mechanism D)
- Multi-tenant isolation

---

## Repository layout

```
maieutic/
├── DEMO_SCRIPT.md                                   ← 5-scene walkthrough
├── prisma/schema.prisma                             ← Exercise · Session · SessionEvent
├── src/
│   ├── app/                                         ← App Router pages + API routes
│   │   ├── (instructor)/{authoring,live,cohorts,cohort,reasoning}
│   │   ├── (student)/exercises · exercise/[id]
│   │   └── api/{author,session,live,cohort}/…
│   ├── components/{student,instructor,ui}
│   └── lib/
│       ├── opus/prompts/                            ← the seven prompts
│       ├── opus/client.ts · schemas.ts · summaries.ts
│       ├── sessions.ts · cohort.ts · events.ts · db.ts
├── scripts/
│   ├── capture-fixtures.ts                          ← one-shot, produces real-Opus fixtures
│   ├── replay-fixtures.ts / reset-demo.ts           ← fast DB-only replay
│   └── smoke.ts · smoke-session.ts · stop{3,4,5}-samples.ts
└── tests/
    ├── unit/{scaffolding,intent-diff}.opus.test.ts  ← Opus-hitting regression
    └── e2e/demo.spec.ts                             ← Playwright happy path
```

---

## Author

Paula Vásquez-Henríquez — Subdirectora, Ing. Civil Informática UDD
Concepción · PhD student, AI.
