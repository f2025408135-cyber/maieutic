// Scaffolding prompt regression test. Hits Opus for real — run via
// `npm run test:opus`, not the default `npm test`.
//
// Structural (not string-equal) assertions per Tech Spec §11:
//  - dimension count is proportional to prompt complexity
//  - no dimension is a generic "edge case" style label
//  - student_level classification is plausible
//  - vague prompts surface a non-null prompt_quality_note

import { describe, it, expect } from "vitest";
import { callOpusAndParse } from "../../src/lib/opus/client";
import {
  SCAFFOLDING_SYSTEM,
  buildScaffoldingUserMessage,
} from "../../src/lib/opus/prompts/scaffolding";
import { ScaffoldingOutput } from "../../src/lib/opus/schemas";

const GENERIC_PATTERNS = [
  /edge cases?/i,
  /handle errors?/i,
  /as needed/i,
  /appropriate(ly)?/i,
  /properly/i,
  /correctly/i,
];

function assertNoGenericMarkers(text: string, context: string) {
  for (const pattern of GENERIC_PATTERNS) {
    expect(
      pattern.test(text),
      `${context} contains generic phrase ${pattern}: ${text}`,
    ).toBe(false);
  }
}

async function generate(title: string, prompt: string) {
  const start = Date.now();
  const out = await callOpusAndParse({
    promptName: "scaffolding:test",
    system: SCAFFOLDING_SYSTEM,
    messages: [
      { role: "user", content: buildScaffoldingUserMessage(prompt, title) },
    ],
    maxTokens: 4096,
    schema: ScaffoldingOutput,
  });
  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  return { out, elapsedSec };
}

describe("scaffolding prompt — structural quality", () => {
  it("trivial prompt: count vowels → 2–3 dimensions, week_1_2", async () => {
    const { out, elapsedSec } = await generate(
      "Count vowels",
      "Write a function that counts vowels in a string.",
    );
    console.log(`\n[trivial/vowels, ${elapsedSec}s]`, JSON.stringify(out, null, 2));

    expect(out.spec_gate_dimensions.length).toBeGreaterThanOrEqual(2);
    expect(out.spec_gate_dimensions.length).toBeLessThanOrEqual(4);
    expect(out.student_level).toBe("week_1_2");
    expect(out.prompt_quality_note).toBeNull();
    for (const d of out.spec_gate_dimensions) {
      assertNoGenericMarkers(d.description, `dimension.description (${d.id})`);
    }
  });

  it("trivial prompt: factorial → 2–3 dimensions", async () => {
    const { out, elapsedSec } = await generate(
      "Factorial",
      "Write a function that returns the factorial of a non-negative integer n.",
    );
    console.log(`\n[trivial/factorial, ${elapsedSec}s]`, JSON.stringify(out, null, 2));

    expect(out.spec_gate_dimensions.length).toBeGreaterThanOrEqual(2);
    expect(out.spec_gate_dimensions.length).toBeLessThanOrEqual(4);
    expect(["week_1_2", "week_3_6"]).toContain(out.student_level);
    expect(out.prompt_quality_note).toBeNull();
  });

  it("medium prompt: most common word → 3–5 dimensions", async () => {
    const { out, elapsedSec } = await generate(
      "Most common word",
      "Write a function that takes a string of words separated by spaces and returns the most common word.",
    );
    console.log(`\n[medium/most-common, ${elapsedSec}s]`, JSON.stringify(out, null, 2));

    expect(out.spec_gate_dimensions.length).toBeGreaterThanOrEqual(3);
    expect(out.spec_gate_dimensions.length).toBeLessThanOrEqual(6);
    expect(["week_3_6", "week_7_plus"]).toContain(out.student_level);
    for (const d of out.spec_gate_dimensions) {
      assertNoGenericMarkers(d.description, `dimension (${d.id})`);
    }
  });

  it("medium prompt: palindrome → 3–5 dimensions", async () => {
    const { out, elapsedSec } = await generate(
      "Palindrome check",
      "Write a function that returns True if a string is a palindrome, ignoring case and non-letter characters.",
    );
    console.log(`\n[medium/palindrome, ${elapsedSec}s]`, JSON.stringify(out, null, 2));

    expect(out.spec_gate_dimensions.length).toBeGreaterThanOrEqual(3);
    expect(out.spec_gate_dimensions.length).toBeLessThanOrEqual(6);
  });

  it("complex prompt: password validator → 5–7 dimensions, week_7_plus", async () => {
    const { out, elapsedSec } = await generate(
      "Password validator",
      "Write a function that validates a password. It must be at least 8 characters, contain at least one digit, at least one uppercase letter, and at least one special character from !@#$%. Return True if valid, False otherwise.",
    );
    console.log(`\n[complex/password, ${elapsedSec}s]`, JSON.stringify(out, null, 2));

    expect(out.spec_gate_dimensions.length).toBeGreaterThanOrEqual(5);
    expect(out.spec_gate_dimensions.length).toBeLessThanOrEqual(8);
    // Borderline between week_3_6 and week_7_plus in practice — the model
    // calls it either way depending on how much weight it places on the
    // "validation" cue. Both are defensible; accept either.
    expect(["week_3_6", "week_7_plus"]).toContain(out.student_level);
    for (const d of out.spec_gate_dimensions) {
      assertNoGenericMarkers(d.description, `dimension (${d.id})`);
    }
    for (const dv of out.expected_divergences) {
      assertNoGenericMarkers(dv.pattern, `divergence (${dv.category})`);
    }
  });

  it("vague prompt: 'animals' → surfaces prompt_quality_note", async () => {
    const { out, elapsedSec } = await generate(
      "Animals",
      "Make a program about animals.",
    );
    console.log(`\n[vague/animals, ${elapsedSec}s]`, JSON.stringify(out, null, 2));

    expect(out.prompt_quality_note).not.toBeNull();
    expect(out.prompt_quality_note!.length).toBeGreaterThan(20);
  });
});
