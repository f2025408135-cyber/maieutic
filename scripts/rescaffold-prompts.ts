// scripts/rescaffold-prompts.ts — rewrite the 14 Unit I/II/III exercises as
// program-style (input()/print()) since function definition is taught in
// Unit IV. For each, update the prompt text and regenerate scaffolding
// via the real scaffolding prompt. Re-exports fixtures on exit.
//
// Unit IV exercises (password, parse-csv-line, top-n-words, validate-email,
// merge-sorted-lists) are left untouched — their "Write a function" phrasing
// is pedagogically correct.

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
  ScaffoldingOutput,
  scaffoldingOutputToAuthoringFields,
} from "../src/lib/opus/schemas";

interface Rewrite {
  id: string;
  title: string;
  prompt: string;
  unit: "unit_1" | "unit_2" | "unit_3" | "unit_4";
}

const REWRITES: Rewrite[] = [
  // ── Unit I · Python Fundamentals ─────────────────────────────────────
  {
    id: "greet-by-name",
    title: "Greet by name",
    prompt:
      "Write a program that asks the user for their name, then prints a friendly greeting like 'Hello, Alice!'.",
    unit: "unit_1",
  },
  {
    id: "circle-area",
    title: "Area of a circle",
    prompt:
      "Write a program that asks the user for a circle's radius, then prints the area using the formula π × r². Use 3.14159 for π.",
    unit: "unit_1",
  },
  {
    id: "rectangle-perimeter",
    title: "Perimeter of a rectangle",
    prompt:
      "Write a program that asks the user for the width and height of a rectangle, then prints its perimeter (2 × width + 2 × height).",
    unit: "unit_1",
  },
  {
    id: "price-with-tax",
    title: "Price with tax",
    prompt:
      "Write a program that asks the user for a price and a tax rate (as a percentage, e.g. 19.0 for 19%), then prints the total price including tax.",
    unit: "unit_1",
  },

  // ── Unit II · Control Structures ─────────────────────────────────────
  {
    id: "vowels-demo",
    title: "Count vowels",
    prompt:
      "Write a program that asks the user for a string, then prints how many vowels it contains.",
    unit: "unit_2",
  },
  {
    id: "count-down-from-n",
    title: "Count down from N",
    prompt:
      "Write a program that asks the user for a positive integer n, then prints each number from n down to 1, one per line.",
    unit: "unit_2",
  },
  {
    id: "sum-first-n",
    title: "Sum the first N integers",
    prompt:
      "Write a program that asks the user for a positive integer n, then prints the sum of the integers from 1 to n.",
    unit: "unit_2",
  },
  {
    id: "even-or-odd",
    title: "Even or odd",
    prompt:
      "Write a program that asks the user for an integer, then prints 'even' or 'odd'.",
    unit: "unit_2",
  },
  {
    id: "max-of-three",
    title: "Maximum of three",
    prompt:
      "Write a program that asks the user for three numbers, then prints the largest one. Do not use the built-in max() — decide with conditionals.",
    unit: "unit_2",
  },

  // ── Unit III · Data Structures ───────────────────────────────────────
  {
    id: "fibonacci-demo",
    title: "Nth Fibonacci number",
    prompt:
      "Write a program that asks the user for a non-negative integer n, then prints the nth Fibonacci number, where fib(0) = 0 and fib(1) = 1.",
    unit: "unit_3",
  },
  {
    id: "palindrome-check",
    title: "Palindrome check",
    prompt:
      "Write a program that asks the user for a string, then prints True if it's a palindrome (ignoring case and non-letter characters) and False otherwise.",
    unit: "unit_3",
  },
  {
    id: "most-common-word",
    title: "Most common word",
    prompt:
      "Write a program that asks the user for a line of space-separated words, then prints the word that appears most often. If there is a tie, print the word that appears first in the input.",
    unit: "unit_3",
  },
  {
    id: "find-duplicates",
    title: "Find duplicates in a list",
    prompt:
      "Write a program that asks the user for a comma-separated list of values, then prints each value that appears more than once. Each duplicate value should be printed only once.",
    unit: "unit_3",
  },
  {
    id: "fizzbuzz",
    title: "FizzBuzz",
    prompt:
      "Write a program that asks the user for a positive integer n, then prints one line per number from 1 through n. For multiples of 3 print 'Fizz'. For multiples of 5 print 'Buzz'. For multiples of both print 'FizzBuzz'. For other numbers, print the number.",
    unit: "unit_3",
  },
];

const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures", "exercises");

async function rescaffoldOne(r: Rewrite) {
  const existing = await prisma.exercise.findUnique({ where: { id: r.id } });
  if (!existing) {
    console.log(`  ! ${r.id} — not in DB, skipping`);
    return false;
  }

  console.log(`  · ${r.id} — regenerating scaffolding…`);
  const scaffolding = await callOpusAndParse({
    promptName: "rescaffold:scaffolding",
    system: SCAFFOLDING_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildScaffoldingUserMessage(r.prompt, r.title, r.unit),
      },
    ],
    maxTokens: 4096,
    schema: ScaffoldingOutput,
  });
  const fields = scaffoldingOutputToAuthoringFields(scaffolding);

  await prisma.exercise.update({
    where: { id: r.id },
    data: {
      title: r.title,
      instructorPromptText: r.prompt,
      specGateDimensions: fields.specGateDimensions,
      expectedDivergences: fields.expectedDivergences,
      // Keep existing studentLevel and unit — those reflect the curriculum
      // placement, which hasn't changed.
      opusGeneratedDimensions: fields.opusGeneratedDimensions,
      opusGeneratedDivergences: fields.opusGeneratedDivergences,
      // Keep opusGeneratedStudentLevel stable.
    },
  });
  console.log(`    ${fields.specGateDimensions.length} dimensions`);
  return true;
}

async function exportExerciseFixtures() {
  await fs.mkdir(FIXTURE_DIR, { recursive: true });
  const exercises = await prisma.exercise.findMany({});
  for (const e of exercises) {
    await fs.writeFile(
      path.join(FIXTURE_DIR, `${e.id}.json`),
      JSON.stringify(e, null, 2),
    );
  }
  return exercises.length;
}

async function main() {
  console.log(`Rescaffolding ${REWRITES.length} exercises…`);
  let done = 0;
  for (const r of REWRITES) {
    if (await rescaffoldOne(r)) done++;
  }
  console.log(`\nRescaffolded ${done}/${REWRITES.length}.`);

  const total = await exportExerciseFixtures();
  console.log(`Re-exported all ${total} exercise fixtures.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
