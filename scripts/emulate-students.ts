// LLM-driven student emulator.
//
// Generates fake but realistic session data by having Opus play the student
// across phases 1-3. Calls the same prompt builders + sessions helpers the
// real API routes do (no HTTP), so the records it writes are
// indistinguishable from a real run as far as the dashboard is concerned.
//
// Usage:
//   npx tsx scripts/emulate-students.ts                  # 8 sessions
//   npx tsx scripts/emulate-students.ts --count 20       # 20 random sessions
//   npx tsx scripts/emulate-students.ts --matrix         # every student × every exercise
//
// Flags:
//   --count <n>          how many sessions to generate (default 8, ignored in matrix mode)
//   --matrix             run a random number of students [15..30] across every published exercise
//   --in-progress <0..1> fraction left mid-session for dashboard variety
//                        (default 0.2 — i.e. 20% don't reach phase 4)
//   --concurrency <n>    how many sessions in flight at once (default 4)

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { z } from "zod";
import { prisma } from "../src/lib/db";
import { callOpusAndParse } from "../src/lib/opus/client";
import {
  SPEC_EXAMINER_SYSTEM,
  buildSpecExaminerUserMessage,
} from "../src/lib/opus/prompts/spec-examiner";
import {
  INTENT_DIFF_SYSTEM,
  buildIntentDiffUserMessage,
} from "../src/lib/opus/prompts/intent-diff";
import {
  POST_HOC_SYSTEM,
  buildPostHocUserMessage,
} from "../src/lib/opus/prompts/post-hoc";
import {
  IntentDiffOutput,
  Phase1Data,
  Phase1Iteration,
  Phase2Data,
  PostHocOutput,
  SpecExaminerOutput,
  intentDiffOutputToDivergences,
  type Divergence,
  type ExerciseRecord,
  type StudentLevel,
} from "../src/lib/opus/schemas";
import {
  advancePhase,
  appendPhase1Iteration,
  createSession,
  finalizePhase2Code,
  getExercise,
  getSession,
  recordDivergenceResponse,
  recordFinalRevision,
  setPhase3Divergences,
  updateCurrentCode,
} from "../src/lib/sessions";
import { refreshSummaryForSession } from "../src/lib/opus/summaries";

// ─── Persona catalog ───────────────────────────────────────────────────────

interface Persona {
  id: string; // becomes part of studentId
  name: string; // first name, used in chat persona
  level: StudentLevel;
  /** One-line trait summary fed into agent prompts. */
  traits: string;
  /** Style guide for spec writing. */
  specStyle: string;
  /** Style guide for code writing. */
  codeStyle: string;
  /** Style guide for divergence answers. */
  answerStyle: string;
  /** Probability the session ends in a code revision pass (0..1). */
  revisionProbability: number;
}

