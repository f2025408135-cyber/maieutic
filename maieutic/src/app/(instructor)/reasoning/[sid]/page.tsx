import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Divergence,
  LiveSummary,
  Phase1Data,
  Phase2Data,
  Phase3Data,
} from "@/lib/opus/schemas";

export default async function Page(
  { params }: { params: Promise<{ sid: string }> },
) {
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
  const phase2 = session.phase2Data ? Phase2Data.parse(session.phase2Data) : null;
  const phase3 = Phase3Data.parse(session.phase3Data);
  const phase4 = session.phase4Data
    ? (session.phase4Data as { divergences: Divergence[]; startedAt: string; completedAt: string | null })
    : null;
  const summaries = (session.liveSummaries as unknown as LiveSummary[]) ?? [];

  return (
    <main className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/live"
          className="text-sm underline text-muted-foreground"
        >
          ← live
        </Link>
        <h1 className="text-xl font-semibold">Private reasoning</h1>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-1 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">
              {session.id}
            </span>
            <Badge variant="outline">student: {session.studentId.slice(0, 8)}</Badge>
            <Badge variant="secondary">{session.exercise.studentLevel}</Badge>
            <Badge>{session.exercise.title}</Badge>
            <Badge variant="outline">Phase {session.currentPhase}</Badge>
            {session.completedAt && <Badge>Closed</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            started {session.startedAt.toLocaleString()}
            {session.completedAt && ` · closed ${session.completedAt.toLocaleString()}`}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="space-y-4">
          <SectionHeader title="What the student saw" />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Spec iterations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {phase1.iterations.length === 0 ? (
                <div className="text-sm text-muted-foreground">(no iterations)</div>
              ) : (
                phase1.iterations.map((it, i) => (
                  <div
                    key={i}
                    className="border rounded p-3 space-y-2 bg-muted/20"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">Round {i + 1}</Badge>
                      <span>{new Date(it.timestamp).toLocaleTimeString()}</span>
                      {it.passed && <Badge>passed</Badge>}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">
                      <div className="text-xs text-muted-foreground">student wrote</div>
                      <div className="bg-background border rounded p-2">
                        {it.studentSpecText}
                      </div>
                    </div>
                    {it.opusQuestions.length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground">opus asked</div>
                        <ul className="text-sm list-disc ml-5">
                          {it.opusQuestions.map((q, qi) => (
                            <li key={qi}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {phase2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm whitespace-pre-wrap bg-muted/20 border rounded p-2">
                  {phase2.planText}
                </div>
              </CardContent>
            </Card>
          )}

          {phase3.opusExchanges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Chat (Phase 3)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {phase3.opusExchanges.map((ex, i) => (
                  <div key={i} className="space-y-1 text-sm">
                    <div className="bg-muted/30 rounded p-2">
                      <div className="text-xs text-muted-foreground">student</div>
                      <div className="whitespace-pre-wrap">
                        {ex.studentMessage}
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded p-2">
                      <div className="text-xs text-muted-foreground">
                        opus ({ex.opusMode})
                      </div>
                      <div className="whitespace-pre-wrap">{ex.opusResponse}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {phase3.finalCode && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Final code</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted/30 border rounded p-2 overflow-x-auto whitespace-pre-wrap">
                  {phase3.finalCode}
                </pre>
              </CardContent>
            </Card>
          )}

          {phase4 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Divergence questions (as shown)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {phase4.divergences.map((d) => (
                  <div
                    key={d.divergenceId}
                    className="border rounded p-3 bg-muted/20"
                  >
                    <div className="text-xs text-muted-foreground">
                      {d.divergenceId}
                    </div>
                    <div className="text-sm mt-1">{d.studentFacingQuestion}</div>
                    {d.studentResponse && (
                      <div className="text-sm mt-2 bg-background border rounded p-2">
                        <div className="text-xs text-muted-foreground">
                          student answered
                        </div>
                        <div className="whitespace-pre-wrap">
                          {d.studentResponse}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-4">
          <SectionHeader
            title="What Opus was thinking"
            subtitle="Private — never shown to the student."
          />

          {phase1.iterations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Spec-gate reasoning per round
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {phase1.iterations.map((it, i) => (
                  <div
                    key={i}
                    className="border rounded p-3 bg-blue-50/30 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Round {i + 1}</Badge>
                      <span className="text-muted-foreground">
                        {new Date(it.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <div>
                        addressed this round: [
                        {it.gapsAddressedThisRound.join(", ")}]
                      </div>
                      <div>still open: [{it.gapsIdentified.join(", ")}]</div>
                      {it.emergentGaps.length > 0 && (
                        <div>
                          emergent gaps:
                          <ul className="ml-4 list-disc">
                            {it.emergentGaps.map((g, gi) => (
                              <li key={gi}>{g.description}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {phase4 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Divergence classifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {phase4.divergences.map((d) => (
                  <div
                    key={d.divergenceId}
                    className="border rounded p-3 bg-blue-50/30 text-xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{d.initialClassification}</Badge>
                      <Badge variant="outline">
                        confidence: {d.initialConfidence}
                      </Badge>
                      {d.finalClassification &&
                        d.finalClassification !== d.initialClassification && (
                          <Badge variant="secondary">
                            final: {d.finalClassification}
                          </Badge>
                        )}
                      {d.alignment && (
                        <Badge
                          className={
                            d.alignment === "aligned"
                              ? "bg-green-100 text-green-800"
                              : d.alignment === "partial"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-red-100 text-red-800"
                          }
                          variant="outline"
                        >
                          alignment: {d.alignment}
                        </Badge>
                      )}
                    </div>
                    <div>
                      <div className="text-muted-foreground">
                        predicted justification
                      </div>
                      <div className="bg-background border rounded p-2">
                        {d.predictedJustification}
                      </div>
                    </div>
                    {d.finalClassificationReason && (
                      <div>
                        <div className="text-muted-foreground">
                          final classification reason
                        </div>
                        <div className="bg-background border rounded p-2">
                          {d.finalClassificationReason}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-muted-foreground">evidence</div>
                      <ul className="ml-4 list-disc">
                        <li>spec: {d.evidenceFromSpec}</li>
                        {d.evidenceFromPlan && <li>plan: {d.evidenceFromPlan}</li>}
                        <li>code: {d.evidenceFromCode}</li>
                      </ul>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {summaries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Live summaries (history)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summaries
                  .slice()
                  .reverse()
                  .map((s, i) => (
                    <div
                      key={i}
                      className="border rounded p-2 text-xs bg-muted/20"
                    >
                      <div className="text-muted-foreground">
                        {new Date(s.timestamp).toLocaleTimeString()}
                      </div>
                      <div>{s.summaryText}</div>
                      {s.flags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {s.flags.map((f) => (
                            <Badge key={f} variant="outline">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Events timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {session.events.length === 0 ? (
                <div className="text-sm text-muted-foreground">(none)</div>
              ) : (
                <ul className="space-y-1 font-mono text-xs">
                  {session.events.map((e) => (
                    <li key={e.id} className="flex gap-2">
                      <span className="text-muted-foreground">
                        {e.createdAt.toLocaleTimeString()}
                      </span>
                      <span>{e.kind}</span>
                      <span className="text-muted-foreground truncate">
                        {JSON.stringify(e.payload).slice(0, 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
