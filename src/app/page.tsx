import Link from "next/link";
import { CodeFrame, Comment, SYNTAX } from "@/components/editor/CodeFrame";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ApiKeySettings } from "@/components/student/ApiKeySettings";
import { prisma } from "@/lib/db";
import { getDict } from "@/lib/i18n/server";

async function getExerciseCount() {
  try {
    return await prisma.exercise.count({ where: { publishedAt: { not: null } } });
  } catch {
    return 0;
  }
}

export default async function Home() {
  const [exerciseCount, t] = await Promise.all([
    getExerciseCount(),
    getDict(),
  ]);

  return (
    <CodeFrame
      fileName="welcome.md"
      language="Markdown"
      statusLeft={
        <>
          <span>✓ claude-opus-4-7</span>
          <span>{t.home.published(exerciseCount)}</span>
        </>
      }
      statusRight={<span>{t.common.markdownUtf8}</span>}
      banner={
        <div className="flex items-end justify-between gap-4">
          <Brand />
          <div className="pb-3 flex items-center gap-3">
            <LanguageSwitcher />
            <ApiKeySettings />
          </div>
        </div>
      }
      hideTopNav
    >
      {/* 1 */}
      <Comment>{t.home.tagline}</Comment>
      {/* 2 */}
      <Comment>
        {t.home.pitchLead}{" "}
        <span style={{ color: SYNTAX.keyword, fontStyle: "normal" }}>
          {t.home.pitchHighlight}
        </span>
        {t.home.pitchTail}
      </Comment>
      {/* 3 */} <span />
      {/* 4 */}
      <RoleRow
        href="/exercises"
        icon="🎓"
        label={t.home.imAStudent}
        hint={t.home.imAStudentHint}
      />
      {/* 5 */} <span />
      {/* 6 */}
      <RoleRow
        href="/live"
        icon="🧑‍🏫"
        label={t.home.imATeacher}
        hint={t.home.imATeacherHint}
      />
      {/* 7 */} <span />
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
