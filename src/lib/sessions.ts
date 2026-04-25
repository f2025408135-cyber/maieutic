// Thin wrappers around Prisma + Zod validation on every write. Route
// Handlers should call these rather than touching Prisma directly, so the
// JSON blobs in the DB are always known-good shapes.

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { sessionEventBus } from "./events";
import { defaultUnitForLevel } from "@/lib/units";

// Prisma's `InputJsonValue` requires a recursive index signature that
// Zod-inferred object literals don't structurally satisfy. Since everything
// we pass through here is already Zod-validated pure JSON, launder the type.
const asJson = <T>(v: T) => v as unknown as Prisma.InputJsonValue;
import {
  Divergence,
  ExerciseAuthoringInput,
  ExerciseRecord,
  HelpRequest,
  LiveSummary,
  OpusGeneratedDimension,
  OpusGeneratedDivergence,
  Phase1Data,
  Phase1Iteration,
  Phase2Data,
  Phase2Exchange,
  Phase2Revision,
  Phase3Data,
  SessionEventKind,
  SessionEventPayloadSchemaByKind,
  SpecDimension,
  ExpectedDivergence,
  emptyPhase1Data,
  emptyPhase2Data,
  parseSessionEventPayload,
  type Alignment,
  type DivergenceCategory,
} from "./opus/schemas";
import { z } from "zod";

// ─── Exercises ─────────────────────────────────────────────────────────────

export async function createExercise(input: ExerciseAuthoringInput) {
  const parsed = ExerciseAuthoringInput.parse(input);
  return prisma.exercise.create({
    data: {
      id: parsed.id,
      title: parsed.title,
      instructorPromptText: parsed.instructorPromptText,
      specGateDimensions: asJson(parsed.specGateDimensions),
      expectedDivergences: asJson(parsed.expectedDivergences),
      studentLevel: parsed.studentLevel,
      unit: parsed.unit ?? defaultUnitForLevel(parsed.studentLevel),
      opusGeneratedDimensions: asJson(parsed.opusGeneratedDimensions),
      opusGeneratedDivergences: asJson(parsed.opusGeneratedDivergences),
      opusGeneratedStudentLevel: parsed.opusGeneratedStudentLevel,
      publishedAt: new Date(),
    },
  });
}

export async function getExercise(exerciseId: string): Promise<ExerciseRecord> {
  const row = await prisma.exercise.findUniqueOrThrow({
    where: { id: exerciseId },
  });
  return ExerciseRecord.parse({
    id: row.id,
    title: row.title,
    instructorPromptText: row.instructorPromptText,
    authoredAt: row.authoredAt,
    publishedAt: row.publishedAt,
    specGateDimensions: row.specGateDimensions,
    expectedDivergences: row.expectedDivergences,
    studentLevel: row.studentLevel,
    unit: row.unit,
    opusGeneratedDimensions: row.opusGeneratedDimensions,
    opusGeneratedDivergences: row.opusGeneratedDivergences,
    opusGeneratedStudentLevel: row.opusGeneratedStudentLevel,
  });
}

// ─── Session lifecycle ─────────────────────────────────────────────────────

export async function createSession(exerciseId: string, studentId: string) {
  const session = await prisma.session.create({
    data: {
      exerciseId,
      studentId,
      currentPhase: 1,
      phase1Data: asJson(emptyPhase1Data()),
      phase2Data: asJson(emptyPhase2Data()),
      liveSummaries: asJson([]),
    },
  });
  // Tell the live dashboard about the new row without waiting for the
  // 10s snapshot tick.
  await appendSessionEvent(session.id, "session_started", {
    exerciseId,
    studentId,
  });
  return session;
}

export async function getSession(sessionId: string) {
  return prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
}

// Pure resolver: given every session for one (student, exercise) pair,
// pick the one the student should land on. Order of preference:
//   1. resumable in-progress (phase > 1, or phase 1 with iterations)
//   2. fresh empty session created after the last completion
//      (a just-clicked "Start fresh" lives here)
//   3. most-recent completed session (read-only review)
//   4. nothing — caller should create a new session
//
// The exercise list uses the same rule to decide whether to show the
// green ✅: only when this resolver would land the student on a
// completed session.
type ResolvableSession = {
  id: string;
  exerciseId: string;
  startedAt: Date;
  completedAt: Date | null;
  currentPhase: number;
  phase1Data: unknown;
};
export function resolveSession<T extends ResolvableSession>(
  sessions: T[],
): T | null {
  const inProgress = sessions
    .filter((s) => s.completedAt === null)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const resumable = inProgress.find((s) => {
    if (s.currentPhase > 1) return true;
    const p1 = s.phase1Data as { iterations?: unknown[] } | null;
    return (p1?.iterations?.length ?? 0) > 0;
  });
  if (resumable) return resumable;

  const completed = sessions
    .filter((s): s is T & { completedAt: Date } => s.completedAt !== null)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())[0];

  const mostRecentEmpty = inProgress[0];
  if (mostRecentEmpty) {
    if (!completed || mostRecentEmpty.startedAt > completed.completedAt) {
      return mostRecentEmpty;
    }
  }

  return completed ?? null;
}