const PERSONAS: Persona[] = [
  {
    id: "carlos_sloppy",
    name: "Carlos",
    level: "week_1_2",
    traits: "rushed, often misses edge cases, writes short specs",
    specStyle:
      "Keep your spec brief — three sentences or fewer. Don't try to enumerate every edge case; gloss over case sensitivity, empty input, or unusual values. You think writing more is overthinking.",
    codeStyle:
      "Write working but incomplete code. Pick ONE realistic gap to leave in: forget uppercase, forget the empty case, hard-code a small value, or off-by-one. Don't introduce more than one mistake.",
    answerStyle:
      "Answer in 1 sentence using natural learner phrases like \"I forgot,\" \"I didn't notice,\" \"I thought it was the same,\" \"I wasn't sure what to put.\" Don't invent strategic justifications you wouldn't have.",
    revisionProbability: 0.3,
  },
  {
    id: "diana_thorough",
    name: "Diana",
    level: "week_1_2",
    traits: "careful, asks herself what could go wrong before writing, writes detailed specs",
    specStyle:
      "Write a thorough spec. Mention inputs, outputs, what happens on empty input, and any case-sensitivity decisions. You'd rather be slow and right than fast.",
    codeStyle:
      "Write code that matches your spec carefully. No deliberate mistakes. If anything diverges from the spec, it's a small, defensible alternative (e.g. using a built-in instead of an explicit loop).",
    answerStyle:
      "Answer in 1-2 sentences. If you genuinely match the spec, say so calmly. If there's a real gap, walk through your reasoning honestly.",
    revisionProbability: 0.1,
  },
  {
    id: "esteban_typical",
    name: "Esteban",
    level: "week_3_6",
    traits: "average, makes occasional bugs, writes adequate specs",
    specStyle:
      "Cover the main cases. You may mention an edge case or two but don't enumerate every assumption. About 4-6 sentences.",
    codeStyle:
      "Write code that mostly works. Introduce ONE small mistake — your call whether it's a drift (forgot an edge), bug (off-by-one or wrong return type), or revision (decided to use a list comprehension instead of a loop you described).",
    answerStyle:
      "Answer in 1-2 sentences. Mix of partial reasoning (\"I think...\") and honest gaps (\"I forgot to...\"). Sometimes you can defend a choice, sometimes you missed something.",
    revisionProbability: 0.4,
  },
  {
    id: "fernanda_strategic",
    name: "Fernanda",
    level: "week_7_plus",
    traits: "experienced, thinks in trade-offs, often revises mid-task to use Pythonic shortcuts",
    specStyle:
      "Write a precise spec — types, contracts, edge cases. You'd write a docstring this way.",
    codeStyle:
      "Implement the spec correctly, but use Pythonic idioms (any(), generator expressions, dict comprehensions, max with key=) even if your spec described a more verbose approach. The result satisfies the spec; the path differs.",
    answerStyle:
      "Defend your code with trade-off reasoning: complexity, readability, idiomatic use, performance for realistic inputs. 1-2 sentences.",
    revisionProbability: 0.2,
  },
  {
    id: "gerardo_overconfident",
    name: "Gerardo",
    level: "week_7_plus",
    traits: "experienced but overconfident, occasionally has subtle off-by-one or boundary bugs",
    specStyle:
      "Write a thorough spec — you cover edge cases methodically because you've been burned before.",
    codeStyle:
      "Write reasonable, advanced-looking code, but introduce ONE subtle bug: an off-by-one, an inverted boolean, a wrong default, or a boundary condition. You don't notice it.",
    answerStyle:
      "Start defensive (\"I think this is correct because...\") and then in the same answer realize the issue. 2 sentences.",
    revisionProbability: 0.5,
  },
];

function randomFrom<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

function randomInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

// ─── Per-session flavor (varies behaviour beyond the persona) ──────────────

interface SessionFlavor {
  mood: string;
  approach: string;
  preparedness: string;
}

const MOODS = [
  "rushed and just wanting to finish",
  "methodical, working through it step by step",
  "distracted, half paying attention",
  "energized, trying out new ideas",
  "tired but pushing through",
  "second-guessing every choice",
  "confident — maybe a bit overconfident",
  "curious about whether you can solve it cleverly",
];

const APPROACHES = [
  "default to an explicit for loop",
  "reach for a list or dict comprehension if it fits",
  "use a built-in like sum(), max(), any(), or sorted() if you remember one that fits",
  "use string methods (.split(), .lower(), .strip(), .replace()) where they help",
  "use range() if you need indices",
  "lean on simple if/else over fancier control flow",
  "use a while loop over a for loop when it feels natural",
];

const PREPAREDNESSES = [
  "you're writing the spec as a first draft, not editing it",
  "you reread your spec once before submitting",
  "you reread and edited your spec for precision",
  "you talked the problem through to yourself before writing",
  "you skimmed the prompt and started typing immediately",
];

function randomFlavor(): SessionFlavor {
  return {
    mood: randomFrom(MOODS),
    approach: randomFrom(APPROACHES),
    preparedness: randomFrom(PREPAREDNESSES),
  };
}

