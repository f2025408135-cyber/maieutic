// STOP 4 evidence — 5 intent-diff outputs + 3 phase-3 chat transcripts.
// Bypasses HTTP and calls the prompts directly; that's the thing Paula is
// reviewing.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { callOpusAndParse } from "../src/lib/opus/client";
import {
  INTENT_DIFF_SYSTEM,
  buildIntentDiffUserMessage,
} from "../src/lib/opus/prompts/intent-diff";
import {
  PHASE2_CHAT_SYSTEM,
  buildPhase2ChatUserMessage,
} from "../src/lib/opus/prompts/phase2-chat";
import {
  POST_HOC_SYSTEM,
  buildPostHocUserMessage,
} from "../src/lib/opus/prompts/post-hoc";
import {
  IntentDiffOutput,
  Phase2ChatOutput,
  PostHocOutput,
  type ExerciseRecord,
  type Phase1Data,
  type Phase2Data,
  type StudentLevel,
} from "../src/lib/opus/schemas";

type Scenario = {
  name: string;
  exercise: Pick<
    ExerciseRecord,
    "instructorPromptText" | "studentLevel" | "expectedDivergences"
  >;
  phase1Spec: string;
  finalCode: string;
  expectedClassification: "drift" | "revision" | "bug" | "empty";
};

function buildPhases(s: Scenario): {
  phase1: Phase1Data;
  phase2: Phase2Data;
} {
  return {
    phase1: {
      iterations: [],
      finalSpecText: s.phase1Spec,
      instructorConfiguredDimensionsAddressed: [],
      helpRequests: [],
    },
    phase2: {
      opusExchanges: [],
      revisions: [],
      currentCode: s.finalCode,
      finalCode: s.finalCode,
      submittedAt: new Date().toISOString(),
    },
  };
}

async function runIntentDiff(s: Scenario) {
  const phases = buildPhases(s);
  const start = Date.now();
  const out = await callOpusAndParse({
    promptName: "intent-diff",
    system: INTENT_DIFF_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildIntentDiffUserMessage({
          exercise: s.exercise,
          ...phases,
        }),
      },
    ],
    maxTokens: 4096,
    schema: IntentDiffOutput,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  return { out, elapsed };
}

const scenarios: Scenario[] = [
  {
    name: "1. week_1_2 DRIFT — vowels, lowercase-only",
    exercise: {
      instructorPromptText: "Write a function that counts vowels in a string.",
      studentLevel: "week_1_2",
      expectedDivergences: [
        {
          category: "drift",
          pattern: "code only checks lowercase despite case-insensitive spec",
          source: "opus",
        },
      ],
    },
    phase1Spec:
      "The function takes a string and counts how many vowels are in it. Vowels are both lowercase a,e,i,o,u and uppercase A,E,I,O,U. 'y' is not a vowel. An empty string returns 0.",
    finalCode: `def count_vowels(s):
    count = 0
    for c in s:
        if c in 'aeiou':
            count = count + 1
    return count
`,
    expectedClassification: "drift",
  },
  {
    name: "2. week_1_2 NO DIVERGENCE — vowels, clean implementation",
    exercise: {
      instructorPromptText: "Write a function that counts vowels in a string.",
      studentLevel: "week_1_2",
      expectedDivergences: [],
    },
    phase1Spec:
      "The function takes a string and returns the count of lowercase a,e,i,o,u AND uppercase A,E,I,O,U. 'y' is not a vowel. Empty string returns 0.",
    finalCode: `def count_vowels(s):
    count = 0
    vowels = 'aeiouAEIOU'
    for c in s:
        if c in vowels:
            count = count + 1
    return count
`,
    expectedClassification: "empty",
  },
  {
    name: "3. week_3_6 BUG — most common word, overwrite instead of increment",
    exercise: {
      instructorPromptText:
        "Return the most common word in a string of space-separated words.",
      studentLevel: "week_3_6",
      expectedDivergences: [
        {
          category: "bug",
          pattern: "dict init bug: counts[w] = 1 instead of counts[w] += 1",
          source: "opus",
        },
      ],
    },
    phase1Spec:
      "The function takes a string of space-separated words and returns the word with the highest count. Empty string returns the empty string. Ties are broken by first appearance.",
    finalCode: `def most_common(s):
    if s == "":
        return ""
    words = s.split()
    counts = {}
    for w in words:
        counts[w] = 1
    return max(counts, key=counts.get)
`,
    expectedClassification: "bug",
  },
  {
    name: "4. week_7_plus REVISION — password any() refactor (bias rule)",
    exercise: {
      instructorPromptText:
        "Validate a password: at least 8 chars, one digit, one uppercase, one special (!@#$%).",
      studentLevel: "week_7_plus",
      expectedDivergences: [
        {
          category: "revision",
          pattern:
            "plan says four booleans in one loop; code uses three any() expressions",
          source: "opus",
        },
      ],
    },
    phase1Spec:
      "The function takes a password string. It returns exactly True if length >= 8 AND contains at least one digit AND at least one uppercase letter AND at least one of !@#$%. Otherwise exactly False. Non-string input: return False. Empty string: return False.",
    finalCode: `def validate(pw):
    if not isinstance(pw, str) or len(pw) < 8:
        return False
    return (any(c.isdigit() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c in '!@#$%' for c in pw))
`,
    expectedClassification: "revision",
  },
  {
    name: "5. week_7_plus DRIFT + REVISION — password with missing special check AND coherent refactor",
    exercise: {
      instructorPromptText:
        "Validate a password: at least 8 chars, one digit, one uppercase, one special (!@#$%).",
      studentLevel: "week_7_plus",
      expectedDivergences: [
        { category: "drift", pattern: "drops a rule", source: "opus" },
      ],
    },
    phase1Spec:
      "The function takes a password string. It returns True iff length >= 8 AND at least one digit AND at least one uppercase letter AND at least one of !@#$%. Otherwise False. Non-string input returns False.",
    finalCode: `def validate(pw):
    if not isinstance(pw, str) or len(pw) < 8:
        return False
    return (any(c.isdigit() for c in pw)
            and any(c.isupper() for c in pw))
`,
    expectedClassification: "drift",
  },
];

