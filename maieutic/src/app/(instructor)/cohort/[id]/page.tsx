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

  const aggregate = await aggregateExercise(id);
  return <CohortView exerciseId={id} aggregate={aggregate} />;
}
