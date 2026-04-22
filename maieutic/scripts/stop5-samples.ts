// STOP 5 evidence — seeds 5 live sessions in varied states, runs the
// live-summary prompt on each, plus seeds two cohorts (small-sample and
// clear-pattern) and runs the cohort-narrative prompt.
//
// Data is constructed directly rather than driven through the UI — we are
// testing the live-summary and cohort-narrative prompts specifically, and
// running 10+ full session flows through Opus would burn real money for
// no additional signal.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../src/lib/db";
import { callOpusAndParse } from "../src/lib/opus/client";
import {
  COHORT_NARRATIVE_SYSTEM,
  buildCohortNarrativeUserMessage,
} from "../src/lib/opus/prompts/cohort-narrative";
import {
  CohortNarrativeOutput,
  type Divergence,
} from "../src/lib/opus/schemas";
import { createExercise } from "../src/lib/sessions";
import { aggregateExercise } from "../src/lib/cohort";
import { refreshSummaryForSession } from "../src/lib/opus/summaries";

// ──────────────────────────────────────────────────────────────────────

async function wipe() {
  await prisma.sessionEvent.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.exercise.deleteMany({});
}

async function publishVowels() {
  return createExercise({
    id: "vowels-stop5",
    title: "Count vowels",
    instructorPromptText:
      "Write a function that counts vowels in a string.",
    specGateDimensions: [
      {
        id: "case_sensitivity",
        description:
          "Does the function count uppercase vowels in addition to lowercase, or only one case?",
        rationale: "Case is the most common unstated assumption.",
        source: "opus",
      },
      {
        id: "y_as_vowel",
        description: "Does 'y' count as a vowel?",
        rationale: "'y is sometimes a vowel' — spec must commit.",
        source: "opus",
      },
      {
        id: "empty_string",
        description:
          "What should the function return when given an empty string?",
        rationale: "Empty input is the canonical missed case in CS1.",
        source: "opus",
      },
    ],
    expectedDivergences: [
      {
        category: "drift",
        pattern:
          "Spec commits to case-insensitive but code checks 'aeiou' only.",
        source: "opus",
      },
    ],
    phase2Required: false,
    studentLevel: "week_1_2",
    opusGeneratedDimensions: [],
    opusGeneratedDivergences: [],
    opusGeneratedPhase2Required: false,
    opusGeneratedStudentLevel: "week_1_2",
  });
}

async function publishPassword() {
  return createExercise({
    id: "password-stop5",
    title: "Validate a password",
    instructorPromptText:
      "Write a function that validates a password. It must be at least 8 characters, contain at least one digit, at least one uppercase letter, and at least one special character from !@#$%.",
    specGateDimensions: [
      {
        id: "exactly_8_behavior",
        description:
          "Is a password of exactly 8 characters valid, or does 'at least 8' mean strictly more than 8?",
        rationale: "Off-by-one is the most common drift.",
        source: "opus",
      },
      {
        id: "non_string_input",
        description: "What happens if the input is not a string?",
        rationale: "Prevents type-error-as-bug confusion.",
        source: "opus",
      },
      {
        id: "special_char_set",
        description:
          "Only !@#$% count as special, or any non-alphanumeric character?",
        rationale: "Students generalize to any punctuation.",
        source: "opus",
      },
      {
        id: "empty_string",
        description: "What should be returned for an empty string?",
        rationale: "Canonical boundary.",
        source: "opus",
      },
      {
        id: "return_contract",
        description: "Exactly True/False, or any truthy/falsy value?",
        rationale: "Prevents over-engineering the return type.",
        source: "opus",
      },
    ],
    expectedDivergences: [
      {
        category: "drift",
        pattern: "Code drops a rule (commonly the special-character check).",
        source: "opus",
      },
      {
        category: "drift",
        pattern: "Code uses > instead of >= for length.",
        source: "opus",
      },
    ],
    phase2Required: true,
    studentLevel: "week_7_plus",
    opusGeneratedDimensions: [],
    opusGeneratedDivergences: [],
    opusGeneratedPhase2Required: true,
    opusGeneratedStudentLevel: "week_7_plus",
  });
}

