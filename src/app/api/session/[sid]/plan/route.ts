import { NextResponse } from "next/server";
import { z } from "zod";
import { advancePhase, getSession, setPhase2Plan } from "@/lib/sessions";

const Body = z.object({
  planText: z.string().min(1).max(5_000),
});

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/session/[sid]/plan">,
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

  await setPhase2Plan(sid, body.planText);
  await advancePhase(sid, 3);
  return NextResponse.json({ ok: true, nextPhase: 3 });
}