function flavorBlock(f: SessionFlavor): string {
  return `TODAY: you are ${f.mood}. For coding, ${f.approach}. As for spec writing, ${f.preparedness}.`;
}

// ─── Agent prompts ─────────────────────────────────────────────────────────

const STUDENT_SYSTEM = `You are role-playing a CS1 (introductory programming) student in a pedagogical
IDE. You will be given a persona — a name, level, and stylistic traits — and a
task. Stay strictly in character. Do not break the fourth wall. Do not explain
that you are an LLM or that you are simulating. Write as the student would write.

The output schema for each task is given in the user turn. Output ONLY the JSON,
no preamble, no markdown fences.`;

function personaBlock(p: Persona): string {
  return `PERSONA:
- Name: ${p.name}
- Level: ${p.level}
- Traits: ${p.traits}`;
}

const SpecOutput = z.object({ spec: z.string().min(1) });
const CodeOutput = z.object({ code: z.string().min(1) });
const AnswerOutput = z.object({ answer: z.string().min(1) });
const ReviseDecisionOutput = z.object({
  revise: z.boolean(),
  // Only used when revise=true
  revisedCode: z.string().optional(),
});

async function agentWriteSpec(
  persona: Persona,
  flavor: SessionFlavor,
  exercise: ExerciseRecord,
  priorRound: { specText: string; questions: string[]; gapsStillOpen: string[] } | null,
): Promise<string> {
  const priorBlock = priorRound
    ? `Your previous spec was:
"""
${priorRound.specText}
"""

The instructor's checker said gaps still open: [${priorRound.gapsStillOpen.join(", ") || "—"}].
Their follow-up questions:
${priorRound.questions.map((q) => `  - ${q}`).join("\n")}

Revise your spec to address some or all of these. Stay in character — a sloppy
student may only address one or two; a thorough student addresses all.`
    : "Write your initial specification.";

  const out = await callOpusAndParse({
    promptName: "emulate-students:write-spec",
    system: STUDENT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `${personaBlock(persona)}

STYLE: ${persona.specStyle}

${flavorBlock(flavor)}

EXERCISE PROMPT:
"""
${exercise.instructorPromptText}
"""

${priorBlock}

Output: { "spec": "<your spec text>" }`,
      },
    ],
    maxTokens: 1024,
    schema: SpecOutput,
  });
  return out.spec;
}

async function agentWriteCode(
  persona: Persona,
  flavor: SessionFlavor,
  exercise: ExerciseRecord,
  finalSpecText: string,
): Promise<string> {
  const out = await callOpusAndParse({
    promptName: "emulate-students:write-code",
    system: STUDENT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `${personaBlock(persona)}

STYLE: ${persona.codeStyle}

${flavorBlock(flavor)}

EXERCISE PROMPT:
"""
${exercise.instructorPromptText}
"""

YOUR ACCEPTED SPEC:
"""
${finalSpecText}
"""

Write the Python implementation. The code should be runnable as a top-level
script (use input() / print()) unless the spec clearly describes a function.

Output: { "code": "<python code>" }`,
      },
    ],
    maxTokens: 1024,
    schema: CodeOutput,
  });
  return out.code;
}

async function agentAnswerDivergence(
  persona: Persona,
  flavor: SessionFlavor,
  exercise: ExerciseRecord,
  question: string,
  finalSpecText: string,
  finalCode: string,
): Promise<string> {
  const out = await callOpusAndParse({
    promptName: "emulate-students:answer-divergence",
    system: STUDENT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `${personaBlock(persona)}

STYLE: ${persona.answerStyle}

${flavorBlock(flavor)}

EXERCISE: ${exercise.instructorPromptText}

YOUR SPEC:
"""
${finalSpecText}
"""

YOUR CODE:
"""
${finalCode}
"""

QUESTION FROM THE TUTOR:
"""
${question}
"""

Answer in your own voice, in character. Don't stage-direct.

Output: { "answer": "<your answer>" }`,
      },
    ],
    maxTokens: 512,
    schema: AnswerOutput,
  });
  return out.answer;
}

