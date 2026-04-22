import Link from "next/link";
import { prisma } from "@/lib/db";

async function getExerciseCount() {
  try {
    return await prisma.exercise.count({ where: { publishedAt: { not: null } } });
  } catch {
    return 0;
  }
}

export default async function Home() {
  const exerciseCount = await getExerciseCount();
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-2xl w-full space-y-10">
        <header className="space-y-3">
          <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase">
            Maieutic · pedagogical IDE
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Structured interlocutor, not an autocomplete.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Claude Opus 4.7 runs the metacognitive loop an 80-student CS1
            classroom cannot run manually — gating student work behind an
            executable spec, diffing code against declared intent, and
            surfacing where each student is stuck in one actionable sentence.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/authoring"
            className="group block border rounded-lg p-5 bg-background hover:border-foreground/20 hover:shadow-sm transition"
          >
            <div className="text-xs text-muted-foreground">Instructor</div>
            <div className="text-lg font-medium mt-1">Author an exercise →</div>
            <div className="text-sm text-muted-foreground mt-2">
              Write a prompt. Opus generates concrete spec-gate scaffolding you
              review before publishing.
            </div>
          </Link>
          <Link
            href="/live"
            className="group block border rounded-lg p-5 bg-background hover:border-foreground/20 hover:shadow-sm transition"
          >
            <div className="text-xs text-muted-foreground">Instructor</div>
            <div className="text-lg font-medium mt-1">
              Live dashboard →
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              Per-student one-line cognitive summaries. Click any row for the
              private reasoning trail.
            </div>
          </Link>
        </section>

        <section className="border-t pt-6 text-sm text-muted-foreground space-y-3">
          <div className="flex items-center justify-between">
            <span>{exerciseCount} published exercise{exerciseCount === 1 ? "" : "s"}</span>
            <span className="font-mono text-xs">
              claude-opus-4-7
            </span>
          </div>
          <p>
            Students open a published exercise at{" "}
            <code className="text-xs bg-muted px-1 rounded">
              /exercise/[id]
            </code>{" "}
            — the editor is locked until the specification is specific enough
            to implement without guesswork.
          </p>
        </section>
      </div>
    </main>
  );
}
