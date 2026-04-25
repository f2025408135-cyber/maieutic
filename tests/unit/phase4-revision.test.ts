// Covers the revision-pass additions to Phase 4:
//   - Phase4Data back-compat when reading legacy session blobs that
//     predate the new revisionChoice/revisedCode/revisedAt fields
//   - recordFinalRevision state-machine guards (skipped vs. revised,
//     rejecting double-finalize, rejecting unanswered divergences)

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Prisma before importing the session helpers. The helpers only call
// session.findUniqueOrThrow and session.update, so we fake just those two.
// vi.mock is hoisted, so the fns have to be hoisted too.
const { findUniqueOrThrow, update } = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../src/lib/db", () => ({
  prisma: { session: { findUniqueOrThrow, update } },
}));

vi.mock("../../src/lib/events", () => ({
  sessionEventBus: { emit: vi.fn() },
}));

import { Phase4Data } from "../../src/lib/opus/schemas";
import { recordFinalRevision } from "../../src/lib/sessions";

const SID = "session-123";

const baseDivergence = {
  divergenceId: "d1",
  initialClassification: "drift" as const,
  initialConfidence: "high" as const,
  predictedJustification: "predicted",
  studentFacingQuestion: "Q",
  evidenceFromSpec: "spec",
  evidenceFromPlan: null,
  evidenceFromCode: "code",
  studentResponse: "I forgot",
  alignment: "partial" as const,
  finalClassification: "drift" as const,
  finalClassificationReason: "reason",
  respondedAt: "2026-04-24T00:00:00.000Z",
};

function legacyBlob() {
  // What an old session row looks like — the three new fields simply
  // aren't present. Zod's .default(null) should fill them on parse.
  return {
    divergences: [baseDivergence],
    startedAt: "2026-04-24T00:00:00.000Z",
    completedAt: "2026-04-24T00:01:00.000Z",
  };
}

function freshBlob(overrides: Partial<ReturnType<typeof legacyBlob>> = {}) {
  return {
    ...legacyBlob(),
    revisionChoice: null,
    revisedCode: null,
    revisedAt: null,
    ...overrides,
  };
}

describe("Phase4Data back-compat", () => {
  it("supplies null defaults when reading a legacy blob", () => {
    const parsed = Phase4Data.parse(legacyBlob());
    expect(parsed.revisionChoice).toBeNull();
    expect(parsed.revisedCode).toBeNull();
    expect(parsed.revisedAt).toBeNull();
  });

  it("round-trips a finalized blob without loss", () => {
    const blob = freshBlob({
      revisionChoice: "revised",
      revisedCode: "print('revised')",
      revisedAt: "2026-04-24T00:05:00.000Z",
    } as never);
    const parsed = Phase4Data.parse(blob);
    expect(parsed.revisionChoice).toBe("revised");
    expect(parsed.revisedCode).toBe("print('revised')");
    expect(parsed.revisedAt).toBe("2026-04-24T00:05:00.000Z");
  });
});

describe("recordFinalRevision", () => {
  beforeEach(() => {
    findUniqueOrThrow.mockReset();
    update.mockReset();
  });

  it("records a skipped pass when revisedCode is null", async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: SID,
      phase4Data: freshBlob(),
    });
    update.mockResolvedValue({});

    await recordFinalRevision(SID, null);

    expect(update).toHaveBeenCalledTimes(1);
    const written = update.mock.calls[0]![0]!.data.phase4Data as {
      revisionChoice: string | null;
      revisedCode: string | null;
      revisedAt: string | null;
    };
    expect(written.revisionChoice).toBe("skipped");
    expect(written.revisedCode).toBeNull();
    expect(written.revisedAt).not.toBeNull();
  });

  it("records a revised pass and preserves the revised code", async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: SID,
      phase4Data: freshBlob(),
    });
    update.mockResolvedValue({});

    await recordFinalRevision(SID, "def f(): pass\n");

    const written = update.mock.calls[0]![0]!.data.phase4Data as {
      revisionChoice: string;
      revisedCode: string;
    };
    expect(written.revisionChoice).toBe("revised");
    expect(written.revisedCode).toBe("def f(): pass\n");
  });

  it("rejects when divergences are still unanswered", async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: SID,
      phase4Data: freshBlob({ completedAt: null } as never),
    });

    await expect(recordFinalRevision(SID, null)).rejects.toThrow(
      /unanswered/i,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a second finalize", async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: SID,
      phase4Data: freshBlob({
        revisionChoice: "skipped",
        revisedAt: "2026-04-24T00:05:00.000Z",
      } as never),
    });

    await expect(recordFinalRevision(SID, "def g(): pass")).rejects.toThrow(
      /already finalized/i,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