// ─── Phase 3 chat scenarios ──────────────────────────────────────────────
type ChatScenario = {
  name: string;
  message: string;
  expectedMode: "interrogative" | "direct";
};

const chatScenarios: ChatScenario[] = [
  {
    name: "A. INTERROGATIVE — 'why does my loop terminate early?'",
    message: "Why does my loop terminate early?",
    expectedMode: "interrogative",
  },
  {
    name: "B. DIRECT — 'what is the syntax of a dictionary in Python?'",
    message: "What is the syntax of a dictionary in Python?",
    expectedMode: "direct",
  },
  {
    name: "C. EDGE — 'syntax for a list comprehension that filters evens?'",
    message: "What's the syntax for a list comprehension that filters evens?",
    expectedMode: "direct",
  },
];

// Shared context for chat scenarios — a mid-Phase-2 student working the vowels exercise
const chatContext = {
  exercise: {
    instructorPromptText: "Write a function that counts vowels in a string.",
    studentLevel: "week_1_2" as StudentLevel,
  },
  specText:
    "The function takes a string and counts both lowercase and uppercase vowels. Empty string returns 0.",
  currentCode: `def count_vowels(s):
    count = 0
    for c in s:
        if c in 'aeiouAEIOU':
            count = count + 1
    return count
`,
  recentExchanges: [],
};

async function runChat(s: ChatScenario) {
  const start = Date.now();
  const out = await callOpusAndParse({
    promptName: "phase2-chat",
    system: PHASE2_CHAT_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildPhase2ChatUserMessage({
          ...chatContext,
          studentMessage: s.message,
        }),
      },
    ],
    maxTokens: 1024,
    schema: Phase2ChatOutput,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  return { out, elapsed };
}

async function runPostHocDemo() {
  // Post-hoc demo: we take the vowel-drift scenario 1 and simulate Ana
  // answering "I forgot about the capital letters." Expect alignment=aligned,
  // final=drift.
  const out = await callOpusAndParse({
    promptName: "post-hoc",
    system: POST_HOC_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildPostHocUserMessage({
          studentLevel: "week_1_2",
          initialClassification: "drift",
          predictedJustification: "I forgot about the capital letters.",
          studentResponse: "I forgot about the capital letters.",
        }),
      },
    ],
    maxTokens: 512,
    schema: PostHocOutput,
  });
  console.log("\n── POST-HOC demo (aligned drift case) ─────────────────────");
  console.log(JSON.stringify(out, null, 2));

  // And the misalignment case
  const out2 = await callOpusAndParse({
    promptName: "post-hoc",
    system: POST_HOC_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildPostHocUserMessage({
          studentLevel: "week_1_2",
          initialClassification: "drift",
          predictedJustification: "I forgot about the capital letters.",
          studentResponse:
            "I wrote it that way on purpose because I wanted to handle normalization externally.",
        }),
      },
    ],
    maxTokens: 512,
    schema: PostHocOutput,
  });
  console.log("\n── POST-HOC demo (divergent coherent justification case) ─");
  console.log(JSON.stringify(out2, null, 2));
}

async function main() {
  console.log("\n================================================================");
  console.log("INTENT-DIFF — 5 scenarios");
  console.log("================================================================");
  for (const s of scenarios) {
    console.log(`\n── ${s.name} ───────────────────────────────`);
    const { out, elapsed } = await runIntentDiff(s);
    console.log(`(${elapsed}s, ${out.divergences.length} divergence(s))`);
    console.log(`Expected: ${s.expectedClassification}`);
    console.log(JSON.stringify(out, null, 2));
  }

  console.log("\n================================================================");
  console.log("PHASE-3 CHAT — 3 scenarios");
  console.log("================================================================");
  for (const s of chatScenarios) {
    console.log(`\n── ${s.name} ───────────────────────────────`);
    const { out, elapsed } = await runChat(s);
    console.log(`(${elapsed}s, mode=${out.mode}, expected=${s.expectedMode})`);
    console.log(`response: ${out.response}`);
  }

  await runPostHocDemo();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
