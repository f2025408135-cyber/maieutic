import Link from "next/link";
import {
  CodeFrame,
  Comment,
  SYNTAX,
} from "@/components/editor/CodeFrame";
import { prisma } from "@/lib/db";

async function getExercises() {
  return prisma.exercise.findMany({
    where: { publishedAt: { not: null } },
    select: { id: true, title: true, studentLevel: true },
    orderBy: { publishedAt: "asc" },
  });
}

type Level = "week_1_2" | "week_3_6" | "week_7_plus";

const LEVEL_ORDER: Level[] = ["week_1_2", "week_3_6", "week_7_plus"];
const LEVEL_LABEL: Record<Level, string> = {
  week_1_2: "Week 1–2",
  week_3_6: "Week 3–6",
  week_7_plus: "Week 7+",
};

type ExerciseRow = { id: string; title: string };

export default async function Exercises() {
  const exercises = await getExercises();

  // Group by level, preserving publishedAt order within each group.
  const byLevel = new Map<Level, ExerciseRow[]>();
  for (const ex of exercises) {
    const level = (ex.studentLevel as Level) ?? "week_1_2";
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push({ id: ex.id, title: ex.title });
  }
  const orderedGroups = LEVEL_ORDER.filter((lvl) => byLevel.has(lvl)).map(
    (lvl) => ({ level: lvl, items: byLevel.get(lvl)! }),
  );

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
      lines.push(<WeekHeader label={LEVEL_LABEL[group.level]} />);
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

function WeekHeader({ label }: { label: string }) {
  return (
    <span className="text-[16px] font-semibold" style={{ color: SYNTAX.type }}>
      # {label}
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
