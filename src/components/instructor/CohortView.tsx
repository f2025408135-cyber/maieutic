"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [narrative, setNarrative] = useState<CohortNarrativeOutput | null>(null);
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
          const body = (await res.json()) as { error?: string; message?: string };
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
    <main className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/live"
          className="text-sm underline text-muted-foreground"
        >
          ← live
        </Link>
        <h1 className="text-xl font-semibold">How did this exercise go?</h1>
      </div>
      <div className="text-sm text-muted-foreground">
        <span className="font-mono">{exerciseId}</span> · {aggregate.exerciseTitle}
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm">
            <strong>Prompt:</strong> {aggregate.exercisePrompt}
          </p>
        </CardContent>
      </Card>

      {aggregate.sessionCount < 3 && hasAny && (
        <div className="text-sm border border-yellow-300 bg-yellow-50 text-yellow-900 rounded p-3">
          Only {aggregate.sessionCount} session
          {aggregate.sessionCount === 1 ? "" : "s"} completed — the narrative
          below will say so and the recommendation should be taken provisionally.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opus narrative</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && (
            <div className="text-sm text-muted-foreground italic">
              Reading cohort data…
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}
          {!hasAny && !loading && (
            <div className="text-sm text-muted-foreground">
              No completed sessions yet. The narrative runs once at least one
              student finishes Phase 4.
            </div>
          )}
          {narrative && (
            <>
              <p className="text-sm whitespace-pre-wrap">{narrative.narrative}</p>
              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <div className="text-muted-foreground">Pattern</div>
                  <div>{narrative.pattern_summary}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Recommendation</div>
                  <div>{narrative.recommendation}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Provisional</div>
                  <div>{narrative.provisional ? "yes" : "no"}</div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Divergences ({divTotal})</CardTitle>
          </CardHeader>
          <CardContent>
            <DistributionBar
              items={[
                {
                  label: "drift",
                  value: aggregate.divergenceCategoryCounts.drift,
                  color: "bg-red-400",
                },
                {
                  label: "revision",
                  value: aggregate.divergenceCategoryCounts.revision,
                  color: "bg-blue-400",
                },
                {
                  label: "bug",
                  value: aggregate.divergenceCategoryCounts.bug,
                  color: "bg-amber-400",
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spec iterations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{iterMedian || "—"}</div>
            <div className="text-xs text-muted-foreground">
              median across {aggregate.sessionCount} session
              {aggregate.sessionCount === 1 ? "" : "s"}
            </div>
            {aggregate.specIterations.length > 0 && (
              <div className="text-xs mt-2 text-muted-foreground">
                range: {Math.min(...aggregate.specIterations)} –{" "}
                {Math.max(...aggregate.specIterations)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Most-missed dimensions (first pass)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aggregate.mostMissedDimensions.length === 0 ? (
              <div className="text-sm text-muted-foreground">(none yet)</div>
            ) : (
              <ul className="space-y-1">
                {aggregate.mostMissedDimensions.map((d) => (
                  <li key={d.id} className="text-sm flex justify-between">
                    <span className="font-mono">{d.id}</span>
                    <Badge variant="outline">{d.count}×</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Most-flagged divergences
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aggregate.mostFlaggedDivergences.length === 0 ? (
              <div className="text-sm text-muted-foreground">(none yet)</div>
            ) : (
              <ul className="space-y-1">
                {aggregate.mostFlaggedDivergences.map((d) => (
                  <li key={d.key} className="text-sm flex items-start gap-2">
                    <Badge variant="outline">{d.count}×</Badge>
                    <span>{d.key}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
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

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
        >
          Refresh narrative
        </Button>
      </div>
    </main>
  );
}

function DistributionBar({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (total === 0)
    return <div className="text-sm text-muted-foreground">(none)</div>;
  return (
    <div className="space-y-2">
      <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted">
        {items.map((it) => (
          <div
            key={it.label}
            style={{ width: `${(it.value / total) * 100}%` }}
            className={it.color}
          />
        ))}
      </div>
      <div className="flex gap-4 text-xs">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded ${it.color}`} />
            <span>
              {it.label} {it.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded p-3 bg-background">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
