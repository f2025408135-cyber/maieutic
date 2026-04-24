import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { findOrCreateSession, getExercise } from "@/lib/sessions";
import {
  Phase1Data,
  Phase2Data,
  Phase3Data,
  Phase4Data,
} from "@/lib/opus/schemas";
import { ExerciseClient } from "@/components/student/ExerciseClient";

const COOKIE = "maieutic_student_id";

export default async function Page(
  ctx: PageProps<"/exercise/[id]">,
) {
  const { id } = await ctx.params;

  let exercise;
  try {
    exercise = await getExercise(id);
  } catch {
    notFound();
  }

  const cookieStore = await cookies();
  const studentId = cookieStore.get(COOKIE)?.value ?? "anon-fallback";

  const session = await findOrCreateSession(id, studentId);

  // Parse the Json blobs so the client receives strongly-typed shapes.
  const phase1 = Phase1Data.parse(session.phase1Data);
  const phase2 = session.phase2Data
    ? Phase2Data.parse(session.phase2Data)
    : null;
  const phase3 = Phase3Data.parse(session.phase3Data);
  const phase4 = session.phase4Data
    ? Phase4Data.parse(session.phase4Data)
    : null;

  return (
    <ExerciseClient
      exercise={{
        id: exercise.id,
        title: exercise.title,
        instructorPromptText: exercise.instructorPromptText,
        studentLevel: exercise.studentLevel,
        unit: exercise.unit,
        phase2Required: exercise.phase2Required,
        specGateDimensions: exercise.specGateDimensions,
      }}
      initialSession={{
        id: session.id,
        currentPhase: session.currentPhase,
        startedAt: session.startedAt.toISOString(),
        phase1,
        phase2,
        phase3,
        phase4,
      }}
    />
  );
}
