"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Workbench } from "@/components/editor/Workbench";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
  result: { alignment: string; finalClassification: string } | null;
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

  const [code, setCode] = useState(initialSession.phase3.currentCode);
  const [exchanges, setExchanges] = useState<Phase3Exchange[]>(
    initialSession.phase3.opusExchanges,
  );
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [finalSubmitting, setFinalSubmitting] = useState(false);

  const [divergences, setDivergences] = useState<DivergenceQuestion[]>([]);
  const [divergenceIndex, setDivergenceIndex] = useState(0);

  const inPhase1 = session.currentPhase === 1;
  const inPhase2 = session.currentPhase === 2;
  const inPhase3 = session.currentPhase === 3;
  const inPhase4 = session.currentPhase === 4;
  const closed = session.currentPhase >= 5;

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

  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!inPhase3) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      fetch(`/api/session/${session.id}/autosave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }).catch(() => {});
    }, 1500);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [code, session.id, inPhase3]);

  async function sendChat() {
    if (!chatInput.trim() || chatBusy) return;
    const message = chatInput;
    setChatBusy(true);
    setError(null);
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
      setChatInput(message);
    } finally {
      setChatBusy(false);
    }
  }

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

  async function answerDivergence(i: number, answer: string) {
    const d = divergences[i];
    if (!d || d.result || d.submitting) return;
    setDivergences((prev) =>
      prev.map((x, idx) => (idx === i ? { ...x, submitting: true } : x)),
    );
    setError(null);
    try {
      const res = await fetch(
        `/api/session/${session.id}/divergence-response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ divergenceId: d.divergenceId, response: answer }),
        },
      );
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

  const phaseLabel: Record<number, string> = {
    1: "spec gate",
    2: "plan",
    3: "writing",
    4: "review",
    5: "closed",
  };

  return (
    <Workbench
      tabs={[
        {
          fileName: `${exercise.id}.py`,
          active: true,
          dirty: inPhase3 && code.length > 0,
        },
      ]}
      statusLeft={
        <>
          <span className="font-mono">{exercise.studentLevel}</span>
          <span>
            phase {session.currentPhase} ·{" "}
            {phaseLabel[session.currentPhase] ?? ""}
          </span>
          {inPhase1 && session.phase1.iterations.length > 0 && (
            <span>iter {session.phase1.iterations.length}</span>
          )}
        </>
      }
      statusRight={
        <>
          {!closed && (
            <AskForHelpDialog
              sessionId={session.id}
              phase={session.currentPhase}
            />
          )}
          <span>Student · {exercise.title}</span>
        </>
      }
    >
      <div className="px-6 py-3 border-b border-[#3e3e42] bg-[#252526] text-sm">
        <span className="text-[#858585] mr-2 font-mono text-xs uppercase tracking-wider">
          exercise
        </span>
        <span>{exercise.instructorPromptText}</span>
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
    </Workbench>
  );
}

// ─── Primitives ────────────────────────────────────────────────────────

