import Link from "next/link";
import { CodeFrame, Comment, SYNTAX } from "@/components/editor/CodeFrame";
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
    <CodeFrame
      fileName="welcome.md"
      language="Markdown"
      statusLeft={
        <>
          <span>✓ claude-opus-4-7</span>
          <span>
            {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"} published
          </span>
        </>
      }
      statusRight={<span>Markdown · UTF-8</span>}
      banner={<Brand />}
    >
      {/* 1  */} <span />
      {/* 2  */}
      <Comment>
        A pedagogical coding tool for programming-education classes.
      </Comment>
      {/* 3  */}
      <Comment>
        Built on Claude Opus 4.7 — an AI that{" "}
        <span style={{ color: SYNTAX.keyword, fontStyle: "normal" }}>
          asks you questions
        </span>{" "}
        instead of writing code for you.
      </Comment>
      {/* 4  */} <span />
      {/* 5  */}
      <span style={{ color: SYNTAX.muted }}>Who are you?</span>
      {/* 6  */} <span />
      {/* 7  */}
      <RoleRow
        href="/exercises"
        icon="🎓"
        label="I'm a student"
        hint="pick an exercise and start working"
      />
      {/* 8  */} <span />
      {/* 9  */}
      <RoleRow
        href="/live"
        icon="🧑‍🏫"
        label="I'm a teacher"
        hint="see the live class dashboard or manage exercises"
      />
      {/* 10 */} <span />
    </CodeFrame>
  );
}

function Brand() {
  return (
    <div className="flex items-end gap-3">
      <h1
        className="font-sans font-bold tracking-tight leading-none"
        style={{
          fontSize: "min(14vw, 112px)",
          color: "#f5f5f5",
          letterSpacing: "-0.04em",
        }}
      >
        Maieutic
      </h1>
      <span
        className="animate-pulse mb-3 inline-block"
        style={{
          width: "min(2vw, 14px)",
          height: "min(6vw, 48px)",
          backgroundColor: "#007acc",
        }}
        aria-hidden
      />
    </div>
  );
}

function RoleRow({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: string;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-4 px-3 -mx-3 rounded transition-colors hover:bg-[#2a2d2e] focus:outline-none focus:bg-[#04395e]"
    >
      <span className="text-[18px] leading-none">{icon}</span>
      <span
        className="font-semibold"
        style={{ color: SYNTAX.function }}
      >
        {label}
      </span>
      <span style={{ color: SYNTAX.comment }}>— {hint}</span>
      <span
        className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
        style={{ color: SYNTAX.muted }}
      >
        →
      </span>
    </Link>
  );
}
