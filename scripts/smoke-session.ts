// Phase 1 acceptance test — exercises every write path in src/lib/sessions.ts
// and round-trips through the Zod schemas. Run with `npx tsx scripts/smoke-session.ts`.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../src/lib/db";
import {
  advancePhase,
  appendHelpRequest,
  appendLiveSummary,
  appendPhase1Iteration,
  appendPhase2Exchange,
  appendPhase2Revision,
  createExercise,
  createSession,
  finalizePhase2Code,
  getExercise,
  getSessionFull,
  listActiveSessions,
  recordDivergenceResponse,
  setPhase3Divergences,
  updateCurrentCode,
} from "../src/lib/sessions";
import {
  ExerciseRecord,
  LiveSummary,
  Phase1Data,
  Phase2Data,
  Phase3Data,
  type Divergence,
} from "../src/lib/opus/schemas";

async function wipe() {
  await prisma.sessionEvent.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.exercise.deleteMany({});
}

async function main() {
  await wipe();

  // ── 1. Create an exercise ────────────────────────────────────────────────
  const exercise = await createExercise({
    id: "vowels-smoke",
    title: "Count vowels",
    instructorPromptText: "Write a function that counts vowels in a string.",
    specGateDimensions: [
      {
        id: "case_sensitivity",
        description:
          "Does the function count uppercase vowels (A,E,I,O,U), or only lowercase?",
        rationale: "Case handling is the most common unstated assumption.",
        source: "opus",
      },
      {
        id: "empty_string",
        description: "What should the function return on an empty string?",
        rationale: "Empty input is the canonical missed case in CS1.",
        source: "opus",
      },
    ],
    expectedDivergences: [
      {
        category: "drift",
        pattern:
          "Student's spec commits to counting uppercase but code only checks lowercase.",
        source: "opus",
      },
    ],
    studentLevel: "week_1_2",
    opusGeneratedDimensions: [
      {
        id: "case_sensitivity",
        description:
          "Does the function count uppercase vowels (A,E,I,O,U), or only lowercase?",
        rationale: "Case handling is the most common unstated assumption.",
      },
      {
        id: "empty_string",
        description: "What should the function return on an empty string?",
        rationale: "Empty input is the canonical missed case in CS1.",
      },
    ],
    opusGeneratedDivergences: [
      {
        category: "drift",
        pattern:
          "Student's spec commits to counting uppercase but code only checks lowercase.",
      },
    ],
    opusGeneratedStudentLevel: "week_1_2",
  });

  console.log("✅ created exercise:", exercise.id);

  // Round-trip through the ExerciseRecord schema.
  const readBack = await getExercise(exercise.id);
  ExerciseRecord.parse(readBack);
  console.log("✅ exercise round-trips through ExerciseRecord schema");

  // ── 2. Create a session ──────────────────────────────────────────────────
  const session = await createSession(exercise.id, "smoke-student");
  console.log("✅ created session:", session.id);

  // ── 3. Phase 1: iteration 1 (gaps still open) ────────────────────────────
  await appendPhase1Iteration(session.id, {
    timestamp: new Date().toISOString(),
    studentSpecText: "The function counts vowels in a string.",
    opusQuestions: [
      "What should happen on uppercase vowels?",
      "What should happen on empty input?",
    ],
    gapsIdentified: ["case_sensitivity", "empty_string"],
    gapsAddressedThisRound: [],
    emergentGaps: [],
    passed: false,
  });

  // ── 4. Phase 1: iteration 2 (addresses one gap) ──────────────────────────
  await appendPhase1Iteration(session.id, {
    timestamp: new Date().toISOString(),
    studentSpecText:
      "The function counts lowercase vowels (a,e,i,o,u). On empty input it returns 0.",
    opusQuestions: ["What about uppercase A, E, I, O, U?"],
    gapsIdentified: ["case_sensitivity"],
    gapsAddressedThisRound: ["empty_string"],
    emergentGaps: [],
    passed: false,
  });

  // ── 5. Phase 1: iteration 3 (passes) ─────────────────────────────────────
  await appendPhase1Iteration(session.id, {
    timestamp: new Date().toISOString(),
    studentSpecText:
      "The function counts vowels (both lowercase a,e,i,o,u and uppercase A,E,I,O,U). On empty input it returns 0.",
    opusQuestions: [],
    gapsIdentified: [],
    gapsAddressedThisRound: ["case_sensitivity"],
    emergentGaps: [],
    passed: true,
  });

  // ── 6. Help request ──────────────────────────────────────────────────────
  await appendHelpRequest(session.id, {
    timestamp: new Date().toISOString(),
    stateAtRequest: { round: 2 },
    message: "I'm not sure how to phrase the case dimension.",
    resolution: null,
  });

  // ── 7. Advance phase → 2 (writing) ───────────────────────────────────────
  await advancePhase(session.id, 2);

  // ── 8. Phase 2 activity ──────────────────────────────────────────────────
  await updateCurrentCode(session.id, "def count_vowels(s):\n    pass\n");

  await appendPhase2Exchange(session.id, {
    timestamp: new Date().toISOString(),
    studentMessage: "why does my loop not terminate?",
    opusMode: "interrogative",
    opusResponse:
      "What condition have you written for the loop to stop? Walk me through it.",
  });

  await appendPhase2Exchange(session.id, {
    timestamp: new Date().toISOString(),
    studentMessage: "what is the syntax of a dict in python?",
    opusMode: "direct",
    opusResponse: "`d = {\"key\": \"value\"}` — curly braces, colons.",
  });

  await appendPhase2Revision(session.id, {
    timestamp: new Date().toISOString(),
    amendmentText: "Use sum() comprehension instead of accumulator.",
    justificationText: "It's cleaner and reads more naturally in Python.",
    opusQuestion: "Is the new approach faster, simpler, or more correct?",
    opusFollowupQuestion: null,
  });

  await finalizePhase2Code(
    session.id,
    "def count_vowels(s):\n    return sum(1 for c in s if c in 'aeiou')\n",
  );

  await advancePhase(session.id, 3);

  // ── 9. Phase 3 divergences + responses ──────────────────────────────────
  const divergences: Divergence[] = [
    {
      divergenceId: "case_drift_1",
      initialClassification: "drift",
      initialConfidence: "high",
      predictedJustification: "I forgot about the capital letters.",
      studentFacingQuestion:
        "Your spec mentioned uppercase vowels too. I noticed the code uses 'aeiou' only. Walk me through what happened there.",
      evidenceFromSpec: "counts both lowercase and uppercase",
      evidenceFromCode: "if c in 'aeiou'",
      studentResponse: null,
      alignment: null,
      finalClassification: null,
      finalClassificationReason: null,
      respondedAt: null,
    },
  ];
  await setPhase3Divergences(session.id, divergences);

  const result = await recordDivergenceResponse(
    session.id,
    "case_drift_1",
    "I forgot about the capital letters.",
    "aligned",
    "drift",
    "Student confirmed they didn't intend the divergence.",
  );
  console.log(
    `✅ divergence response recorded (allAnswered=${result.allAnswered})`,
  );

  // ── 10. Live summary ────────────────────────────────────────────────────
  await appendLiveSummary(session.id, {
    timestamp: new Date().toISOString(),
    summaryText:
      "Phase 3; one divergence answered with aligned prediction (drift on case). No intervention needed.",
    flags: [],
  });

  // ── 11. Advance to closed ───────────────────────────────────────────────
  await advancePhase(session.id, 4);

  // ── 12. Round-trip full read ────────────────────────────────────────────
  const full = await getSessionFull(session.id);
  Phase1Data.parse(full.phase1Data);
  Phase2Data.parse(full.phase2Data);
  if (full.phase3Data !== null) Phase3Data.parse(full.phase3Data);
  const summaries = full.liveSummaries;
  if (!Array.isArray(summaries)) throw new Error("liveSummaries not array");
  for (const s of summaries) LiveSummary.parse(s);
  console.log("✅ full session round-trips through every phase schema");

  const active = await listActiveSessions();
  console.log(
    `✅ listActiveSessions: ${active.length} active (completed sessions excluded: ${active.filter((s) => !s.completedAt).length})`,
  );

  // ── 13. Malformed write should throw a readable Zod error ──────────────
  console.log("\nProbing malformed-input path...");
  try {
    // Deliberately wrong types — cast through unknown to bypass TS and let
    // Zod prove it catches the malformed payload at runtime.
    await appendPhase1Iteration(session.id, {
      timestamp: 42,
      studentSpecText: null,
      opusQuestions: "not an array",
      gapsIdentified: [],
      gapsAddressedThisRound: [],
      emergentGaps: [],
      passed: "yes",
    } as unknown as Parameters<typeof appendPhase1Iteration>[1]);
    throw new Error("should have thrown");
  } catch (err) {
    if (err instanceof Error && err.message === "should have thrown") {
      console.error("❌ malformed input did NOT throw");
      process.exit(1);
    }
    console.log("✅ malformed input threw as expected:");
    console.log(
      "   " +
        (err instanceof Error ? err.message : String(err))
          .split("\n")
          .slice(0, 8)
          .join("\n   "),
    );
  }

  // ── 14. Event count — verify events fired as side effects ─────────────
  const events = await prisma.sessionEvent.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
  });
  const kinds = events.map((e) => e.kind);
  console.log(`\n✅ ${events.length} SessionEvent rows written: ${kinds.join(", ")}`);

  // ── 15. Final JSON snapshot ────────────────────────────────────────────
  console.log("\n── Final session snapshot ─────────────────────────────");
  const snapshot = await prisma.session.findUniqueOrThrow({
    where: { id: session.id },
  });
  console.log(
    JSON.stringify(
      {
        id: snapshot.id,
        exerciseId: snapshot.exerciseId,
        currentPhase: snapshot.currentPhase,
        completedAt: snapshot.completedAt,
        phase1: {
          iterations: (snapshot.phase1Data as Phase1Data).iterations.length,
          finalSpecText: (snapshot.phase1Data as Phase1Data).finalSpecText?.slice(0, 60),
          dimensionsAddressed: (snapshot.phase1Data as Phase1Data)
            .instructorConfiguredDimensionsAddressed,
          helpRequests: (snapshot.phase1Data as Phase1Data).helpRequests.length,
        },
        phase2: {
          exchanges: (snapshot.phase2Data as Phase2Data).opusExchanges.length,
          revisions: (snapshot.phase2Data as Phase2Data).revisions.length,
          finalCodeBytes: (snapshot.phase2Data as Phase2Data).finalCode?.length,
        },
        phase3: {
          divergences: (snapshot.phase3Data as Phase3Data).divergences.length,
          aligned: (snapshot.phase3Data as Phase3Data).divergences.filter(
            (d) => d.alignment === "aligned",
          ).length,
        },
        liveSummaries: (snapshot.liveSummaries as LiveSummary[]).length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
