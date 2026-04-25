// STOP 3 evidence: runs three real spec-gate sessions against the
// spec-examiner prompt and prints full iteration transcripts.
//
// Bypasses HTTP and calls the same functions the routes call — keeps the
// focus on prompt behavior, not framework plumbing.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../src/lib/db";
import { callOpusAndParse } from "../src/lib/opus/client";
import {
  SPEC_EXAMINER_SYSTEM,
  buildSpecExaminerUserMessage,
} from "../src/lib/opus/prompts/spec-examiner";
import {
  Phase1Data,
  Phase1Iteration,
  SpecExaminerOutput,
  type ExerciseRecord,
} from "../src/lib/opus/schemas";
import {
  advancePhase,
  appendPhase1Iteration,
  createExercise,
  createSession,
  getExercise,
} from "../src/lib/sessions";

async function wipe() {
  await prisma.sessionEvent.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.exercise.deleteMany({});
}

async function runSpecIteration(
  exercise: ExerciseRecord,
  priorIterations: Phase1Iteration[],
  specText: string,
) {
  const start = Date.now();
  const examiner = await callOpusAndParse({
    promptName: "spec-examiner",
    system: SPEC_EXAMINER_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildSpecExaminerUserMessage(
          exercise,
          priorIterations,
          specText,
        ),
      },
    ],
    maxTokens: 1024,
    schema: SpecExaminerOutput,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const iter: Phase1Iteration = {
    timestamp: new Date().toISOString(),
    studentSpecText: specText,
    opusQuestions: examiner.questions,
    gapsIdentified: examiner.gaps_still_open,
    gapsAddressedThisRound: examiner.gaps_addressed,
    emergentGaps: examiner.emergent_gaps,
    passed: examiner.gaps_still_open.length === 0,
  };
  return { iter, examiner, elapsed };
}

function printIter(round: number, iter: Phase1Iteration, elapsed: string) {
  console.log(`\n── Round ${round}  (${elapsed}s) ───────────────────────────`);
  console.log(`Student spec: ${JSON.stringify(iter.studentSpecText)}`);
  console.log(`Addressed this round: [${iter.gapsAddressedThisRound.join(", ") || "—"}]`);
  console.log(`Still open:           [${iter.gapsIdentified.join(", ") || "—"}]`);
  if (iter.emergentGaps.length) {
    console.log("Emergent gaps:");
    for (const g of iter.emergentGaps) console.log(`  • ${g.description}`);
  }
  if (iter.opusQuestions.length) {
    console.log("Opus asked:");
    for (const q of iter.opusQuestions) console.log(`  • ${q}`);
  }
  console.log(`Passed: ${iter.passed}`);
}

// ─── Scenario 1 — week_1_2 vowels, 3 rounds ──────────────────────────────
async function scenario1Vowels() {
  console.log("\n================================================================");
  console.log("SCENARIO 1 — week_1_2 / count vowels");
  console.log("================================================================");

  await createExercise({
    id: "vowels-stop3",
    title: "Count vowels",
    instructorPromptText: "Write a function that counts vowels in a string.",
    specGateDimensions: [
      {
        id: "case_sensitivity",
        description:
          "Does the function count uppercase vowels (A, E, I, O, U) in addition to lowercase, or only one case?",
        rationale:
          "Case handling is the most common unstated assumption in string-counting problems.",
        source: "opus",
      },
      {
        id: "y_as_vowel",
        description: "Does 'y' count as a vowel?",
        rationale:
          "English teaches 'y is sometimes a vowel'; the spec must commit to one reading.",
        source: "opus",
      },
      {
        id: "empty_string",
        description:
          "What should the function return when given an empty string?",
        rationale:
          "Empty input is the canonical missed case in CS1; surfacing it in the spec gate is cheaper than in a failed test.",
        source: "opus",
      },
    ],
    expectedDivergences: [
      {
        category: "drift",
        pattern:
          "Spec commits to counting uppercase vowels but code only checks lowercase.",
        source: "opus",
      },
    ],
    studentLevel: "week_1_2",
    opusGeneratedDimensions: [],
    opusGeneratedDivergences: [],
    opusGeneratedStudentLevel: "week_1_2",
  });

  const exercise = await getExercise("vowels-stop3");
  const session = await createSession(exercise.id, "stop3-ana");

  const specs = [
    "it counts vowels",
    "The function takes a string and counts how many vowels are in it. Vowels are a, e, i, o, u.",
    "The function takes a string and counts how many vowels are in it (both lowercase a, e, i, o, u and uppercase A, E, I, O, U). 'y' does not count as a vowel. If the string is empty, the function returns 0.",
  ];

  for (let i = 0; i < specs.length; i++) {
    const prior = Phase1Data.parse(
      (await prisma.session.findUniqueOrThrow({ where: { id: session.id } }))
        .phase1Data,
    ).iterations;
    const { iter, elapsed } = await runSpecIteration(exercise, prior, specs[i]);
    printIter(i + 1, iter, elapsed);
    await appendPhase1Iteration(session.id, iter);
    if (iter.passed) {
      await advancePhase(session.id, 2);
      console.log(`\nGate closed → advanced to phase 2.`);
      break;
    }
  }
}

