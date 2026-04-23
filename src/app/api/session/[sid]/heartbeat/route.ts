import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/session/[sid]/heartbeat">,
) {
  const { sid } = await ctx.params;
  try {
    await prisma.session.update({
      where: { id: sid },
      data: { lastActiveAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
