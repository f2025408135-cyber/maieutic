# 🪞 Maieutic

Maieutic flips the role an LLM usually plays in learning to program. Instead
of handing the student working code, it guides them to think first about what
the program should do — the specification — before they write a single line.
When the code is done, the student has to explain the differences between
what they said they'd do and what they actually wrote.

This is built on a bet about how programming is changing. Writing code from
scratch matters less than it used to; specifying behavior precisely, reading
code critically, and noticing the gap between intent and output matter more.
Those are the skills Maieutic trains.

Along the way it surfaces a kind of learning signal that's normally invisible
to an instructor: not just whether the code passes the tests, but whether the
student can explain *why* their code does what it does, where they drifted
from their own spec, and whether they can say why. That's what a teacher needs
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

- **Noticing the gap between spec and implementation.** When the student
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
  wrote — the specs, the code, the answer to the divergence question. On the
  right (and only visible to the instructor) what the system
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

## Quick start

Prerequisites: Node 20+ and an Anthropic API key.

```bash
# Install
npm install

# Copy the env template and paste in your key
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# Apply migrations and generate the Prisma client
npx prisma migrate dev

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

## Stack

- Next.js 16 (app router) + React 19 + TypeScript strict
- Tailwind v4 + shadcn/ui + Monaco editor (autocomplete explicitly disabled)
- Prisma 6 + SQLite (local file, fine for MVP; Postgres swap is mechanical)
- `@anthropic-ai/sdk` (model: `claude-opus-4-7`)
- Server-Sent Events for the live dashboard (plain Route Handler + in-process
  `EventEmitter`, no Redis)
- Zod at every LLM response boundary

---

## What Opus does

Opus is called at seven moments in a student's and a teacher's experience.
Each one is a carefully-prompted conversation — not a code-generation — and
the prompts themselves live in `src/lib/opus/prompts/` for anyone who wants
to read them.

**Three serve the student's skill development.**

- When the student submits a specification, Opus reads it and asks the
  questions an experienced implementer would obviously ask, until the spec
  actually answers them.
- When the student chats with Opus while coding, Opus decides turn by turn
  whether the question is a reference one (syntax — answered directly) or a
  reasoning one (their own logic — answered with a counter-question).
- When the student submits their code, Opus compares it to the specification
  and writes a neutral question about any place the two don't line up.

**Three serve the teacher's view of student learning.**

- A one-sentence live summary of where each active student actually is in
  their thinking, regenerated whenever anything changes in the session.
- After the student answers the final divergence question, Opus compares
  their answer with what it had privately predicted they would say, and
  refines its classification — this is the signal that tells the teacher
  whether the student can explain their own code.
- After a cohort has worked through an exercise, Opus reads all of the
  session data and writes a short narrative with a concrete curricular
  suggestion.

**One serves classroom scale.**

- When the instructor types a plain-text problem prompt, Opus returns the
  specification scaffolding they can review and publish — seconds, not hours.

---

## Author

Paula Vásquez-Henríquez — PhD Student in AI · Deputy Director, Computer
Science program at Universidad del Desarrollo, Concepción, Chile.
