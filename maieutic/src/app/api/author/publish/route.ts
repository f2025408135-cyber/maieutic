import { NextResponse } from "next/server";
import { createExercise } from "@/lib/sessions";
import { ExerciseAuthoringInput } from "@/lib/opus/schemas";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const raw = await req.json();
  const parsed = ExerciseAuthoringInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        issues: parsed.error.issues.slice(0, 10),
      },
      { status: 400 },
    );
  }

  // If the incoming id is already taken, append a short suffix. The slug is
  // built client-side from the title, so collisions are plausible in a demo.
  let id = parsed.data.id;
  while (await prisma.exercise.findUnique({ where: { id } })) {
    id = `${parsed.data.id}-${Math.random().toString(36).slice(2, 6)}`;
  }

  try {
    const exercise = await createExercise({ ...parsed.data, id });
    return NextResponse.json({ exercise });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: "publish_failed", message },
      { status: 500 },
    );
  }
}
