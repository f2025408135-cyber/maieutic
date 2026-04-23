"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PythonEditor } from "@/components/student/PythonEditor";
import { TopNav } from "@/components/editor/TopNav";
import { FileTabBar } from "@/components/editor/FileTab";
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
import { UNIT_ROMAN, UNIT_TITLE, type Unit } from "@/lib/units";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExerciseClientProps {
  exercise: {
    id: string;
    title: string;
    instructorPromptText: string;
    studentLevel: StudentLevel;
    unit: Unit;
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

// ─── Main ─────────────────────────────────────────────────────────────────

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

  // ── actions ──────────────────────────────────────────────────────────
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

  // ── layout ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4] flex flex-col">
      <TopNav back={{ href: "/exercises", label: "Back to exercises" }} />
      <FileTabBar fileName={`${exercise.id}.py`} />

      <ExerciseTitle
        title={exercise.title}
        promptText={exercise.instructorPromptText}
        unit={exercise.unit}
      />

      {!closed && (
        <HelpImStuckButton sessionId={session.id} phase={session.currentPhase} />
      )}

      {inPhase1 && (
        <Phase1View
          iterations={session.phase1.iterations}
          draft={specDraft}
          setDraft={setSpecDraft}
          onSubmit={submitSpec}
          submitting={submitting}
          error={error}
        />
      )}

      {inPhase2 && (
        <Phase2View
          iterations={session.phase1.iterations}
          finalSpec={session.phase1.finalSpecText ?? ""}
          draft={planDraft}
          setDraft={setPlanDraft}
          onSubmit={submitPlan}
          submitting={submitting}
          error={error}
        />
      )}

      {inPhase3 && (
        <Phase3View
          iterations={session.phase1.iterations}
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
        <Phase4View
          iterations={session.phase1.iterations}
          finalSpec={session.phase1.finalSpecText ?? ""}
          plan={session.phase2?.planText ?? null}
          finalCode={session.phase3.finalCode ?? code}
          divergences={divergences}
          currentIndex={divergenceIndex}
          setIndex={setDivergenceIndex}
          onAnswer={answerDivergence}
          error={error}
        />
      )}

      {closed && (
        <Phase5View
          iterations={session.phase1.iterations}
          finalSpec={session.phase1.finalSpecText ?? ""}
          plan={session.phase2?.planText ?? null}
          finalCode={session.phase3.finalCode ?? code}
          divergences={divergences}
        />
      )}
    </div>
  );
}

// ─── Exercise title banner ───────────────────────────────────────────

function ExerciseTitle({
  title,
  promptText,
  unit,
}: {
  title: string;
  promptText: string;
  unit: Unit;
}) {
  return (
    <div className="px-8 py-10 border-b border-[#3e3e42] bg-[#1e1e1e]">
      <div className="max-w-3xl mx-auto">
        <div className="text-xs font-mono text-[#4ec9b0] tracking-wider uppercase mb-3">
          Unit {UNIT_ROMAN[unit]} · {UNIT_TITLE[unit]}
        </div>
        <h1 className="text-4xl font-semibold tracking-tight leading-tight">
          {title}
        </h1>
        <p className="mt-4 text-lg text-[#d4d4d4]/90 leading-relaxed">
          {promptText}
        </p>
      </div>
    </div>
  );
}

