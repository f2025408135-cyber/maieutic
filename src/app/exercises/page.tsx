import Link from "next/link";
import { CodeFrame, Comment, SYNTAX } from "@/components/editor/CodeFrame";
import { prisma } from "@/lib/db";
import { UNIT_IDS, UNIT_ROMAN, UNIT_TITLE, type Unit } from "@/lib/units";

async function getExercises() {
  return prisma.exercise.findMany({
    where: { publishedAt: { not: null } },
    select: { id: true, title: true, unit: true },
    orderBy: { publishedAt: "asc" },
  });
}

type ExerciseRow = { id: string; title: string };

export default async function Exercises() {
  const exercises = await getExercises();

  // Group by unit, preserving publishedAt order within each group.
  const byUnit = new Map<Unit, ExerciseRow[]>();
  for (const ex of exercises) {
    const unit = (ex.unit as Unit) ?? "unit_2";
    if (!byUnit.has(unit)) byUnit.set(unit, []);
    byUnit.get(unit)!.push({ id: ex.id, title: ex.title });
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
      Available exercises
    </span>,
  );
  lines.push(<Comment>Click any row to open the exercise.</Comment>);
  lines.push(<span />);

  if (exercises.length === 0) {
    lines.push(<ExerciseRowEmpty />);
  } else {
    orderedGroups.forEach((group, gi) => {
      if (gi > 0) lines.push(<span />);
      lines.push(<UnitHeader unit={group.unit} />);
      for (const ex of group.items) {
        lines.push(<ExerciseLine id={ex.id} title={ex.title} />);
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
        ← back to welcome
      </Link>
    </Comment>,
  );
  lines.push(<span />);

  return (
    <CodeFrame
      fileName="exercises.md"
      language="Markdown"
      statusLeft={
        <>
          <span>✓ claude-opus-4-7</span>
          <span>
            {exercises.length} exercise{exercises.length === 1 ? "" : "s"}{" "}
            available
          </span>
        </>
      }
      statusRight={<span>Markdown · UTF-8</span>}
    >
      {lines.map((line, i) => (
        <span key={i}>{line}</span>
      ))}
    </CodeFrame>
  );
}

function UnitHeader({ unit }: { unit: Unit }) {
  return (
    <span className="text-[16px] font-semibold" style={{ color: SYNTAX.type }}>
      # Unit {UNIT_ROMAN[unit]} · {UNIT_TITLE[unit]}
    </span>
  );
}

function ExerciseLine({ id, title }: { id: string; title: string }) {
  return (
    <Link
      href={`/exercise/${id}`}
      className="group inline-flex items-center gap-3 pl-6 pr-3 -ml-3 rounded transition-colors hover:bg-[#2a2d2e] focus:outline-none focus:bg-[#04395e]"
    >
      <span className="text-[16px] leading-none">📘</span>
      <span style={{ color: SYNTAX.function }}>{title}</span>
      <span
        className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
        style={{ color: SYNTAX.muted }}
      >
        →
      </span>
    </Link>
  );
}

function ExerciseRowEmpty() {
  return (
    <span>
      <Comment>No exercises published yet — </Comment>
      <Link
        href="/authoring"
        className="underline decoration-dotted underline-offset-2"
        style={{ color: "#6a9955" }}
      >
        author one
      </Link>
      <Comment>.</Comment>
    </span>
  );
}