// Low-level — insert a session with pre-built phase data. Bypasses the
// validation in sessions.ts intentionally: we're crafting test fixtures.
async function rawInsertSession(args: {
  id: string;
  studentId: string;
  exerciseId: string;
  minutesAgoStarted: number;
  currentPhase: number;
  completed?: boolean;
  phase1Data: object;
  phase2Data?: object | null;
  phase3Data: object;
  phase4Data?: object | null;
  liveSummaries?: object[];
  events?: { kind: string; payload: object; minutesAgo: number }[];
}) {
  const startedAt = new Date(Date.now() - args.minutesAgoStarted * 60_000);
  const session = await prisma.session.create({
    data: {
      id: args.id,
      studentId: args.studentId,
      exerciseId: args.exerciseId,
      startedAt,
      completedAt: args.completed ? new Date() : null,
      currentPhase: args.currentPhase,
      phase1Data: args.phase1Data as never,
      phase2Data: (args.phase2Data ?? null) as never,
      phase3Data: args.phase3Data as never,
      phase4Data: (args.phase4Data ?? null) as never,
      liveSummaries: (args.liveSummaries ?? []) as never,
    },
  });
  for (const ev of args.events ?? []) {
    await prisma.sessionEvent.create({
      data: {
        sessionId: session.id,
        kind: ev.kind,
        payload: ev.payload as never,
        createdAt: new Date(Date.now() - ev.minutesAgo * 60_000),
      },
    });
  }
  return session;
}

// ──────────────────────────────────────────────────────────────────────
// Seed 5 active sessions in varied states.
// ──────────────────────────────────────────────────────────────────────

