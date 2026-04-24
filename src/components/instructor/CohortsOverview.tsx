"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/editor/TopNav";
import { FileTabBar } from "@/components/editor/FileTab";
import { StatusBar } from "@/components/editor/StatusBar";
import { InstructorNav } from "@/components/instructor/InstructorNav";
import type { ExerciseSummary } from "@/lib/cohort";
import {
  UNIT_IDS,
  UNIT_ROMAN,
  UNIT_TITLE,
  isUnit,
  type Unit,
} from "@/lib/units";

type SortMode = "most_attempted" | "unit" | "alphabetical";

export function CohortsOverview({
  summaries,
}: {
  summaries: ExerciseSummary[];
}) {
  const [sort, setSort] = useState<SortMode>("most_attempted");

  const totalStarted = summaries.reduce((n, s) => n + s.sessionsStarted, 0);
  const totalCompleted = summaries.reduce(
    (n, s) => n + s.sessionsCompleted,
    0,
  );

  const grouped = useMemo(() => {
    if (sort !== "unit") return null;
    const byUnit = new Map<Unit, ExerciseSummary[]>();
    const other: ExerciseSummary[] = [];
    for (const ex of summaries) {
      if (isUnit(ex.unit)) {
        const list = byUnit.get(ex.unit) ?? [];
        list.push(ex);
        byUnit.set(ex.unit, list);
      } else {
        other.push(ex);
      }
    }
    const groups = UNIT_IDS.filter((u) => byUnit.has(u)).map((u) => ({
      unit: u,
      label: `Unit ${UNIT_ROMAN[u]} · ${UNIT_TITLE[u]}`,
      items: [...byUnit.get(u)!].sort((a, b) => a.title.localeCompare(b.title)),
    }));
    if (other.length > 0) {
      groups.push({
        unit: "other" as unknown as Unit,
        label: "Other",
        items: other,
      });
    }
    return groups;
  }, [summaries, sort]);

  const flatSorted = useMemo(() => {
    const copy = [...summaries];
    if (sort === "alphabetical") {
      copy.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "most_attempted") {
      copy.sort(
        (a, b) =>
          b.sessionsStarted - a.sessionsStarted ||
          a.title.localeCompare(b.title),
      );
    }
    return copy;
  }, [summaries, sort]);

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#1e1e1e] text-[#d4d4d4] flex flex-col">
      <TopNav left={<InstructorNav current="cohorts" />} />
      <FileTabBar fileName="exercises.md" />

      <div className="shrink-0 px-8 py-6 border-b border-[#3e3e42] bg-[#1e1e1e]">
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono text-[#4ec9b0] tracking-wider uppercase mb-2">
              Instructor · Exercises
            </div>
            <h1 className="text-2xl font-semibold tracking-tight leading-tight">
              Exercise performance across the class
            </h1>
            <p className="mt-2 text-sm text-[#d4d4d4]/85 leading-relaxed">
              Each card summarizes one exercise across every student session —
              completion rate, spec iteration counts, divergence types, and the
              dimensions most often missed on the first round. Open a card to
              see per-student runs and full summary.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatPill
                label="exercises"
                count={summaries.length}
                color="#4ec9b0"
              />
              <StatPill
                label="sessions started"
                count={totalStarted}
                color="#569cd6"
              />
              <StatPill
                label="sessions completed"
                count={totalCompleted}
                color="#89d185"
                muted={totalCompleted === 0}
              />
            </div>
          </div>
          <Link
            href="/authoring"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#007acc] hover:bg-[#1188dd] text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            + New exercise
          </Link>
        </div>
      </div>

      <section className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold tracking-tight text-[#d4d4d4]">
              Exercises
            </h2>
            <SortToggle value={sort} onChange={setSort} />
          </div>

          {summaries.length === 0 ? (
            <div className="border border-dashed border-[#3e3e42] rounded p-10 text-center text-sm text-[#858585]">
              No published exercises yet.{" "}
              <Link
                href="/authoring"
                className="underline text-[#569cd6] hover:text-white"
              >
                Author one.
              </Link>
            </div>
          ) : grouped ? (
            <div className="space-y-6">
              {grouped.map((g) => (
                <div key={String(g.unit)} className="space-y-3">
                  <div className="text-[11px] font-mono text-[#4ec9b0] tracking-wider uppercase">
                    {g.label}
                  </div>
                  <div className="space-y-2">
                    {g.items.map((ex) => (
                      <ExerciseCard key={ex.id} ex={ex} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {flatSorted.map((ex) => (
                <ExerciseCard key={ex.id} ex={ex} />
              ))}
            </div>
          )}
        </div>
      </section>

      <StatusBar
        left={
          <>
            <span>✓ claude-opus-4-7</span>
            <span>
              {summaries.length} exercise
              {summaries.length === 1 ? "" : "s"}
            </span>
          </>
        }
        right={<span>Aggregated across every session</span>}
      />
    </div>
  );
}

function ExerciseCard({ ex }: { ex: ExerciseSummary }) {
  const completionPct =
    ex.sessionsStarted > 0
      ? Math.round((ex.sessionsCompleted / ex.sessionsStarted) * 100)
      : 0;
  const totalDivergences =
    ex.divergenceCounts.drift +
    ex.divergenceCounts.revision +
    ex.divergenceCounts.bug;

  return (
    <Link
      href={`/cohort/${ex.id}`}
      className="block group border border-[#3e3e42] bg-[#252526] rounded hover:border-[#007acc] transition-colors overflow-hidden"
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
              <UnitBadge unit={ex.unit} />
              {ex.helpRequestsReceived > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px]"
                  style={{ backgroundColor: "#5a1d1d", color: "#f48771" }}
                >
                  🙋 {ex.helpRequestsReceived} help
                </span>
              )}
            </div>
            <div className="mt-1.5 text-base font-semibold text-[#d4d4d4] group-hover:text-white">
              {ex.title}
            </div>
          </div>
          <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[#858585] text-sm">
            →
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric
            label="Sessions"
            value={
              <>
                <span className="text-[#d4d4d4]">{ex.sessionsCompleted}</span>
                <span className="text-[#858585]"> / {ex.sessionsStarted}</span>
              </>
            }
            hint={
              ex.sessionsStarted > 0
                ? `${completionPct}% complete`
                : "no sessions yet"
            }
            bar={ex.sessionsStarted > 0 ? completionPct : null}
          />
          <Metric
            label="Spec iterations"
            value={
              ex.medianIterations !== null ? (
                <>
                  <span className="text-[#d4d4d4]">
                    {ex.medianIterations.toFixed(ex.medianIterations % 1 ? 1 : 0)}
                  </span>
                  <span className="text-[#858585]"> median</span>
                </>
              ) : (
                <span className="text-[#858585]">—</span>
              )
            }
            hint={
              ex.maxIterations !== null
                ? `max ${ex.maxIterations}`
                : "no completions"
            }
          />
          <Metric
            label="Divergences"
            value={
              totalDivergences === 0 ? (
                <span className="text-[#858585]">none</span>
              ) : (
                <DivergenceMix counts={ex.divergenceCounts} />
              )
            }
            hint={
              totalDivergences === 0
                ? "no completions yet"
                : `${totalDivergences} flagged`
            }
          />
          <Metric
            label="Top miss"
            value={
              ex.topMissedDimension ? (
                <span
                  className="text-[#d4d4d4] font-mono text-xs truncate block"
                  title={ex.topMissedDimension.id}
                >
                  {ex.topMissedDimension.id}
                </span>
              ) : (
                <span className="text-[#858585]">—</span>
              )
            }
            hint={
              ex.topMissedDimension
                ? `${ex.topMissedDimension.count} round 1 miss${ex.topMissedDimension.count === 1 ? "" : "es"}`
                : ""
            }
          />
        </div>

        {ex.topDivergenceCluster && (
          <div className="border-t border-[#3e3e42] pt-3 text-xs">
            <span className="text-[#858585] uppercase tracking-wider text-[10px] font-mono">
              Top divergence cluster ·{" "}
            </span>
            <span className="text-[#d4d4d4]">
              &ldquo;{ex.topDivergenceCluster.key}
              {ex.topDivergenceCluster.key.length === 80 ? "…" : ""}&rdquo;
            </span>
            <span className="text-[#858585]">
              {" "}
              × {ex.topDivergenceCluster.count}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

function Metric({
  label,
  value,
  hint,
  bar,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** Optional percentage (0–100) to render as a thin progress bar. */
  bar?: number | null;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-[#858585] font-mono">
        {label}
      </div>
      <div className="mt-1 text-sm min-w-0">{value}</div>
      {bar != null && (
        <div className="mt-1.5 h-1 rounded-full bg-[#1e1e1e] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#4ec9b0]"
            style={{ width: `${bar}%` }}
          />
        </div>
      )}
      {hint && (
        <div className="mt-1 text-[11px] text-[#858585] font-mono">{hint}</div>
      )}
    </div>
  );
}

function DivergenceMix({
  counts,
}: {
  counts: { drift: number; revision: number; bug: number };
}) {
  const parts: { key: string; label: string; value: number; color: string }[] =
    [
      { key: "drift", label: "drift", value: counts.drift, color: "#dcdcaa" },
      {
        key: "revision",
        label: "rev",
        value: counts.revision,
        color: "#75beff",
      },
      { key: "bug", label: "bug", value: counts.bug, color: "#f48771" },
    ];
  const nonZero = parts.filter((p) => p.value > 0);
  if (nonZero.length === 0) return <span className="text-[#858585]">—</span>;
  return (
    <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
      {nonZero.map((p) => (
        <span key={p.key} className="inline-flex items-center gap-1">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-[#d4d4d4]">{p.value}</span>
          <span className="text-[#858585]">{p.label}</span>
        </span>
      ))}
    </div>
  );
}

function UnitBadge({ unit }: { unit: string }) {
  const label = isUnit(unit) ? `Unit ${UNIT_ROMAN[unit as Unit]}` : unit;
  const title = isUnit(unit) ? UNIT_TITLE[unit as Unit] : undefined;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#3e3e42] bg-[#1e1e1e] text-[#4ec9b0]"
      title={title}
    >
      {label}
    </span>
  );
}

function SortToggle({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (next: SortMode) => void;
}) {
  const options: { id: SortMode; label: string }[] = [
    { id: "most_attempted", label: "Most attempted" },
    { id: "unit", label: "By unit" },
    { id: "alphabetical", label: "A → Z" },
  ];
  return (
    <div
      role="tablist"
      className="inline-flex items-center p-0.5 rounded border border-[#3e3e42] bg-[#252526] text-xs font-mono"
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`px-2.5 py-1 rounded transition-colors ${
              active
                ? "bg-[#007acc] text-white"
                : "text-[#858585] hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function StatPill({
  color,
  label,
  count,
  muted,
}: {
  color: string;
  label: string;
  count: number;
  muted?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#3e3e42] bg-[#252526] text-xs font-mono ${
        muted ? "opacity-50" : ""
      }`}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-[#d4d4d4]">{count}</span>
      <span className="text-[#858585]">{label}</span>
    </span>
  );
}
