"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Workbench } from "@/components/editor/Workbench";
import type { CohortAggregate } from "@/lib/opus/prompts/cohort-narrative";
import type { CohortNarrativeOutput, SpecDimension } from "@/lib/opus/schemas";

type AugmentedAggregate = CohortAggregate & {
  exerciseTitle: string;
  exercisePrompt: string;
  specGateDimensions: SpecDimension[];
};

export function CohortView({
  exerciseId,
  aggregate,
}: {
  exerciseId: string;
  aggregate: AugmentedAggregate;
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

  return (
    <Workbench
      tabs={[
        { fileName: "live-dashboard", href: "/live" },
        { fileName: `cohort/${exerciseId}`, active: true },
      ]}
      statusLeft={
        <>
          <span>
            {aggregate.sessionCount} session
            {aggregate.sessionCount === 1 ? "" : "s"} completed
          </span>
          <span>{divTotal} divergences</span>
        </>
      }
      statusRight={<span>Instructor · cohort</span>}
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
          <span className="text-[#858585] font-mono">{exerciseId}</span>
        </header>
        <h1 className="text-xl font-semibold">How did this exercise go?</h1>
        <p className="text-sm text-[#858585]">{aggregate.exerciseTitle}</p>

        <Panel>
          <div className="text-[11px] uppercase tracking-wider text-[#858585] mb-2">
            Exercise prompt
          </div>
          <p className="text-sm text-[#d4d4d4]">{aggregate.exercisePrompt}</p>
        </Panel>

        {aggregate.sessionCount < 3 && hasAny && (
          <div className="text-sm border border-[#4f3b17] bg-[#2a2411] text-[#dcdcaa] rounded p-3">
            Only {aggregate.sessionCount} session
            {aggregate.sessionCount === 1 ? "" : "s"} completed — the narrative
            below will say so and the recommendation should be taken
            provisionally.
          </div>
        )}

        <Panel>
          <div className="flex items-start justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-[#858585]">
              Opus narrative
            </div>
            {narrative && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: narrative.provisional ? "#4f3b17" : "#1e3a2a",
                  color: narrative.provisional ? "#dcdcaa" : "#89d185",
                }}
              >
                {narrative.provisional ? "provisional" : "confirmed"}
              </span>
            )}
          </div>
          {loading && (
            <div className="text-sm text-[#858585] italic">
              Reading cohort data…
            </div>
          )}
          {error && <div className="text-sm text-[#f48771]">{error}</div>}
          {!hasAny && !loading && (
            <div className="text-sm text-[#858585]">
              No completed sessions yet. The narrative runs once at least one
              student finishes Phase 4.
            </div>
          )}
          {narrative && (
            <>
              <p className="text-sm leading-relaxed text-[#d4d4d4]">
                {narrative.narrative}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                <MetaRow label="Pattern" value={narrative.pattern_summary} />
                <MetaRow
                  label="Recommendation"
                  value={narrative.recommendation}
                />
              </div>
            </>
          )}
        </Panel>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel>
            <div className="text-[11px] uppercase tracking-wider text-[#858585] mb-3">
              Divergences ({divTotal})
            </div>
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
          </Panel>

          <Panel>
            <div className="text-[11px] uppercase tracking-wider text-[#858585] mb-3">
              Spec iterations
            </div>
            <div className="text-3xl font-semibold text-[#dcdcaa]">
              {iterMedian || "—"}
            </div>
            <div className="text-xs text-[#858585] mt-1">
              median across {aggregate.sessionCount} session
              {aggregate.sessionCount === 1 ? "" : "s"}
            </div>
            {aggregate.specIterations.length > 0 && (
              <div className="text-xs mt-2 text-[#858585]">
                range: {Math.min(...aggregate.specIterations)} –{" "}
                {Math.max(...aggregate.specIterations)}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel>
            <div className="text-[11px] uppercase tracking-wider text-[#858585] mb-3">
              Most-missed dimensions (first pass)
            </div>
            {aggregate.mostMissedDimensions.length === 0 ? (
              <div className="text-sm text-[#858585]">(none yet)</div>
            ) : (
              <ul className="space-y-1.5">
                {aggregate.mostMissedDimensions.map((d) => (
                  <li
                    key={d.id}
                    className="text-sm flex items-center justify-between"
                  >
                    <span className="font-mono text-[#4ec9b0]">{d.id}</span>
                    <span className="text-xs font-mono text-[#858585]">
                      {d.count}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <div className="text-[11px] uppercase tracking-wider text-[#858585] mb-3">
              Most-flagged divergences
            </div>
            {aggregate.mostFlaggedDivergences.length === 0 ? (
              <div className="text-sm text-[#858585]">(none yet)</div>
            ) : (
              <ul className="space-y-2">
                {aggregate.mostFlaggedDivergences.map((d) => (
                  <li key={d.key} className="text-sm flex items-start gap-2">
                    <span className="text-xs font-mono text-[#858585] shrink-0 pt-0.5">
                      {d.count}×
                    </span>
                    <span className="text-[#d4d4d4]">{d.key}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <MetricCard
            label="Alignment failures"
            value={aggregate.alignmentFailures}
          />
          <MetricCard
            label="Proactive revisions"
            value={aggregate.proactiveRevisions}
          />
          <MetricCard label="Unresolved" value={aggregate.unresolvedCount} />
        </div>

        <div className="flex justify-end pb-8">
          <button
            className="text-xs text-[#858585] hover:text-white transition-colors"
            onClick={() => window.location.reload()}
          >
            ↻ refresh narrative
          </button>
        </div>
      </main>
    </Workbench>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-[#3e3e42] bg-[#252526] rounded p-4">
      {children}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-[#3e3e42] pl-3">
      <div className="text-[11px] uppercase tracking-wider text-[#858585]">
        {label}
      </div>
      <div className="text-sm mt-0.5">{value}</div>
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
      <div className="flex gap-4 text-xs">
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
      <div className="text-[11px] uppercase tracking-wider text-[#858585]">
        {label}
      </div>
      <div className="text-2xl font-semibold text-[#dcdcaa] mt-1">{value}</div>
    </div>
  );
}
