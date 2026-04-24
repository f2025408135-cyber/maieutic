# Maieutic

Maieutic flips the role an LLM usually plays in learning to program. Instead
of handing the student working code, it guides them to think first about what
the program should do and how they'll build it — the specification and the
plan — before they write a single line. When the code is done, the student
has to explain the differences between what they said they'd do and what they
actually wrote.

This is built on a bet about how programming is changing. Writing code from
scratch matters less than it used to; specifying behavior precisely, reading
code critically, and noticing the gap between intent and output matter more.
Those are the skills Maieutic trains.

Along the way it surfaces a kind of learning signal that's normally invisible
to an instructor: not just whether the code passes the tests, but whether the
student can explain *why* their code does what it does, where they drifted
from their own plan, and whether they can say why. That's what a teacher needs
to see individual students develop — and it's nearly impossible to capture by
hand in a lab with eighty students.

---

## What it's for

### 1 · Students build three durable skills

- **Writing accurate specifications.** Before writing any code, the student
  has to describe what the program should do — clearly enough that someone
  else could implement it. Opus reads the description and asks the obvious
  questions the student left unanswered: *what if the input is empty? should
  uppercase letters count?* The editor stays locked until the spec answers
  them. The habit: describe the behavior first, write the code second.

- **Critical thinking for debugging their own code.** Students write in Monaco
  with autocomplete **off**. A chat panel lets them ask Opus questions while
  coding; Opus answers reference questions directly ("what's the syntax for a
  for loop over a string?") but returns counter-questions for reasoning
  questions ("why doesn't my count look right?"). The debugging thinking
  stays with the student.

- **Noticing the gap between plan and implementation.** When the student
  submits, Opus compares what they said they'd do with what they actually
  wrote. Wherever the two don't line up, it points the difference out as a
  neutral question — *"In your spec you said X. In the code I see Y. What
  happened?"* The skill: reading your own code critically against your own
  intent, and being able to explain where it diverged, and why.

### 2 · Instructors can see those skills develop

- **A live class dashboard.** One row per active student, each with a plain
  one-sentence summary of where the student actually is in their thinking —
  not *"phase 3, 6 minutes idle"* but *"the student wrote 'n >= 0' and
  'negative inputs are handled' in the same spec; they're confused about what
  committing to behavior looks like, not about Fibonacci."* The dashboard is
  there so the instructor can tell, at a glance, who's productively stuck and
  who needs help now.

- **A per-session view of one student's reasoning.** For any session, the
  teacher can open a two-column view: on the left, everything the student
  wrote — the specs, the plan, the code, the answer to the divergence
  question. On the right (and only visible to the instructor) what the system
  understood about that student: what it predicted they would say, how their
  actual answer compared, and where it points to a genuine understanding
  versus a gap the student hasn't closed yet. This is how a teacher gets
  evidence of whether a student can explain their own code, not just
  whether it runs.

- **A cohort-level read of a whole exercise.** After a class has worked
  through a problem, the teacher can see a short narrative of how the cohort
  did — which dimensions most students missed on the first spec, which kinds
  of divergences showed up repeatedly, and a concrete suggestion for what to
  change. Not *"students struggled"* but *"six of eight students missed
  case-sensitivity on their first spec; consider introducing it as an
  explicit dimension earlier in the unit."*

### 3 · It works at the scale of a real classroom

- **A library of the teacher's exercises with aggregate results.** Every
  published exercise appears as a card showing how many students tried it,
  how many finished, which parts of the specification were missed most
  often, and how the divergences distributed. Useful for deciding what to
  reuse, what to retire, and where the curriculum needs more scaffolding.

- **Fast authoring.** The instructor types a plain-text problem prompt and
  gets back the scaffolding a student's specification will have to answer —
  reviewable, editable field by field, with each suggestion labeled so the
  teacher keeps editorial control. A unit's worth of exercises is an
  afternoon, not a week.

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
