import { NextResponse } from "next/server";
import { z } from "zod";
import { appendHelpRequest } from "@/lib/sessions";

const Body = z.object({
  message: z.string().min(1).max(2_000),
  phaseState: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/session/[sid]/help">,
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

  await appendHelpRequest(sid, {
    timestamp: new Date().toISOString(),
    stateAtRequest: body.phaseState ?? {},
    message: body.message,
    resolution: null,
  });
  return NextResponse.json({ ok: true });
}
