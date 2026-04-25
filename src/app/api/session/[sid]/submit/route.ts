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
  intentDiffOutputToDivergences,
} from "@/lib/opus/schemas";
import {
  advancePhase,
  finalizePhase2Code,
  getExercise,
  getSession,
  setPhase3Divergences,
} from "@/lib/sessions";
import { getLang } from "@/lib/i18n/server";
import { langDirective } from "@/lib/i18n/prompt";

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
  if (session.currentPhase !== 2) {
    return NextResponse.json(
      { error: "wrong_phase", currentPhase: session.currentPhase },
      { status: 409 },
    );
  }

  const exercise = await getExercise(session.exerciseId);
  const phase1 = Phase1Data.parse(session.phase1Data);

  // Persist the final code first, so the intent-diff prompt reads the
  // authoritative text even if the client's body somehow diverged.
  await finalizePhase2Code(sid, body.finalCode);
  const session2 = await getSession(sid);
  const phase2 = Phase2Data.parse(session2.phase2Data);
  const lang = await getLang();

  let diff;
  try {
    diff = await callOpusAndParse({
      promptName: "intent-diff",
      system:
        INTENT_DIFF_SYSTEM +
        langDirective(lang, ["divergences[].student_facing_question"]),
      messages: [
        {
          role: "user",
          content: buildIntentDiffUserMessage({
            exercise,
            phase1,
            phase2,
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
  await setPhase3Divergences(sid, divergences);
  // No divergences → the student's work is already accepted; skip the
  // question loop and mark the session complete so the exercise shows
  // as done in the list.
  await advancePhase(sid, divergences.length === 0 ? 4 : 3);

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
