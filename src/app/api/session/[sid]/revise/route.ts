import { NextResponse } from "next/server";
import { z } from "zod";
import { callOpusAndParse } from "@/lib/opus/client";
import {
  Phase2Data,
  RevisePlanOutput,
} from "@/lib/opus/schemas";
import {
  appendPhase3Revision,
  getSession,
} from "@/lib/sessions";

const Body = z.object({
  amendment: z.string().min(1).max(5_000),
  justification: z.string().min(1).max(5_000),
});

const SYSTEM = `You are the coding assistant for a CS1 student in a pedagogical IDE. The
student is mid-writing and wants to revise their implementation plan. You
are NOT deciding whether the revision is allowed — revisions are always
allowed. Your job is to ask ONE short question that forces them to articulate
whether the new approach is faster, simpler, or more correct, and why.

Optionally include a single follow-up question that goes deeper (e.g. asks
about a concrete trade-off), or null if one question is enough.

Output a single JSON object, no preamble, no fences:

{
  "question": "<one short question>",
  "followup_question": "<another short question, or null>"
}`;

function buildUser(
  originalPlan: string | null,
  amendment: string,
  justification: string,
) {
  return `ORIGINAL PLAN:
"""
${originalPlan ?? "(this exercise had no Phase 2 plan; the student is revising their unwritten plan)"}
"""

STUDENT'S AMENDMENT:
"""
${amendment}
"""

STUDENT'S STATED JUSTIFICATION:
"""
${justification}
"""

Ask one short question (and optionally one follow-up) that forces the
student to articulate the merit of the new approach — faster, simpler, or
more correct. Output JSON per schema.`;
}

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/session/[sid]/revise">,
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
  const plan = session.phase2Data ? Phase2Data.parse(session.phase2Data) : null;

  let out;
  try {
    out = await callOpusAndParse({
      promptName: "revise-plan",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: buildUser(plan?.planText ?? null, body.amendment, body.justification),
        },
      ],
      maxTokens: 512,
      schema: RevisePlanOutput,
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

  await appendPhase3Revision(sid, {
    timestamp: new Date().toISOString(),
    amendmentText: body.amendment,
    justificationText: body.justification,
    opusQuestion: out.question,
    opusFollowupQuestion: out.followup_question,
  });

  return NextResponse.json({ question: out.question, followup_question: out.followup_question });
}
