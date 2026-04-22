# Maieutic

A pedagogical IDE that uses Claude Opus 4.7 as a structured interlocutor for CS1
programming exercises — **not** as an autocomplete. Opus gates student work
behind an executable specification, compares each student's code to their
declared intent, and surfaces the cognitive state of every active student to
the instructor as a one-line summary that can be acted on in five seconds.

Built for the Anthropic Builder Hackathon. MVP-scope, single-process,
local-dev only.

---

## What this is

Four working surfaces:

- **`/authoring`** — instructors write a plain-text exercise prompt; Opus
  generates concrete spec-gate scaffolding the instructor reviews and
  publishes.
- **`/exercise/[id]`** — students iterate a specification with Opus until it's
  executable, optionally declare an implementation plan, write code with
  autocomplete off, and answer neutrally-phrased questions about any
  divergences between what they said and what they wrote.
- **`/live`** — real-time instructor dashboard showing one row per active
  student with an Opus-generated cognitive summary, refreshed every 90 s and
  on every state change via Server-Sent Events.
- **`/cohort/[id]` · `/reasoning/[sid]`** — per-exercise cohort narrative
  with a concrete curricular recommendation, plus a side-by-side view of
  what the student saw next to Opus's private classification / prediction
  / alignment reasoning for any session.

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

# Seed the demo fixtures (Ana/Beto/Carmen + 4 cohort sessions)
npm run reset-demo

# Start dev server
npm run dev

# Open http://localhost:3000
```

---

## Demo

Run `npm run reset-demo && npm run dev`, then walk through
[`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md). Five scenes, ~7 minutes total.

If anything breaks: the script's failure-mode table at the bottom covers the
common cases.

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

See [`tech-spec.md`](../tech-spec.md) for the full architectural breakdown and
[`prd.md`](../prd.md) for the MVP contract.

---

## The five load-bearing Opus prompts

Each lives in `src/lib/opus/prompts/`:

| Prompt | What it does | Why frontier reasoning matters |
|---|---|---|
| `scaffolding.ts` | Instructor prompt → spec-gate dimensions + expected divergences + level + phase-2 flag | Dimension count proportional to complexity; every dimension concrete; vague prompts get a quality note |
| `spec-examiner.ts` | Student spec → Socratic questions, executability decision | Commitment-by-omission reading; level-calibrated question count (1–4); emergent gaps don't block the gate once the floor is met |
| `phase3-chat.ts` | Student chat message → mode (interrogative / direct) + response | Distinguishes reference questions from disguised implementation requests per message |
| `intent-diff.ts` | Spec + plan + code → classified divergences + predicted student justifications + neutrally-phrased questions | Revision-bias on ambiguous cases; predictions calibrated to level ("forgot" at week_1_2, strategy reasoning at week_7_plus) |
| `post-hoc.ts` | Student's answer → alignment score + possibly revised classification | Coherent justification → final=revision regardless of initial; "I don't know" at week_1_2 is valid signal |

Plus two instructor-facing prompts:

- `live-summary.ts` — one sentence an instructor can act on in 5 s.
- `cohort-narrative.ts` — 2–3 sentences naming a concrete pattern and a
  concrete curricular fix, never "students struggled."

---

## What's out of scope (deferred per PRD §8)

- LMS / autograder / GitHub Classroom integration
- Student account system (MVP uses a dev-mode cookie)
- Per-student longitudinal trajectories across a full semester
- Buddy-system evasion detection (paste bursts, typing rhythm, stylistic
  inconsistency)
- Informed-consent flow for the private-prediction mechanism
- Data-governance framework (FERPA-equivalent retention, research use)
- Two-pass self-critique classifier (Mechanism D)
- Multi-tenant isolation

This is a capability demonstration, not a production system.

---

## Repository layout

```
maieutic/
├── prd.md / tech-spec.md / project-description.md  ← design documents (parent dir)
├── execution-plan.md                                ← the 7-phase build plan
├── DEMO_SCRIPT.md                                   ← 5-scene walkthrough
├── prisma/schema.prisma
├── src/
│   ├── app/                                         ← App Router pages + API routes
│   │   ├── (instructor)/{authoring,live,cohort,reasoning}
│   │   ├── (student)/exercise/[id]
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
