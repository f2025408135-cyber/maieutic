// Covers the "revisit / reset" routing rules:
//   - findOrCreateSession returns the resolver's pick (resume / phase 1 /
//     review) or creates a new session if nothing exists.
//   - listResolvedSessionsForStudent applies the same rule per exercise
//     so the exercise-list ✅ stays in sync with what findOrCreate would
//     do (a fresh "Start fresh" clears the check; a stale stray click
//     does not).
//   - createSession unconditionally opens a fresh session — what the
//     /api/exercise/[id]/reset route calls.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, sessionCreate, eventCreate } = vi.hoisted(() => ({
  findMany: vi.fn(),
  sessionCreate: vi.fn(),
  eventCreate: vi.fn(),
}));

vi.mock("../../src/lib/db", () => ({
  prisma: {
    session: { findMany, create: sessionCreate },
    sessionEvent: { create: eventCreate },
  },
}));

vi.mock("../../src/lib/events", () => ({
  sessionEventBus: { emit: vi.fn() },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  createSession,
  findOrCreateSession,
  listResolvedSessionsForStudent,
} from "../../src/lib/sessions";

const EX = "vowels-demo";
const STUDENT = "student-abc";

const STALE_EMPTY = {
  id: "stale-empty",
  exerciseId: EX,
  currentPhase: 1,
  phase1Data: { iterations: [] },
  startedAt: new Date("2026-03-01"),
  completedAt: null,
};
const OLD_COMPLETED = {
  id: "old-completed",
  exerciseId: EX,
  currentPhase: 5,
  phase1Data: { iterations: [{}] },
  startedAt: new Date("2026-03-15"),
  completedAt: new Date("2026-04-01"),
};
const JUST_RESET = {
  id: "just-reset",
  exerciseId: EX,
  currentPhase: 1,
  phase1Data: { iterations: [] },
  startedAt: new Date("2026-04-15T10:00:00Z"),
  completedAt: null,
};
const MID_ATTEMPT = {
  id: "mid-attempt",
  exerciseId: EX,
  currentPhase: 3,
  phase1Data: { iterations: [{ studentSpecText: "…" }] },
  startedAt: new Date("2026-04-10"),
  completedAt: null,
};

describe("findOrCreateSession", () => {
  beforeEach(() => {
    findMany.mockReset();
    sessionCreate.mockReset();
    eventCreate.mockReset();
  });

  it("falls through to the completed review when the only in-progress session is a stale empty phase 1", async () => {
    findMany.mockResolvedValue([STALE_EMPTY, OLD_COMPLETED]);
    const result = await findOrCreateSession(EX, STUDENT);
    expect(result.id).toBe("old-completed");
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("returns the empty session when Start fresh happened after the last completion", async () => {
    findMany.mockResolvedValue([
      JUST_RESET,
      { ...OLD_COMPLETED, completedAt: new Date("2026-04-15T09:00:00Z") },
    ]);
    const result = await findOrCreateSession(EX, STUDENT);
    expect(result.id).toBe("just-reset");
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("resumes a mid-attempt session even when a prior completed one exists", async () => {
    findMany.mockResolvedValue([MID_ATTEMPT, OLD_COMPLETED]);
    const result = await findOrCreateSession(EX, STUDENT);
    expect(result.id).toBe("mid-attempt");
  });

  it("resumes phase 1 once the student has submitted at least one iteration", async () => {
    findMany.mockResolvedValue([
      {
        ...MID_ATTEMPT,
        id: "phase1-with-progress",
        currentPhase: 1,
        phase1Data: { iterations: [{ studentSpecText: "first try" }] },
      },
    ]);
    const result = await findOrCreateSession(EX, STUDENT);
    expect(result.id).toBe("phase1-with-progress");
  });

  it("creates a fresh session only when nothing exists for this pair", async () => {
    findMany.mockResolvedValue([]);
    sessionCreate.mockResolvedValue({ id: "brand-new" });
    eventCreate.mockResolvedValue({ createdAt: new Date() });

    const result = await findOrCreateSession(EX, STUDENT);

    expect(result.id).toBe("brand-new");
    expect(sessionCreate).toHaveBeenCalledTimes(1);
  });
});

describe("listResolvedSessionsForStudent — drives the exercise-list ✅", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("clears the check after Start fresh until the new attempt completes", async () => {
    // Two exercises in scope:
    //   • EX:    just-reset on top of an old completed → ✅ should clear
    //   • OTHER: only an old completed → ✅ stays
    findMany.mockResolvedValue([
      JUST_RESET,
      { ...OLD_COMPLETED, completedAt: new Date("2026-04-15T09:00:00Z") },
      { ...OLD_COMPLETED, id: "other-done", exerciseId: "other" },
    ]);
    const map = await listResolvedSessionsForStudent(STUDENT);
    expect(map.get(EX)?.completedAt).toBeNull();
    expect(map.get("other")?.completedAt).not.toBeNull();
  });

  it("keeps ✅ when the only in-progress is a stale stray click", async () => {
    findMany.mockResolvedValue([STALE_EMPTY, OLD_COMPLETED]);
    const map = await listResolvedSessionsForStudent(STUDENT);
    expect(map.get(EX)?.id).toBe("old-completed");
    expect(map.get(EX)?.completedAt).not.toBeNull();
  });
});

describe("createSession (used by /reset)", () => {
  beforeEach(() => {
    findMany.mockReset();
    sessionCreate.mockReset();
    eventCreate.mockReset();
  });

  it("creates a session without consulting existing ones", async () => {
    sessionCreate.mockResolvedValue({ id: "reset-new" });
    eventCreate.mockResolvedValue({ createdAt: new Date() });

    const result = await createSession(EX, STUDENT);

    expect(result.id).toBe("reset-new");
    expect(findMany).not.toHaveBeenCalled();
    expect(sessionCreate.mock.calls[0]![0]!.data).toMatchObject({
      exerciseId: EX,
      studentId: STUDENT,
      currentPhase: 1,
    });
  });
});
