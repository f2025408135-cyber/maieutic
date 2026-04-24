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
  const divTotal =
    aggregate.divergenceCategoryCounts.drift +
    aggregate.divergenceCategoryCounts.revision +
    aggregate.divergenceCategoryCounts.bug;
  const iterMedian =
    aggregate.specIterations.length === 0
      ? 0
      : [...aggregate.specIterations].sort((a, b) => a - b)[
          Math.floor(aggregate.specIterations.length / 2)
        ];
  const iterRange =
    aggregate.specIterations.length > 0
      ? [
          Math.min(...aggregate.specIterations),
          Math.max(...aggregate.specIterations),
        ]
      : null;
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
      <FileTabBar fileName={`cohort/${exerciseId}.md`} />

      <div className="shrink-0 px-8 py-6 border-b border-[#3e3e42] bg-[#1e1e1e]">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-2 text-[11px] font-mono tracking-wider uppercase">
            <Link
              href="/cohorts"
              className="text-[#858585] hover:text-white transition-colors"
            >
              ← cohorts
            </Link>
            <span className="text-[#3e3e42]">·</span>
            <span className="text-[#4ec9b0]">
              {unitLabel ?? "Cohort"}
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
            <StatPill
              label="divergences"
              count={divTotal}
              color="#dcdcaa"
              muted={divTotal === 0}
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
                  Reading cohort data…
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title={`Divergences · ${divTotal}`}>
              <div className="border border-[#3e3e42] bg-[#252526] rounded p-4">
                <DistributionBar
                  items={[
                    {
                      label: "drift",
                      value: aggregate.divergenceCategoryCounts.drift,
                      color: "#f48771",
                    },
                    {
                      label: "revision",
                      value: aggregate.divergenceCategoryCounts.revision,
                      color: "#75beff",
                    },
                    {
                      label: "bug",
                      value: aggregate.divergenceCategoryCounts.bug,
                      color: "#dcdcaa",
                    },
                  ]}
                />
              </div>
            </Section>

            <Section title="Specification iterations">
              <div className="border border-[#3e3e42] bg-[#252526] rounded p-4">
                <div className="text-3xl font-semibold text-[#dcdcaa]">
                  {iterMedian || "—"}
                </div>
                <div className="text-xs text-[#858585] mt-1">
                  median across {aggregate.sessionCount} session
                  {aggregate.sessionCount === 1 ? "" : "s"}
                </div>
                {iterRange && (
                  <div className="text-xs mt-2 text-[#858585]">
                    range: {iterRange[0]} – {iterRange[1]}
                  </div>
                )}
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title="Most-missed dimensions (first pass)">
              <div className="border border-[#3e3e42] bg-[#252526] rounded p-4">
                {aggregate.mostMissedDimensions.length === 0 ? (
                  <div className="text-sm text-[#858585]">(none yet)</div>
                ) : (
                  <ul className="space-y-1.5">
                    {aggregate.mostMissedDimensions.map((d) => (
                      <li
                        key={d.id}
                        className="text-sm flex items-center justify-between gap-2"
                      >
                        <span className="font-mono text-[#4ec9b0] truncate">
                          {d.id}
                        </span>
                        <span className="text-xs font-mono text-[#858585] shrink-0">
                          {d.count}×
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>

            <Section title="Most-flagged divergences">
              <div className="border border-[#3e3e42] bg-[#252526] rounded p-4">
                {aggregate.mostFlaggedDivergences.length === 0 ? (
                  <div className="text-sm text-[#858585]">(none yet)</div>
                ) : (
                  <ul className="space-y-2">
                    {aggregate.mostFlaggedDivergences.map((d) => (
                      <li
                        key={d.key}
                        className="text-sm flex items-start gap-2"
                      >
                        <span className="text-xs font-mono text-[#858585] shrink-0 pt-0.5">
                          {d.count}×
                        </span>
                        <span className="text-[#d4d4d4]">{d.key}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>
          </div>

          <Section title="Other signals">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MetricCard
                label="Alignment failures"
                value={aggregate.alignmentFailures}
              />
              <MetricCard
                label="Proactive revisions"
                value={aggregate.proactiveRevisions}
              />
              <MetricCard
                label="Unresolved divergences"
                value={aggregate.unresolvedCount}
              />
            </div>
          </Section>

          <div className="flex justify-end pt-2 pb-4">
            <button
              onClick={() => window.location.reload()}
              className="text-xs font-mono text-[#858585] hover:text-white transition-colors"
            >
              ↻ refresh summary
            </button>
          </div>
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

function DistributionBar({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (total === 0)
    return <div className="text-sm text-[#858585]">(none)</div>;
  return (
    <div className="space-y-3">
      <div className="h-3 w-full rounded-full overflow-hidden flex bg-[#1e1e1e]">
        {items.map((it) => (
          <div
            key={it.label}
            style={{
              width: `${(it.value / total) * 100}%`,
              backgroundColor: it.color,
            }}
          />
        ))}
      </div>
      <div className="flex gap-4 text-xs flex-wrap">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: it.color }}
            />
            <span className="text-[#858585]">
              {it.label}{" "}
              <span className="text-[#d4d4d4] font-mono">{it.value}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[#3e3e42] bg-[#252526] rounded p-3">
      <div className="text-[11px] uppercase tracking-wider text-[#858585] font-mono">
        {label}
      </div>
      <div className="text-2xl font-semibold text-[#dcdcaa] mt-1">{value}</div>
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
