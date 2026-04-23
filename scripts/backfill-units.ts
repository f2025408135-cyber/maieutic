// One-off: assign the correct unit to each existing exercise in the DB,
// then re-export all exercise fixtures so reset-demo restores them.
//
// Classification rules:
//   - No current exercises are pure Unit I (variables/IO/types only). All
//     5 week_1_2 exercises use conditionals or loops → Unit II.
//   - All week_3_6 exercises are list/dict-centric → Unit III.
//   - All week_7_plus exercises require composed validation / multi-step
//     function logic → Unit IV.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import type { Unit } from "../src/lib/units";

const UNIT_BY_ID: Record<string, Unit> = {
  // Week 1–2 → Unit II (all use conditionals or loops).
  "vowels-demo": "unit_2",
  "count-down-from-n": "unit_2",
  "sum-first-n": "unit_2",
  "even-or-odd": "unit_2",
  "max-of-three": "unit_2",

  // Week 3–6 → Unit III (lists + dicts).
  "fibonacci-demo": "unit_3",
  "palindrome-check": "unit_3",
  "most-common-word": "unit_3",
  "find-duplicates": "unit_3",
  fizzbuzz: "unit_3",

  // Week 7+ → Unit IV.
  "password-demo": "unit_4",
  "parse-csv-line": "unit_4",
  "top-n-words": "unit_4",
  "validate-email": "unit_4",
  "merge-sorted-lists": "unit_4",
};

const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures", "exercises");

async function main() {
  const exercises = await prisma.exercise.findMany({});
  console.log(`Backfilling unit on ${exercises.length} exercises…`);

  for (const ex of exercises) {
    const unit = UNIT_BY_ID[ex.id];
    if (!unit) {
      console.log(`  ! ${ex.id}: no unit mapping, defaulting to unit_2`);
      await prisma.exercise.update({
        where: { id: ex.id },
        data: { unit: "unit_2" },
      });
      continue;
    }
    if (ex.unit === unit) {
      console.log(`  · ${ex.id}: already ${unit}`);
      continue;
    }
    await prisma.exercise.update({
      where: { id: ex.id },
      data: { unit },
    });
    console.log(`  ✓ ${ex.id}: ${ex.unit} → ${unit}`);
  }

  // Re-export fixtures with the new unit field.
  await fs.mkdir(FIXTURE_DIR, { recursive: true });
  const refreshed = await prisma.exercise.findMany({});
  for (const e of refreshed) {
    await fs.writeFile(
      path.join(FIXTURE_DIR, `${e.id}.json`),
      JSON.stringify(e, null, 2),
    );
  }
  console.log(`\nRe-exported ${refreshed.length} fixtures.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
