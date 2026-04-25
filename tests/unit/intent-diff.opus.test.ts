// Intent-diff regression test. Hits Opus for real — run via `npm run test:opus`.
//
// Structural assertions per Tech Spec §11:
//  - classification matches expected
//  - week_1_2 drift predictions contain "forgot|didn't|don't know|wasn't sure"
//  - week_7_plus revision predictions reference strategy/trade-off words
//  - student-facing questions never contain accusation markers

import { describe, expect, it } from "vitest";
import { callOpusAndParse } from "../../src/lib/opus/client";
import {
  INTENT_DIFF_SYSTEM,
  buildIntentDiffUserMessage,
} from "../../src/lib/opus/prompts/intent-diff";
import {
  IntentDiffOutput,
  Phase2ChatOutput,
  PostHocOutput,
  type ExerciseRecord,
  type Phase1Data,
  type Phase2Data,
  type StudentLevel,
} from "../../src/lib/opus/schemas";
import {
  PHASE2_CHAT_SYSTEM,
  buildPhase2ChatUserMessage,
} from "../../src/lib/opus/prompts/phase2-chat";
import {
  POST_HOC_SYSTEM,
  buildPostHocUserMessage,
} from "../../src/lib/opus/prompts/post-hoc";

const ACCUSATION_MARKERS = /required|must|failed|wrong|should have/i;
const WEEK_1_2_FORGET = /forgot|didn't|don't know|wasn't sure|skipped|didn't think/i;
const WEEK_7_PLUS_STRATEGIC =
  /trade-off|strategy|simpler|cleaner|complexity|amortized|hashmap|loop|pass|efficient|idiomatic|readable|readability/i;

function buildPhases(args: {
  spec: string;
  code: string;
}): { phase1: Phase1Data; phase2: Phase2Data } {
  return {
    phase1: {
      iterations: [],
      finalSpecText: args.spec,
      instructorConfiguredDimensionsAddressed: [],
      helpRequests: [],
    },
    phase2: {
      opusExchanges: [],
      revisions: [],
      currentCode: args.code,
      finalCode: args.code,
      submittedAt: new Date().toISOString(),
    },
  };
}

async function runIntentDiff(args: {
  studentLevel: StudentLevel;
  instructorPromptText: string;
  expectedDivergences?: ExerciseRecord["expectedDivergences"];
  spec: string;
  code: string;
}) {
  return callOpusAndParse({
    promptName: "intent-diff",
    system: INTENT_DIFF_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildIntentDiffUserMessage({
          exercise: {
            instructorPromptText: args.instructorPromptText,
            studentLevel: args.studentLevel,
            expectedDivergences: args.expectedDivergences ?? [],
          },
          ...buildPhases({ spec: args.spec, code: args.code }),
        }),
      },
    ],
    maxTokens: 4096,
    schema: IntentDiffOutput,
  });
}

