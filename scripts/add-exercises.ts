// scripts/add-exercises.ts — add a batch of exercises via the real
// scaffolding prompt and re-export fixtures. Run once when you want more
// exercises on the /exercises page.

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
  type StudentLevel,
} from "../src/lib/opus/schemas";
import { createExercise } from "../src/lib/sessions";
import type { Unit } from "../src/lib/units";

interface Seed {
  id: string;
  title: string;
  prompt: string;
  level: StudentLevel;
  unit: Unit;
  // Scaffolding's own phase2 judgment is usually fine; override here only
  // if we strongly disagree.
  phase2Override?: boolean;
}

const SEEDS: Seed[] = [
  // ── Unit I · Python Fundamentals ─────────────────────────────────────
  // Pure Unit I: variables, I/O, math, strings, casting. NO loops, NO
  // conditionals. Each is a function that takes args and returns a value.
  {
    id: "greet-by-name",
    title: "Greet by name",
    prompt:
      "Write a function that takes a person's name (a string) and returns a friendly greeting like 'Hello, Alice!'.",
    level: "week_1_2",
    unit: "unit_1",
  },
  {
    id: "circle-area",
    title: "Area of a circle",
    prompt:
      "Write a function that takes a radius (a number) and returns the area of a circle using the formula π × r². Use 3.14159 for π.",
    level: "week_1_2",
    unit: "unit_1",
  },
  {
    id: "rectangle-perimeter",
    title: "Perimeter of a rectangle",
    prompt:
      "Write a function that takes the width and height of a rectangle (two numbers) and returns its perimeter (2 × width + 2 × height).",
    level: "week_1_2",
    unit: "unit_1",
  },
  {
    id: "price-with-tax",
    title: "Price with tax",
    prompt:
      "Write a function that takes a price (a number) and a tax rate expressed as a percentage (e.g. 19.0 for 19%), and returns the total price including tax.",
    level: "week_1_2",
    unit: "unit_1",
  },

  // ── Unit II · Control Structures ─────────────────────────────────────
  {
    id: "count-down-from-n",
    title: "Count down from N",
    prompt:
      "Write a function that takes a positive integer n and prints each number from n down to 1, one per line.",
    level: "week_1_2",
    unit: "unit_2",
  },
  {
    id: "sum-first-n",
    title: "Sum the first N integers",
    prompt:
      "Write a function that takes a positive integer n and returns the sum of the integers from 1 to n.",
    level: "week_1_2",
    unit: "unit_2",
  },
  {
    id: "even-or-odd",
    title: "Even or odd",
    prompt:
      "Write a function that takes an integer and returns the string 'even' or 'odd'.",
    level: "week_1_2",
    unit: "unit_2",
  },
  {
    id: "max-of-three",
    title: "Maximum of three",
    prompt:
      "Write a function that takes three numbers and returns the largest one. Do not use the built-in max() function.",
    level: "week_1_2",
    unit: "unit_2",
  },

  // ── Unit III · Data Structures ───────────────────────────────────────
  {
    id: "palindrome-check",
    title: "Palindrome check",
    prompt:
      "Write a function that returns True if a string is a palindrome, ignoring case and non-letter characters.",
    level: "week_3_6",
    unit: "unit_3",
  },
  {
    id: "most-common-word",
    title: "Most common word",
    prompt:
      "Write a function that takes a string of space-separated words and returns the word that appears most often. Break ties by returning the word that appears first.",
    level: "week_3_6",
    unit: "unit_3",
  },
  {
    id: "find-duplicates",
    title: "Find duplicates in a list",
    prompt:
      "Write a function that takes a list and returns a new list containing only the items that appear more than once. Each duplicate should appear only once in the result.",
    level: "week_3_6",
    unit: "unit_3",
  },
  {
    id: "fizzbuzz",
    title: "FizzBuzz",
    prompt:
      "Write a function that takes a positive integer n and returns a list of strings for numbers 1 through n. For multiples of 3 use 'Fizz'. For multiples of 5 use 'Buzz'. For multiples of both use 'FizzBuzz'. For other numbers, use the number as a string.",
    level: "week_3_6",
    unit: "unit_3",
  },

  // ── Unit IV · Functions ──────────────────────────────────────────────
  {
    id: "parse-csv-line",
    title: "Parse a CSV line",
    prompt:
      "Write a function that takes a CSV line and a list of column names, and returns a dictionary mapping column names to values. Handle quoted fields that may contain commas.",
    level: "week_7_plus",
    unit: "unit_4",
    phase2Override: true,
  },
  {
    id: "top-n-words",
    title: "Top N most-frequent words",
    prompt:
      "Write a function that takes a paragraph of text and an integer n, and returns the n most-frequent words as a list. Words are case-insensitive. Break ties alphabetically.",
    level: "week_7_plus",
    unit: "unit_4",
    phase2Override: true,
  },
  {
    id: "validate-email",
    title: "Validate an email",
    prompt:
      "Write a function that takes a string and returns True if it is a valid email address. A valid address has exactly one '@', at least one character before it, a domain with at least one '.', and no whitespace.",
    level: "week_7_plus",
    unit: "unit_4",
    phase2Override: true,
  },
  {
    id: "merge-sorted-lists",
    title: "Merge two sorted dict lists",
    prompt:
      "Write a function that takes two lists of dictionaries, each already sorted by a 'timestamp' key, and returns a single merged list, sorted by 'timestamp'. Do not re-sort — merge in linear time.",
    level: "week_7_plus",
    unit: "unit_4",
    phase2Override: true,
  },
];

const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures");

async function publishOne(seed: Seed) {
  const existing = await prisma.exercise.findUnique({ where: { id: seed.id } });
  if (existing) {
    console.log(`  ✓ ${seed.id} (already exists, skipping)`);
    return false;
  }

  console.log(`  · ${seed.id} — generating scaffolding…`);
  const scaffolding = await callOpusAndParse({
    promptName: "add-exercises:scaffolding",
    system: SCAFFOLDING_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildScaffoldingUserMessage(seed.prompt, seed.title, seed.unit),
      },
    ],
    maxTokens: 4096,
    schema: ScaffoldingOutput,
  });
  const fields = scaffoldingOutputToAuthoringFields(scaffolding);

  await createExercise({
    id: seed.id,
    title: seed.title,
    instructorPromptText: seed.prompt,
    ...fields,
    // Always pin to our declared level so the /exercises grouping is
    // predictable regardless of Opus's own judgment.
    studentLevel: seed.level,
    opusGeneratedStudentLevel: seed.level,
    unit: seed.unit,
  });
  console.log(`    ${fields.specGateDimensions.length} dimensions`);
  return true;
}

async function exportExerciseFixtures() {
  await fs.mkdir(path.join(FIXTURE_DIR, "exercises"), { recursive: true });
  const exercises = await prisma.exercise.findMany({});
  for (const e of exercises) {
    await fs.writeFile(
      path.join(FIXTURE_DIR, "exercises", `${e.id}.json`),
      JSON.stringify(e, null, 2),
    );
  }
  return exercises.length;
}

async function main() {
  console.log(
    `Publishing ${SEEDS.length} new exercise${SEEDS.length === 1 ? "" : "s"}…`,
  );
  let added = 0;
  for (const seed of SEEDS) {
    if (await publishOne(seed)) added++;
  }
  console.log(`\nAdded ${added}/${SEEDS.length} exercises.`);

  const total = await exportExerciseFixtures();
  console.log(
    `Re-exported all ${total} exercise fixtures to tests/fixtures/exercises/.`,
  );
  console.log("\nrun `npm run reset-demo` to replay with the new set.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