export async function findOrCreateSession(
  exerciseId: string,
  studentId: string,
) {
  const sessions = await prisma.session.findMany({
    where: { exerciseId, studentId },
    orderBy: { startedAt: "desc" },
  });
  const resolved = resolveSession(sessions);
  if (resolved) return resolved;
  return createSession(exerciseId, studentId);
}

// Returns the resolved session per exercise the student has touched.
// Callers (e.g. /exercises) inspect `completedAt` on each resolved
// session to render the ✅ — staying in lockstep with findOrCreateSession.
export async function listResolvedSessionsForStudent(
  studentId: string,
): Promise<Map<string, Awaited<ReturnType<typeof prisma.session.findMany>>[number]>> {
  if (!studentId) return new Map();
  const rows = await prisma.session.findMany({
    where: { studentId },
  });
  const byExercise = new Map<string, typeof rows>();
  for (const s of rows) {
    const arr = byExercise.get(s.exerciseId) ?? [];
    arr.push(s);
    byExercise.set(s.exerciseId, arr);
  }
  const out = new Map<string, (typeof rows)[number]>();
  for (const [exId, sessions] of byExercise) {
    const resolved = resolveSession(sessions);
    if (resolved) out.set(exId, resolved);
  }
  return out;
}

export async function getSessionFull(sessionId: string) {
  return prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      exercise: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function listActiveSessions(sinceMinutes = 30) {
  const cutoff = new Date(Date.now() - sinceMinutes * 60 * 1000);
  return prisma.session.findMany({
    where: { completedAt: null, startedAt: { gte: cutoff } },
    include: { exercise: true },
    orderBy: { startedAt: "desc" },
  });
}

export async function listCompletedSessionsForExercise(exerciseId: string) {
  return prisma.session.findMany({
    where: { exerciseId, completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
  });
}

export async function advancePhase(
  sessionId: string,
  to: 1 | 2 | 3 | 4,
): Promise<void> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const from = session.currentPhase;
  if (from === to) return;
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      currentPhase: to,
      ...(to === 4 ? { completedAt: new Date() } : {}),
    },
  });
  await appendSessionEvent(sessionId, "phase_transition", { from, to });
  if (to === 4) {
    // revalidatePath only works inside a Next.js request. Wrap so that
    // CLI scripts (emulate-students, capture-fixtures, etc.) can call
    // advancePhase without tripping over the static-generation invariant.
    try {
      revalidatePath("/exercises");
    } catch {
      /* not in a request — the dashboard will revalidate on next visit */
    }
  }
}

// ─── Phase 1 ───────────────────────────────────────────────────────────────

export async function appendPhase1Iteration(
  sessionId: string,
  iter: Phase1Iteration,
): Promise<void> {
  const parsed = Phase1Iteration.parse(iter);
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const phase1 = Phase1Data.parse(session.phase1Data);
  phase1.iterations.push(parsed);
  // Track addressed dimensions as the cumulative union across rounds.
  const addressed = new Set(phase1.instructorConfiguredDimensionsAddressed);
  for (const id of parsed.gapsAddressedThisRound) addressed.add(id);
  phase1.instructorConfiguredDimensionsAddressed = [...addressed];
  if (parsed.passed) phase1.finalSpecText = parsed.studentSpecText;
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase1Data: asJson(phase1) },
  });
}

export async function appendHelpRequest(
  sessionId: string,
  req: HelpRequest,
): Promise<void> {
  const parsed = HelpRequest.parse(req);
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const phase1 = Phase1Data.parse(session.phase1Data);
  phase1.helpRequests.push(parsed);
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase1Data: asJson(phase1) },
  });
  await appendSessionEvent(sessionId, "help_request", {
    message: parsed.message,
    phase: session.currentPhase,
  });
}

export async function resolveHelpRequests(
  sessionId: string,
  resolution: string = "help_arrived",
): Promise<{ resolved: number }> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const phase1 = Phase1Data.parse(session.phase1Data);
  let resolved = 0;
  for (const req of phase1.helpRequests) {
    if (req.resolution === null) {
      req.resolution = resolution;
      resolved++;
    }
  }
  if (resolved === 0) return { resolved: 0 };
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase1Data: asJson(phase1) },
  });
  await appendSessionEvent(sessionId, "help_resolved", {
    phase: session.currentPhase,
    count: resolved,
  });
  return { resolved };
}

// ─── Phase 2 ───────────────────────────────────────────────────────────────

export async function appendPhase2Exchange(
  sessionId: string,
  ex: Phase2Exchange,
): Promise<void> {
  const parsed = Phase2Exchange.parse(ex);
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const phase2 = Phase2Data.parse(session.phase2Data);
  phase2.opusExchanges.push(parsed);
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase2Data: asJson(phase2) },
  });
}

export async function appendPhase2Revision(
  sessionId: string,
  rev: Phase2Revision,
): Promise<void> {
  const parsed = Phase2Revision.parse(rev);
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const phase2 = Phase2Data.parse(session.phase2Data);
  phase2.revisions.push(parsed);
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase2Data: asJson(phase2) },
  });
  await appendSessionEvent(sessionId, "revision", {
    amendmentText: parsed.amendmentText,
    justificationText: parsed.justificationText,
  });
}