describe("intent-diff — classification and prediction register", () => {
  it("week_1_2 drift: vowels lowercase-only → drift with forgetting language", async () => {
    const out = await runIntentDiff({
      studentLevel: "week_1_2",
      instructorPromptText: "Write a function that counts vowels in a string.",
      spec: "The function counts vowels. Both lowercase and uppercase A,E,I,O,U. Empty returns 0.",
      code:
        "def count_vowels(s):\n    c = 0\n    for x in s:\n        if x in 'aeiou':\n            c = c + 1\n    return c\n",
    });
    expect(out.divergences.length).toBeGreaterThanOrEqual(1);
    const d = out.divergences[0];
    expect(d.initial_classification).toBe("drift");
    expect(d.predicted_justification).toMatch(WEEK_1_2_FORGET);
    expect(d.student_facing_question).not.toMatch(ACCUSATION_MARKERS);
  });

  it("week_1_2 no divergence: clean vowels implementation → empty divergences", async () => {
    const out = await runIntentDiff({
      studentLevel: "week_1_2",
      instructorPromptText: "Write a function that counts vowels in a string.",
      spec: "Counts both lowercase aeiou and uppercase AEIOU. 'y' not counted. Empty returns 0.",
      code:
        "def count_vowels(s):\n    c = 0\n    for x in s:\n        if x in 'aeiouAEIOU':\n            c += 1\n    return c\n",
    });
    expect(out.divergences.length).toBe(0);
  });

  it("week_3_6 bug: overwrite instead of increment → bug", async () => {
    const out = await runIntentDiff({
      studentLevel: "week_3_6",
      instructorPromptText:
        "Return the most common word in a string of space-separated words.",
      spec: "Returns the word with the highest count. Splits the input on whitespace, builds a dictionary mapping each word to its count, increments per word, and returns the max. Empty string returns empty string.",
      code:
        'def most_common(s):\n    if s == "":\n        return ""\n    counts = {}\n    for w in s.split():\n        counts[w] = 1\n    return max(counts, key=counts.get)\n',
    });
    expect(out.divergences.length).toBeGreaterThanOrEqual(1);
    expect(out.divergences[0].initial_classification).toBe("bug");
    expect(out.divergences[0].student_facing_question).not.toMatch(
      ACCUSATION_MARKERS,
    );
  });

  it("week_7_plus revision (bias rule): any() refactor → revision with strategic prediction", async () => {
    const out = await runIntentDiff({
      studentLevel: "week_7_plus",
      instructorPromptText:
        "Validate a password: >=8 chars, a digit, an uppercase letter, one of !@#$%.",
      spec: "Returns True iff length >= 8 AND at least one digit AND at least one uppercase AND at least one of !@#$%. Non-string input returns False. Empty returns False. I'll use four boolean variables, one per rule, updated in a single loop, and return True iff all four flags pass plus the length check.",
      code:
        "def validate(pw):\n    if not isinstance(pw, str) or len(pw) < 8:\n        return False\n    return (any(c.isdigit() for c in pw)\n            and any(c.isupper() for c in pw)\n            and any(c in '!@#$%' for c in pw))\n",
    });
    expect(out.divergences.length).toBeGreaterThanOrEqual(1);
    const d = out.divergences[0];
    expect(d.initial_classification).toBe("revision");
    expect(d.predicted_justification.length).toBeGreaterThan(40);
    expect(d.predicted_justification).toMatch(WEEK_7_PLUS_STRATEGIC);
    expect(d.student_facing_question).not.toMatch(ACCUSATION_MARKERS);
  });

  it("week_7_plus drift: drops a rule → drift even among mixed refactor", async () => {
    const out = await runIntentDiff({
      studentLevel: "week_7_plus",
      instructorPromptText:
        "Validate a password: >=8 chars, a digit, an uppercase letter, one of !@#$%.",
      spec: "Returns True iff length >= 8 AND at least one digit AND at least one uppercase AND at least one of !@#$%. Non-string returns False. Four boolean checks using explicit loops; return True iff all pass.",
      code:
        "def validate(pw):\n    if not isinstance(pw, str) or len(pw) < 8:\n        return False\n    return (any(c.isdigit() for c in pw)\n            and any(c.isupper() for c in pw))\n",
    });
    const categories = out.divergences.map((d) => d.initial_classification);
    expect(categories).toContain("drift");
  });
});

describe("phase-2 chat — mode selection", () => {
  const ctx = {
    exercise: {
      instructorPromptText: "Write a function that counts vowels in a string.",
      studentLevel: "week_1_2" as StudentLevel,
    },
    specText: "Counts both lowercase aeiou and uppercase AEIOU. Empty returns 0.",
    currentCode:
      "def count_vowels(s):\n    c = 0\n    for x in s:\n        if x in 'aeiouAEIOU':\n            c = c + 1\n    return c\n",
    recentExchanges: [],
  };

  async function runChat(message: string) {
    return callOpusAndParse({
      promptName: "phase2-chat",
      system: PHASE2_CHAT_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildPhase2ChatUserMessage({ ...ctx, studentMessage: message }),
        },
      ],
      maxTokens: 1024,
      schema: Phase2ChatOutput,
    });
  }

  it("own-code question → interrogative", async () => {
    const out = await runChat("Why does my loop terminate early?");
    expect(out.mode).toBe("interrogative");
  });

  it("language reference → direct", async () => {
    const out = await runChat("What is the syntax of a dictionary in Python?");
    expect(out.mode).toBe("direct");
  });

  it("generic list-comprehension reference → direct", async () => {
    const out = await runChat(
      "What's the syntax for a list comprehension that filters evens?",
    );
    expect(out.mode).toBe("direct");
  });
});

describe("post-hoc re-classifier", () => {
  async function runPostHoc(args: {
    level: StudentLevel;
    initial: "drift" | "revision" | "bug";
    predicted: string;
    response: string;
  }) {
    return callOpusAndParse({
      promptName: "post-hoc",
      system: POST_HOC_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildPostHocUserMessage({
            studentLevel: args.level,
            initialClassification: args.initial,
            predictedJustification: args.predicted,
            studentResponse: args.response,
          }),
        },
      ],
      maxTokens: 512,
      schema: PostHocOutput,
    });
  }

  it("aligned drift stays drift", async () => {
    const out = await runPostHoc({
      level: "week_1_2",
      initial: "drift",
      predicted: "I forgot about the capital letters.",
      response: "I forgot about the capital letters.",
    });
    expect(out.alignment).toBe("aligned");
    expect(out.final_classification).toBe("drift");
  });

  it("coherent justification flips drift → revision", async () => {
    const out = await runPostHoc({
      level: "week_7_plus",
      initial: "drift",
      predicted: "I forgot about the capital letters.",
      response:
        "I deliberately handle normalization externally — the caller is expected to pass a pre-normalized string.",
    });
    expect(out.final_classification).toBe("revision");
  });
});
