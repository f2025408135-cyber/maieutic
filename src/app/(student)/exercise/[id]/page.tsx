import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { findOrCreateSession, getExercise } from "@/lib/sessions";
import {
  Phase1Data,
  Phase2Data,
  Phase3Data,
} from "@/lib/opus/schemas";
import { ExerciseClient } from "@/components/student/ExerciseClient";
import { getLang } from "@/lib/i18n/server";
import { translatedExerciseFields } from "@/lib/exercise-i18n";

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

  const [session, lang] = await Promise.all([
    findOrCreateSession(id, studentId),
    getLang(),
  ]);
  const translated = await translatedExerciseFields(
    exercise.id,
    exercise.title,
    exercise.instructorPromptText,
    lang,
  );

  // Parse the Json blobs so the client receives strongly-typed shapes.
  const phase1 = Phase1Data.parse(session.phase1Data);
  const phase2 = Phase2Data.parse(session.phase2Data);
  const phase3 = session.phase3Data
    ? Phase3Data.parse(session.phase3Data)
    : null;

  return (
    <ExerciseClient
      exercise={{
        id: exercise.id,
        title: translated.title,
        instructorPromptText: translated.instructorPromptText,
        studentLevel: exercise.studentLevel,
        unit: exercise.unit,
        specGateDimensions: exercise.specGateDimensions,
      }}
      initialSession={{
        id: session.id,
        currentPhase: session.currentPhase,
        startedAt: session.startedAt.toISOString(),
        phase1,
        phase2,
        phase3,
      }}
    />
  );
}