async function seedActiveSessions() {
  // A — STUCK: Phase 1, iteration 4, same gap unresolved for 7 min.
  await rawInsertSession({
    id: "s_stuck_ana",
    studentId: "ana_stuck",
    exerciseId: "vowels-stop5",
    minutesAgoStarted: 18,
    currentPhase: 1,
    phase1Data: {
      iterations: [
        {
          timestamp: new Date(Date.now() - 15 * 60_000).toISOString(),
          studentSpecText: "it counts vowels",
          opusQuestions: [
            "What about uppercase vowels?",
            "What should the function return on empty input?",
          ],
          gapsIdentified: ["case_sensitivity", "y_as_vowel", "empty_string"],
          gapsAddressedThisRound: [],
          emergentGaps: [],
          passed: false,
        },
        {
          timestamp: new Date(Date.now() - 11 * 60_000).toISOString(),
          studentSpecText: "it counts vowels in a string and handles empty input",
          opusQuestions: [
            "You said 'handles empty input' — concretely, what does the function return?",
          ],
          gapsIdentified: ["case_sensitivity", "empty_string"],
          gapsAddressedThisRound: ["y_as_vowel"],
          emergentGaps: [],
          passed: false,
        },
        {
          timestamp: new Date(Date.now() - 8 * 60_000).toISOString(),
          studentSpecText:
            "The function counts vowels. It handles empty input. Vowels are a, e, i, o, u.",
          opusQuestions: [
            "For 'handles empty input' — what value does the function return for \"\"?",
          ],
          gapsIdentified: ["case_sensitivity", "empty_string"],
          gapsAddressedThisRound: [],
          emergentGaps: [],
          passed: false,
        },
        {
          timestamp: new Date(Date.now() - 7 * 60_000).toISOString(),
          studentSpecText:
            "The function counts vowels (a, e, i, o, u). Empty inputs are handled.",
          opusQuestions: [
            "Still not quite — 'empty inputs are handled' — what specifically? Does the function return 0, raise, something else?",
          ],
          gapsIdentified: ["case_sensitivity", "empty_string"],
          gapsAddressedThisRound: [],
          emergentGaps: [],
          passed: false,
        },
      ],
      finalSpecText: null,
      instructorConfiguredDimensionsAddressed: ["y_as_vowel"],
      helpRequests: [],
    },
    phase3Data: {
      opusExchanges: [],
      revisions: [],
      currentCode: "",
      finalCode: null,
      submittedAt: null,
    },
    events: [
      {
        kind: "phase_transition",
        payload: { from: 0, to: 1 },
        minutesAgo: 18,
      },
    ],
  });

  // B — HIGH PERFORMER: Phase 3, clean spec in 1 round, working on code.
  await rawInsertSession({
    id: "s_high_beto",
    studentId: "beto_high",
    exerciseId: "vowels-stop5",
    minutesAgoStarted: 9,
    currentPhase: 3,
    phase1Data: {
      iterations: [
        {
          timestamp: new Date(Date.now() - 8 * 60_000).toISOString(),
          studentSpecText:
            "Takes a string, returns a count of vowels. Counts both lowercase a,e,i,o,u and uppercase A,E,I,O,U. Does NOT count 'y'. Empty string returns 0.",
          opusQuestions: [],
          gapsIdentified: [],
          gapsAddressedThisRound: ["case_sensitivity", "y_as_vowel", "empty_string"],
          emergentGaps: [],
          passed: true,
        },
      ],
      finalSpecText:
        "Takes a string, returns a count of vowels. Counts both lowercase a,e,i,o,u and uppercase A,E,I,O,U. Does NOT count 'y'. Empty string returns 0.",
      instructorConfiguredDimensionsAddressed: [
        "case_sensitivity",
        "y_as_vowel",
        "empty_string",
      ],
      helpRequests: [],
    },
    phase3Data: {
      opusExchanges: [
        {
          timestamp: new Date(Date.now() - 4 * 60_000).toISOString(),
          studentMessage: "what is the syntax for str.lower()?",
          opusMode: "direct",
          opusResponse:
            "str.lower() takes no arguments and returns a new lowercase string.",
        },
      ],
      revisions: [],
      currentCode:
        "def count_vowels(s):\n    c = 0\n    for ch in s:\n        if ch in 'aeiouAEIOU':\n            c += 1\n    return c\n",
      finalCode: null,
      submittedAt: null,
    },
    events: [
      {
        kind: "phase_transition",
        payload: { from: 1, to: 3 },
        minutesAgo: 8,
      },
    ],
  });

  // C — ALIGNMENT FAILURE: Phase 4, answered "I don't know" on a boundary question.
  const cDivergences: Divergence[] = [
    {
      divergenceId: "case_drift",
      initialClassification: "drift",
      initialConfidence: "high",
      predictedJustification: "I forgot about the capital letters.",
      studentFacingQuestion:
        "Your spec said the function counts vowels like A, E, I, O, U as well as lowercase. I noticed your code only checks for lowercase. Can you tell me what happened there?",
      evidenceFromSpec: "counts both lowercase and uppercase",
      evidenceFromPlan: null,
      evidenceFromCode: "if c in 'aeiou':",
      studentResponse: "I don't know.",
      alignment: "diverged",
      finalClassification: "drift",
      finalClassificationReason:
        "Student responded 'I don't know' rather than the predicted forgetting phrase; classification stays drift.",
      respondedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    },
  ];
  await rawInsertSession({
    id: "s_align_carmen",
    studentId: "carmen_align",
    exerciseId: "vowels-stop5",
    minutesAgoStarted: 22,
    currentPhase: 4,
    phase1Data: {
      iterations: [
        {
          timestamp: new Date(Date.now() - 21 * 60_000).toISOString(),
          studentSpecText:
            "Counts vowels. Both lowercase and uppercase. 'y' does not count. Empty returns 0.",
          opusQuestions: [],
          gapsIdentified: [],
          gapsAddressedThisRound: [
            "case_sensitivity",
            "y_as_vowel",
            "empty_string",
          ],
          emergentGaps: [],
          passed: true,
        },
      ],
      finalSpecText:
        "Counts vowels. Both lowercase and uppercase. 'y' does not count. Empty returns 0.",
      instructorConfiguredDimensionsAddressed: [
        "case_sensitivity",
        "y_as_vowel",
        "empty_string",
      ],
      helpRequests: [],
    },
    phase3Data: {
      opusExchanges: [],
      revisions: [],
      currentCode:
        "def count_vowels(s):\n    c = 0\n    for x in s:\n        if x in 'aeiou':\n            c = c + 1\n    return c\n",
      finalCode:
        "def count_vowels(s):\n    c = 0\n    for x in s:\n        if x in 'aeiou':\n            c = c + 1\n    return c\n",
      submittedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    },
    phase4Data: {
      divergences: cDivergences,
      startedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
      completedAt: null,
    },
    events: [
      {
        kind: "alignment_failure",
        payload: {
          divergenceId: "case_drift",
          prediction: "I forgot about the capital letters.",
          response: "I don't know.",
        },
        minutesAgo: 2,
      },
    ],
  });

  // D — MID-PHASE 3: Phase 3, 12 minutes in, chat log shows syntax uncertainty.
  await rawInsertSession({
    id: "s_mid_diego",
    studentId: "diego_mid",
    exerciseId: "vowels-stop5",
    minutesAgoStarted: 15,
    currentPhase: 3,
    phase1Data: {
      iterations: [
        {
          timestamp: new Date(Date.now() - 14 * 60_000).toISOString(),
          studentSpecText:
            "The function takes a string and returns how many vowels are in it (a,e,i,o,u and A,E,I,O,U). Empty string returns 0.",
          opusQuestions: [],
          gapsIdentified: [],
          gapsAddressedThisRound: [
            "case_sensitivity",
            "y_as_vowel",
            "empty_string",
          ],
          emergentGaps: [],
          passed: true,
        },
      ],
      finalSpecText:
        "The function takes a string and returns how many vowels are in it (a,e,i,o,u and A,E,I,O,U). Empty string returns 0.",
      instructorConfiguredDimensionsAddressed: [
        "case_sensitivity",
        "y_as_vowel",
        "empty_string",
      ],
      helpRequests: [],
    },
    phase3Data: {
      opusExchanges: [
        {
          timestamp: new Date(Date.now() - 10 * 60_000).toISOString(),
          studentMessage: "how do I check if a char is in a string?",
          opusMode: "direct",
          opusResponse: "Use the `in` operator: `'a' in 'cat'` returns True.",
        },
        {
          timestamp: new Date(Date.now() - 6 * 60_000).toISOString(),
          studentMessage: "do I need to import something to use len()?",
          opusMode: "direct",
          opusResponse:
            "No — len() is a built-in function, available without an import.",
        },
        {
          timestamp: new Date(Date.now() - 3 * 60_000).toISOString(),
          studentMessage: "what's the syntax for a for loop over a string?",
          opusMode: "direct",
          opusResponse:
            "`for ch in s:` iterates each character one at a time.",
        },
      ],
      revisions: [],
      currentCode: "def count_vowels(s):\n    \n",
      finalCode: null,
      submittedAt: null,
    },
    events: [
      {
        kind: "phase_transition",
        payload: { from: 1, to: 3 },
        minutesAgo: 14,
      },
    ],
  });

  // E — HELP REQUESTED: Phase 1, help request pending, student flagged minutes ago.
  await rawInsertSession({
    id: "s_help_elena",
    studentId: "elena_help",
    exerciseId: "password-stop5",
    minutesAgoStarted: 14,
    currentPhase: 1,
    phase1Data: {
      iterations: [
        {
          timestamp: new Date(Date.now() - 13 * 60_000).toISOString(),
          studentSpecText:
            "The function validates a password and returns True or False.",
          opusQuestions: [
            "Is a password of exactly 8 characters valid, or is 'at least 8' strictly more than 8?",
            "What happens if the input is not a string?",
            "Is the set of special characters exactly !@#$%, or any non-alphanumeric?",
            "What about an empty string?",
          ],
          gapsIdentified: [
            "exactly_8_behavior",
            "non_string_input",
            "special_char_set",
            "empty_string",
          ],
          gapsAddressedThisRound: ["return_contract"],
          emergentGaps: [],
          passed: false,
        },
      ],
      finalSpecText: null,
      instructorConfiguredDimensionsAddressed: ["return_contract"],
      helpRequests: [
        {
          timestamp: new Date(Date.now() - 4 * 60_000).toISOString(),
          stateAtRequest: { phase: 1, iteration: 1 },
          message:
            "I don't know what 'type contract' means — can someone come over?",
          resolution: null,
        },
      ],
    },
    phase3Data: {
      opusExchanges: [],
      revisions: [],
      currentCode: "",
      finalCode: null,
      submittedAt: null,
    },
    events: [
      {
        kind: "help_request",
        payload: {
          message:
            "I don't know what 'type contract' means — can someone come over?",
          phase: 1,
        },
        minutesAgo: 4,
      },
    ],
  });
}

