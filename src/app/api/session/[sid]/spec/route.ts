import { NextResponse } from "next/server";
import { z } from "zod";
import { callOpusAndParse } from "@/lib/opus/client";
import {
  SPEC_EXAMINER_SYSTEM,
  buildSpecExaminerUserMessage,
} from "@/lib/opus/prompts/spec-examiner";
import {
  Phase1Data,
  SpecExaminerOutput,
  type Phase1Iteration,
} from "@/lib/opus/schemas";
import {
  advancePhase,
  appendPhase1Iteration,
  getExercise,
  getSession,
} from "@/lib/sessions";
import { getLang } from "@/lib/i18n/server";
import { langDirective } from "@/lib/i18n/prompt";

const Body = z.object({
  specText: z.string().min(1).max(10_000),
});

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/session/[sid]/spec">,
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
  if (session.currentPhase !== 1) {
    return NextResponse.json(
      { error: "wrong_phase", currentPhase: session.currentPhase },
      { status: 409 },
    );
  }
  const exercise = await getExercise(session.exerciseId);
  const priorIterations = Phase1Data.parse(session.phase1Data).iterations;
  const lang = await getLang();

  let examiner;
  try {
    examiner = await callOpusAndParse({
      promptName: "spec-examiner",
      system:
        SPEC_EXAMINER_SYSTEM +
        langDirective(lang, ["questions", "emergent_gaps[].question"]),
      messages: [
        {
          role: "user",
          content: buildSpecExaminerUserMessage(
            exercise,
            priorIterations,
            body.specText,
          ),
        },
      ],
      maxTokens: 1024,
      schema: SpecExaminerOutput,
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

  // Tech Spec §4.4: `passed` is a pure function of gaps_still_open length.
  const passed = examiner.gaps_still_open.length === 0;

  const iteration: Phase1Iteration = {
    timestamp: new Date().toISOString(),
    studentSpecText: body.specText,
    opusQuestions: examiner.questions,
    gapsIdentified: examiner.gaps_still_open,
    gapsAddressedThisRound: examiner.gaps_addressed,
    emergentGaps: examiner.emergent_gaps,
    passed,
  };
  await appendPhase1Iteration(sid, iteration);

  if (passed) {
    await advancePhase(sid, 2);
  }

  return NextResponse.json({
    iteration,
    passed,
    nextPhase: passed ? 2 : 1,
  });
}
