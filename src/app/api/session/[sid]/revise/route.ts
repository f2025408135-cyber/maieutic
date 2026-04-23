import { NextResponse } from "next/server";
import { z } from "zod";
import { appendPhase3Revision, getSession } from "@/lib/sessions";

const Body = z.object({
  amendment: z.string().min(1).max(5_000),
  justification: z.string().min(1).max(5_000),
});

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

  await appendPhase3Revision(sid, {
    timestamp: new Date().toISOString(),
    amendmentText: body.amendment,
    justificationText: body.justification,
  });

  return NextResponse.json({ ok: true });
}
