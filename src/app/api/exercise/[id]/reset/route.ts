import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, getExercise } from "@/lib/sessions";

const STUDENT_COOKIE = "maieutic_student_id";

// Creates a fresh session for the (student, exercise) pair. Previous
// sessions stay in the DB — the teacher tools want the full history of
// attempts, and findOrCreateSession returns the most recent session, so
// the new one becomes the one the student sees.
export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/exercise/[id]/reset">,
) {
  const { id } = await ctx.params;

  try {
    await getExercise(id);
  } catch {
    return NextResponse.json({ error: "unknown_exercise" }, { status: 404 });
  }

  const cookieStore = await cookies();
  const studentId = cookieStore.get(STUDENT_COOKIE)?.value ?? "anon-fallback";

  const session = await createSession(id, studentId);
  return NextResponse.json({ ok: true, sessionId: session.id });
}
