import { NextResponse } from "next/server";
import { z } from "zod";
import { callOpusAndParse } from "@/lib/opus/client";
import {
  INTENT_DIFF_SYSTEM,
  buildIntentDiffUserMessage,
} from "@/lib/opus/prompts/intent-diff";
import {
  IntentDiffOutput,
  Phase1Data,
  Phase2Data,
  Phase3Data,
  intentDiffOutputToDivergences,
} from "@/lib/opus/schemas";
import {
  advancePhase,
  finalizePhase3Code,
  getExercise,
  getSession,
  setPhase4Divergences,
} from "@/lib/sessions";

const Body = z.object({
  finalCode: z.string().max(100_000),
});

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/session/[sid]/submit">,
) {
  const { sid } = await ctx.params;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", details: err instanceof Error ? err.message : "" },
      { status: 400 },
    );
  }

  const session = await getSession(sid);
  if (session.currentPhase !== 3) {
    return NextResponse.json(
      { error: "wrong_phase", currentPhase: session.currentPhase },
      { status: 409 },
    );
  }

  const exercise = await getExercise(session.exerciseId);
  const phase1 = Phase1Data.parse(session.phase1Data);
  const phase2 = session.phase2Data ? Phase2Data.parse(session.phase2Data) : null;

  // Persist the final code first, so the intent-diff prompt reads the
  // authoritative text even if the client's body somehow diverged.
  await finalizePhase3Code(sid, body.finalCode);
  const session2 = await getSession(sid);
  const phase3 = Phase3Data.parse(session2.phase3Data);

  let diff;
  try {
    diff = await callOpusAndParse({
      promptName: "intent-diff",
      system: INTENT_DIFF_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildIntentDiffUserMessage({
            exercise,
            phase1,
            phase2,
            phase3,
          }),
        },
      ],
      maxTokens: 4096,
      schema: IntentDiffOutput,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "opus_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }

  const divergences = intentDiffOutputToDivergences(diff);
  await setPhase4Divergences(sid, divergences);
  // No divergences → the student's work is already accepted; skip the
  // question loop and mark the session complete so the exercise shows
  // as done in the list.
  await advancePhase(sid, divergences.length === 0 ? 5 : 4);

  // Return only student-visible fields. Classification, prediction, and
  // confidence stay on the server (visible to instructors only).
  return NextResponse.json({
    divergences: divergences.map((d) => ({
      divergenceId: d.divergenceId,
      studentFacingQuestion: d.studentFacingQuestion,
    })),
    count: divergences.length,
  });
}
