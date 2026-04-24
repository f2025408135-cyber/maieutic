"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/editor/TopNav";
import { FileTabBar } from "@/components/editor/FileTab";
import { StatusBar } from "@/components/editor/StatusBar";
import { InstructorNav } from "@/components/instructor/InstructorNav";
import type { CohortAggregate } from "@/lib/opus/prompts/cohort-narrative";
import type { CohortNarrativeOutput, SpecDimension } from "@/lib/opus/schemas";
import {
  UNIT_ROMAN,
  UNIT_TITLE,
  isUnit,
  type Unit,
} from "@/lib/units";

type AugmentedAggregate = CohortAggregate & {
  exerciseTitle: string;
  exercisePrompt: string;
  specGateDimensions: SpecDimension[];
};

export function CohortView({
  exerciseId,
  aggregate,
  unit,
  sessionsStarted,
  helpRequestsReceived,
}: {
  exerciseId: string;
  aggregate: AugmentedAggregate;
  unit: string;
  sessionsStarted: number;
  helpRequestsReceived: number;
}) {
  const [narrative, setNarrative] = useState<CohortNarrativeOutput | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchNarrative() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cohort/${exerciseId}/narrative`, {
          method: "POST",
        });
        if (!res.ok) {
          const body = (await res.json()) as {
            error?: string;
            message?: string;
          };
          throw new Error(body.message || body.error || `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { narrative: CohortNarrativeOutput };
        if (!cancelled) setNarrative(body.narrative);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "narrative failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchNarrative();
    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  const hasAny = aggregate.sessionCount > 0;
  const completionPct =
    sessionsStarted > 0
      ? Math.round((aggregate.sessionCount / sessionsStarted) * 100)
      : 0;
  const unitLabel = isUnit(unit)
    ? `Unit ${UNIT_ROMAN[unit as Unit]} · ${UNIT_TITLE[unit as Unit]}`
    : null;

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#1e1e1e] text-[#d4d4d4] flex flex-col">
      <TopNav left={<InstructorNav current="cohorts" />} />
      <FileTabBar fileName={`exercise/${exerciseId}.md`} />

      <div className="shrink-0 px-8 py-6 border-b border-[#3e3e42] bg-[#1e1e1e]">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-2 text-[11px] font-mono tracking-wider uppercase">
            <Link
              href="/cohorts"
              className="text-[#858585] hover:text-white transition-colors"
            >
              ← exercises
            </Link>
            <span className="text-[#3e3e42]">·</span>
            <span className="text-[#4ec9b0]">
              {unitLabel ?? "Exercise"}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight leading-tight">
            How did this exercise go?
          </h1>
          <p className="mt-2 text-sm text-[#d4d4d4]/85 leading-relaxed">
            {aggregate.exerciseTitle}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatPill
              label="sessions started"
              count={sessionsStarted}
              color="#569cd6"
            />
            <StatPill
              label={`completed${sessionsStarted > 0 ? ` · ${completionPct}%` : ""}`}
              count={aggregate.sessionCount}
              color="#89d185"
              muted={aggregate.sessionCount === 0}
            />
            {helpRequestsReceived > 0 && (
              <StatPill
                label="help requests"
                count={helpRequestsReceived}
                color="#f48771"
              />
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Section title="Exercise instructions">
            <div className="border border-[#3e3e42] bg-[#252526] rounded p-4 text-sm text-[#d4d4d4] whitespace-pre-wrap">
              {aggregate.exercisePrompt}
            </div>
          </Section>

          {aggregate.sessionCount < 3 && hasAny && (
            <div className="text-sm border border-[#4f3b17] bg-[#2a2411] text-[#dcdcaa] rounded p-3">
              Only {aggregate.sessionCount} session
              {aggregate.sessionCount === 1 ? "" : "s"} completed — the
              narrative below will say so and the recommendation should be
              taken provisionally.
            </div>
          )}

          <Section
            title="Summary"
            aside={
              narrative && (
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: narrative.provisional
                      ? "#4f3b17"
                      : "#1e3a2a",
                    color: narrative.provisional ? "#dcdcaa" : "#89d185",
                  }}
                >
                  {narrative.provisional ? "provisional" : "confirmed"}
                </span>
              )
            }
          >
            <div className="border border-[#3e3e42] bg-[#252526] rounded p-4 space-y-4">
              {loading && (
                <div className="text-sm text-[#858585] italic">
                  Reading exercise data…
                </div>
              )}
              {error && (
                <div className="text-sm text-[#f48771] font-mono">{error}</div>
              )}
              {!hasAny && !loading && (
                <div className="text-sm text-[#858585]">
                  No completed sessions yet. The summary runs once at least
                  one student finishes Phase 4.
                </div>
              )}
              {narrative && (
                <>
                  <p className="text-sm leading-relaxed text-[#d4d4d4]">
                    {narrative.narrative}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <InsightList
                      label="Solution techniques"
                      items={narrative.solution_techniques}
                      color="#569cd6"
                    />
                    <InsightList
                      label="Common drifts & errors"
                      items={narrative.common_drifts}
                      color="#f48771"
                    />
                    <InsightList
                      label="Strengths"
                      items={narrative.strengths}
                      color="#89d185"
                    />
                    <InsightList
                      label="Difficulties"
                      items={narrative.difficulties}
                      color="#dcdcaa"
                    />
                  </div>
                </>
              )}
            </div>
          </Section>

          {hasAny && (
            <Section title="Divergences">
              <DivergenceCard
                counts={aggregate.divergenceCategoryCounts}
                expected={aggregate.expectedDivergences}
                alignmentFailures={aggregate.alignmentFailures}
                proactiveRevisions={aggregate.proactiveRevisions}
              />
            </Section>
          )}

        </div>
      </main>

      <StatusBar
        left={
          <>
            <span>✓ claude-opus-4-7</span>
            <span>
              {aggregate.sessionCount} completed · {sessionsStarted} started
            </span>
          </>
        }
        right={<span>Aggregated across every session</span>}
      />
    </div>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-[#d4d4d4]">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function InsightList({
  label,
  items,
  color,
}: {
  label: string;
  items: string[];
  color: string;
}) {
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: color }}>
      <div className="flex items-center gap-2">
        <div className="text-[11px] uppercase tracking-wider text-[#858585] font-mono">
          {label}
        </div>
        <span
          className="text-[10px] font-mono text-[#858585]"
          aria-hidden
        >
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="mt-1 text-sm text-[#858585] italic">(none noted)</div>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {items.map((it, i) => (
            <li key={i} className="text-sm text-[#d4d4d4] flex gap-2">
              <span className="text-[#858585] shrink-0">·</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const DIVERGENCE_PALETTE = {
  drift: { color: "#dcdcaa", label: "drift" },
  revision: { color: "#75beff", label: "revision" },
  bug: { color: "#f48771", label: "bug" },
} as const;

function DivergenceCard({
  counts,
  expected,
  alignmentFailures,
  proactiveRevisions,
}: {
  counts: Record<"drift" | "revision" | "bug", number>;
  expected: Array<{ category: string; pattern: string }>;
  alignmentFailures: number;
  proactiveRevisions: number;
}) {
  const total = counts.drift + counts.revision + counts.bug;
  const parts = (["drift", "revision", "bug"] as const).map((k) => ({
    key: k,
    ...DIVERGENCE_PALETTE[k],
    value: counts[k],
  }));

  return (
    <div className="border border-[#3e3e42] bg-[#252526] rounded p-4 space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-[#858585] font-mono">
            Mix
          </div>
          <span className="text-[11px] text-[#858585] font-mono">
            {total === 0 ? "none flagged" : `${total} flagged`}
          </span>
        </div>
        {total === 0 ? (
          <div className="text-sm text-[#858585]">
            No divergences across completed sessions.
          </div>
        ) : (
          <>
            <div className="h-2 rounded-full bg-[#1e1e1e] overflow-hidden flex">
              {parts.map((p) =>
                p.value > 0 ? (
                  <div
                    key={p.key}
                    style={{
                      width: `${(p.value / total) * 100}%`,
                      backgroundColor: p.color,
                    }}
                    title={`${p.value} ${p.label}`}
                  />
                ) : null,
              )}
            </div>
            <div className="flex items-center gap-4 text-xs font-mono flex-wrap pt-1">
              {parts.map((p) => (
                <span key={p.key} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: p.color }}
                    aria-hidden
                  />
                  <span className="text-[#d4d4d4]">{p.value}</span>
                  <span className="text-[#858585]">{p.label}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {expected.length > 0 && (
        <div className="border-t border-[#3e3e42] pt-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[#858585] font-mono">
            Instructor-intended patterns
          </div>
          <ul className="space-y-1.5">
            {expected.map((e, i) => {
              const palette =
                DIVERGENCE_PALETTE[e.category as keyof typeof DIVERGENCE_PALETTE];
              return (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-[#d4d4d4]"
                >
                  <span
                    className="mt-0.5 shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#3e3e42] bg-[#1e1e1e]"
                    style={{ color: palette?.color ?? "#d4d4d4" }}
                  >
                    {e.category}
                  </span>
                  <span className="leading-snug">{e.pattern}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#3e3e42] pt-4">
        <Signal
          label="Alignment failures"
          value={alignmentFailures}
          hint="students answered &ldquo;didn't think about that&rdquo;"
        />
        <Signal
          label="Proactive revisions"
          value={proactiveRevisions}
          hint="student-initiated spec changes mid-Phase 3"
        />
      </div>
    </div>
  );
}

function Signal({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-[#858585] font-mono">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-[#d4d4d4]">{value}</div>
      <div className="mt-0.5 text-[11px] text-[#858585]">{hint}</div>
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
