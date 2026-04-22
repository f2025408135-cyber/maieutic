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
    select: {
      id: true,
      title: true,
      studentLevel: true,
      phase2Required: true,
      specGateDimensions: true,
      _count: { select: { sessions: true } },
    },
    orderBy: { publishedAt: "asc" },
  });
}

const LEVEL_LABEL: Record<string, string> = {
  week_1_2: "Week 1–2",
  week_3_6: "Week 3–6",
  week_7_plus: "Week 7+",
};

export default async function Exercises() {
  const exercises = await getExercises();

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
      <span />
      <span
        className="text-[22px] font-semibold"
        style={{ color: SYNTAX.function }}
      >
        Available exercises
      </span>
      <Comment>Click any row to open the exercise.</Comment>
      <span />
      <span />

      {exercises.length === 0 ? (
        <ExerciseRowEmpty />
      ) : (
        exercises.map((ex) => {
          const dims = Array.isArray(ex.specGateDimensions)
            ? ex.specGateDimensions.length
            : 0;
          return (
            <ExerciseRow
              key={ex.id}
              id={ex.id}
              title={ex.title}
              level={ex.studentLevel}
              sessions={ex._count.sessions}
              dims={dims}
              phase2={ex.phase2Required}
            />
          );
        })
      )}

      <span />
      <span />
      <Comment>
        <Link
          href="/"
          className="underline decoration-dotted underline-offset-2 hover:text-[#b5cea8] transition-colors"
          style={{ color: "inherit" }}
        >
          ← back to welcome
        </Link>
      </Comment>
      <span />
    </CodeFrame>
  );
}

function ExerciseRow({
  id,
  title,
  level,
  sessions,
  dims,
  phase2,
}: {
  id: string;
  title: string;
  level: string;
  sessions: number;
  dims: number;
  phase2: boolean;
}) {
  const levelLabel = LEVEL_LABEL[level] ?? level;
  return (
    <Link
      href={`/exercise/${id}`}
      className="group inline-flex items-center gap-4 px-3 -mx-3 rounded transition-colors hover:bg-[#2a2d2e] focus:outline-none focus:bg-[#04395e]"
    >
      <span className="text-[18px] leading-none">📘</span>
      <span
        className="text-[16px] font-semibold"
        style={{ color: SYNTAX.function }}
      >
        {title}
      </span>
      <span style={{ color: SYNTAX.muted }}>
        — {levelLabel} · {dims} commitments
        {phase2 ? " · planning step" : ""}
        {sessions > 0
          ? ` · ${sessions} session${sessions === 1 ? "" : "s"}`
          : ""}
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

function ExerciseRowEmpty() {
  return (
    <span className="pl-3 -ml-3">
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