// ──────────────────────────────────────────────────────────────────────
// Seed 2 cohorts: small-sample (2 sessions) on password, clear-pattern
// (8 sessions with systematic case-drift) on vowels.
// ──────────────────────────────────────────────────────────────────────

async function seedCohorts() {
  // Clear pattern: 8 completed vowels sessions, 6 with case-sensitivity drift.
  for (let i = 0; i < 8; i++) {
    const hasCaseDrift = i < 6;
    const divergences: Divergence[] = hasCaseDrift
      ? [
          {
            divergenceId: `case_drift_${i}`,
            initialClassification: "drift",
            initialConfidence: "high",
            predictedJustification: "I forgot about the capital letters.",
            studentFacingQuestion:
              "Your spec said the function counts vowels like A, E, I, O, U as well as lowercase. I noticed your code only checks for lowercase. Can you tell me what happened there?",
            evidenceFromSpec: "counts both lowercase and uppercase",
            evidenceFromPlan: null,
            evidenceFromCode: "if c in 'aeiou':",
            studentResponse:
              i % 2 === 0 ? "I forgot" : "I didn't think about that",
            alignment: "aligned",
            finalClassification: "drift",
            finalClassificationReason:
              "Student confirmed unintended omission of uppercase handling.",
            respondedAt: new Date().toISOString(),
          },
        ]
      : [];
    const firstIterGaps = hasCaseDrift
      ? ["case_sensitivity", "empty_string"]
      : [];
    await prisma.session.create({
      data: {
        id: `cohort_vowels_${i}`,
        studentId: `cohort_vowels_student_${i}`,
        exerciseId: "vowels-stop5",
        startedAt: new Date(Date.now() - (60 + i) * 60_000),
        completedAt: new Date(Date.now() - i * 60_000),
        currentPhase: 5,
        phase1Data: {
          iterations: [
            {
              timestamp: new Date().toISOString(),
              studentSpecText: "counts vowels",
              opusQuestions: ["case? empty?"],
              gapsIdentified: firstIterGaps,
              gapsAddressedThisRound: ["y_as_vowel"],
              emergentGaps: [],
              passed: firstIterGaps.length === 0,
            },
            ...(hasCaseDrift
              ? [
                  {
                    timestamp: new Date().toISOString(),
                    studentSpecText:
                      "counts vowels a,e,i,o,u AND A,E,I,O,U. empty returns 0.",
                    opusQuestions: [],
                    gapsIdentified: [],
                    gapsAddressedThisRound: [
                      "case_sensitivity",
                      "empty_string",
                    ],
                    emergentGaps: [],
                    passed: true,
                  },
                ]
              : []),
          ],
          finalSpecText:
            "counts vowels a,e,i,o,u AND A,E,I,O,U. empty returns 0.",
          instructorConfiguredDimensionsAddressed: [
            "case_sensitivity",
            "y_as_vowel",
            "empty_string",
          ],
          helpRequests: [],
        },
        phase3Data: {
          opusExchanges: [],
          revisions: [],
          currentCode: "",
          finalCode: hasCaseDrift
            ? "def count_vowels(s):\n    c = 0\n    for x in s:\n        if x in 'aeiou':\n            c += 1\n    return c\n"
            : "def count_vowels(s):\n    c = 0\n    for x in s:\n        if x in 'aeiouAEIOU':\n            c += 1\n    return c\n",
          submittedAt: new Date().toISOString(),
        },
        phase4Data: {
          divergences,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        liveSummaries: [],
      },
    });
  }

  // Small sample: 2 completed password sessions with varied patterns.
  for (let i = 0; i < 2; i++) {
    await prisma.session.create({
      data: {
        id: `cohort_password_${i}`,
        studentId: `cohort_password_student_${i}`,
        exerciseId: "password-stop5",
        startedAt: new Date(Date.now() - (30 + i * 5) * 60_000),
        completedAt: new Date(Date.now() - (i * 5) * 60_000),
        currentPhase: 5,
        phase1Data: {
          iterations: Array.from({ length: i === 0 ? 3 : 5 }, (_, k) => ({
            timestamp: new Date().toISOString(),
            studentSpecText: `iteration ${k + 1}`,
            opusQuestions: [],
            gapsIdentified: k === (i === 0 ? 2 : 4) ? [] : ["non_string_input"],
            gapsAddressedThisRound: [],
            emergentGaps: [],
            passed: k === (i === 0 ? 2 : 4),
          })),
          finalSpecText: "spec text",
          instructorConfiguredDimensionsAddressed: [
            "exactly_8_behavior",
            "non_string_input",
            "special_char_set",
            "empty_string",
            "return_contract",
          ],
          helpRequests: [],
        },
        phase2Data: {
          planText: "plan",
          submittedAt: new Date().toISOString(),
        },
        phase3Data: {
          opusExchanges: [],
          revisions: [],
          currentCode: "",
          finalCode: "def validate(pw): return True",
          submittedAt: new Date().toISOString(),
        },
        phase4Data: {
          divergences: [
            {
              divergenceId: `pw_${i}_d1`,
              initialClassification: i === 0 ? "drift" : "revision",
              initialConfidence: "high",
              predictedJustification: "partial_justification",
              studentFacingQuestion: "question",
              evidenceFromSpec: "evidence",
              evidenceFromPlan: "evidence",
              evidenceFromCode: "evidence",
              studentResponse: "partial response",
              alignment: i === 0 ? "diverged" : "aligned",
              finalClassification: i === 0 ? "drift" : "revision",
              finalClassificationReason: "reason",
              respondedAt: new Date().toISOString(),
            },
          ],
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        liveSummaries: [],
      },
    });
  }
}

// ──────────────────────────────────────────────────────────────────────
// Run live-summary prompt on each active session.
// ──────────────────────────────────────────────────────────────────────

async function runLiveSummaries() {
  console.log("\n================================================================");
  console.log("LIVE SUMMARIES — 5 sessions");
  console.log("================================================================");

  const ids = [
    "s_stuck_ana",
    "s_high_beto",
    "s_align_carmen",
    "s_mid_diego",
    "s_help_elena",
  ];
  for (const id of ids) {
    const start = Date.now();
    const summary = await refreshSummaryForSession(id);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    if (!summary) {
      console.log(`\n── ${id} — NO SUMMARY (session closed?)`);
      continue;
    }
    console.log(`\n── ${id}  (${elapsed}s) ─────────────────────────`);
    console.log(`summary: ${summary.summaryText}`);
    console.log(`flags:   [${summary.flags.join(", ") || "—"}]`);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Run cohort-narrative prompt on both exercises.
// ──────────────────────────────────────────────────────────────────────

async function runCohortNarratives() {
  console.log("\n================================================================");
  console.log("COHORT NARRATIVES — 2 exercises");
  console.log("================================================================");

  for (const exerciseId of ["vowels-stop5", "password-stop5"]) {
    const aggregate = await aggregateExercise(exerciseId);
    console.log(`\n── ${exerciseId} — aggregate ───────────────────`);
    console.log(`  sessions: ${aggregate.sessionCount}`);
    console.log(
      `  divergences: drift=${aggregate.divergenceCategoryCounts.drift} revision=${aggregate.divergenceCategoryCounts.revision} bug=${aggregate.divergenceCategoryCounts.bug}`,
    );
    console.log(
      `  most-missed: ${aggregate.mostMissedDimensions.map((d) => `${d.id}(${d.count})`).join(", ") || "—"}`,
    );
    console.log(`  alignment failures: ${aggregate.alignmentFailures}`);
    const start = Date.now();
    const narrative = await callOpusAndParse({
      promptName: "cohort-narrative",
      system: COHORT_NARRATIVE_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildCohortNarrativeUserMessage({
            exerciseTitle: aggregate.exerciseTitle,
            exercisePrompt: aggregate.exercisePrompt,
            aggregate,
          }),
        },
      ],
      maxTokens: 2048,
      schema: CohortNarrativeOutput,
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n── ${exerciseId} — narrative  (${elapsed}s) ───────`);
    console.log(JSON.stringify(narrative, null, 2));
  }
}

async function main() {
  await wipe();
  await publishVowels();
  await publishPassword();
  await seedActiveSessions();
  await seedCohorts();

  console.log("\nSeeded:");
  const sessionCount = await prisma.session.count();
  const eventCount = await prisma.sessionEvent.count();
  console.log(`  sessions: ${sessionCount}`);
  console.log(`  events:   ${eventCount}`);

  await runLiveSummaries();
  await runCohortNarratives();

  console.log("\nDone. Open http://localhost:3000/live to see the dashboard.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