async function agentReviseCodeDecision(
  persona: Persona,
  exercise: ExerciseRecord,
  finalSpecText: string,
  originalCode: string,
  divergenceQAs: { question: string; answer: string }[],
): Promise<{ revise: boolean; revisedCode?: string }> {
  // For simplicity bias toward the persona's revisionProbability — but still
  // give the agent the choice based on what came up in the divergences.
  const seedDecision = Math.random() < persona.revisionProbability;
  if (!seedDecision) return { revise: false };

  const out = await callOpusAndParse({
    promptName: "emulate-students:revise-decision",
    system: STUDENT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `${personaBlock(persona)}

You have just finished answering divergence questions about your code. You can
optionally revise your code now to address the gaps before finishing. Your
original answers stay on record either way.

EXERCISE: ${exercise.instructorPromptText}

YOUR SPEC:
"""
${finalSpecText}
"""

YOUR ORIGINAL CODE:
"""
${originalCode}
"""

DIVERGENCE Q&A:
${divergenceQAs.map((q, i) => `Q${i + 1}: ${q.question}\nA${i + 1}: ${q.answer}`).join("\n\n")}

If you would, in character, revise the code to fix the gaps now, output the
revised code. If you'd leave it as-is, output revise=false.

Output: { "revise": true | false, "revisedCode": "<code if revising>" }`,
      },
    ],
    maxTokens: 1024,
    schema: ReviseDecisionOutput,
  });
  if (!out.revise || !out.revisedCode) return { revise: false };
  return { revise: true, revisedCode: out.revisedCode };
}

// ─── Phase orchestrators ───────────────────────────────────────────────────

const MAX_SPEC_ROUNDS = 4;

async function runSpecExaminer(
  exercise: ExerciseRecord,
  sessionId: string,
  specText: string,
): Promise<Phase1Iteration> {
  const session = await getSession(sessionId);
  const priorIterations = Phase1Data.parse(session.phase1Data).iterations;
  const examiner = await callOpusAndParse({
    promptName: "emulate-students:spec-examiner",
    system: SPEC_EXAMINER_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildSpecExaminerUserMessage(exercise, priorIterations, specText),
      },
    ],
    maxTokens: 1024,
    schema: SpecExaminerOutput,
  });
  const iter: Phase1Iteration = {
    timestamp: new Date().toISOString(),
    studentSpecText: specText,
    opusQuestions: examiner.questions,
    gapsIdentified: examiner.gaps_still_open,
    gapsAddressedThisRound: examiner.gaps_addressed,
    emergentGaps: examiner.emergent_gaps,
    passed: examiner.gaps_still_open.length === 0,
  };
  await appendPhase1Iteration(sessionId, iter);
  return iter;
}

async function runPhase1(
  persona: Persona,
  flavor: SessionFlavor,
  exercise: ExerciseRecord,
  sessionId: string,
): Promise<{ passed: boolean; finalSpecText: string }> {
  let priorRound: { specText: string; questions: string[]; gapsStillOpen: string[] } | null = null;
  for (let round = 1; round <= MAX_SPEC_ROUNDS; round++) {
    const specText = await agentWriteSpec(persona, flavor, exercise, priorRound);
    const iter = await runSpecExaminer(exercise, sessionId, specText);
    console.log(
      `    spec round ${round}: passed=${iter.passed}, open=[${iter.gapsIdentified.join(", ")}]`,
    );
    if (iter.passed) {
      return { passed: true, finalSpecText: specText };
    }
    priorRound = {
      specText,
      questions: iter.opusQuestions,
      gapsStillOpen: iter.gapsIdentified,
    };
  }
  // Didn't close — return the last attempt as the "spec" so phase 2 can run.
  // The session record remains in phase 1 and counts as "stuck" on the dashboard.
  return { passed: false, finalSpecText: priorRound?.specText ?? "" };
}

