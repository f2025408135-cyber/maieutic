import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveHelpRequests } from "@/lib/sessions";

const Body = z
  .object({
    resolution: z.enum(["help_arrived", "student_cancelled"]).optional(),
  })
  .default({});

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/session/[sid]/help/resolve">,
) {
  const { sid } = await ctx.params;
  let resolution: "help_arrived" | "student_cancelled" = "help_arrived";
  try {
    const raw = await req.text();
    if (raw) {
      const parsed = Body.parse(JSON.parse(raw));
      if (parsed.resolution) resolution = parsed.resolution;
    }
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", details: err instanceof Error ? err.message : "" },
      { status: 400 },
    );
  }
  const result = await resolveHelpRequests(sid, resolution);
  return NextResponse.json({ ok: true, ...result });
}