function HelpImStuckButton({
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
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-5 py-3 rounded-full bg-[#a94444] hover:bg-[#bf5555] text-white font-medium shadow-md shadow-black/30 transition-colors"
      >
        <span aria-hidden className="text-base">🙋</span>
        <span>Help, I&apos;m stuck</span>
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

// ─── Phase 1 — spec gate (single column) ─────────────────────────────

function Phase1View({
  iterations,
  draft,
  setDraft,
  onSubmit,
  submitting,
  error,
}: {
  iterations: Phase1Iteration[];
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const lastIteration = iterations[iterations.length - 1];
  const hints = lastIteration?.opusQuestions ?? [];
  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <Panel title={`Your specification · round ${iterations.length + 1}`}>
          <div className="space-y-3">
            <p className="text-sm text-[#858585]">
              Write, in natural language, what the program must do. Say what
              the inputs are, what it prints, and what assumptions you&apos;re
              making. The editor unlocks once the spec is precise enough.
            </p>
            <StudentTextarea
              value={draft}
              onChange={setDraft}
              rows={8}
              placeholder="The program asks the user for..."
              disabled={submitting}
            />
            <div className="flex items-center gap-3">
              <Button onClick={onSubmit} disabled={submitting || !draft.trim()}>
                {submitting ? "Reviewing…" : "Submit spec for review"}
              </Button>
              {error && (
                <span className="text-sm text-[#f48771] font-mono">
                  {error}
                </span>
              )}
            </div>
          </div>
        </Panel>

        {hints.length > 0 && (
          <HintsPanel hints={hints} round={iterations.length} />
        )}

        {iterations.length > 1 && (
          <Panel
            title={`Earlier rounds · ${iterations.length - 1}`}
            collapsible
          >
            <IterationHistory iterations={iterations.slice(0, -1)} />
          </Panel>
        )}
      </div>
    </main>
  );
}

function HintsPanel({ hints, round }: { hints: string[]; round: number }) {
  return (
    <section className="border border-[#4a4a2e] bg-[#2a2a1a] rounded p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base" aria-hidden>
          💡
        </span>
        <h2 className="text-[13px] font-semibold text-[#dcdcaa]">
          Some things to think about
        </h2>
        <span className="text-[10px] text-[#858585] font-mono ml-auto">
          round {round}
        </span>
      </div>
      <ul className="space-y-2 text-sm text-[#d4d4d4]">
        {hints.map((h, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-[#dcdcaa] shrink-0">→</span>
            <span>{h}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[#858585] mt-3">
        These are suggestions — decide for yourself which ones to pin down in
        your next spec.
      </p>
    </section>
  );
}

// ─── Phase 2 — plan (single column, spec collapsible) ────────────────

function Phase2View({
  iterations,
  finalSpec,
  draft,
  setDraft,
  onSubmit,
  submitting,
  error,
}: {
  iterations: Phase1Iteration[];
  finalSpec: string;
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <SpecAndHistoryTop
          finalSpec={finalSpec}
          iterations={iterations}
        />
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
                <span className="text-sm text-[#f48771] font-mono">
                  {error}
                </span>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </main>
  );
}

// ─── Phase 3 — editor + chat ─────────────────────────────────────────

function Phase3View({
  iterations,
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
  iterations: Phase1Iteration[];
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
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-8 py-3 border-b border-[#3e3e42]">
        <div className="max-w-5xl mx-auto">
          <SpecAndHistoryTop
            finalSpec={finalSpec}
            plan={plan}
            iterations={iterations}
            compact
          />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_24rem] min-h-0">
        <section className="flex flex-col min-h-[50vh] border-r border-[#3e3e42]">
          <div className="flex-1 min-h-0">
            <PythonEditor value={code} onChange={setCode} readOnly={false} />
          </div>
          <div className="px-6 py-3 border-t border-[#3e3e42] bg-[#252526] flex items-center justify-between gap-3">
            <RevisePlanDialog sessionId={sessionId} />
            <div className="flex items-center gap-3">
              {finalSubmitting && (
                <span className="text-xs text-[#858585]">
                  Comparing your code against your spec — 15–25 s…
                </span>
              )}
              {error && (
                <span className="text-xs text-[#f48771] font-mono">
                  {error}
                </span>
              )}
              <Button
                onClick={submitFinalCode}
                disabled={finalSubmitting || !code.trim()}
              >
                {finalSubmitting ? "Reviewing your work…" : "Submit for review"}
              </Button>
            </div>
          </div>
        </section>

        <ChatPanel
          exchanges={exchanges}
          chatInput={chatInput}
          setChatInput={setChatInput}
          sendChat={sendChat}
          chatBusy={chatBusy}
        />
      </div>
    </div>
  );
}

// ─── Phase 4 — divergence review ─────────────────────────────────────

function Phase4View({
  iterations,
  finalSpec,
  plan,
  finalCode,
  divergences,
  currentIndex,
  setIndex,
  onAnswer,
  error,
}: {
  iterations: Phase1Iteration[];
  finalSpec: string;
  plan: string | null;
  finalCode: string;
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

  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <SpecAndHistoryTop
          finalSpec={finalSpec}
          plan={plan}
          iterations={iterations}
          finalCode={finalCode}
        />

        {divergences.length === 0 ? (
          <Panel title="Review">
            <div className="text-sm">
              Opus found no meaningful divergences between your spec/plan and
              your code. Nicely done.
            </div>
          </Panel>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-[#858585] font-mono">
              <span>
                Divergence {currentIndex + 1} of {divergences.length}
              </span>
              <span>
                Answered {divergences.filter((x) => x.result).length} /{" "}
                {divergences.length}
              </span>
            </div>

            <Panel title="Opus asks">
              <DivergenceAnswer
                d={divergences[currentIndex]}
                isLast={currentIndex === divergences.length - 1}
                draft={draft}
                setDraft={setDraft}
                onAnswer={(answer) => onAnswer(currentIndex, answer)}
                error={error}
              />
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
          </>
        )}
      </div>
    </main>
  );
}

function DivergenceAnswer({
  d,
  isLast,
  draft,
  setDraft,
  onAnswer,
  error,
}: {
  d: DivergenceQuestion;
  isLast: boolean;
  draft: string;
  setDraft: (v: string) => void;
  onAnswer: (answer: string) => void;
  error: string | null;
}) {
  const answered = d.result !== null;
  return (
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
            onClick={() => onAnswer(draft)}
            disabled={d.submitting || !draft.trim()}
          >
            {d.submitting
              ? "Recording…"
              : isLast
                ? "Submit and finish"
                : "Next"}
          </Button>
        </>
      )}
      {error && <div className="text-sm text-[#f48771] font-mono">{error}</div>}
    </div>
  );
}

// ─── Phase 5 — closed ─────────────────────────────────────────────────

function Phase5View({
  iterations,
  finalSpec,
  plan,
  finalCode,
  divergences,
}: {
  iterations: Phase1Iteration[];
  finalSpec: string;
  plan: string | null;
  finalCode: string;
  divergences: DivergenceQuestion[];
}) {
  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <Panel title="Session complete ✓">
          <div className="space-y-3 text-sm">
            <p>
              You answered {divergences.length} divergence{" "}
              {divergences.length === 1 ? "question" : "questions"}. Your
              instructor can see everything from here — the spec iterations,
              your plan, your code, the chat, and the reasoning behind each
              divergence.
            </p>
            <p className="text-[#858585]">
              Nothing more to do. Head back to <Link href="/exercises" className="text-[#569cd6] hover:text-white underline">Available exercises</Link> for another.
            </p>
          </div>
        </Panel>
        <SpecAndHistoryTop
          finalSpec={finalSpec}
          plan={plan}
          iterations={iterations}
          finalCode={finalCode}
          defaultOpen
        />
      </div>
    </main>
  );
}

// ─── Collapsible spec + plan + history + final code bundle ───────────

function SpecAndHistoryTop({
  finalSpec,
  plan,
  iterations,
  finalCode,
  compact,
  defaultOpen,
}: {
  finalSpec: string;
  plan?: string | null;
  iterations: Phase1Iteration[];
  finalCode?: string;
  compact?: boolean;
  defaultOpen?: boolean;
}) {
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <CollapseRow
        label={`Your spec${finalSpec ? "" : " (empty)"}`}
        defaultOpen={defaultOpen}
      >
        <div className="text-sm whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-2">
          {finalSpec || "(not submitted yet)"}
        </div>
      </CollapseRow>
      {plan && (
        <CollapseRow label="Your plan" defaultOpen={defaultOpen}>
          <div className="text-sm whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-2">
            {plan}
          </div>
        </CollapseRow>
      )}
      {iterations.length > 0 && (
        <CollapseRow
          label={`Spec iteration history · ${iterations.length} round${iterations.length === 1 ? "" : "s"}`}
          defaultOpen={defaultOpen}
        >
          <IterationHistory iterations={iterations} />
        </CollapseRow>
      )}
      {finalCode && (
        <CollapseRow label="Your submitted code" defaultOpen={defaultOpen}>
          <pre className="text-xs bg-[#1e1e1e] border border-[#3e3e42] rounded p-2 overflow-x-auto font-mono">
            {finalCode}
          </pre>
        </CollapseRow>
      )}
    </div>
  );
}

function CollapseRow({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group border border-[#3e3e42] bg-[#252526] rounded"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-3 py-1.5 flex items-center gap-2 text-xs font-mono text-[#858585] hover:text-white select-none">
        <span className="inline-block transition-transform group-open:rotate-90">
          ▸
        </span>
        <span>{label}</span>
      </summary>
      <div className="px-3 pb-3 pt-1">{children}</div>
    </details>
  );
}

function IterationHistory({ iterations }: { iterations: Phase1Iteration[] }) {
  return (
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
              <span className="text-xs text-[#89d185] font-mono">✓ passed</span>
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
  );
}

// ─── Chat panel ──────────────────────────────────────────────────────

function ChatPanel({
  exchanges,
  chatInput,
  setChatInput,
  sendChat,
  chatBusy,
}: {
  exchanges: Phase3Exchange[];
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChat: () => void;
  chatBusy: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [exchanges.length]);

  return (
    <aside className="flex flex-col h-[60vh] lg:h-auto bg-[#252526] min-h-0">
      <div className="px-4 py-2.5 border-b border-[#3e3e42] flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-[#007acc] text-white flex items-center justify-center text-[10px] font-semibold">
          OP
        </div>
        <div>
          <div className="text-sm font-semibold">Chat with Opus</div>
          <div className="text-[10px] text-[#858585] font-mono">
            interrogative for your code · direct for syntax
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 px-4 py-3 overflow-y-auto space-y-4 min-h-0"
      >
        {exchanges.length === 0 ? (
          <p className="text-sm text-[#858585]">
            Ask about your code or about Python syntax. Opus will answer
            directly for syntax questions, and with counter-questions when
            you ask about your own approach.
          </p>
        ) : (
          exchanges.map((ex, i) => (
            <div key={i} className="space-y-2">
              <Bubble side="right" label="you">
                {ex.studentMessage}
              </Bubble>
              <Bubble
                side="left"
                label={
                  ex.opusResponse === "__pending__"
                    ? "opus"
                    : `opus · ${ex.opusMode}`
                }
                highlight
              >
                {ex.opusResponse === "__pending__" ? (
                  <span className="italic text-[#75beff]">thinking…</span>
                ) : (
                  ex.opusResponse
                )}
              </Bubble>
            </div>
          ))
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
  );
}

function Bubble({
  side,
  label,
  highlight,
  children,
}: {
  side: "left" | "right";
  label: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  const isRight = side === "right";
  return (
    <div className={`flex flex-col ${isRight ? "items-end" : "items-start"}`}>
      <div className="text-[10px] uppercase tracking-wider text-[#858585] mb-1 font-mono">
        {label}
      </div>
      <div
        className={`max-w-[90%] text-sm rounded-lg px-3 py-2 whitespace-pre-wrap ${
          isRight
            ? "bg-[#2a4d6e] border border-[#3e5d7a] text-white"
            : highlight
              ? "bg-[#252526] border border-[#007acc]/40"
              : "bg-[#1e1e1e] border border-[#3e3e42]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Primitives ──────────────────────────────────────────────────────

function Panel({
  title,
  collapsible,
  defaultOpen = true,
  children,
}: {
  title?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  if (collapsible && title) {
    return (
      <details
        open={defaultOpen}
        className="border border-[#3e3e42] bg-[#252526] rounded"
      >
        <summary className="cursor-pointer list-none px-4 py-2.5 border-b border-[#3e3e42] text-[11px] font-semibold tracking-wider uppercase text-[#858585] hover:text-white flex items-center gap-2">
          <span className="inline-block transition-transform group-open:rotate-90">
            ▸
          </span>
          {title}
        </summary>
        <div className="p-4">{children}</div>
      </details>
    );
  }
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

function RoundBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#3e3e42] bg-[#1e1e1e]">
      <span className="text-[#858585]">round</span>{" "}
      <span className="text-[#569cd6] ml-1">{n}</span>
    </span>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────

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