async function runPhase2(
  persona: Persona,
  flavor: SessionFlavor,
  exercise: ExerciseRecord,
  sessionId: string,
  finalSpecText: string,
): Promise<{ divergenceCount: number }> {
  const code = await agentWriteCode(persona, flavor, exercise, finalSpecText);
  await updateCurrentCode(sessionId, code);
  await finalizePhase2Code(sessionId, code);

  const session = await getSession(sessionId);
  const phase1 = Phase1Data.parse(session.phase1Data);
  const phase2 = Phase2Data.parse(session.phase2Data);

  const diff = await callOpusAndParse({
    promptName: "emulate-students:intent-diff",
    system: INTENT_DIFF_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildIntentDiffUserMessage({
          exercise,
          phase1,
          phase2,
        }),
      },
    ],
    maxTokens: 4096,
    schema: IntentDiffOutput,
  });
  const divergences = intentDiffOutputToDivergences(diff);
  await setPhase3Divergences(sessionId, divergences);
  console.log(
    `    intent-diff: ${divergences.length} divergence(s) [${divergences.map((d) => d.initialClassification).join(",")}]`,
  );

  if (divergences.length === 0) {
    // Auto-close — no questions to answer.
    await advancePhase(sessionId, 4);
  } else {
    await advancePhase(sessionId, 3);
  }
  return { divergenceCount: divergences.length };
}

async function runPhase3(
  persona: Persona,
  flavor: SessionFlavor,
  exercise: ExerciseRecord,
  sessionId: string,
  finalSpecText: string,
  finalCode: string,
  divergences: Divergence[],
): Promise<{ qa: { question: string; answer: string }[] }> {
  const qa: { question: string; answer: string }[] = [];
  for (const d of divergences) {
    const answer = await agentAnswerDivergence(
      persona,
      flavor,
      exercise,
      d.studentFacingQuestion,
      finalSpecText,
      finalCode,
    );
    const postHoc = await callOpusAndParse({
      promptName: "emulate-students:post-hoc",
      system: POST_HOC_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildPostHocUserMessage({
            studentLevel: exercise.studentLevel,
            initialClassification: d.initialClassification,
            predictedJustification: d.predictedJustification,
            studentResponse: answer,
          }),
        },
      ],
      maxTokens: 512,
      schema: PostHocOutput,
    });
    await recordDivergenceResponse(
      sessionId,
      d.divergenceId,
      answer,
      postHoc.alignment,
      postHoc.final_classification,
      postHoc.final_classification_reason,
    );
    qa.push({ question: d.studentFacingQuestion, answer });
  }
  return { qa };
}

async function runFinalRevision(
  persona: Persona,
  exercise: ExerciseRecord,
  sessionId: string,
  finalSpecText: string,
  finalCode: string,
  qa: { question: string; answer: string }[],
): Promise<void> {
  const decision = await agentReviseCodeDecision(
    persona,
    exercise,
    finalSpecText,
    finalCode,
    qa,
  );
  if (decision.revise && decision.revisedCode) {
    await recordFinalRevision(sessionId, decision.revisedCode);
    console.log(`    revision: revised`);
  } else {
    await recordFinalRevision(sessionId, null);
    console.log(`    revision: skipped`);
  }
  await advancePhase(sessionId, 4);
}

// ─── Whole-session orchestrator ────────────────────────────────────────────