export async function updateCurrentCode(
  sessionId: string,
  code: string,
): Promise<void> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const phase2 = Phase2Data.parse(session.phase2Data);
  phase2.currentCode = code;
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase2Data: asJson(phase2) },
  });
}

export async function finalizePhase2Code(
  sessionId: string,
  finalCode: string,
): Promise<void> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const phase2 = Phase2Data.parse(session.phase2Data);
  phase2.finalCode = finalCode;
  phase2.currentCode = finalCode;
  phase2.submittedAt = new Date().toISOString();
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase2Data: asJson(phase2) },
  });
}

// ─── Phase 3 ───────────────────────────────────────────────────────────────

export async function setPhase3Divergences(
  sessionId: string,
  divergences: Divergence[],
): Promise<void> {
  const parsed = z.array(Divergence).parse(divergences);
  const now = new Date().toISOString();
  const phase3: Phase3Data = {
    divergences: parsed,
    startedAt: now,
    completedAt: null,
    revisionChoice: null,
    revisedCode: null,
    revisedAt: null,
  };
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase3Data: asJson(phase3) },
  });
}

export async function recordDivergenceResponse(
  sessionId: string,
  divergenceId: string,
  response: string,
  alignment: Alignment,
  finalClassification: DivergenceCategory,
  finalClassificationReason: string,
): Promise<{ allAnswered: boolean; predictionUsed: string }> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  if (!session.phase3Data)
    throw new Error(`session ${sessionId} has no phase3Data`);
  const phase3 = Phase3Data.parse(session.phase3Data);
  const target = phase3.divergences.find((d) => d.divergenceId === divergenceId);
  if (!target) throw new Error(`unknown divergenceId: ${divergenceId}`);
  const predictionUsed = target.predictedJustification;
  target.studentResponse = response;
  target.alignment = alignment;
  target.finalClassification = finalClassification;
  target.finalClassificationReason = finalClassificationReason;
  target.respondedAt = new Date().toISOString();

  const allAnswered = phase3.divergences.every(
    (d) => d.studentResponse !== null,
  );
  if (allAnswered) phase3.completedAt = new Date().toISOString();

  await prisma.session.update({
    where: { id: sessionId },
    data: { phase3Data: asJson(phase3) },
  });

  if (alignment === "diverged") {
    await appendSessionEvent(sessionId, "alignment_failure", {
      divergenceId,
      prediction: predictionUsed,
      response,
    });
  }

  return { allAnswered, predictionUsed };
}

// Revision pass: called once, after all divergences are answered. Either
// records a skipped pass (no code change) or stores the revised code. Does
// not touch phase2.finalCode, divergence answers, or classifications —
// those are the frozen learning signal.
export async function recordFinalRevision(
  sessionId: string,
  revisedCode: string | null,
): Promise<void> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  if (!session.phase3Data)
    throw new Error(`session ${sessionId} has no phase3Data`);
  const phase3 = Phase3Data.parse(session.phase3Data);
  if (phase3.completedAt === null)
    throw new Error(`session ${sessionId} has unanswered divergences`);
  if (phase3.revisionChoice !== null)
    throw new Error(`session ${sessionId} already finalized`);
  phase3.revisionChoice = revisedCode === null ? "skipped" : "revised";
  phase3.revisedCode = revisedCode;
  phase3.revisedAt = new Date().toISOString();
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase3Data: asJson(phase3) },
  });
}

// ─── Live summaries ───────────────────────────────────────────────────────

export async function appendLiveSummary(
  sessionId: string,
  summary: LiveSummary,
): Promise<void> {
  const parsed = LiveSummary.parse(summary);
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const summaries = z.array(LiveSummary).parse(session.liveSummaries);
  summaries.push(parsed);
  await prisma.session.update({
    where: { id: sessionId },
    data: { liveSummaries: asJson(summaries) },
  });
  await appendSessionEvent(sessionId, "summary_refresh", {
    summary: parsed.summaryText,
    flags: parsed.flags,
  });
}

// ─── Session events ───────────────────────────────────────────────────────

export async function appendSessionEvent(
  sessionId: string,
  kind: SessionEventKind,
  payload: unknown,
): Promise<void> {
  const schema = SessionEventPayloadSchemaByKind[kind];
  const parsed = schema.parse(payload);
  const row = await prisma.sessionEvent.create({
    data: { sessionId, kind, payload: asJson(parsed) },
  });
  sessionEventBus.emit("event", {
    sessionId,
    kind,
    payload: parsed,
    createdAt: row.createdAt,
  });
}

export function isKnownEventKind(k: string): k is SessionEventKind {
  return k in SessionEventPayloadSchemaByKind;
}

// ─── Re-exports used by callers ───────────────────────────────────────────

export {
  SpecDimension,
  ExpectedDivergence,
  OpusGeneratedDimension,
  OpusGeneratedDivergence,
  parseSessionEventPayload,
};
