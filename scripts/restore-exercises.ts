// One-off restore: reads tests/fixtures/exercises/*.json and inserts each
// into the DB. Skips any exercise whose id already exists. Drops the
// legacy phase2Required / opusGeneratedPhase2Required fields if present
// in the fixture JSON — they were retired when the plan phase was removed.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "exercises");

type FixtureExercise = {
  id: string;
  title: string;
  instructorPromptText: string;
  authoredAt: string;
  publishedAt: string | null;
  specGateDimensions: unknown;
  expectedDivergences: unknown;
  studentLevel: string;
  unit?: string;
  opusGeneratedDimensions: unknown;
  opusGeneratedDivergences: unknown;
  opusGeneratedStudentLevel: string;
};

async function main() {
  const files = (await fs.readdir(FIXTURES))
    .filter((f) => f.endsWith(".json"))
    .sort();
  let restored = 0;
  let skipped = 0;
  for (const file of files) {
    const raw = await fs.readFile(path.join(FIXTURES, file), "utf8");
    const ex = JSON.parse(raw) as FixtureExercise;
    const existing = await prisma.exercise.findUnique({ where: { id: ex.id } });
    if (existing) {
      console.log(`  • skip   ${ex.id} (already in DB)`);
      skipped++;
      continue;
    }
    await prisma.exercise.create({
      data: {
        id: ex.id,
        title: ex.title,
        instructorPromptText: ex.instructorPromptText,
        authoredAt: new Date(ex.authoredAt),
        publishedAt: ex.publishedAt ? new Date(ex.publishedAt) : null,
        specGateDimensions: ex.specGateDimensions as never,
        expectedDivergences: ex.expectedDivergences as never,
        studentLevel: ex.studentLevel,
        unit: ex.unit ?? "unit_2",
        opusGeneratedDimensions: ex.opusGeneratedDimensions as never,
        opusGeneratedDivergences: ex.opusGeneratedDivergences as never,
        opusGeneratedStudentLevel: ex.opusGeneratedStudentLevel,
      },
    });
    restored++;
    console.log(`  ✓ restore ${ex.id} — ${ex.title}`);
  }
  console.log(`\nDone. ${restored} restored, ${skipped} skipped.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
