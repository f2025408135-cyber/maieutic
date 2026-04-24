import { NextResponse } from "next/server";
import { z } from "zod";
import { LANG_COOKIE, LANGS } from "@/lib/i18n/dict";

const Body = z.object({ lang: z.enum(LANGS) });

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", details: err instanceof Error ? err.message : "" },
      { status: 400 },
    );
  }
  const res = NextResponse.json({ ok: true, lang: body.lang });
  res.cookies.set(LANG_COOKIE, body.lang, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