// ─── Scenario 2 — week_7_plus password validator ────────────────────────
async function scenario2Password() {
  console.log("\n================================================================");
  console.log("SCENARIO 2 — week_7_plus / password validator");
  console.log("================================================================");

  await createExercise({
    id: "password-stop3",
    title: "Validate a password",
    instructorPromptText:
      "Write a function that validates a password. It must be at least 8 characters, contain at least one digit, at least one uppercase letter, and at least one special character from !@#$%. Return True if valid, False otherwise.",
    specGateDimensions: [
      {
        id: "exactly_8_behavior",
        description:
          "Is a password of exactly 8 characters valid, or does 'at least 8' mean strictly more than 8?",
        rationale: "Off-by-one on length is the most common drift.",
        source: "opus",
      },
      {
        id: "non_string_input",
        description:
          "What happens if the input is not a string (None, integer, list)?",
        rationale:
          "Type-contract commitment prevents type-error crashes being treated as bugs.",
        source: "opus",
      },
      {
        id: "special_char_set",
        description:
          "Only !@#$% count as special, or is any non-alphanumeric character acceptable?",
        rationale:
          "Students frequently interpret 'at least one special character' as 'any special'.",
        source: "opus",
      },
      {
        id: "empty_string",
        description: "What should be returned for an empty string?",
        rationale:
          "Confirming False-vs-raising on empty input is a canonical boundary check.",
        source: "opus",
      },
      {
        id: "return_contract",
        description:
          "Should the function return exactly True and False, or is any truthy/falsy value acceptable?",
        rationale:
          "Prevents students from over-engineering a richer return type.",
        source: "opus",
      },
    ],
    expectedDivergences: [
      {
        category: "drift",
        pattern: "Code uses > instead of >= for length.",
        source: "opus",
      },
    ],
    studentLevel: "week_7_plus",
    opusGeneratedDimensions: [],
    opusGeneratedDivergences: [],
    opusGeneratedStudentLevel: "week_7_plus",
  });

  const exercise = await getExercise("password-stop3");
  const session = await createSession(exercise.id, "stop3-beto");

  const specs = [
    "The function takes a password string and returns True or False based on whether it's valid.",
    "The function takes a password string. It returns True if the password is at least 8 characters, contains at least one digit, at least one uppercase letter, and at least one of the characters !@#$%. Otherwise returns False. If the input is not a string, return False. An 8-character password that meets all rules IS valid (>=).",
    "The function takes a password string. It returns exactly True if the password is at least 8 characters long (>= 8), contains at least one digit, at least one uppercase letter, and at least one special character from the literal set !@#$%. Otherwise it returns exactly False. An empty string returns False. A non-string input (None, integer, list) returns False.",
  ];

  for (let i = 0; i < specs.length; i++) {
    const prior = Phase1Data.parse(
      (await prisma.session.findUniqueOrThrow({ where: { id: session.id } }))
        .phase1Data,
    ).iterations;
    const { iter, elapsed } = await runSpecIteration(exercise, prior, specs[i]);
    printIter(i + 1, iter, elapsed);
    await appendPhase1Iteration(session.id, iter);
    if (iter.passed) {
      await advancePhase(session.id, 2);
      console.log(`\nGate closed → advanced to phase 2.`);
      break;
    }
  }
}

// ─── Scenario 3 — Opus holds the line on a vague "addressing" ───────────
async function scenario3HoldsTheLine() {
  console.log("\n================================================================");
  console.log("SCENARIO 3 — Opus rejects vague 'addressing'");
  console.log("  The student mentions empty input and case but does not commit.");
  console.log("  Both should remain open gaps.");
  console.log("================================================================");

  const exercise = await getExercise("vowels-stop3");
  const session = await createSession(exercise.id, "stop3-carmen");

  const vagueSpec =
    "The function counts vowels in a string. It handles empty input and deals with case appropriately. Y is not a vowel.";

  const prior = Phase1Data.parse(
    (await prisma.session.findUniqueOrThrow({ where: { id: session.id } }))
      .phase1Data,
  ).iterations;
  const { iter, elapsed } = await runSpecIteration(exercise, prior, vagueSpec);
  printIter(1, iter, elapsed);
  await appendPhase1Iteration(session.id, iter);

  const expectedOpen = ["case_sensitivity", "empty_string"];
  const actuallyOpen = new Set(iter.gapsIdentified);
  const heldTheLine = expectedOpen.every((id) => actuallyOpen.has(id));
  console.log(
    `\nOpus held the line on vague commitments: ${heldTheLine ? "YES ✓" : "NO ✗"}`,
  );
}

async function main() {
  await wipe();
  await scenario1Vowels();
  await scenario2Password();
  await scenario3HoldsTheLine();
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
