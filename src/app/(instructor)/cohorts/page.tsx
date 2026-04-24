import { summarizeAllExercises } from "@/lib/cohort";
import { CohortsOverview } from "@/components/instructor/CohortsOverview";

export default async function CohortsPage() {
  const summaries = await summarizeAllExercises();
  return <CohortsOverview summaries={summaries} />;
}
