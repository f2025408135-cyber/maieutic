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
  language?: string;
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
      "Write a C function `int is_palindrome(const char *str)` that returns 1 if a string is a palindrome, and 0 otherwise. The function should ignore case and skip non-alphanumeric characters.",
    level: "week_3_6",
    unit: "unit_3",
    language: "c",
  },
  {
    id: "most-common-word",
    title: "Most common word",
    prompt:
      "Write a C function `void find_most_common_word(const char *text, char *result)` that finds the word that appears most frequently in a string of space-separated words, and copies it into the result buffer. Assume words are case-insensitive and ignore punctuation.",
    level: "week_3_6",
    unit: "unit_3",
    language: "c",
  },
  {
    id: "find-duplicates",
    title: "Find duplicates in a list",
    prompt:
      "Write a C function `int find_duplicates(const int *arr, int size, int *duplicates)` that takes an integer array, finds all values that appear more than once, and stores them in the duplicates array. The function should return the number of duplicates found. Each duplicate should appear only once in the result array.",
    level: "week_3_6",
    unit: "unit_3",
    language: "c",
  },
  {
    id: "fizzbuzz",
    title: "FizzBuzz",
    prompt:
      "Write a C program that asks the user for a positive integer N, then loops from 1 to N. For multiples of 3 print 'Fizz', for multiples of 5 print 'Buzz', for multiples of both print 'FizzBuzz', and for other numbers print the number itself.",
    level: "week_3_6",
    unit: "unit_3",
    language: "c",
  },
  {
    id: "matrix-multiplication",
    title: "Matrix multiplication",
    prompt:
      "Write a C program that reads the dimensions and elements of two matrices, verifies if multiplication is possible, computes the product matrix using nested loops, and prints the result.",
    level: "week_3_6",
    unit: "unit_3",
    language: "c",
  },

  // ── Unit IV · Functions ──────────────────────────────────────────────
  {
    id: "parse-csv-line",
    title: "Parse a CSV line",
    prompt:
      "Write a C function `int parse_csv(const char *line, char fields[][100], int max_fields)` that parses a single CSV line into a 2D character array of fields. The function must handle fields enclosed in double quotes that contain commas and return the total fields parsed.",
    level: "week_7_plus",
    unit: "unit_4",
    language: "c",
    phase2Override: true,
  },
  {
    id: "top-n-words",
    title: "Top N most-frequent words",
    prompt:
      "Write a C program that reads a paragraph of text, counts the occurrences of each unique word (case-insensitive), and prints the top N most frequent words in descending order of frequency. Break ties alphabetically.",
    level: "week_7_plus",
    unit: "unit_4",
    language: "c",
    phase2Override: true,
  },
  {
    id: "validate-email",
    title: "Validate an email",
    prompt:
      "Write a C function `int validate_email(const char *email)` that checks if a string is a valid email address, returning 1 if valid, and 0 otherwise. A valid email has exactly one '@', at least one character before the '@', a domain with at least one '.' after the '@', and no whitespace.",
    level: "week_7_plus",
    unit: "unit_4",
    language: "c",
    phase2Override: true,
  },
  {
    id: "merge-sorted-lists",
    title: "Merge two sorted lists",
    prompt:
      "Write a C function `void merge_sorted_arrays(const int *arr1, int size1, const int *arr2, int size2, int *merged)` that merges two sorted integer arrays into a single sorted array in linear O(N) time (do not merge and re-sort).",
    level: "week_7_plus",
    unit: "unit_4",
    language: "c",
    phase2Override: true,
  },

  // ── Unit V · Pointers & Memory ────────────────────────────────────────
  {
    id: "reverse-array-pointers",
    title: "Reverse array using pointers",
    prompt:
      "Write a function `void reverse_array(int *arr, int size)` that reverses the elements of an integer array in place using pointer arithmetic (no array indexing like `arr[i]`).",
    level: "week_7_plus",
    unit: "unit_5",
    language: "c",
  },
  {
    id: "custom-string-concat",
    title: "Custom string concatenation",
    prompt:
      "Write a C function `void custom_strcat(char *dest, const char *src)` that appends the source string to the destination string using pointers. Do not use any `<string.h>` library functions.",
    level: "week_7_plus",
    unit: "unit_5",
    language: "c",
  },
  {
    id: "dynamic-array-stats",
    title: "Dynamic array statistics",
    prompt:
      "Write a C program that asks the user for a count N, dynamically allocates an integer array of size N using `malloc`, reads N integers from the user, and computes and prints the minimum, maximum, and average values. Free the memory before exit.",
    level: "week_7_plus",
    unit: "unit_5",
    language: "c",
  },
  {
    id: "dynamic-matrix-transpose",
    title: "Dynamic 2D matrix transpose",
    prompt:
      "Write a C program that dynamically allocates a 2D matrix of size R x C using pointer-to-pointer syntax (`int **matrix`). Read the matrix elements from the user, compute and print its transpose, and cleanly free all dynamically allocated memory.",
    level: "week_7_plus",
    unit: "unit_5",
    language: "c",
  },
  {
    id: "array-filter-callbacks",
    title: "Array filtering with callbacks",
    prompt:
      "Write a C function `int filter_array(const int *src, int size, int *dest, int (*predicate)(int))` that filters elements of an array using a callback function pointer. Implement predicate functions like `is_even` and `is_positive` to test it.",
    level: "week_7_plus",
    unit: "unit_5",
    language: "c",
  },

  // ── Unit VI · Dynamic Data Structures ─────────────────────────────────
  {
    id: "singly-linked-list-ops",
    title: "Singly linked list operations",
    prompt:
      "Write a C program that defines a singly linked list node structure. Implement functions to insert a node at the beginning and print all nodes. The program should read integers from the user until -1 is entered, build the list, print it, and free all nodes.",
    level: "week_7_plus",
    unit: "unit_6",
    language: "c",
  },
  {
    id: "stack-push-pop",
    title: "Stack push and pop",
    prompt:
      "Write a C program that implements a Stack data structure using a linked list. Implement `push` and `pop` functions. The program should push 3 integers onto the stack and pop them one by one, printing each popped value.",
    level: "week_7_plus",
    unit: "unit_6",
    language: "c",
  },
  {
    id: "binary-search-tree-check",
    title: "Binary search tree search",
    prompt:
      "Write a C program that builds a Binary Search Tree (BST) from user input and implements a recursive function `int search(Node* root, int key)` that returns 1 if the key is found, and 0 otherwise.",
    level: "week_7_plus",
    unit: "unit_6",
    language: "c",
  },

  // ── Unit VII · Advanced Systems & Bitwise ─────────────────────────────
  {
    id: "bitwise-bit-count",
    title: "Count set bits",
    prompt:
      "Write a C function `int count_set_bits(unsigned int n)` that counts and returns the number of set bits (1s) in its binary representation using bitwise operators (`&`, `>>`).",
    level: "week_7_plus",
    unit: "unit_7",
    language: "c",
  },
  {
    id: "file-char-frequency",
    title: "File character frequency",
    prompt:
      "Write a C program that opens a file named `input.txt` for reading, counts the total occurrences of a specific character (e.g. 'e'), and prints the result. Handle file open failures.",
    level: "week_7_plus",
    unit: "unit_7",
    language: "c",
  },
  {
    id: "bitwise-permissions",
    title: "Bitwise file permissions",
    prompt:
      "Write a C program that simulates UNIX-style file permissions (Read=4, Write=2, Execute=1) using bitwise flags. Implement functions to add a permission, remove a permission, and check if a permission is set using bitwise operators (`|`, `&`, `~`).",
    level: "week_7_plus",
    unit: "unit_7",
    language: "c",
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
    language: seed.language,
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
