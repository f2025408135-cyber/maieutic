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
  Phase3Data,
  Phase3Exchange,
  Phase3Revision,
  Phase4Data,
  SessionEventKind,
  SessionEventPayloadSchemaByKind,
  SpecDimension,
  ExpectedDivergence,
  emptyPhase1Data,
  emptyPhase3Data,
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
      phase2Required: parsed.phase2Required,
      studentLevel: parsed.studentLevel,
      unit: parsed.unit ?? defaultUnitForLevel(parsed.studentLevel),
      opusGeneratedDimensions: asJson(parsed.opusGeneratedDimensions),
      opusGeneratedDivergences: asJson(parsed.opusGeneratedDivergences),
      opusGeneratedPhase2Required: parsed.opusGeneratedPhase2Required,
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
    phase2Required: row.phase2Required,
    studentLevel: row.studentLevel,
    unit: row.unit,
    opusGeneratedDimensions: row.opusGeneratedDimensions,
    opusGeneratedDivergences: row.opusGeneratedDivergences,
    opusGeneratedPhase2Required: row.opusGeneratedPhase2Required,
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
      phase3Data: asJson(emptyPhase3Data()),
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
  to: 1 | 2 | 3 | 4 | 5,
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
      ...(to === 5 ? { completedAt: new Date() } : {}),
    },
  });
  await appendSessionEvent(sessionId, "phase_transition", { from, to });
  if (to === 5) revalidatePath("/exercises");
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

export async function setPhase2Plan(
  sessionId: string,
  planText: string,
): Promise<void> {
  const parsed = Phase2Data.parse({
    planText,
    submittedAt: new Date().toISOString(),
  });
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase2Data: asJson(parsed) },
  });
}

// ─── Phase 3 ───────────────────────────────────────────────────────────────

export async function appendPhase3Exchange(
  sessionId: string,
  ex: Phase3Exchange,
): Promise<void> {
  const parsed = Phase3Exchange.parse(ex);
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const phase3 = Phase3Data.parse(session.phase3Data);
  phase3.opusExchanges.push(parsed);
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase3Data: asJson(phase3) },
  });
}

export async function appendPhase3Revision(
  sessionId: string,
  rev: Phase3Revision,
): Promise<void> {
  const parsed = Phase3Revision.parse(rev);
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const phase3 = Phase3Data.parse(session.phase3Data);
  phase3.revisions.push(parsed);
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase3Data: asJson(phase3) },
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
  const phase3 = Phase3Data.parse(session.phase3Data);
  phase3.currentCode = code;
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase3Data: asJson(phase3) },
  });
}

export async function finalizePhase3Code(
  sessionId: string,
  finalCode: string,
): Promise<void> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const phase3 = Phase3Data.parse(session.phase3Data);
  phase3.finalCode = finalCode;
  phase3.currentCode = finalCode;
  phase3.submittedAt = new Date().toISOString();
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase3Data: asJson(phase3) },
  });
}

// ─── Phase 4 ───────────────────────────────────────────────────────────────

export async function setPhase4Divergences(
  sessionId: string,
  divergences: Divergence[],
): Promise<void> {
  const parsed = z.array(Divergence).parse(divergences);
  const now = new Date().toISOString();
  const phase4: Phase4Data = {
    divergences: parsed,
    startedAt: now,
    completedAt: null,
    revisionChoice: null,
    revisedCode: null,
    revisedAt: null,
  };
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase4Data: asJson(phase4) },
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
  if (!session.phase4Data)
    throw new Error(`session ${sessionId} has no phase4Data`);
  const phase4 = Phase4Data.parse(session.phase4Data);
  const target = phase4.divergences.find((d) => d.divergenceId === divergenceId);
  if (!target) throw new Error(`unknown divergenceId: ${divergenceId}`);
  const predictionUsed = target.predictedJustification;
  target.studentResponse = response;
  target.alignment = alignment;
  target.finalClassification = finalClassification;
  target.finalClassificationReason = finalClassificationReason;
  target.respondedAt = new Date().toISOString();

  const allAnswered = phase4.divergences.every(
    (d) => d.studentResponse !== null,
  );
  if (allAnswered) phase4.completedAt = new Date().toISOString();

  await prisma.session.update({
    where: { id: sessionId },
    data: { phase4Data: asJson(phase4) },
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
// not touch phase3.finalCode, divergence answers, or classifications —
// those are the frozen learning signal.
export async function recordFinalRevision(
  sessionId: string,
  revisedCode: string | null,
): Promise<void> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  if (!session.phase4Data)
    throw new Error(`session ${sessionId} has no phase4Data`);
  const phase4 = Phase4Data.parse(session.phase4Data);
  if (phase4.completedAt === null)
    throw new Error(`session ${sessionId} has unanswered divergences`);
  if (phase4.revisionChoice !== null)
    throw new Error(`session ${sessionId} already finalized`);
  phase4.revisionChoice = revisedCode === null ? "skipped" : "revised";
  phase4.revisedCode = revisedCode;
  phase4.revisedAt = new Date().toISOString();
  await prisma.session.update({
    where: { id: sessionId },
    data: { phase4Data: asJson(phase4) },
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
