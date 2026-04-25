import { NextResponse } from "next/server";
import { z } from "zod";
import { Phase4Data } from "@/lib/opus/schemas";
import {
  advancePhase,
  getSession,
  recordFinalRevision,
} from "@/lib/sessions";

const Body = z.object({
  revisedCode: z.string().max(100_000).optional(),
});

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/session/[sid]/finalize">,
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
  if (session.currentPhase !== 4) {
    return NextResponse.json(
      { error: "wrong_phase", currentPhase: session.currentPhase },
      { status: 409 },
    );
  }
  if (!session.phase4Data)
    return NextResponse.json({ error: "no_phase4" }, { status: 500 });

  const phase4 = Phase4Data.parse(session.phase4Data);
  if (phase4.completedAt === null) {
    return NextResponse.json(
      { error: "unanswered_divergences" },
      { status: 409 },
    );
  }
  if (phase4.revisionChoice !== null) {
    return NextResponse.json(
      { error: "already_finalized", revisionChoice: phase4.revisionChoice },
      { status: 409 },
    );
  }

  const revisedCode = body.revisedCode?.trim() ? body.revisedCode : null;
  await recordFinalRevision(sid, revisedCode);
  await advancePhase(sid, 5);

  return NextResponse.json({
    ok: true,
    revisionChoice: revisedCode === null ? "skipped" : "revised",
  });
}
