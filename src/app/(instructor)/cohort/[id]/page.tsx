import { notFound } from "next/navigation";
import { aggregateExercise } from "@/lib/cohort";
import { prisma } from "@/lib/db";
import { CohortView } from "@/components/instructor/CohortView";

export default async function Page(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const exercise = await prisma.exercise.findUnique({ where: { id } });
  if (!exercise) notFound();

  const [aggregate, sessionsStarted, helpRequests] = await Promise.all([
    aggregateExercise(id),
    prisma.session.count({ where: { exerciseId: id } }),
    prisma.sessionEvent.count({
      where: { kind: "help_request", session: { exerciseId: id } },
    }),
  ]);

  return (
    <CohortView
      exerciseId={id}
      aggregate={aggregate}
      unit={exercise.unit}
      sessionsStarted={sessionsStarted}
      helpRequestsReceived={helpRequests}
    />
  );
}
