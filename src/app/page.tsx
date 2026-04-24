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
      hideTopNav
    >
      {/* 1 */}
      <Comment>
        A pedagogical coding tool for programming-education classes.
      </Comment>
      {/* 2 */}
      <Comment>
        Built on Claude Opus 4.7, directed here to{" "}
        <span style={{ color: SYNTAX.keyword, fontStyle: "normal" }}>
          ask questions
        </span>{" "}
        rather than produce code on the student&apos;s behalf.
      </Comment>
      {/* 3 */} <span />
      {/* 4 */}
      <Comment>
        Students work through each exercise as a sequence of specification,
        plan, implementation, and review.
      </Comment>
      {/* 5 */}
      <Comment>
        At every stage Opus draws out the commitments a student has left
        implicit, rather than producing code on their behalf.
      </Comment>
      {/* 6 */} <span />
      {/* 7 */}
      <RoleRow
        href="/exercises"
        icon="🎓"
        label="I'm a student"
        hint="pick an exercise and start working"
      />
      {/* 8 */} <span />
      {/* 9 */}
      <Comment>
        Teachers see every session as it unfolds, and, once complete,
        per-exercise analyses of how the class reasoned through the problem
        and where it struggled.
      </Comment>
      {/* 10 */} <span />
      {/* 11 */}
      <RoleRow
        href="/live"
        icon="🧑‍🏫"
        label="I'm a teacher"
        hint="see the live class dashboard or manage exercises"
      />
      {/* 12 */} <span />
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
