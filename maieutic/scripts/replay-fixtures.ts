// scripts/replay-fixtures.ts — insert the captured fixtures into a fresh DB
// with rewritten timestamps so the demo looks like it's been running live.
//
// Timestamp policy (per Tech Spec §10):
//  - Completed sessions (Ana, Beto, cohort fill): marked finished 5–20 min ago.
//  - Carmen: started 14 min ago, still active, help request 4 min ago.
//  - Live summaries and events are rewritten relative to the same timeline so
//    "14 minutes into spec writing" reads correctly on the dashboard.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";

const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures");

async function wipe() {
  await prisma.sessionEvent.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.exercise.deleteMany({});
}

type ExerciseJson = {
  id: string;
  title: string;
  instructorPromptText: string;
  authoredAt: string;
  publishedAt: string | null;
  specGateDimensions: unknown;
  expectedDivergences: unknown;
  phase2Required: boolean;
  studentLevel: string;
  opusGeneratedDimensions: unknown;
  opusGeneratedDivergences: unknown;
  opusGeneratedPhase2Required: boolean;
  opusGeneratedStudentLevel: string;
};

type EventJson = {
  id: string;
  sessionId: string;
  kind: string;
  payload: unknown;
  createdAt: string;
};

type SessionJson = {
  id: string;
  studentId: string;
  exerciseId: string;
  startedAt: string;
  completedAt: string | null;
  currentPhase: number;
  phase1Data: unknown;
  phase2Data: unknown;
  phase3Data: unknown;
  phase4Data: unknown;
  liveSummaries: unknown;
  events: EventJson[];
};

// How far back to place each student's start time. Relative to `now` at
// replay time. Carmen stays active.
const OFFSETS_MIN: Record<string, { startedMinAgo: number; completedMinAgo: number | null }> = {
  ana_student: { startedMinAgo: 25, completedMinAgo: 18 },
  beto_student: { startedMinAgo: 22, completedMinAgo: 12 },
  carmen_student: { startedMinAgo: 14, completedMinAgo: null },
  cohort_student_0: { startedMinAgo: 60, completedMinAgo: 50 },
  cohort_student_1: { startedMinAgo: 55, completedMinAgo: 42 },
  cohort_student_2: { startedMinAgo: 48, completedMinAgo: 35 },
  cohort_student_3: { startedMinAgo: 40, completedMinAgo: 28 },
};

function minutesAgoToDate(min: number): Date {
  return new Date(Date.now() - min * 60_000);
}

// Rebase a list of ISO timestamps so the first one lands at `firstAt` and
// relative spacing is preserved.
function rebaseTimestamps(dates: string[], firstAt: Date): string[] {
  if (dates.length === 0) return dates;
  const original = dates.map((d) => new Date(d).getTime());
  const base = Math.min(...original);
  return original.map((t) =>
    new Date(firstAt.getTime() + (t - base)).toISOString(),
  );
}

async function replayExercise(ex: ExerciseJson) {
  await prisma.exercise.create({
    data: {
      id: ex.id,
      title: ex.title,
      instructorPromptText: ex.instructorPromptText,
      authoredAt: new Date(ex.authoredAt),
      publishedAt: ex.publishedAt ? new Date(ex.publishedAt) : null,
      specGateDimensions: ex.specGateDimensions as never,
      expectedDivergences: ex.expectedDivergences as never,
      phase2Required: ex.phase2Required,
      studentLevel: ex.studentLevel,
      opusGeneratedDimensions: ex.opusGeneratedDimensions as never,
      opusGeneratedDivergences: ex.opusGeneratedDivergences as never,
      opusGeneratedPhase2Required: ex.opusGeneratedPhase2Required,
      opusGeneratedStudentLevel: ex.opusGeneratedStudentLevel,
    },
  });
}

