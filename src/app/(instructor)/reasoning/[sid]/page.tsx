import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Workbench } from "@/components/editor/Workbench";
import {
  LiveSummary,
  Phase1Data,
  Phase2Data,
  Phase3Data,
} from "@/lib/opus/schemas";
import { UNIT_ROMAN, UNIT_TITLE, isUnit, type Unit } from "@/lib/units";

export default async function Page({
  params,
}: {
  params: Promise<{ sid: string }>;
}) {
  const { sid } = await params;
  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: {
      exercise: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) notFound();

  const phase1 = Phase1Data.parse(session.phase1Data);
  const phase2 = Phase2Data.parse(session.phase2Data);
  const phase3 = session.phase3Data
    ? Phase3Data.parse(session.phase3Data)
    : null;
  const summaries = (session.liveSummaries as unknown as LiveSummary[]) ?? [];

  return (
    <Workbench
      tabs={[
        { fileName: "live-dashboard", href: "/live" },
        { fileName: `reasoning/${sid.slice(0, 8)}`, active: true },
      ]}
      statusLeft={
        <>
          <span>student {session.studentId.slice(0, 8)}</span>
          <span>phase {session.currentPhase}</span>
          {session.completedAt && <span>closed</span>}
        </>
      }
      statusRight={<span>Instructor · reasoning trail</span>}
    >
      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        <header className="flex items-center gap-3 text-sm">
          <Link
            href="/live"
            className="text-[#858585] hover:text-white transition-colors"
          >
            ← live
          </Link>
          <span className="text-[#858585]">/</span>
          <span className="text-[#858585] font-mono">
            {session.id.slice(0, 12)}…
          </span>
        </header>
        <h1 className="text-xl font-semibold">Private reasoning</h1>
        <p className="text-sm text-[#858585]">
          Side-by-side: what the student saw vs. what Opus was thinking. Only
          instructors see this page.
        </p>

        <Panel>
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className="font-mono text-xs text-[#858585]">
              {session.id}
            </span>
            <span className="text-[#858585]">·</span>
            <span
              className="font-mono text-xs text-[#4ec9b0]"
              title={
                isUnit(session.exercise.unit)
                  ? UNIT_TITLE[session.exercise.unit as Unit]
                  : undefined
              }
            >
              {isUnit(session.exercise.unit)
                ? `Unit ${UNIT_ROMAN[session.exercise.unit as Unit]} · ${UNIT_TITLE[session.exercise.unit as Unit]}`
                : session.exercise.studentLevel}
            </span>
            <span className="text-[#858585]">·</span>
            <span>{session.exercise.title}</span>
            <span className="text-[#858585]">·</span>
            <span className="font-mono text-xs text-[#569cd6]">
              phase {session.currentPhase}
            </span>
            {session.completedAt && (
              <span className="ml-auto text-xs text-[#858585]">closed</span>
            )}
          </div>
          <div className="text-xs text-[#858585] mt-2 font-mono">
            started {session.startedAt.toLocaleString()}
            {session.completedAt &&
              ` · closed ${session.completedAt.toLocaleString()}`}
          </div>
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="space-y-4">
            <ColumnHeader>What the student saw</ColumnHeader>

            <Panel title="Specification iterations">
              {phase1.iterations.length === 0 ? (
                <Empty />
              ) : (
                <div className="space-y-3">
                  {phase1.iterations.map((it, i) => (
                    <div
                      key={i}
                      className="border border-[#3e3e42] rounded p-3 space-y-2 bg-[#1e1e1e]"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <RoundBadge n={i + 1} />
                        <span className="text-[#858585] font-mono">
                          {new Date(it.timestamp).toLocaleTimeString()}
                        </span>
                        {it.passed && (
                          <span className="text-[#89d185] text-xs">
                            ✓ passed
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[#858585] mb-1">
                          student wrote
                        </div>
                        <div className="text-sm whitespace-pre-wrap bg-[#252526] border border-[#3e3e42] rounded p-2">
                          {it.studentSpecText}
                        </div>
                      </div>
                      {it.opusQuestions.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-[#858585] mb-1">
                            opus asked
                          </div>
                          <ul className="text-sm list-disc ml-5 space-y-0.5">
                            {it.opusQuestions.map((q, qi) => (
                              <li key={qi}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {phase2.opusExchanges.length > 0 && (
              <Panel title="Chat (Phase 2)">
                <div className="space-y-3">
                  {phase2.opusExchanges.map((ex, i) => (
                    <div key={i} className="space-y-2 text-sm">
                      <div className="bg-[#1e1e1e] border border-[#3e3e42] rounded p-2">
                        <div className="text-[10px] uppercase tracking-wider text-[#858585] mb-1">
                          student
                        </div>
                        <div className="whitespace-pre-wrap">
                          {ex.studentMessage}
                        </div>
                      </div>
                      <div className="bg-[#1e3a5c] border border-[#007acc] rounded p-2">
                        <div className="text-[10px] uppercase tracking-wider text-[#75beff] mb-1">
                          opus · {ex.opusMode}
                        </div>
                        <div className="whitespace-pre-wrap">
                          {ex.opusResponse}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {phase2.finalCode && (
              <Panel title="Final code">
                <pre className="text-xs bg-[#1e1e1e] border border-[#3e3e42] rounded p-3 overflow-x-auto font-mono text-[#d4d4d4]">
                  {phase2.finalCode}
                </pre>
              </Panel>
            )}

            {phase3?.revisedCode && (
              <Panel title="Revised after divergence review">
                <div className="text-[10px] uppercase tracking-wider text-[#858585] mb-2 font-mono">
                  student revised{" "}
                  {phase3.revisedAt
                    ? new Date(phase3.revisedAt).toLocaleString()
                    : ""}
                  {" · classifications above still refer to the original code"}
                </div>
                <pre className="text-xs bg-[#1e1e1e] border border-[#3e3e42] rounded p-3 overflow-x-auto font-mono text-[#d4d4d4]">
                  {phase3.revisedCode}
                </pre>
              </Panel>
            )}

            {phase3 && (
              <Panel title="Divergence questions (as shown)">
                <div className="space-y-3">
                  {phase3.divergences.map((d) => (
                    <div
                      key={d.divergenceId}
                      className="border border-[#3e3e42] rounded p-3 bg-[#1e1e1e]"
                    >
                      <div className="text-xs text-[#858585] font-mono mb-2">
                        {d.divergenceId}
                      </div>
                      <div className="text-sm mb-2">
                        {d.studentFacingQuestion}
                      </div>
                      {d.studentResponse && (
                        <div className="mt-2 bg-[#252526] border border-[#3e3e42] rounded p-2">
                          <div className="text-[10px] uppercase tracking-wider text-[#858585] mb-1">
                            student answered
                          </div>
                          <div className="text-sm whitespace-pre-wrap">
                            {d.studentResponse}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </section>

          <section className="space-y-4">
            <ColumnHeader
              subtitle="Private — never shown to the student."
              color="#dcdcaa"
            >
              What Opus was thinking
            </ColumnHeader>

            {phase1.iterations.length > 0 && (
              <Panel title="Specification-gate reasoning per round">
                <div className="space-y-3">
                  {phase1.iterations.map((it, i) => (
                    <div
                      key={i}
                      className="border border-[#3e3e42] rounded p-3 bg-[#2a2411] text-xs space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        <RoundBadge n={i + 1} />
                        <span className="text-[#858585] font-mono">
                          {new Date(it.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#858585]">addressed:</span>{" "}
                        <span className="font-mono text-[#89d185]">
                          [{it.gapsAddressedThisRound.join(", ") || "—"}]
                        </span>
                      </div>
                      <div>
                        <span className="text-[#858585]">still open:</span>{" "}
                        <span className="font-mono text-[#f48771]">
                          [{it.gapsIdentified.join(", ") || "—"}]
                        </span>
                      </div>
                      {it.emergentGaps.length > 0 && (
                        <div>
                          <span className="text-[#858585]">emergent:</span>
                          <ul className="ml-4 list-disc text-[#d4d4d4] mt-0.5">
                            {it.emergentGaps.map((g, gi) => (
                              <li key={gi}>{g.description}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {phase3 && (
              <Panel title="Divergence classifications">
                <div className="space-y-3">
                  {phase3.divergences.map((d) => (
                    <div
                      key={d.divergenceId}
                      className="border border-[#3e3e42] rounded p-3 bg-[#2a2411] text-xs space-y-2"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CategoryBadge
                          category={d.initialClassification}
                          prefix="initial"
                        />
                        <ConfidenceBadge confidence={d.initialConfidence} />
                        {d.finalClassification &&
                          d.finalClassification !== d.initialClassification && (
                            <CategoryBadge
                              category={d.finalClassification}
                              prefix="final"
                            />
                          )}
                        {d.alignment && <AlignmentBadge a={d.alignment} />}
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[#858585]">
                          predicted justification
                        </div>
                        <div className="bg-[#1e1e1e] border border-[#3e3e42] rounded p-2 mt-1 text-[#d4d4d4]">
                          {d.predictedJustification}
                        </div>
                      </div>
                      {d.finalClassificationReason && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-[#858585]">
                            final classification reason
                          </div>
                          <div className="bg-[#1e1e1e] border border-[#3e3e42] rounded p-2 mt-1 text-[#d4d4d4]">
                            {d.finalClassificationReason}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[#858585]">
                          evidence
                        </div>
                        <ul className="ml-4 list-disc text-[#d4d4d4] mt-0.5 space-y-0.5">
                          <li>
                            <span className="text-[#858585]">
                              specification:
                            </span>{" "}
                            {d.evidenceFromSpec}
                          </li>
                          <li>
                            <span className="text-[#858585]">code:</span>{" "}
                            <code className="font-mono text-[#ce9178]">
                              {d.evidenceFromCode}
                            </code>
                          </li>
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {summaries.length > 0 && (
              <Panel title="Live summaries (history)">
                <div className="space-y-2">
                  {summaries
                    .slice()
                    .reverse()
                    .map((s, i) => (
                      <div
                        key={i}
                        className="border border-[#3e3e42] rounded p-2 text-xs bg-[#1e1e1e]"
                      >
                        <div className="text-[#858585] font-mono">
                          {new Date(s.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="mt-1 text-[#d4d4d4]">
                          {s.summaryText}
                        </div>
                        {s.flags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {s.flags.map((f) => (
                              <span
                                key={f}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-[#2d2d30] text-[#dcdcaa] font-mono"
                              >
                                {f.replace(/_/g, " ")}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </Panel>
            )}

            <Panel title="Events timeline">
              {session.events.length === 0 ? (
                <Empty />
              ) : (
                <ul className="space-y-1 font-mono text-xs">
                  {session.events.map((e) => (
                    <li key={e.id} className="flex gap-2">
                      <span className="text-[#858585] shrink-0">
                        {e.createdAt.toLocaleTimeString()}
                      </span>
                      <span className="text-[#569cd6] shrink-0">{e.kind}</span>
                      <span className="text-[#858585] truncate">
                        {JSON.stringify(e.payload).slice(0, 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </section>
        </div>
      </main>
    </Workbench>
  );
}

function Panel({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[#3e3e42] bg-[#252526] rounded p-4">
      {title && (
        <div className="text-[11px] uppercase tracking-wider text-[#858585] mb-3 font-semibold">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function ColumnHeader({
  children,
  subtitle,
  color,
}: {
  children: React.ReactNode;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div>
      <h2
        className="text-lg font-semibold"
        style={color ? { color } : undefined}
      >
        {children}
      </h2>
      {subtitle && (
        <p className="text-xs text-[#858585] mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

function RoundBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#3e3e42] bg-[#1e1e1e]">
      <span className="text-[#858585]">round</span>{" "}
      <span className="text-[#569cd6] ml-1">{n}</span>
    </span>
  );
}

function CategoryBadge({
  category,
  prefix,
}: {
  category: "drift" | "revision" | "bug";
  prefix: string;
}) {
  const palette = {
    drift: { bg: "#5a1d1d", fg: "#f48771" },
    revision: { bg: "#1f3a5c", fg: "#75beff" },
    bug: { bg: "#4f3b17", fg: "#dcdcaa" },
  } as const;
  const { bg, fg } = palette[category];
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
      style={{ backgroundColor: bg, color: fg }}
    >
      {prefix}: {category}
    </span>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: "high" | "medium" | "low";
}) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono border border-[#3e3e42] bg-[#1e1e1e] text-[#858585]">
      {confidence}
    </span>
  );
}

function AlignmentBadge({
  a,
}: {
  a: "aligned" | "partial" | "diverged";
}) {
  const palette = {
    aligned: { bg: "#1e3a2a", fg: "#89d185" },
    partial: { bg: "#4f3b17", fg: "#dcdcaa" },
    diverged: { bg: "#5a1d1d", fg: "#f48771" },
  } as const;
  const { bg, fg } = palette[a];
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
      style={{ backgroundColor: bg, color: fg }}
    >
      alignment: {a}
    </span>
  );
}

function Empty() {
  return <div className="text-sm text-[#858585]">(none)</div>;
}