function TwoColumn({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] overflow-hidden">
      <section className="border-r border-[#3e3e42] overflow-y-auto p-6 space-y-4">
        {left}
      </section>
      <section className="h-[60vh] lg:h-auto bg-[#1e1e1e]">{right}</section>
    </div>
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
    <section className="border border-[#3e3e42] bg-[#252526] rounded">
      {title && (
        <div className="px-4 py-2.5 border-b border-[#3e3e42]">
          <h2 className="text-[11px] font-semibold tracking-wider uppercase text-[#858585]">
            {title}
          </h2>
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

function StudentTextarea({
  value,
  onChange,
  rows = 4,
  placeholder,
  disabled,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      onKeyDown={onKeyDown}
      className="w-full bg-[#3c3c3c] text-[#d4d4d4] border border-[#3e3e42] rounded px-3 py-2 text-sm placeholder:text-[#6a6a6a] focus:outline-none focus:border-[#007acc] disabled:opacity-50 resize-y"
    />
  );
}

// ─── Phase 1 ──────────────────────────────────────────────────────────

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
      <Panel title={`Your specification · round ${iterations.length + 1}`}>
        <div className="space-y-3">
          <p className="text-sm text-[#858585]">
            Write, in natural language, what the program must do: inputs,
            outputs, edge cases, behavior on bad input. The editor unlocks
            once the spec is specific enough to implement without guesswork.
          </p>
          <StudentTextarea
            value={draft}
            onChange={setDraft}
            rows={6}
            placeholder="The function takes a string and returns..."
            disabled={submitting}
          />
          <div className="flex items-center gap-3">
            <Button onClick={onSubmit} disabled={submitting || !draft.trim()}>
              {submitting ? "Reviewing…" : "Submit spec for review"}
            </Button>
            {error && (
              <span className="text-sm text-[#f48771] font-mono">{error}</span>
            )}
          </div>
        </div>
      </Panel>

      <Panel title={`Checklist · ${addressedSet.size}/${dimensions.length}`}>
        <ul className="space-y-1 text-sm font-mono">
          {dimensions.map((d) => (
            <li
              key={d.id}
              className={`flex items-start gap-2 ${
                addressedSet.has(d.id) ? "text-[#89d185]" : "text-[#858585]"
              }`}
            >
              <span className="mt-0.5">
                {addressedSet.has(d.id) ? "✓" : "○"}
              </span>
              <span className="text-xs">{d.id}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[#858585] mt-3">
          Item names only — Opus will ask the concrete questions.
        </p>
      </Panel>

      {iterations.length > 0 && (
        <Panel title="History">
          <div className="space-y-4 max-h-[55vh] overflow-y-auto">
            {iterations.map((it, i) => (
              <div
                key={i}
                className="border-l-2 border-[#3e3e42] pl-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <RoundBadge n={i + 1} />
                  <span className="text-xs text-[#858585] font-mono">
                    {new Date(it.timestamp).toLocaleTimeString()}
                  </span>
                  {it.passed && (
                    <span className="text-xs text-[#89d185] font-mono">
                      ✓ passed
                    </span>
                  )}
                </div>
                <div className="text-sm whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-2">
                  {it.studentSpecText}
                </div>
                {it.opusQuestions.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-[#858585]">
                      Opus asked
                    </div>
                    <ul className="text-sm space-y-1">
                      {it.opusQuestions.map((q, qi) => (
                        <li key={qi} className="flex gap-2">
                          <span className="text-[#858585]">·</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

// ─── Phase 2 ──────────────────────────────────────────────────────────

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
      <Panel title="Your spec · frozen">
        <div className="text-sm whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-3">
          {finalSpec}
        </div>
      </Panel>

      <Panel title="Implementation plan">
        <div className="space-y-3">
          <p className="text-sm text-[#858585]">
            Before the editor unlocks, write down the data structures
            you&apos;ll use, the order of operations, and the functions
            you&apos;ll define. This is your prediction — your code will be
            diffed against it later.
          </p>
          <StudentTextarea
            value={draft}
            onChange={setDraft}
            rows={8}
            placeholder="I'll use a single loop over the characters..."
            disabled={submitting}
          />
          <div className="flex items-center gap-3">
            <Button onClick={onSubmit} disabled={submitting || !draft.trim()}>
              {submitting ? "Submitting…" : "Submit plan"}
            </Button>
            {error && (
              <span className="text-sm text-[#f48771] font-mono">{error}</span>
            )}
          </div>
        </div>
      </Panel>
    </>
  );
}

// ─── Phase 3 ──────────────────────────────────────────────────────────

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
      <section className="flex flex-col border-r border-[#3e3e42]">
        <div className="px-6 py-2.5 border-b border-[#3e3e42] flex items-center justify-between gap-3 bg-[#252526]">
          <details className="text-sm min-w-0 flex-1">
            <summary className="cursor-pointer text-[#858585] hover:text-white transition-colors font-mono text-xs uppercase tracking-wider">
              spec &amp; plan · frozen
            </summary>
            <div className="mt-3 space-y-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#858585] mb-1">
                  Spec
                </div>
                <div className="whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-2">
                  {finalSpec}
                </div>
              </div>
              {plan && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#858585] mb-1">
                    Plan
                  </div>
                  <div className="whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-2">
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
          <div className="px-6 py-2 text-xs text-[#858585] border-t border-[#3e3e42]">
            Opus is comparing your code against your spec and plan — this
            takes 15–25 seconds.
          </div>
        )}
        {error && (
          <div className="px-6 py-2 text-sm text-[#f48771] border-t border-[#3e3e42] font-mono">
            {error}
          </div>
        )}
      </section>

      <aside className="flex flex-col h-[60vh] lg:h-auto bg-[#252526]">
        <div className="px-4 py-2.5 border-b border-[#3e3e42] text-[11px] font-semibold tracking-wider uppercase text-[#858585]">
          Chat with Opus
        </div>
        <div className="flex-1 px-4 py-3 overflow-y-auto">
          {exchanges.length === 0 ? (
            <p className="text-sm text-[#858585]">
              Ask about your code or about Python syntax. Opus will answer
              directly for syntax questions, and with counter-questions when
              you ask about your own approach.
            </p>
          ) : (
            <div className="space-y-5">
              {exchanges.map((ex, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#3c3c3c] border border-[#3e3e42] flex items-center justify-center text-[11px] font-mono text-[#858585] shrink-0">
                      you
                    </div>
                    <div className="flex-1 text-sm bg-[#1e1e1e] border border-[#3e3e42] rounded px-3 py-2 whitespace-pre-wrap">
                      {ex.studentMessage}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#007acc] text-white flex items-center justify-center text-[10px] font-semibold shrink-0">
                      OP
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-[#858585]">
                        opus
                        {ex.opusResponse !== "__pending__" && (
                          <span className="font-mono text-[#4ec9b0]">
                            {" · "}
                            {ex.opusMode}
                          </span>
                        )}
                      </div>
                      <div className="text-sm bg-[#1e3a5c] border border-[#007acc] rounded px-3 py-2 whitespace-pre-wrap">
                        {ex.opusResponse === "__pending__" ? (
                          <span className="italic text-[#75beff]">
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
        </div>
        <div className="border-t border-[#3e3e42] p-3 space-y-2">
          <StudentTextarea
            value={chatInput}
            onChange={setChatInput}
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
            <span className="text-xs text-[#858585] font-mono">
              ⌘/Ctrl + Enter to send
            </span>
            <Button
              size="sm"
              onClick={sendChat}
              disabled={chatBusy || !chatInput.trim()}
            >
              {chatBusy ? "…" : "Send"}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Phase 4 ──────────────────────────────────────────────────────────

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
        <Panel>
          <div className="text-sm">
            Opus found no meaningful divergences between your spec/plan and
            your code. Nicely done.
          </div>
        </Panel>
      </div>
    );
  }

  const d = divergences[currentIndex];
  const answered = d.result !== null;

  return (
    <div className="flex-1 flex items-start justify-center p-8 overflow-y-auto">
      <div className="max-w-2xl w-full space-y-4">
        <div className="flex items-center justify-between text-sm text-[#858585] font-mono">
          <span>
            divergence {currentIndex + 1} of {divergences.length}
          </span>
          <span>
            answered {divergences.filter((x) => x.result).length} /{" "}
            {divergences.length}
          </span>
        </div>
        <Panel title="Opus asks">
          <div className="space-y-4">
            <p className="whitespace-pre-wrap text-[#d4d4d4]">
              {d.studentFacingQuestion}
            </p>
            {answered ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <div className="text-[10px] uppercase tracking-wider text-[#858585] mb-1">
                    your answer
                  </div>
                  <div className="bg-[#1e1e1e] border border-[#3e3e42] rounded p-2 whitespace-pre-wrap">
                    {d.answer}
                  </div>
                </div>
                <div className="text-xs text-[#858585]">
                  Recorded. Your instructor can see the full reasoning trail.
                </div>
              </div>
            ) : (
              <>
                <StudentTextarea
                  value={draft}
                  onChange={setDraft}
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
            {error && (
              <div className="text-sm text-[#f48771] font-mono">{error}</div>
            )}
          </div>
        </Panel>
        <div className="flex gap-2 text-xs font-mono">
          {divergences.map((x, i) => (
            <button
              key={x.divergenceId}
              onClick={() => setIndex(i)}
              className={`px-2 py-1 rounded border transition-colors ${
                i === currentIndex
                  ? "bg-[#007acc] border-[#007acc] text-white"
                  : x.result
                    ? "bg-[#1e3a2a] border-[#1e3a2a] text-[#89d185]"
                    : "bg-[#252526] border-[#3e3e42] text-[#858585] hover:border-[#007acc]"
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

// ─── Phase 5 ──────────────────────────────────────────────────────────

function Phase5Closed({
  divergences,
}: {
  divergences: DivergenceQuestion[];
}) {
  return (
    <div className="flex-1 flex items-start justify-center p-8 overflow-y-auto">
      <div className="max-w-xl w-full">
        <Panel title="Session complete">
          <div className="space-y-3 text-sm">
            <p>
              You answered {divergences.length} divergence{" "}
              {divergences.length === 1 ? "question" : "questions"}. Your
              instructor can see everything from here — the spec iterations,
              your plan, your code, the chat, and the reasoning behind each
              divergence.
            </p>
            <p className="text-[#858585]">
              Nothing more to do here. Close this tab or open a new exercise.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ─── Misc UI ──────────────────────────────────────────────────────────

function RoundBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#3e3e42] bg-[#1e1e1e]">
      <span className="text-[#858585]">round</span>{" "}
      <span className="text-[#569cd6] ml-1">{n}</span>
    </span>
  );
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
      <button
        onClick={() => setOpen(true)}
        className="text-[12px] px-2 py-0.5 rounded bg-[#2d2d30] text-white hover:bg-[#3e3e42] transition-colors"
      >
        Ask for help
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask the instructor or TA</DialogTitle>
            <DialogDescription>
              This sends a notification to the instructor dashboard with your
              current session state.
            </DialogDescription>
          </DialogHeader>
          <StudentTextarea
            value={message}
            onChange={setMessage}
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
      <button
        onClick={() => setOpen(true)}
        className="text-sm px-3 py-1.5 rounded border border-[#3e3e42] bg-[#2d2d30] text-[#d4d4d4] hover:bg-[#3e3e42] transition-colors"
      >
        Revise plan
      </button>
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
              <div className="text-sm text-[#858585]">Opus asks:</div>
              <div className="text-sm bg-[#1e3a5c] border border-[#007acc] rounded p-3">
                {question}
              </div>
              <p className="text-xs text-[#858585]">
                This revision is saved. Close this dialog and keep coding.
              </p>
            </div>
          ) : (
            <>
              <StudentTextarea
                value={amendment}
                onChange={setAmendment}
                rows={3}
                placeholder="What are you changing?"
                disabled={sending}
              />
              <StudentTextarea
                value={justification}
                onChange={setJustification}
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
