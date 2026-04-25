// scripts/capture-fixtures.ts — run the full Maieutic loop against real Opus
// for three demo students + a few cohort-fill sessions, and write JSON
// fixtures to tests/fixtures/{exercises,sessions}/.
//
// Run once (costs ~10 minutes of Opus time). Replay the fixtures via
// `npm run reset-demo` for the actual demo.
//
// Faithful to Tech Spec §10: fixtures are produced by running real sessions
// through the real system, not synthesized.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { callOpusAndParse } from "../src/lib/opus/client";
import {
  SCAFFOLDING_SYSTEM,
  buildScaffoldingUserMessage,
} from "../src/lib/opus/prompts/scaffolding";
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
  PostHocOutput,
  ScaffoldingOutput,
  SpecExaminerOutput,
  intentDiffOutputToDivergences,
  scaffoldingOutputToAuthoringFields,
  type Divergence,
  type ExerciseRecord,
  type StudentLevel,
} from "../src/lib/opus/schemas";
import {
  advancePhase,
  appendHelpRequest,
  appendPhase1Iteration,
  createExercise,
  createSession,
  finalizePhase2Code,
  getExercise,
  getSession,
  recordDivergenceResponse,
  setPhase3Divergences,
} from "../src/lib/sessions";
import { refreshSummaryForSession } from "../src/lib/opus/summaries";

const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures");

async function wipe() {
  await prisma.sessionEvent.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.exercise.deleteMany({});
}

// ─── Scaffolding + publish one exercise via real Opus ─────────────────────
async function publishExerciseViaScaffolding(args: {
  id: string;
  title: string;
  prompt: string;
  levelOverride?: StudentLevel;
}): Promise<ExerciseRecord> {
  console.log(`\n[scaffolding] ${args.id} — "${args.title}"`);
  const scaffolding = await callOpusAndParse({
    promptName: "capture-fixtures:scaffolding",
    system: SCAFFOLDING_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildScaffoldingUserMessage(args.prompt, args.title),
      },
    ],
    maxTokens: 4096,
    schema: ScaffoldingOutput,
  });
  const fields = scaffoldingOutputToAuthoringFields(scaffolding);
  const ex = await createExercise({
    id: args.id,
    title: args.title,
    instructorPromptText: args.prompt,
    ...fields,
    // Overrides: for Fibonacci, force level=week_3_6 even if Opus says
    // otherwise so Carmen is on-level. For fixtures we own the mapping.
    ...(args.levelOverride
      ? { studentLevel: args.levelOverride, opusGeneratedStudentLevel: args.levelOverride }
      : {}),
  });
  console.log(
    `  ✓ published with ${fields.specGateDimensions.length} dimensions, level=${fields.studentLevel}`,
  );
  void ex;
  return getExercise(args.id);
}