async function emulateOneSession(
  persona: Persona,
  exercise: ExerciseRecord,
  studentId: string,
  options: { stopAfterPhase: 1 | 2 | 3 | 4 } = { stopAfterPhase: 4 },
): Promise<string> {
  // stopAfterPhase semantics:
  //   1 → leave in phase 1 (spec still has open gaps)
  //   2 → leave actively in phase 2 (spec accepted, no code submitted)
  //   3 → leave in phase 3 (code submitted, divergences answered, no revision)
  //   4 → completed
  const flavor = randomFlavor();
  const session = await createSession(exercise.id, studentId);
  console.log(
    `  → ${session.id.slice(0, 8)} · ${persona.name} · ${exercise.id} · stop=${options.stopAfterPhase}`,
  );

  const phase1 = await runPhase1(persona, flavor, exercise, session.id);
  if (!phase1.passed || options.stopAfterPhase < 2) {
    await refreshSummaryForSession(session.id);
    return session.id;
  }
  await advancePhase(session.id, 2);

  if (options.stopAfterPhase < 3) {
    await refreshSummaryForSession(session.id);
    return session.id;
  }
  const phase2 = await runPhase2(persona, flavor, exercise, session.id, phase1.finalSpecText);
  if (phase2.divergenceCount === 0) {
    await refreshSummaryForSession(session.id);
    return session.id;
  }

  const reloaded = await getSession(session.id);
  const reloadedPhase2 = Phase2Data.parse(reloaded.phase2Data);
  const reloadedPhase3 = (reloaded.phase3Data as { divergences: Divergence[] }) ?? { divergences: [] };

  const phase3 = await runPhase3(
    persona,
    flavor,
    exercise,
    session.id,
    phase1.finalSpecText,
    reloadedPhase2.finalCode ?? reloadedPhase2.currentCode,
    reloadedPhase3.divergences,
  );

  if (options.stopAfterPhase < 4) {
    await refreshSummaryForSession(session.id);
    return session.id;
  }
  await runFinalRevision(
    persona,
    exercise,
    session.id,
    phase1.finalSpecText,
    reloadedPhase2.finalCode ?? reloadedPhase2.currentCode,
    phase3.qa,
  );
  await refreshSummaryForSession(session.id);
  return session.id;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 8;
  let matrix = false;
  let demoSpread = false;
  let inProgress = 0.2;
  let concurrency = 4;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) {
      count = parseInt(args[++i], 10);
    } else if (args[i] === "--matrix") {
      matrix = true;
    } else if (args[i] === "--demo-spread") {
      demoSpread = true;
    } else if (args[i] === "--in-progress" && args[i + 1]) {
      inProgress = parseFloat(args[++i]);
    } else if (args[i] === "--concurrency" && args[i + 1]) {
      concurrency = parseInt(args[++i], 10);
    }
  }
  if (Number.isNaN(count) || count < 1) throw new Error("invalid --count");
  if (Number.isNaN(inProgress) || inProgress < 0 || inProgress > 1) {
    throw new Error("invalid --in-progress (must be 0..1)");
  }
  if (Number.isNaN(concurrency) || concurrency < 1) {
    throw new Error("invalid --concurrency");
  }
  return { count, matrix, demoSpread, inProgress, concurrency };
}

interface PlannedSession {
  persona: Persona;
  studentId: string;
  exerciseId: string;
  stopAfterPhase: 1 | 2 | 3 | 4;
}

