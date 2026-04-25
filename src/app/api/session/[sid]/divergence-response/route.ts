import { NextResponse } from "next/server";
import { z } from "zod";
import { callOpusAndParse } from "@/lib/opus/client";
import {
  POST_HOC_SYSTEM,
  buildPostHocUserMessage,
} from "@/lib/opus/prompts/post-hoc";
import {
  Phase3Data,
  PostHocOutput,
} from "@/lib/opus/schemas";
import {
  getExercise,
  getSession,
  recordDivergenceResponse,
} from "@/lib/sessions";

const Body = z.object({
  divergenceId: z.string().min(1),
  response: z.string().min(1).max(5_000),
});

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/session/[sid]/divergence-response">,
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
  if (!session.phase3Data)
    return NextResponse.json({ error: "no_phase3" }, { status: 500 });

  const exercise = await getExercise(session.exerciseId);
  const phase3 = Phase3Data.parse(session.phase3Data);
  const divergence = phase3.divergences.find(
    (d) => d.divergenceId === body.divergenceId,
  );
  if (!divergence)
    return NextResponse.json(
      { error: "unknown_divergence_id" },
      { status: 404 },
    );
  if (divergence.studentResponse !== null)
    return NextResponse.json(
      { error: "already_answered" },
      { status: 409 },
    );

  let postHoc;
  try {
    postHoc = await callOpusAndParse({
      promptName: "post-hoc",
      system: POST_HOC_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildPostHocUserMessage({
            studentLevel: exercise.studentLevel,
            initialClassification: divergence.initialClassification,
            predictedJustification: divergence.predictedJustification,
            studentResponse: body.response,
          }),
        },
      ],
      maxTokens: 512,
      schema: PostHocOutput,
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

  const { allAnswered } = await recordDivergenceResponse(
    sid,
    body.divergenceId,
    body.response,
    postHoc.alignment,
    postHoc.final_classification,
    postHoc.final_classification_reason,
  );

  // Session stays in phase 3 after the last answer; the student then
  // picks between revising their code and finishing via /finalize, which
  // is what advances to phase 4 (closed).

  return NextResponse.json({
    ok: true,
    allAnswered,
    alignment: postHoc.alignment,
    finalClassification: postHoc.final_classification,
  });
}