// ─── Spec iteration helper (real Opus) ────────────────────────────────────
async function runSpecIteration(
  sessionId: string,
  exercise: ExerciseRecord,
  specText: string,
): Promise<{ iter: Phase1Iteration; raw: ReturnType<typeof SpecExaminerOutput.parse> }> {
  const session = await getSession(sessionId);
  const priorIterations = Phase1Data.parse(session.phase1Data).iterations;
  const examiner = await callOpusAndParse({
    promptName: "capture-fixtures:spec-examiner",
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
  return { iter, raw: examiner };
}

// ─── Ana — week_1_2 vowels drift (closed) ─────────────────────────────────
async function captureAna(vowels: ExerciseRecord) {
  console.log("\n[ana] week_1_2 / vowels drift");
  const session = await createSession(vowels.id, "ana_student");
  const { iter: r1 } = await runSpecIteration(
    session.id,
    vowels,
    "The function counts vowels in a string.",
  );
  console.log(`  round 1: passed=${r1.passed}, open=[${r1.gapsIdentified.join(", ")}]`);
  const { iter: r2 } = await runSpecIteration(
    session.id,
    vowels,
    "The function takes a string and returns how many vowels are in it (both lowercase a,e,i,o,u and uppercase A,E,I,O,U). 'y' is not a vowel. If the string is empty, return 0.",
  );
  console.log(`  round 2: passed=${r2.passed}, open=[${r2.gapsIdentified.join(", ")}]`);
  if (!r2.passed) throw new Error("ana spec didn't close in 2 rounds; tighten the spec");
  await advancePhase(session.id, 2);

  const droppedCode = `def count_vowels(s):
    count = 0
    for c in s:
        if c in 'aeiou':
            count = count + 1
    return count
`;
  await finalizePhase2Code(session.id, droppedCode);

  // Intent-diff
  const phase2 = { opusExchanges: [], revisions: [], currentCode: droppedCode, finalCode: droppedCode, submittedAt: new Date().toISOString() };
  const diff = await callOpusAndParse({
    promptName: "capture-fixtures:intent-diff",
    system: INTENT_DIFF_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildIntentDiffUserMessage({
          exercise: vowels,
          phase1: Phase1Data.parse((await getSession(session.id)).phase1Data),
          phase2,
        }),
      },
    ],
    maxTokens: 4096,
    schema: IntentDiffOutput,
  });
  const divergences = intentDiffOutputToDivergences(diff);
  await setPhase3Divergences(session.id, divergences);
  await advancePhase(session.id, 3);
  console.log(`  intent-diff: ${divergences.length} divergences, classifications=[${divergences.map((d) => d.initialClassification).join(",")}]`);

  // Student answers each divergence with real post-hoc classification.
  for (const d of divergences) {
    const answer =
      d.initialClassification === "drift"
        ? "I forgot about the capital letters."
        : "I don't know.";
    const postHoc = await callOpusAndParse({
      promptName: "capture-fixtures:post-hoc",
      system: POST_HOC_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildPostHocUserMessage({
            studentLevel: vowels.studentLevel,
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
      session.id,
      d.divergenceId,
      answer,
      postHoc.alignment,
      postHoc.final_classification,
      postHoc.final_classification_reason,
    );
  }
  const s = await getSession(session.id);
  if (!s.completedAt) await advancePhase(session.id, 4);

  const summary = await refreshSummaryForSession(session.id);
  console.log(`  live summary (post-close): ${summary?.summaryText ?? "(none — session closed)"}`);

  return session.id;
}

// ─── Beto — week_7_plus password revision (closed) ───────────────────────
async function captureBeto(password: ExerciseRecord) {
  console.log("\n[beto] week_7_plus / password revision");
  const session = await createSession(password.id, "beto_student");

  const { iter: r1 } = await runSpecIteration(
    session.id,
    password,
    "The function validates a password string and returns True if valid, False otherwise. A password is valid if it is at least 8 characters long, contains at least one digit, at least one uppercase letter, and at least one of the characters !@#$%.",
  );
  console.log(`  round 1: passed=${r1.passed}, open=[${r1.gapsIdentified.join(", ")}]`);
  const { iter: r2 } = await runSpecIteration(
    session.id,
    password,
    "The function takes a password string. It returns exactly True if the password is at least 8 characters (>= 8), contains at least one digit, at least one uppercase letter, and at least one character from the literal set !@#$%. Otherwise returns exactly False. An empty string returns False. If the input is not a string (None, int, list), the function returns False. Whitespace characters (spaces, tabs) count toward the 8-character length but do not satisfy the special-character rule. Non-ASCII uppercase letters do not satisfy the uppercase-letter rule (only ASCII A-Z). The function returns the booleans True/False exactly, not truthy/falsy values.",
  );
  console.log(`  round 2: passed=${r2.passed}, open=[${r2.gapsIdentified.join(", ")}]`);
  if (!r2.passed) {
    console.log("  spec didn't close in 2 rounds — attempting one more");
    const { iter: r3 } = await runSpecIteration(
      session.id,
      password,
      `${r2.studentSpecText}\n\nAdditionally: ${r2.gapsIdentified.map((g) => `commit concretely to '${g}'`).join(", ")}.`,
    );
    console.log(`  round 3: passed=${r3.passed}, open=[${r3.gapsIdentified.join(", ")}]`);
    if (!r3.passed)
      throw new Error(
        "beto spec didn't close in 3 rounds — tighten specs or simplify scaffolding",
      );
  }

  await advancePhase(session.id, 2);

  const revisedCode = `def validate(pw):
    if not isinstance(pw, str) or len(pw) < 8:
        return False
    return (any(c.isdigit() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c in '!@#$%' for c in pw))
`;
  await finalizePhase2Code(session.id, revisedCode);

  const phase2 = { opusExchanges: [], revisions: [], currentCode: revisedCode, finalCode: revisedCode, submittedAt: new Date().toISOString() };
  const sessLoaded = await getSession(session.id);
  const diff = await callOpusAndParse({
    promptName: "capture-fixtures:intent-diff",
    system: INTENT_DIFF_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildIntentDiffUserMessage({
          exercise: password,
          phase1: Phase1Data.parse(sessLoaded.phase1Data),
          phase2,
        }),
      },
    ],
    maxTokens: 4096,
    schema: IntentDiffOutput,
  });
  const divergences = intentDiffOutputToDivergences(diff);
  await setPhase3Divergences(session.id, divergences);
  await advancePhase(session.id, 3);
  console.log(`  intent-diff: ${divergences.length} divergences, classifications=[${divergences.map((d) => d.initialClassification).join(",")}]`);

  for (const d of divergences) {
    const answer =
      "I switched to any() because the three comprehensions are more idiomatic and the extra passes over a short password string are negligible. The behavior is equivalent.";
    const postHoc = await callOpusAndParse({
      promptName: "capture-fixtures:post-hoc",
      system: POST_HOC_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildPostHocUserMessage({
            studentLevel: password.studentLevel,
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
      session.id,
      d.divergenceId,
      answer,
      postHoc.alignment,
      postHoc.final_classification,
      postHoc.final_classification_reason,
    );
  }
  const s = await getSession(session.id);
  if (!s.completedAt) await advancePhase(session.id, 4);

  await refreshSummaryForSession(session.id);
  return session.id;
}

// ─── Carmen — week_3_6 stuck on Fibonacci, help requested (open) ─────────
async function captureCarmen(fibonacci: ExerciseRecord) {
  console.log("\n[carmen] week_3_6 / fibonacci stuck");
  const session = await createSession(fibonacci.id, "carmen_student");

  const tries = [
    "The function takes a number n and returns the nth Fibonacci number.",
    "The function takes an integer n and returns the nth Fibonacci number. It handles negative input appropriately.",
    "The function takes an integer n >= 0 and returns the nth Fibonacci number in the sequence where fib(0) = 0, fib(1) = 1. Negative inputs are handled.",
  ];
  for (let i = 0; i < tries.length; i++) {
    const { iter } = await runSpecIteration(session.id, fibonacci, tries[i]);
    console.log(`  round ${i + 1}: passed=${iter.passed}, open=[${iter.gapsIdentified.join(", ")}]`);
    if (iter.passed) {
      console.log("  unexpectedly passed — carmen is supposed to stay stuck");
      break;
    }
  }

  // Carmen asks for help on round 3.
  await appendHelpRequest(session.id, {
    timestamp: new Date().toISOString(),
    stateAtRequest: { phase: 1, attemptNumber: 3 },
    message:
      "I don't understand what 'handles negative input appropriately' is supposed to mean. Can someone come explain?",
    resolution: null,
  });

  const summary = await refreshSummaryForSession(session.id);
  console.log(`  live summary: ${summary?.summaryText}`);
  console.log(`  flags: [${summary?.flags.join(", ") ?? "—"}]`);
  return session.id;
}

// ─── Cohort fill — 4 vowel sessions with systematic case-drift ───────────
async function captureCohortFill(vowels: ExerciseRecord) {
  console.log("\n[cohort-fill] 4 additional vowel sessions");
  const specs = [
    // Three with case-drift
    "The function counts vowels a, e, i, o, u and A, E, I, O, U in a string. Y is not a vowel. Empty string returns 0.",
    "Counts vowels (both lowercase aeiou and uppercase AEIOU). y not a vowel. empty -> 0.",
    "Takes a string. Returns count of aeiou and AEIOU. y is not counted. For empty string return 0.",
    // One clean
    "Takes a string. Returns the count of vowels (both lowercase aeiou and uppercase AEIOU). 'y' is NOT a vowel. Empty string returns 0.",
  ];
  const codesWithDrift = [
    "def count_vowels(s):\n    c = 0\n    for ch in s:\n        if ch in 'aeiou':\n            c += 1\n    return c\n",
    "def count_vowels(s):\n    total = 0\n    vs = 'aeiou'\n    for ch in s:\n        if ch in vs:\n            total = total + 1\n    return total\n",
    "def count_vowels(s):\n    return sum(1 for ch in s if ch in 'aeiou')\n",
  ];
  const cleanCode =
    "def count_vowels(s):\n    return sum(1 for ch in s if ch in 'aeiouAEIOU')\n";
  const answers = [
    "I forgot about the capital letters.",
    "I didn't think about uppercase.",
    "I guess I forgot to add the uppercase ones.",
    "", // clean — no divergence
  ];

  for (let i = 0; i < 4; i++) {
    const session = await createSession(vowels.id, `cohort_student_${i}`);
    const { iter } = await runSpecIteration(session.id, vowels, specs[i]);
    if (!iter.passed) {
      console.log(`  cohort ${i}: spec didn't pass in 1 round, skipping`);
      continue;
    }
    await advancePhase(session.id, 2);
    const code = i < 3 ? codesWithDrift[i] : cleanCode;
    await finalizePhase2Code(session.id, code);

    const phase2 = { opusExchanges: [], revisions: [], currentCode: code, finalCode: code, submittedAt: new Date().toISOString() };
    const sessLoaded = await getSession(session.id);
    const diff = await callOpusAndParse({
      promptName: "capture-fixtures:intent-diff",
      system: INTENT_DIFF_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildIntentDiffUserMessage({
            exercise: vowels,
            phase1: Phase1Data.parse(sessLoaded.phase1Data),
            phase2,
          }),
        },
      ],
      maxTokens: 4096,
      schema: IntentDiffOutput,
    });
    const divergences = intentDiffOutputToDivergences(diff);
    await setPhase3Divergences(session.id, divergences);
    await advancePhase(session.id, 3);
    console.log(`  cohort ${i}: ${divergences.length} divergences`);

    for (const d of divergences) {
      const postHoc = await callOpusAndParse({
        promptName: "capture-fixtures:post-hoc",
        system: POST_HOC_SYSTEM,
        messages: [
          {
            role: "user",
            content: buildPostHocUserMessage({
              studentLevel: vowels.studentLevel,
              initialClassification: d.initialClassification,
              predictedJustification: d.predictedJustification,
              studentResponse: answers[i],
            }),
          },
        ],
        maxTokens: 512,
        schema: PostHocOutput,
      });
      await recordDivergenceResponse(
        session.id,
        d.divergenceId,
        answers[i],
        postHoc.alignment,
        postHoc.final_classification,
        postHoc.final_classification_reason,
      );
    }
    const s = await getSession(session.id);
    if (!s.completedAt) await advancePhase(session.id, 4);
  }
}

// ─── Export fixtures to JSON ──────────────────────────────────────────────
async function exportFixtures() {
  await fs.mkdir(path.join(FIXTURE_DIR, "exercises"), { recursive: true });
  await fs.mkdir(path.join(FIXTURE_DIR, "sessions"), { recursive: true });

  const exercises = await prisma.exercise.findMany({});
  for (const e of exercises) {
    await fs.writeFile(
      path.join(FIXTURE_DIR, "exercises", `${e.id}.json`),
      JSON.stringify(e, null, 2),
    );
  }

  const sessions = await prisma.session.findMany({
    include: { events: true },
  });
  for (const s of sessions) {
    await fs.writeFile(
      path.join(FIXTURE_DIR, "sessions", `${s.id}.json`),
      JSON.stringify(s, null, 2),
    );
  }
  console.log(
    `\nExported ${exercises.length} exercises + ${sessions.length} sessions to tests/fixtures/`,
  );
}

async function main() {
  await wipe();

  const vowels = await publishExerciseViaScaffolding({
    id: "vowels-demo",
    title: "Count vowels",
    prompt: "Write a function that counts vowels in a string.",
    levelOverride: "week_1_2",
  });

  const password = await publishExerciseViaScaffolding({
    id: "password-demo",
    title: "Validate a password",
    prompt:
      "Write a function that validates a password. It must be at least 8 characters, contain at least one digit, at least one uppercase letter, and at least one special character from !@#$%. Return True if valid, False otherwise.",
    levelOverride: "week_7_plus",
  });

  const fibonacci = await publishExerciseViaScaffolding({
    id: "fibonacci-demo",
    title: "Nth Fibonacci number",
    prompt:
      "Write a function that returns the nth Fibonacci number, where fib(0) = 0 and fib(1) = 1.",
    levelOverride: "week_3_6",
  });

  await captureAna(vowels);
  await captureBeto(password);
  await captureCarmen(fibonacci);
  await captureCohortFill(vowels);

  await exportFixtures();

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
