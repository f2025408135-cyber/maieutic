import Link from "next/link";
import { cookies } from "next/headers";
import { CodeFrame, Comment, SYNTAX } from "@/components/editor/CodeFrame";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { prisma } from "@/lib/db";
import { listResolvedSessionsForStudent } from "@/lib/sessions";
import { UNIT_IDS, UNIT_ROMAN, type Unit } from "@/lib/units";
import { getDict, getLang } from "@/lib/i18n/server";
import type { Dict } from "@/lib/i18n/en";
import { translatedExerciseTitles } from "@/lib/exercise-i18n";

const STUDENT_COOKIE = "maieutic_student_id";

async function getExercises() {
  return prisma.exercise.findMany({
    where: { publishedAt: { not: null } },
    select: { id: true, title: true, instructorPromptText: true, unit: true },
    orderBy: { publishedAt: "asc" },
  });
}

// Mark an exercise ✅ only when the session the student would land on
// (per findOrCreateSession's rule) is itself completed. So a "Start
// fresh" session — which routes the student to phase 1 — clears the
// check until they finish the new attempt.
async function getDoneExerciseIds(studentId: string): Promise<Set<string>> {
  const resolved = await listResolvedSessionsForStudent(studentId);
  const done = new Set<string>();
  for (const [exId, session] of resolved) {
    if (session.completedAt !== null) done.add(exId);
  }
  return done;
}

type ExerciseRow = { id: string; title: string; done: boolean };

export default async function Exercises() {
  const cookieStore = await cookies();
  const studentId = cookieStore.get(STUDENT_COOKIE)?.value ?? "";
  const [exercises, doneIds, t, lang] = await Promise.all([
    getExercises(),
    getDoneExerciseIds(studentId),
    getDict(),
    getLang(),
  ]);
  const translatedTitles = await translatedExerciseTitles(exercises, lang);

  // Group by unit, preserving publishedAt order within each group.
  const byUnit = new Map<Unit, ExerciseRow[]>();
  for (const ex of exercises) {
    const unit = (ex.unit as Unit) ?? "unit_2";
    if (!byUnit.has(unit)) byUnit.set(unit, []);
    byUnit.get(unit)!.push({
      id: ex.id,
      title: translatedTitles.get(ex.id) ?? ex.title,
      done: doneIds.has(ex.id),
    });
  }
  const orderedGroups = UNIT_IDS.filter((u) => byUnit.has(u)).map((u) => ({
    unit: u,
    items: byUnit.get(u)!,
  }));

  const lines: React.ReactNode[] = [];
  lines.push(<span />);
  lines.push(
    <span
      className="text-[22px] font-semibold"
      style={{ color: SYNTAX.function }}
    >
      {t.exercises.title}
    </span>,
  );
  lines.push(<Comment>{t.exercises.clickAny}</Comment>);
  lines.push(<span />);

  if (exercises.length === 0) {
    lines.push(<ExerciseRowEmpty t={t} />);
  } else {
    orderedGroups.forEach((group, gi) => {
      if (gi > 0) lines.push(<span />);
      lines.push(<UnitHeader unit={group.unit} t={t} />);
      for (const ex of group.items) {
        lines.push(<ExerciseLine id={ex.id} title={ex.title} done={ex.done} />);
      }
    });
  }

  lines.push(<span />);
  lines.push(<span />);
  lines.push(
    <Comment>
      <Link
        href="/"
        className="underline decoration-dotted underline-offset-2 hover:text-[#b5cea8] transition-colors"
        style={{ color: "inherit" }}
      >
        {t.common.backToWelcome}
      </Link>
    </Comment>,
  );
  lines.push(<span />);

  const doneCount = doneIds.size;

  return (
    <CodeFrame
      fileName="exercises.md"
      language="Markdown"
      back={{ href: "/", label: t.common.welcome }}
      topNavRight={<LanguageSwitcher />}
      statusLeft={
        <>
          <span>✓ claude-opus-4-7</span>
          <span>{t.exercises.available(exercises.length)}</span>
          {doneCount > 0 && <span>{t.exercises.completed(doneCount)}</span>}
        </>
      }
      statusRight={<span>{t.common.markdownUtf8}</span>}
    >
      {lines.map((line, i) => (
        <span key={i}>{line}</span>
      ))}
    </CodeFrame>
  );
}

function UnitHeader({ unit, t }: { unit: Unit; t: Dict }) {
  return (
    <span className="text-[16px] font-semibold" style={{ color: SYNTAX.type }}>
      {t.exercises.unitHeader(UNIT_ROMAN[unit], t.units[unit])}
    </span>
  );
}

function ExerciseLine({
  id,
  title,
  done,
}: {
  id: string;
  title: string;
  done: boolean;
}) {
  return (
    <Link
      href={`/exercise/${id}`}
      className="group inline-flex items-center gap-3 pl-6 pr-3 -ml-3 rounded transition-colors hover:bg-[#2a2d2e] focus:outline-none focus:bg-[#04395e]"
    >
      <span className="text-[16px] leading-none">{done ? "✅" : "📘"}</span>
      <span
        style={{
          color: done ? SYNTAX.comment : SYNTAX.function,
        }}
      >
        {title}
      </span>
      <span
        className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
        style={{ color: SYNTAX.muted }}
      >
        →
      </span>
    </Link>
  );
}

function ExerciseRowEmpty({ t }: { t: Dict }) {
  return (
    <span>
      <Comment>{t.exercises.emptyPrefix}</Comment>
      <Link
        href="/authoring"
        className="underline decoration-dotted underline-offset-2"
        style={{ color: "#6a9955" }}
      >
        {t.exercises.authorOne}
      </Link>
      <Comment>{t.exercises.period}</Comment>
    </span>
  );
}
