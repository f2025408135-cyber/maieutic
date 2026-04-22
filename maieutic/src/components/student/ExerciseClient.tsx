"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PythonEditor } from "@/components/student/PythonEditor";
import type {
  OpusMode,
  Phase1Data,
  Phase1Iteration,
  Phase2Data,
  Phase3Data,
  Phase3Exchange,
  SpecDimension,
  StudentLevel,
} from "@/lib/opus/schemas";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExerciseClientProps {
  exercise: {
    id: string;
    title: string;
    instructorPromptText: string;
    studentLevel: StudentLevel;
    phase2Required: boolean;
    specGateDimensions: SpecDimension[];
  };
  initialSession: {
    id: string;
    currentPhase: number;
    startedAt: string;
    phase1: Phase1Data;
    phase2: Phase2Data | null;
    phase3: Phase3Data;
  };
}

interface DivergenceQuestion {
  divergenceId: string;
  studentFacingQuestion: string;
  answer: string | null;
  submitting: boolean;
  result: {
    alignment: string;
    finalClassification: string;
  } | null;
}

// ─── Main component ───────────────────────────────────────────────────────

export function ExerciseClient({
  exercise,
  initialSession,
}: ExerciseClientProps) {
  const [session, setSession] = useState(initialSession);
  const [specDraft, setSpecDraft] = useState("");
  const [planDraft, setPlanDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 3 — editor, chat, submit.
  const [code, setCode] = useState(initialSession.phase3.currentCode);
  const [exchanges, setExchanges] = useState<Phase3Exchange[]>(
    initialSession.phase3.opusExchanges,
  );
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [finalSubmitting, setFinalSubmitting] = useState(false);

  // Phase 4 — divergences.
  const [divergences, setDivergences] = useState<DivergenceQuestion[]>([]);
  const [divergenceIndex, setDivergenceIndex] = useState(0);

  const inPhase1 = session.currentPhase === 1;
  const inPhase2 = session.currentPhase === 2;
  const inPhase3 = session.currentPhase === 3;
  const inPhase4 = session.currentPhase === 4;
  const closed = session.currentPhase >= 5;

  // ── Phase 1: submit spec ──────────────────────────────────────────────
  async function submitSpec() {
    if (!specDraft.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${session.id}/spec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specText: specDraft }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as {
        iteration: Phase1Iteration;
        passed: boolean;
        nextPhase: number;
      };
      setSession((prev) => ({
        ...prev,
        currentPhase: body.nextPhase,
        phase1: {
          ...prev.phase1,
          iterations: [...prev.phase1.iterations, body.iteration],
          finalSpecText: body.passed
            ? body.iteration.studentSpecText
            : prev.phase1.finalSpecText,
          instructorConfiguredDimensionsAddressed: Array.from(
            new Set([
              ...prev.phase1.instructorConfiguredDimensionsAddressed,
              ...body.iteration.gapsAddressedThisRound,
            ]),
          ),
        },
      }));
      if (!body.passed) setSpecDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Phase 2: submit plan ──────────────────────────────────────────────
  async function submitPlan() {
    if (!planDraft.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${session.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planText: planDraft }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setSession((prev) => ({
        ...prev,
        currentPhase: 3,
        phase2: { planText: planDraft, submittedAt: new Date().toISOString() },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Phase 3: autosave (debounced) ─────────────────────────────────────
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!inPhase3) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      fetch(`/api/session/${session.id}/autosave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }).catch(() => {
        /* best-effort; next save will retry */
      });
    }, 1500);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [code, session.id, inPhase3]);

  // ── Phase 3: send chat message ────────────────────────────────────────
  async function sendChat() {
    if (!chatInput.trim() || chatBusy) return;
    const message = chatInput;
    setChatBusy(true);
    setError(null);
    // Optimistically show the student message; Opus response appears after.
    const pending: Phase3Exchange = {
      timestamp: new Date().toISOString(),
      studentMessage: message,
      opusMode: "direct" as OpusMode,
      opusResponse: "__pending__",
    };
    setExchanges((prev) => [...prev, pending]);
    setChatInput("");
    try {
      const res = await fetch(`/api/session/${session.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { exchange: Phase3Exchange };
      setExchanges((prev) => [...prev.slice(0, -1), body.exchange]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "chat failed");
      setExchanges((prev) => prev.slice(0, -1));
      setChatInput(message); // restore input so they can retry
    } finally {
      setChatBusy(false);
    }
  }

  // ── Phase 3: submit final code ────────────────────────────────────────
  async function submitFinalCode() {
    if (finalSubmitting) return;
    setFinalSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${session.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalCode: code }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as {
        divergences: { divergenceId: string; studentFacingQuestion: string }[];
        count: number;
      };
      setDivergences(
        body.divergences.map((d) => ({
          divergenceId: d.divergenceId,
          studentFacingQuestion: d.studentFacingQuestion,
          answer: null,
          submitting: false,
          result: null,
        })),
      );
      setDivergenceIndex(0);
      setSession((prev) => ({ ...prev, currentPhase: 4 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "submit failed");
    } finally {
      setFinalSubmitting(false);
    }
  }

  // ── Phase 4: answer a divergence question ────────────────────────────
  async function answerDivergence(i: number, answer: string) {
    const d = divergences[i];
    if (!d || d.result || d.submitting) return;
    setDivergences((prev) =>
      prev.map((x, idx) => (idx === i ? { ...x, submitting: true } : x)),
    );
    setError(null);
    try {
      const res = await fetch(`/api/session/${session.id}/divergence-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divergenceId: d.divergenceId, response: answer }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as {
        allAnswered: boolean;
        alignment: string;
        finalClassification: string;
      };
      setDivergences((prev) =>
        prev.map((x, idx) =>
          idx === i
            ? {
                ...x,
                submitting: false,
                answer,
                result: {
                  alignment: body.alignment,
                  finalClassification: body.finalClassification,
                },
              }
            : x,
        ),
      );
      if (body.allAnswered) {
        setSession((prev) => ({ ...prev, currentPhase: 5 }));
      } else if (i < divergences.length - 1) {
        setDivergenceIndex(i + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "answer failed");
      setDivergences((prev) =>
        prev.map((x, idx) => (idx === i ? { ...x, submitting: false } : x)),
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b bg-background px-6 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground font-mono">
            /exercise/{exercise.id} · session {session.id.slice(0, 8)}…
          </div>
          <h1 className="text-lg font-semibold truncate">{exercise.title}</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge variant="secondary">{exercise.studentLevel}</Badge>
          <PhaseBadge phase={session.currentPhase} />
          {!closed && (
            <AskForHelpDialog sessionId={session.id} phase={session.currentPhase} />
          )}
        </div>
      </header>

      <div className="px-6 py-3 border-b bg-muted/30">
        <p className="text-sm">
          <strong>Exercise:</strong> {exercise.instructorPromptText}
        </p>
      </div>

      {inPhase1 && (
        <TwoColumn
          left={
            <Phase1Panel
              iterations={session.phase1.iterations}
              draft={specDraft}
              setDraft={setSpecDraft}
              onSubmit={submitSpec}
              submitting={submitting}
              error={error}
              dimensions={exercise.specGateDimensions}
              addressed={session.phase1.instructorConfiguredDimensionsAddressed}
            />
          }
          right={
            <PythonEditor
              value={PHASE3_PLACEHOLDER}
              readOnly
              lockNotice="The editor unlocks after the spec gate passes."
            />
          }
        />
      )}

      {inPhase2 && (
        <TwoColumn
          left={
            <Phase2Panel
              finalSpec={session.phase1.finalSpecText ?? ""}
              draft={planDraft}
              setDraft={setPlanDraft}
              onSubmit={submitPlan}
              submitting={submitting}
              error={error}
            />
          }
          right={
            <PythonEditor
              value={PHASE3_PLACEHOLDER}
              readOnly
              lockNotice="Submit your plan — then the editor unlocks."
            />
          }
        />
      )}

      {inPhase3 && (
        <Phase3Layout
          finalSpec={session.phase1.finalSpecText ?? ""}
          plan={session.phase2?.planText ?? null}
          code={code}
          setCode={setCode}
          exchanges={exchanges}
          chatInput={chatInput}
          setChatInput={setChatInput}
          sendChat={sendChat}
          chatBusy={chatBusy}
          submitFinalCode={submitFinalCode}
          finalSubmitting={finalSubmitting}
          sessionId={session.id}
          error={error}
        />
      )}

      {inPhase4 && (
        <Phase4Panel
          divergences={divergences}
          currentIndex={divergenceIndex}
          setIndex={setDivergenceIndex}
          onAnswer={answerDivergence}
          error={error}
        />
      )}

      {closed && <Phase5Closed divergences={divergences} />}
    </main>
  );
}

// ─── Layout primitives ────────────────────────────────────────────────────

function TwoColumn({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] overflow-hidden">
      <section className="border-r overflow-y-auto p-6 space-y-4">{left}</section>
      <section className="h-[60vh] lg:h-auto">{right}</section>
    </div>
  );
}

// ─── Phase 1 panel ────────────────────────────────────────────────────────

function Phase1Panel({
  iterations,
  draft,
  setDraft,
  onSubmit,
  submitting,
  error,
  dimensions,
  addressed,
}: {
  iterations: Phase1Iteration[];
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  dimensions: SpecDimension[];
  addressed: string[];
}) {
  const addressedSet = new Set(addressed);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Your specification (round {iterations.length + 1})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Write, in natural language, what the program must do: inputs,
            outputs, edge cases, behavior on bad input. The editor unlocks once
            the spec is specific enough to implement without guesswork.
          </p>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            placeholder="The function takes a string and returns..."
            disabled={submitting}
          />
          <div className="flex items-center gap-3">
            <Button onClick={onSubmit} disabled={submitting || !draft.trim()}>
              {submitting ? "Reviewing…" : "Submit spec for review"}
            </Button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Checklist ({addressedSet.size}/{dimensions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {dimensions.map((d) => (
              <li
                key={d.id}
                className={`flex items-start gap-2 ${
                  addressedSet.has(d.id) ? "text-green-700" : "text-muted-foreground"
                }`}
              >
                <span className="mt-0.5">
                  {addressedSet.has(d.id) ? "✓" : "○"}
                </span>
                <span className="font-mono text-xs">{d.id}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Item names only — Opus will ask the concrete questions.
          </p>
        </CardContent>
      </Card>

      {iterations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-4">
                {iterations.map((it, i) => (
                  <div key={i} className="border-l-2 pl-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Round {i + 1}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(it.timestamp).toLocaleTimeString()}
                      </span>
                      {it.passed && <Badge>Passed</Badge>}
                    </div>
                    <div className="text-sm whitespace-pre-wrap bg-muted/40 rounded p-2">
                      {it.studentSpecText}
                    </div>
                    {it.opusQuestions.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">
                          Opus asked:
                        </div>
                        <ul className="text-sm space-y-1">
                          {it.opusQuestions.map((q, qi) => (
                            <li key={qi} className="flex gap-2">
                              <span className="text-muted-foreground">•</span>
                              <span>{q}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ─── Phase 2 panel ────────────────────────────────────────────────────────

function Phase2Panel({
  finalSpec,
  draft,
  setDraft,
  onSubmit,
  submitting,
  error,
}: {
  finalSpec: string;
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your spec (frozen)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm whitespace-pre-wrap bg-muted/40 rounded p-3">
            {finalSpec}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Implementation plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Before the editor unlocks, write down the data structures you&apos;ll
            use, the order of operations, and the functions you&apos;ll define.
            This is your prediction — your code will be diffed against it later.
          </p>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            placeholder="I'll use a single loop over the characters..."
            disabled={submitting}
          />
          <div className="flex items-center gap-3">
            <Button onClick={onSubmit} disabled={submitting || !draft.trim()}>
              {submitting ? "Submitting…" : "Submit plan"}
            </Button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Phase 3 layout — editor + chat ──────────────────────────────────────

function Phase3Layout({
  finalSpec,
  plan,
  code,
  setCode,
  exchanges,
  chatInput,
  setChatInput,
  sendChat,
  chatBusy,
  submitFinalCode,
  finalSubmitting,
  sessionId,
  error,
}: {
  finalSpec: string;
  plan: string | null;
  code: string;
  setCode: (v: string) => void;
  exchanges: Phase3Exchange[];
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChat: () => void;
  chatBusy: boolean;
  submitFinalCode: () => void;
  finalSubmitting: boolean;
  sessionId: string;
  error: string | null;
}) {
  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_24rem] overflow-hidden">
      <section className="flex flex-col border-r">
        <div className="px-6 py-3 border-b flex items-center justify-between gap-3 bg-muted/20">
          <details className="text-sm min-w-0 flex-1">
            <summary className="cursor-pointer text-muted-foreground">
              Spec & plan (frozen)
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Spec</div>
                <div className="whitespace-pre-wrap bg-background border rounded p-2">
                  {finalSpec}
                </div>
              </div>
              {plan && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Plan</div>
                  <div className="whitespace-pre-wrap bg-background border rounded p-2">
                    {plan}
                  </div>
                </div>
              )}
            </div>
          </details>
          <div className="flex items-center gap-2 shrink-0">
            <RevisePlanDialog sessionId={sessionId} />
            <Button
              onClick={submitFinalCode}
              disabled={finalSubmitting || !code.trim()}
            >
              {finalSubmitting ? "Reviewing your work…" : "Submit for review"}
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-[50vh]">
          <PythonEditor value={code} onChange={setCode} readOnly={false} />
        </div>
        {finalSubmitting && (
          <div className="px-6 py-2 text-xs text-muted-foreground border-t">
            Opus is comparing your code against your spec and plan — this takes
            15–25 seconds.
          </div>
        )}
        {error && (
          <div className="px-6 py-2 text-sm text-red-600 border-t">{error}</div>
        )}
      </section>

      <aside className="flex flex-col h-[60vh] lg:h-auto">
        <div className="px-4 py-2 border-b text-sm font-medium bg-muted/20">
          Chat with Opus
        </div>
        <ScrollArea className="flex-1 px-4 py-3">
          {exchanges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ask about your code or about Python syntax. Opus will answer
              directly for syntax questions, and with counter-questions when
              you ask about your own approach.
            </p>
          ) : (
            <div className="space-y-5">
              {exchanges.map((ex, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-muted border flex items-center justify-center text-xs font-mono shrink-0">
                      you
                    </div>
                    <div className="flex-1 text-sm bg-muted/50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {ex.studentMessage}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold shrink-0">
                      OP
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="text-xs text-muted-foreground">
                        opus{" "}
                        {ex.opusResponse !== "__pending__" && (
                          <span className="font-mono">· {ex.opusMode}</span>
                        )}
                      </div>
                      <div className="text-sm bg-background border rounded-lg px-3 py-2 whitespace-pre-wrap">
                        {ex.opusResponse === "__pending__" ? (
                          <span className="italic text-muted-foreground">
                            thinking…
                          </span>
                        ) : (
                          ex.opusResponse
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-3 space-y-2">
          <Textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            rows={3}
            placeholder="Ask a question…"
            disabled={chatBusy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                sendChat();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              ⌘/Ctrl + Enter to send
            </span>
            <Button size="sm" onClick={sendChat} disabled={chatBusy || !chatInput.trim()}>
              {chatBusy ? "…" : "Send"}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Phase 4 panel — divergence review ────────────────────────────────

function Phase4Panel({
  divergences,
  currentIndex,
  setIndex,
  onAnswer,
  error,
}: {
  divergences: DivergenceQuestion[];
  currentIndex: number;
  setIndex: (i: number) => void;
  onAnswer: (i: number, answer: string) => void;
  error: string | null;
}) {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft("");
  }, [currentIndex]);

  if (divergences.length === 0) {
    return (
      <div className="flex-1 p-8">
        <Card>
          <CardContent className="text-sm">
            Opus found no meaningful divergences between your spec/plan and
            your code. Nicely done.
          </CardContent>
        </Card>
      </div>
    );
  }

  const d = divergences[currentIndex];
  const answered = d.result !== null;

  return (
    <div className="flex-1 flex items-start justify-center p-8">
      <div className="max-w-2xl w-full space-y-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Divergence {currentIndex + 1} of {divergences.length}
          </span>
          <span>
            Answered: {divergences.filter((x) => x.result).length} /{" "}
            {divergences.length}
          </span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Opus asks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap">{d.studentFacingQuestion}</p>
            {answered ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <div className="text-xs text-muted-foreground">
                    Your answer
                  </div>
                  <div className="bg-muted/40 rounded p-2 whitespace-pre-wrap">
                    {d.answer}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Recorded. Your instructor can see the full reasoning trail.
                </div>
              </div>
            ) : (
              <>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={5}
                  placeholder={`Answering "I don't know" is valid and often the most useful thing you can say.`}
                  disabled={d.submitting}
                />
                <Button
                  onClick={() => onAnswer(currentIndex, draft)}
                  disabled={d.submitting || !draft.trim()}
                >
                  {d.submitting
                    ? "Recording…"
                    : currentIndex === divergences.length - 1
                      ? "Submit and finish"
                      : "Next"}
                </Button>
              </>
            )}
            {error && <div className="text-sm text-red-600">{error}</div>}
          </CardContent>
        </Card>
        <div className="flex gap-2 text-xs">
          {divergences.map((x, i) => (
            <button
              key={x.divergenceId}
              onClick={() => setIndex(i)}
              className={`px-2 py-1 rounded border ${
                i === currentIndex
                  ? "bg-blue-100 border-blue-300"
                  : x.result
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-muted/30 border-muted"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Phase 5 — closed ─────────────────────────────────────────────────

function Phase5Closed({ divergences }: { divergences: DivergenceQuestion[] }) {
  return (
    <div className="flex-1 flex items-start justify-center p-8">
      <div className="max-w-xl w-full">
        <Card>
          <CardHeader>
            <CardTitle>Session complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              You answered {divergences.length} divergence{" "}
              {divergences.length === 1 ? "question" : "questions"}. Your
              instructor can see everything from here — the spec iterations,
              your plan, your code, the chat, and the reasoning behind each
              divergence.
            </p>
            <p className="text-muted-foreground">
              Nothing more to do here. Close this tab or open a new exercise.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Misc UI ──────────────────────────────────────────────────────────

function PhaseBadge({ phase }: { phase: number }) {
  const labels = {
    1: "Phase 1 · spec gate",
    2: "Phase 2 · plan",
    3: "Phase 3 · writing",
    4: "Phase 4 · review",
    5: "Closed",
  } as const;
  const label = labels[phase as keyof typeof labels] ?? `Phase ${phase}`;
  return <Badge>{label}</Badge>;
}

function AskForHelpDialog({
  sessionId,
  phase,
}: {
  sessionId: string;
  phase: number;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    setSending(true);
    try {
      await fetch(`/api/session/${sessionId}/help`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim() || "(no details provided)",
          phaseState: { phase },
        }),
      });
      setSent(true);
      setTimeout(() => {
        setOpen(false);
        setSent(false);
        setMessage("");
      }, 1200);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Ask for help
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask the instructor or TA</DialogTitle>
            <DialogDescription>
              This sends a notification to the instructor dashboard with your
              current session state.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="What are you stuck on?"
            disabled={sending || sent}
          />
          <DialogFooter>
            <Button onClick={send} disabled={sending || sent}>
              {sent ? "Sent" : sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RevisePlanDialog({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [amendment, setAmendment] = useState("");
  const [justification, setJustification] = useState("");
  const [sending, setSending] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!amendment.trim() || !justification.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/session/${sessionId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amendment, justification }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { question: string };
      setQuestion(body.question);
    } finally {
      setSending(false);
    }
  }, [amendment, justification, sessionId]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Revise plan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revise your plan</DialogTitle>
            <DialogDescription>
              Tell Opus what you want to change and why. Your original plan is
              preserved; this is recorded as a proactive revision.
            </DialogDescription>
          </DialogHeader>
          {question ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Opus asks:</div>
              <div className="text-sm bg-blue-50 border border-blue-100 rounded p-3">
                {question}
              </div>
              <p className="text-xs text-muted-foreground">
                This revision is saved. Close this dialog and keep coding.
              </p>
            </div>
          ) : (
            <>
              <Textarea
                value={amendment}
                onChange={(e) => setAmendment(e.target.value)}
                rows={3}
                placeholder="What are you changing?"
                disabled={sending}
              />
              <Textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={3}
                placeholder="Why — faster, simpler, or more correct?"
                disabled={sending}
              />
            </>
          )}
          <DialogFooter>
            {question ? (
              <Button
                onClick={() => {
                  setOpen(false);
                  setTimeout(() => {
                    setAmendment("");
                    setJustification("");
                    setQuestion(null);
                  }, 200);
                }}
              >
                Close
              </Button>
            ) : (
              <Button
                onClick={submit}
                disabled={sending || !amendment.trim() || !justification.trim()}
              >
                {sending ? "Recording…" : "Record revision"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.message || body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

const PHASE3_PLACEHOLDER = `# The editor unlocks once your spec is approved.
# While you write here in Phase 3:
#   - Autocomplete is off.
#   - Opus answers language questions directly.
#   - Opus responds to "why is my code broken?" with questions, not fixes.
`;