function pickStopPhase(inProgress: number): 1 | 2 | 3 | 4 {
  if (Math.random() >= inProgress) return 4;
  const r = Math.random();
  if (r < 1 / 3) return 1;
  if (r < 2 / 3) return 2;
  return 3;
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<void> {
  const idx = { value: 0 };
  async function worker() {
    while (idx.value < tasks.length) {
      const i = idx.value++;
      try {
        await tasks[i]();
      } catch (err) {
        console.error(
          `  ! task ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

async function main() {
  const { count, matrix, demoSpread, inProgress, concurrency } = parseArgs();

  const exerciseRows = await prisma.exercise.findMany({
    where: { publishedAt: { not: null } },
    select: { id: true },
    orderBy: { publishedAt: "asc" },
  });
  if (exerciseRows.length === 0) {
    throw new Error("No published exercises in DB. Run scripts/restore-exercises.ts first.");
  }

  // Build the session plan.
  const planned: PlannedSession[] = [];
  if (demoSpread) {
    // Deterministic spread for the live dashboard demo. Bug-prone personas
    // are paired with edge-case-rich exercises for stop=3 so phase-2
    // intent-diff is likely to find divergences (otherwise the session
    // auto-advances to phase 4 and disappears from the dashboard). Three
    // stop=3 attempts hedge against intent-diff occasionally returning 0
    // divergences.
    const seed: Array<{ stop: 1 | 2 | 3; personaId: string; exerciseId: string }> = [
      { stop: 1, personaId: "carlos_sloppy", exerciseId: "vowels-demo" },
      { stop: 1, personaId: "gerardo_overconfident", exerciseId: "password-demo" },
      { stop: 2, personaId: "diana_thorough", exerciseId: "fibonacci-demo" },
      { stop: 2, personaId: "esteban_typical", exerciseId: "count-down-from-n" },
      { stop: 3, personaId: "carlos_sloppy", exerciseId: "palindrome-check" },
      { stop: 3, personaId: "gerardo_overconfident", exerciseId: "find-duplicates" },
      { stop: 3, personaId: "carlos_sloppy", exerciseId: "most-common-word" },
    ];
    const exerciseIds = new Set(exerciseRows.map((e) => e.id));
    console.log(`Demo-spread mode: ${seed.length} sessions, deterministic phase distribution.`);
    for (const s of seed) {
      const persona = PERSONAS.find((p) => p.id === s.personaId);
      if (!persona) throw new Error(`unknown persona: ${s.personaId}`);
      if (!exerciseIds.has(s.exerciseId)) {
        throw new Error(`exercise not published: ${s.exerciseId}`);
      }
      planned.push({
        persona,
        studentId: `${persona.id}_${Math.random().toString(36).slice(2, 8)}`,
        exerciseId: s.exerciseId,
        stopAfterPhase: s.stop,
      });
    }
  } else if (matrix) {
    const studentCount = randomInt(15, 30);
    console.log(
      `Matrix mode: ${studentCount} students × ${exerciseRows.length} exercises = ${studentCount * exerciseRows.length} sessions.`,
    );
    for (let s = 0; s < studentCount; s++) {
      const persona = randomFrom(PERSONAS);
      const slug = Math.random().toString(36).slice(2, 8);
      const studentId = `${persona.id}_${slug}`;
      for (const ex of exerciseRows) {
        planned.push({
          persona,
          studentId,
          exerciseId: ex.id,
          stopAfterPhase: pickStopPhase(inProgress),
        });
      }
    }
  } else {
    console.log(
      `Random mode: ${count} sessions, ${Math.round(inProgress * 100)}% left in-progress.`,
    );
    for (let i = 0; i < count; i++) {
      const persona = randomFrom(PERSONAS);
      planned.push({
        persona,
        studentId: `${persona.id}_${Math.random().toString(36).slice(2, 8)}`,
        exerciseId: randomFrom(exerciseRows).id,
        stopAfterPhase: pickStopPhase(inProgress),
      });
    }
  }

  console.log(
    `Concurrency=${concurrency}. Starting ${planned.length} sessions.\n`,
  );
  const t0 = Date.now();

  // Cache exercises once instead of fetching per session.
  const exerciseCache = new Map<string, ExerciseRecord>();
  for (const row of exerciseRows) {
    exerciseCache.set(row.id, await getExercise(row.id));
  }

  let completed = 0;
  const tasks = planned.map((p, i) => async () => {
    const exercise = exerciseCache.get(p.exerciseId)!;
    console.log(`[${i + 1}/${planned.length}] start ${p.persona.id} · ${p.exerciseId} · stop=${p.stopAfterPhase}`);
    await emulateOneSession(p.persona, exercise, p.studentId, {
      stopAfterPhase: p.stopAfterPhase,
    });
    completed++;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`     done ${completed}/${planned.length} (${elapsed}s elapsed)`);
  });

  await runWithConcurrency(tasks, concurrency);

  const totalMin = ((Date.now() - t0) / 60_000).toFixed(1);
  console.log(`\nDone. ${completed}/${planned.length} sessions in ${totalMin} min.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