async function replaySession(s: SessionJson) {
  const offset = OFFSETS_MIN[s.studentId];
  if (!offset) {
    console.warn(`  ! no offset for student ${s.studentId}, using defaults`);
  }
  const startedMinAgo = offset?.startedMinAgo ?? 30;
  const completedMinAgo = offset?.completedMinAgo ?? null;
  const startedAt = minutesAgoToDate(startedMinAgo);
  const completedAt = completedMinAgo !== null ? minutesAgoToDate(completedMinAgo) : null;
  const windowMs = (completedAt ?? new Date()).getTime() - startedAt.getTime();

  // Rebase nested timestamps inside the phase JSONs — they're all strings
  // scattered across iterations / exchanges / divergences.
  const phase1 = s.phase1Data as {
    iterations?: Array<{ timestamp: string } & Record<string, unknown>>;
    helpRequests?: Array<{ timestamp: string } & Record<string, unknown>>;
    [k: string]: unknown;
  } | null;

  if (phase1?.iterations) {
    const rebasedTs = rebaseTimestamps(
      phase1.iterations.map((i) => i.timestamp),
      new Date(startedAt.getTime() + 30_000), // start iterations 30s after session start
    );
    phase1.iterations = phase1.iterations.map((it, i) => ({
      ...it,
      timestamp: rebasedTs[i],
    }));
  }

  if (phase1?.helpRequests) {
    // Put each help request 3/4 of the way into the window.
    phase1.helpRequests = phase1.helpRequests.map((h) => ({
      ...h,
      timestamp: new Date(startedAt.getTime() + windowMs * 0.75).toISOString(),
    }));
  }

  await prisma.session.create({
    data: {
      id: s.id,
      studentId: s.studentId,
      exerciseId: s.exerciseId,
      startedAt,
      completedAt,
      currentPhase: s.currentPhase,
      phase1Data: (phase1 ?? {}) as never,
      phase2Data: (s.phase2Data ?? null) as never,
      phase3Data: (s.phase3Data ?? {}) as never,
      phase4Data: (s.phase4Data ?? null) as never,
      liveSummaries: (s.liveSummaries ?? []) as never,
    },
  });

  // Events — distribute across the session window preserving order.
  if (s.events?.length) {
    const originalTimes = s.events.map((e) => new Date(e.createdAt).getTime());
    const rebased = rebaseTimestamps(
      s.events.map((e) => e.createdAt),
      new Date(startedAt.getTime() + 10_000),
    ).map((d) => new Date(d));
    // If session is active and the last event would be in the future, clamp
    // the window to now - 30s for active sessions.
    for (let i = 0; i < s.events.length; i++) {
      const ev = s.events[i];
      let at = rebased[i];
      if (!completedAt && at.getTime() > Date.now() - 30_000) {
        at = new Date(Date.now() - 60_000 - (originalTimes.length - i) * 30_000);
      }
      await prisma.sessionEvent.create({
        data: {
          id: ev.id,
          sessionId: ev.sessionId,
          kind: ev.kind,
          payload: ev.payload as never,
          createdAt: at,
        },
      });
    }
  }
}

async function main() {
  const wipeFlag = process.argv.includes("--wipe") || process.argv.includes("--reset");
  if (wipeFlag) {
    console.log("Wiping DB...");
    await wipe();
  }

  const exercises = await fs.readdir(path.join(FIXTURE_DIR, "exercises"));
  console.log(`Replaying ${exercises.length} exercises...`);
  for (const file of exercises) {
    const raw = await fs.readFile(path.join(FIXTURE_DIR, "exercises", file), "utf8");
    const ex = JSON.parse(raw) as ExerciseJson;
    await replayExercise(ex);
    console.log(`  ✓ ${ex.id}`);
  }

  const sessions = await fs.readdir(path.join(FIXTURE_DIR, "sessions"));
  console.log(`\nReplaying ${sessions.length} sessions...`);
  for (const file of sessions) {
    const raw = await fs.readFile(path.join(FIXTURE_DIR, "sessions", file), "utf8");
    const s = JSON.parse(raw) as SessionJson;
    await replaySession(s);
    console.log(
      `  ✓ ${s.studentId} (${s.id.slice(0, 8)}…) — phase ${s.currentPhase}${s.completedAt ? " [closed]" : " [active]"}`,
    );
  }

  console.log("\nDone. Open /live to see the dashboard.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
