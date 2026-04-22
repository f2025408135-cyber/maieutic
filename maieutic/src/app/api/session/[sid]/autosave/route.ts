import { NextResponse } from "next/server";
import { z } from "zod";
import { updateCurrentCode } from "@/lib/sessions";

const Body = z.object({
  code: z.string().max(100_000),
});

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/session/[sid]/autosave">,
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
  await updateCurrentCode(sid, body.code);
  return NextResponse.json({ ok: true });
}
