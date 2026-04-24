import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { callOpusAndParse } from "@/lib/opus/client";
import { LANG_DIRECTIVE_NAME, type Lang } from "@/lib/i18n/dict";

// Student-visible English text authored by the instructor is translated
// on demand into the student's language and cached per (exercise, lang)
// in ExerciseTranslation. The source of truth stays the English `Exercise`
// row; translations are disposable and regenerate if deleted.

export interface TranslatedFields {
  title: string;
  instructorPromptText: string;
}

const TranslateOutput = z.object({
  title: z.string().min(1),
  instructor_prompt_text: z.string().min(1),
});

export async function translatedExerciseFields(
  exerciseId: string,
  sourceTitle: string,
  sourcePromptText: string,
  lang: Lang,
): Promise<TranslatedFields> {
  if (lang === "en")
    return { title: sourceTitle, instructorPromptText: sourcePromptText };

  const cached = await prisma.exerciseTranslation.findUnique({
    where: { exerciseId_lang: { exerciseId, lang } },
  });
  if (cached)
    return {
      title: cached.title,
      instructorPromptText: cached.instructorPromptText,
    };

  const target = LANG_DIRECTIVE_NAME[lang];
  const system = `You are translating programming exercise content from English into ${target} for CS1 students.

Keep the mathematical/technical meaning precise. Do NOT simplify or add explanation — translate what is there, nothing more. Preserve inline code snippets, variable names, function names, and quoted tokens exactly (e.g. \`print("Hello")\`, ALL_CAPS placeholders like NAME or PRICE, or specific output examples).

Use classroom register appropriate for introductory programming students (informal "tú"-voice).

Output JSON only, no preamble, no markdown fences:

{
  "title": "<translated title>",
  "instructor_prompt_text": "<translated prompt>"
}`;

  const userMessage = `Translate this exercise to ${target}:

TITLE:
${sourceTitle}

PROMPT:
${sourcePromptText}

Output JSON per schema.`;

  const parsed = await callOpusAndParse({
    promptName: `exercise-translation:${lang}`,
    system,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 2048,
    schema: TranslateOutput,
  });

  const fields: TranslatedFields = {
    title: parsed.title,
    instructorPromptText: parsed.instructor_prompt_text,
  };

  // Upsert so a concurrent second request (two students opening the same
  // exercise at once in Spanish) doesn't 409 on the unique index — it
  // just overwrites with the second translation, which is fine.
  await prisma.exerciseTranslation.upsert({
    where: { exerciseId_lang: { exerciseId, lang } },
    create: { exerciseId, lang, ...fields },
    update: fields,
  });

  return fields;
}

// Batch version for the exercises list page — 1 call per (exercise, lang)
// on first render, then cached.
export async function translatedExerciseTitles(
  exercises: { id: string; title: string; instructorPromptText: string }[],
  lang: Lang,
): Promise<Map<string, string>> {
  if (lang === "en")
    return new Map(exercises.map((e) => [e.id, e.title]));

  const cached = await prisma.exerciseTranslation.findMany({
    where: { lang, exerciseId: { in: exercises.map((e) => e.id) } },
    select: { exerciseId: true, title: true },
  });
  const cacheMap = new Map(cached.map((c) => [c.exerciseId, c.title]));

  const missing = exercises.filter((e) => !cacheMap.has(e.id));
  if (missing.length === 0) return cacheMap;

  // Translate missing in parallel. Each call also persists both title +
  // prompt so the individual-exercise page doesn't re-translate later.
  await Promise.all(
    missing.map(async (e) => {
      const fields = await translatedExerciseFields(
        e.id,
        e.title,
        e.instructorPromptText,
        lang,
      );
      cacheMap.set(e.id, fields.title);
    }),
  );

  return cacheMap;
}
