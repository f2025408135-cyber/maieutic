// Applies the 2026-04-24 prompt clarifications from student feedback:
//   - Two unambiguous fixes (password-demo signature, find-duplicates
//     output shape).
//   - Eight illustrative-example additions that hint at the minimum
//     "print look" without prescribing the exact format.
//
// Idempotent: updates only the instructorPromptText field; nothing
// in-flight is disturbed.

import { prisma } from "../src/lib/db";

const UPDATES: Record<string, string> = {
  "password-demo":
    "Write a function that takes a password string and returns True if valid, False otherwise. A valid password is at least 8 characters, contains at least one digit, at least one uppercase letter, and at least one special character from !@#$%.",
  "find-duplicates":
    "Write a program that asks the user for a comma-separated list of values, then prints each value that appears more than once, one per line. Each duplicate value should appear only once.",
  "circle-area":
    "Write a program that asks the user for a circle's radius, then prints the area using the formula π × r² (e.g., `78.54`). Use 3.14159 for π.",
  "price-with-tax":
    "Write a program that asks the user for a price and a tax rate (as a percentage, e.g. 19.0 for 19%), then prints the total price including tax (e.g., `119.00`).",
  "rectangle-perimeter":
    "Write a program that asks the user for the width and height of a rectangle, then prints its perimeter — 2 × width + 2 × height (e.g., `30`).",
  "sum-first-n":
    "Write a program that asks the user for a positive integer n, then prints the sum of the integers from 1 to n (e.g., `55` for n=10).",
  "max-of-three":
    "Write a program that asks the user for three numbers, then prints the largest one (e.g., `17`). Do not use the built-in max() — decide with conditionals.",
  "fibonacci-demo":
    "Write a program that asks the user for a non-negative integer n, then prints the nth Fibonacci number (e.g., `5` for n=5), where fib(0) = 0 and fib(1) = 1.",
  "vowels-demo":
    "Write a program that asks the user for a string, then prints how many vowels it contains (e.g., `3`).",
  "most-common-word":
    "Write a program that asks the user for a line of space-separated words, then prints the word that appears most often (e.g., `the`). If there is a tie, print the word that appears first in the input.",
};

async function main() {
  let updated = 0;
  let skipped = 0;
  let missing = 0;
  for (const [id, newText] of Object.entries(UPDATES)) {
    const current = await prisma.exercise.findUnique({
      where: { id },
      select: { instructorPromptText: true },
    });
    if (!current) {
      console.log(`· missing in DB: ${id}`);
      missing++;
      continue;
    }
    if (current.instructorPromptText === newText) {
      console.log(`· already up to date: ${id}`);
      skipped++;
      continue;
    }
    await prisma.exercise.update({
      where: { id },
      data: { instructorPromptText: newText },
    });
    // Drop cached translations — they would otherwise serve the old text
    // to Spanish users.
    await prisma.exerciseTranslation.deleteMany({ where: { exerciseId: id } });
    console.log(`✓ updated: ${id}`);
    updated++;
  }
  console.log(
    `\n${updated} updated, ${skipped} already current, ${missing} missing.`,
  );
  await prisma.$disconnect();
}

main();
