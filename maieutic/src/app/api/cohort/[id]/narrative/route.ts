import { NextResponse } from "next/server";
import { callOpusAndParse } from "@/lib/opus/client";
import {
  COHORT_NARRATIVE_SYSTEM,
  buildCohortNarrativeUserMessage,
} from "@/lib/opus/prompts/cohort-narrative";
import { CohortNarrativeOutput } from "@/lib/opus/schemas";
import { aggregateExercise } from "@/lib/cohort";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let aggregate;
  try {
    aggregate = await aggregateExercise(id);
  } catch {
    return NextResponse.json({ error: "exercise_not_found" }, { status: 404 });
  }

  let narrative;
  try {
    narrative = await callOpusAndParse({
      promptName: "cohort-narrative",
      system: COHORT_NARRATIVE_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildCohortNarrativeUserMessage({
            exerciseTitle: aggregate.exerciseTitle,
            exercisePrompt: aggregate.exercisePrompt,
            aggregate,
          }),
        },
      ],
      maxTokens: 2048,
      schema: CohortNarrativeOutput,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "opus_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ narrative, aggregate });
}
