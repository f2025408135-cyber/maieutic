"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { provideInput as provideCInput, runC } from "@/lib/run-c";
import { TopNav } from "@/components/editor/TopNav";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { FileTabBar } from "@/components/editor/FileTab";
import { StatusBar } from "@/components/editor/StatusBar";
import type {
  OpusMode,
  Phase1Data,
  Phase1Iteration,
  Phase2Data,
  Phase2Exchange,
  Phase3Data,
  SpecDimension,
  StudentLevel,
} from "@/lib/opus/schemas";
import { UNIT_ROMAN, type Unit } from "@/lib/units";
import { useT } from "@/lib/i18n/client";
import type { Dict } from "@/lib/i18n/en";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExerciseClientProps {
  exercise: {
    id: string;
    title: string;
    instructorPromptText: string;
    studentLevel: StudentLevel;
    unit: Unit;
    specGateDimensions: SpecDimension[];
    language?: string;
  };
  initialSession: {
    id: string;
    currentPhase: number;
    startedAt: string;
    phase1: Phase1Data;
    phase2: Phase2Data;
    phase3: Phase3Data | null;
  };
}

function phaseLabel(t: Dict, n: number): string {
  const key = String(n) as keyof Dict["phaseLabel"];
  return t.phaseLabel[key] ?? "";
}

interface DivergenceQuestion {
  divergenceId: string;
  studentFacingQuestion: string;
  answer: string | null;
  submitting: boolean;
  result: { alignment: string; finalClassification: string } | null;
}

type ConsoleLine = {
  kind: "stdout" | "stderr" | "input" | "system" | "error";
  text: string;
};
type RunState = "idle" | "loading" | "running" | "waiting-input";

// ─── Main ─────────────────────────────────────────────────────────────────

export function ExerciseClient({
  exercise,
  initialSession,
}: ExerciseClientProps) {
  const t = useT();
  const [session, setSession] = useState(initialSession);
  // Seed the spec textarea from the most recent iteration so that on reload
  // (or after a failed submission) the student can edit their last attempt
  // instead of retyping from scratch.
  const [specDraft, setSpecDraft] = useState(() => {
    const last =
      initialSession.phase1.iterations[
        initialSession.phase1.iterations.length - 1
      ];
    return last?.studentSpecText ?? "";
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState(initialSession.phase2.currentCode);
  const [exchanges, setExchanges] = useState<Phase2Exchange[]>(
    initialSession.phase2.opusExchanges,
  );
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [finalSubmitting, setFinalSubmitting] = useState(false);

  // ── browser-side Code runner (C only) ──────────────────────
  // The console is a unified stream: stdout, stderr, echoed input, and
  // any errors arrive as ConsoleLine entries in arrival order.
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [runState, setRunState] = useState<RunState>("idle");

  async function runCode() {
    if (runState !== "idle") return;
    setConsoleLines([]);
    
    setRunState("loading");
    setConsoleLines([{ kind: "system", text: "Loading C…\n" }]);
    try {
      await runC(code, (event) => {
        if (event.type === "stdout") {
          setConsoleLines((prev) => [
            ...prev.filter((l) => l.kind !== "system"),
            { kind: "stdout", text: event.text },
          ]);
          setRunState("running");
        } else if (event.type === "stderr") {
          setConsoleLines((prev) => [
            ...prev.filter((l) => l.kind !== "system"),
            { kind: "stderr", text: event.text },
          ]);
        } else if (event.type === "inputRequest") {
          setConsoleLines((prev) => prev.filter((l) => l.kind !== "system"));
          setRunState("waiting-input");
        } else if (event.type === "error") {
          setConsoleLines((prev) => [
            ...prev,
            { kind: "error", text: event.text + "\n" },
          ]);
          setRunState("idle");
        } else if (event.type === "done") {
          setRunState("idle");
        }
      });
    } catch (err) {
      setConsoleLines((prev) => [
        ...prev,
        {
          kind: "error",
          text:
            (err instanceof Error ? err.message : String(err)) + "\n",
        },
      ]);
      setRunState("idle");
    }
  }
  function submitConsoleInput(text: string) {
    if (runState !== "waiting-input") return;
    provideCInput(text);
    setConsoleLines((prev) => [...prev, { kind: "input", text: text + "\n" }]);
    setRunState("running");
  }
  function clearConsole() {
    if (runState !== "idle") return;
    setConsoleLines([]);
  }

  // Seed from persisted phase3 data so reloading mid-review preserves any
  // answers the student has already given.
  const [divergences, setDivergences] = useState<DivergenceQuestion[]>(() => {
    const stored = initialSession.phase3;
    if (!stored) return [];
    return stored.divergences.map((d) => ({
      divergenceId: d.divergenceId,
      studentFacingQuestion: d.studentFacingQuestion,
      answer: d.studentResponse,
      submitting: false,
      result:
        d.studentResponse && d.alignment && d.finalClassification
          ? {
              alignment: d.alignment,
              finalClassification: d.finalClassification,
            }
          : null,
    }));
  });
  const [divergenceIndex, setDivergenceIndex] = useState(() => {
    const firstUnanswered = divergences.findIndex((d) => d.result === null);
    return firstUnanswered === -1 ? 0 : firstUnanswered;
  });

  // Revision pass: mirror of phase3Data.revisionChoice. Stays null until the
  // student either skips or submits a revised version after the divergence
  // loop finishes. Triggers the handoff UI; finalizing advances to phase 4.
  const [revisionChoice, setRevisionChoice] = useState<
    "skipped" | "revised" | null
  >(initialSession.phase3?.revisionChoice ?? null);
  const [finalizing, setFinalizing] = useState(false);

  const hasPendingAnswers =
    divergences.length > 0 && divergences.some((d) => d.result === null);

  // Prevent reload / tab close while any divergence is still unanswered.
  useEffect(() => {
    if (!hasPendingAnswers) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasPendingAnswers]);

  const [helpActive, setHelpActive] = useState(() =>
    initialSession.phase1.helpRequests.some((h) => h.resolution === null),
  );
  const [helpDismissing, setHelpDismissing] = useState(false);

  async function dismissHelp(
    resolution: "help_arrived" | "student_cancelled" = "help_arrived",
  ) {
    if (helpDismissing) return;
    setHelpDismissing(true);
    try {
      const res = await fetch(`/api/session/${session.id}/help/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      if (res.ok) setHelpActive(false);
    } finally {
      setHelpDismissing(false);
    }
  }

  const inPhase1 = session.currentPhase === 1;
  const inPhase2 = session.currentPhase === 2;
  const inPhase3 = session.currentPhase === 3;
  const closed = session.currentPhase >= 4;

  // ── presence heartbeat ──────────────────────────────────────────────
  // Pings the server every 15s while the page is visible so the teacher
  // dashboard can tell whether the student is still at the exercise. If
  // the heartbeat stops (tab closed, navigated away, laptop shut), the
  // dashboard labels the session "Stepped away" then "Left session".
  useEffect(() => {
    if (closed) return;
    const sessionId = session.id;
    let stopped = false;
    async function ping() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        await fetch(`/api/session/${sessionId}/heartbeat`, { method: "POST" });
      } catch {
        /* network blip — next tick will retry */
      }
    }
    void ping();
    const timer = setInterval(ping, 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session.id, closed]);

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
      // Intentionally leave specDraft alone on a failed submission — the
      // student should edit their last attempt, not start from a blank slate.
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.unknownError);
    } finally {
      setSubmitting(false);
    }
  }

  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!inPhase2) return;
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
  }, [code, session.id, inPhase2]);

  async function sendChat() {
    if (!chatInput.trim() || chatBusy) return;
    const message = chatInput;
    setChatBusy(true);
    setError(null);
    const pending: Phase2Exchange = {
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
      const body = (await res.json()) as { exchange: Phase2Exchange };
      setExchanges((prev) => [...prev.slice(0, -1), body.exchange]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.unknownError);
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
      // 0 divergences → server auto-closes the session (Phase 4). Either
      // way, route the client into Phase 3 view (which now covers both the
      // answer loop and the finished state).
      setSession((prev) => ({
        ...prev,
        currentPhase: body.divergences.length === 0 ? 4 : 3,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.unknownError);
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
      if (!body.allAnswered) {
        const next = divergences.findIndex(
          (d, idx) => idx !== i && d.result === null,
        );
        if (next !== -1) setDivergenceIndex(next);
      }
      // Once every divergence is answered we stay in phase 3. The student
      // picks between revising their code and finishing via /finalize,
      // which advances the phase.
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.unknownError);
      setDivergences((prev) =>
        prev.map((x, idx) => (idx === i ? { ...x, submitting: false } : x)),
      );
    }
  }

  async function finalizeSession(revisedCode: string | null) {
    if (finalizing) return;
    setFinalizing(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${session.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(revisedCode === null ? {} : { revisedCode }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as {
        revisionChoice: "skipped" | "revised";
      };
      setRevisionChoice(body.revisionChoice);
      setSession((prev) => ({ ...prev, currentPhase: 4 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.unknownError);
    } finally {
      setFinalizing(false);
    }
  }

  const [restarting, setRestarting] = useState(false);
  async function startFreshSession() {
    if (restarting) return;
    if (!window.confirm(t.phase3.startFreshConfirm)) return;
    setRestarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/exercise/${exercise.id}/reset`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await readError(res));
      // The new session becomes "most recent" for this (student, exercise)
      // pair; a full reload picks it up via findOrCreateSession and clears
      // any in-memory drafts from the prior session.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.unknownError);
      setRestarting(false);
    }
  }

  // ── layout ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#1e1e1e] text-[#d4d4d4] flex flex-col">
      <TopNav
        left={<LanguageSwitcher />}
        back={
          hasPendingAnswers
            ? undefined
            : { href: "/exercises", label: t.common.backToExercises }
        }
        right={
          !closed && (
            <HelpImStuckButton
              sessionId={session.id}
              phase={session.currentPhase}
              disabled={helpActive}
              onRequested={() => setHelpActive(true)}
            />
          )
        }
      />
      <FileTabBar fileName={`${exercise.id}.c`} />

      <ExerciseTitle
        title={exercise.title}
        promptText={exercise.instructorPromptText}
        unit={exercise.unit}
        aside={
          inPhase2 ? (
            <AcceptedSpecInline
              text={session.phase1.finalSpecText ?? ""}
            />
          ) : undefined
        }
      />

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
          consoleLines={consoleLines}
          runState={runState}
          runCode={runCode}
          submitConsoleInput={submitConsoleInput}
          clearConsole={clearConsole}
          language="c"
        />
      )}

      {(inPhase3 || closed) && (
        <Phase3View
          iterations={session.phase1.iterations}
          finalSpec={session.phase1.finalSpecText ?? ""}
          // Show the revised code when one exists — that's the version
          // the student actually ended with. The original stays as the
          // diff anchor in the teacher reasoning view.
          finalCode={
            initialSession.phase3?.revisedCode ??
            session.phase2.finalCode ??
            code
          }
          divergences={divergences}
          currentIndex={divergenceIndex}
          setIndex={setDivergenceIndex}
          onAnswer={answerDivergence}
          error={error}
          revisionChoice={revisionChoice}
          onFinalize={finalizeSession}
          finalizing={finalizing}
          closed={closed}
          onStartFresh={startFreshSession}
          restarting={restarting}
          language="c"
        />
      )}

      <StatusBar
        left={
          <>
            <span>✓ claude-opus-4-7</span>
            <span>
              {t.statusBar.phase(
                session.currentPhase,
                phaseLabel(t, session.currentPhase),
              )}
            </span>
          </>
        }
        right={
          <span>
            {t.statusBar.unit(UNIT_ROMAN[exercise.unit], t.units[exercise.unit])}
          </span>
        }
      />

      {helpActive && (
        <HelpPendingOverlay
          onDismiss={dismissHelp}
          dismissing={helpDismissing}
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
  aside,
}: {
  title: string;
  promptText: string;
  unit: Unit;
  /** Optional right-side content (e.g. accepted spec after Phase 1). */
  aside?: React.ReactNode;
}) {
  const t = useT();
  const heading = (
    <div>
      <div className="text-[11px] font-mono text-[#4ec9b0] tracking-wider uppercase mb-2">
        {t.statusBar.unit(UNIT_ROMAN[unit], t.units[unit])}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight leading-tight">
        {title}
      </h1>
      <p className="mt-2 text-sm text-[#d4d4d4]/85 leading-relaxed">
        {promptText}
      </p>
    </div>
  );

  return (
    <div className="shrink-0 px-8 py-6 border-b border-[#3e3e42] bg-[#1e1e1e]">
      <div className={aside ? "max-w-6xl mx-auto" : "max-w-3xl mx-auto"}>
        {aside ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {heading}
            <div className="space-y-3">{aside}</div>
          </div>
        ) : (
          heading
        )}
      </div>
    </div>
  );
}

function HelpImStuckButton({
  sessionId,
  phase,
  disabled,
  onRequested,
}: {
  sessionId: string;
  phase: number;
  disabled?: boolean;
  onRequested: () => void;
}) {
  const t = useT();
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");

  async function handleClick() {
    if (status === "sending" || disabled) return;
    setStatus("sending");
    try {
      const res = await fetch(`/api/session/${sessionId}/help`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "(student pressed Help, I'm stuck)",
          phaseState: { phase },
        }),
      });
      if (res.ok) {
        setStatus("idle");
        onRequested();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled || status === "sending"}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#a94444] hover:bg-[#bf5555] disabled:opacity-60 text-white text-sm font-medium transition-colors"
      >
        <span aria-hidden>🙋</span>
        <span>{t.help.button}</span>
      </button>
      <Dialog
        open={status === "error"}
        onOpenChange={(open) => {
          if (!open) setStatus("idle");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.help.sendError}</DialogTitle>
            <DialogDescription>{t.help.sendErrorBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setStatus("idle")}>{t.common.ok}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HelpPendingOverlay({
  onDismiss,
  dismissing,
}: {
  onDismiss: (resolution: "help_arrived" | "student_cancelled") => void;
  dismissing: boolean;
}) {
  const t = useT();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-pending-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="max-w-md mx-4 rounded-lg border border-[#a94444] bg-[#1e1e1e] shadow-xl p-8 text-center space-y-4">
        <div className="text-5xl" aria-hidden>
          🙋
        </div>
        <h2 id="help-pending-title" className="text-xl font-semibold">
          {t.help.pendingTitle}
        </h2>
        <p className="text-sm text-[#d4d4d4] leading-relaxed">
          {t.help.pendingBody}
        </p>
        <button
          onClick={() => onDismiss("help_arrived")}
          disabled={dismissing}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-[#4ec9b0] hover:bg-[#5fd9c0] disabled:opacity-60 text-[#1e1e1e] text-sm font-semibold transition-colors"
        >
          {dismissing ? t.help.resuming : t.help.helpIsHere}
        </button>
        <button
          onClick={() => onDismiss("student_cancelled")}
          disabled={dismissing}
          className="text-xs text-[#858585] hover:text-[#d4d4d4] underline underline-offset-2 disabled:opacity-60 transition-colors"
        >
          {t.help.neverMind}
        </button>
      </div>
    </div>
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
  const t = useT();
  const lastIteration = iterations[iterations.length - 1];
  const hints = lastIteration?.opusQuestions ?? [];
  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <Panel title={t.phase1.roundTitle(iterations.length + 1)}>
          <div className="space-y-3">
            <div className="text-sm text-[#d4d4d4] leading-relaxed space-y-2">
              <p>{t.phase1.intro}</p>
              <ol className="list-decimal pl-6 space-y-1">
                <li>{t.phase1.bullet1}</li>
                <li>{t.phase1.bullet2}</li>
                <li>{t.phase1.bullet3}</li>
              </ol>
              <p>{t.phase1.unlockNote}</p>
            </div>
            <StudentTextarea
              value={draft}
              onChange={setDraft}
              rows={8}
              placeholder={t.phase1.placeholder}
              disabled={submitting}
            />
            <div className="flex items-center gap-3">
              <Button onClick={onSubmit} disabled={submitting || !draft.trim()}>
                {submitting ? t.phase1.submitting : t.phase1.submit}
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
            title={t.phase1.earlierRounds(iterations.length - 1)}
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
  const t = useT();
  return (
    <section className="border border-[#4a4a2e] bg-[#2a2a1a] rounded p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base" aria-hidden>
          💡
        </span>
        <h2 className="text-[13px] font-semibold text-[#dcdcaa]">
          {t.phase1.hintsTitle}
        </h2>
        <span className="text-[10px] text-[#858585] font-mono ml-auto">
          {t.phase1.hintsRound(round)}
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
      <p className="text-xs text-[#858585] mt-3">{t.phase1.hintsFooter}</p>
    </section>
  );
}

// ─── Phase 2 — editor + chat ─────────────────────────────────────────

function Phase2View({
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
  consoleLines,
  runState,
  runCode,
  submitConsoleInput,
  clearConsole,
  language = "c",
}: {
  code: string;
  setCode: (v: string) => void;
  exchanges: Phase2Exchange[];
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChat: () => void;
  chatBusy: boolean;
  submitFinalCode: () => void;
  finalSubmitting: boolean;
  sessionId: string;
  error: string | null;
  consoleLines: ConsoleLine[];
  runState: RunState;
  runCode: () => void;
  submitConsoleInput: (text: string) => void;
  clearConsole: () => void;
  language?: "c";
}) {
  const t = useT();
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_24rem] min-h-0">
        <section className="flex flex-col min-h-[50vh] border-r border-[#3e3e42]">
          <div className="flex-1 min-h-0">
            <PythonEditor value={code} onChange={setCode} readOnly={false} language={language} />
          </div>
          <RunConsole
            lines={consoleLines}
            runState={runState}
            onSubmitInput={submitConsoleInput}
            onClear={clearConsole}
          />
          <div className="px-6 py-3 border-t border-[#3e3e42] bg-[#252526] flex items-center justify-between gap-3">
            <div className="min-w-0">
              {finalSubmitting && (
                <span className="text-sm font-medium text-[#569cd6] inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#569cd6] animate-pulse" />
                  {t.phase2.comparing}
                </span>
              )}
              {error && !finalSubmitting && (
                <span className="text-xs text-[#f48771] font-mono">
                  {error}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={runCode}
                disabled={runState !== "idle" || !code.trim()}
                className="text-sm px-3 py-1.5 rounded border border-[#3e3e42] bg-[#252526] text-[#d4d4d4] hover:bg-[#2d2d30] disabled:opacity-60 transition-colors inline-flex items-center gap-2"
              >
                {runState === "loading" && (
                  <span className="w-2 h-2 rounded-full bg-[#dcdcaa] animate-pulse" />
                )}
                {runState === "running" && (
                  <span className="w-2 h-2 rounded-full bg-[#569cd6] animate-pulse" />
                )}
                <span>▶</span>
                <span>
                  {runState === "loading"
                    ? t.phase2.loadingPython
                    : runState === "running"
                      ? t.phase2.running
                      : t.phase2.run}
                </span>
              </button>
              <RevisePlanDialog sessionId={sessionId} />
              <Button
                onClick={submitFinalCode}
                disabled={finalSubmitting || !code.trim()}
              >
                {finalSubmitting ? t.phase2.submitting : t.phase2.submit}
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

function RunConsole({
  lines,
  runState,
  onSubmitInput,
  onClear,
}: {
  lines: ConsoleLine[];
  runState: RunState;
  onSubmitInput: (text: string) => void;
  onClear: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [consoleInputFocused, setConsoleInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (runState === "waiting-input") inputRef.current?.focus();
  }, [runState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, runState]);

  function submit() {
    onSubmitInput(draft);
    setDraft("");
  }

  return (
    <section className="shrink-0 border-t border-[#3e3e42] bg-[#1e1e1e] flex flex-col h-[200px]">
      <div className="px-3 py-1.5 border-b border-[#3e3e42] bg-[#252526] flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[#858585]">
        <span>{t.phase2.consoleHeader}</span>
        {lines.length > 0 && runState === "idle" && (
          <button
            onClick={onClear}
            className="hover:text-white transition-colors"
          >
            {t.phase2.consoleClear}
          </button>
        )}
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 text-[13px] font-mono whitespace-pre-wrap break-words"
      >
        {lines.length === 0 && runState === "idle" ? (
          <span className="text-[#6a6a6a]">{t.phase2.consoleEmpty}</span>
        ) : (
          lines.map((line, i) => (
            <span
              key={i}
              className={
                line.kind === "stderr" || line.kind === "error"
                  ? "text-[#f48771]"
                  : line.kind === "input"
                    ? "text-[#9cdcfe]"
                    : line.kind === "system"
                      ? "text-[#858585] italic"
                      : "text-[#d4d4d4]"
              }
            >
              {line.text}
            </span>
          ))
        )}
        {runState === "waiting-input" && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[#4ec9b0] select-none">›</span>
            <input
              ref={inputRef}
              type="text"
              // The readOnly-then-clear-on-focus trick is the only thing
              // that reliably suppresses native form autofill across
              // Firefox/Zen, Chrome, and Safari — autocomplete="off" is
              // ignored, password-manager data-* attrs don't cover the
              // browser's built-in autofill.
              readOnly={!consoleInputFocused}
              onFocus={() => setConsoleInputFocused(true)}
              onBlur={() => setConsoleInputFocused(false)}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              data-form-type="other"
              aria-label="Console input"
              className="flex-1 bg-transparent text-[#d4d4d4] outline-none font-mono text-[13px]"
            />
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Phase 3 — divergence review ─────────────────────────────────────

function Phase3View({
  iterations,
  finalSpec,
  finalCode,
  divergences,
  currentIndex,
  setIndex,
  onAnswer,
  error,
  revisionChoice,
  onFinalize,
  finalizing,
  closed,
  onStartFresh,
  restarting,
  language = "c",
}: {
  iterations: Phase1Iteration[];
  finalSpec: string;
  finalCode: string;
  divergences: DivergenceQuestion[];
  currentIndex: number;
  setIndex: (i: number) => void;
  onAnswer: (i: number, answer: string) => void;
  error: string | null;
  revisionChoice: "skipped" | "revised" | null;
  onFinalize: (revisedCode: string | null) => void;
  finalizing: boolean;
  closed: boolean;
  onStartFresh: () => void;
  restarting: boolean;
  language?: "c";
}) {
  const t = useT();
  const allAnswered =
    divergences.length > 0 && divergences.every((d) => d.result !== null);

  // Terminal states after the divergence loop:
  //   - 0 divergences  → phase already 4, show "session complete" (closed)
  //   - answered, no choice yet → show the revision handoff
  //   - editing        → swap to the Monaco revision editor
  //   - revised/skipped → show "session complete" with an optional badge
  const needsFinalization =
    allAnswered && revisionChoice === null && !closed;
  const [editingRevision, setEditingRevision] = useState(false);

  // Once the server confirms the finalize (revisionChoice flips from null),
  // drop the editor so the student lands on the "session complete" view
  // instead of a stale editor that would reject a second submit.
  useEffect(() => {
    if (revisionChoice !== null) setEditingRevision(false);
  }, [revisionChoice]);

  if (editingRevision) {
    return (
      <RevisionEditor
        finalSpec={finalSpec}
        originalCode={finalCode}
        divergences={divergences}
        onSubmit={(code) => onFinalize(code)}
        onCancel={() => {
          setEditingRevision(false);
          onFinalize(null);
        }}
        finalizing={finalizing}
        error={error}
        language={language}
      />
    );
  }

  // Size the read-only editor to exactly the code's line count so there's no
  // internal scrollbar and no dead space. Monaco's line height at fontSize
  // 14 is ~20px; the extra 24px covers top padding plus the horizontal
  // scrollbar Monaco leaves at the bottom.
  const codeHeight = finalCode
    ? `${finalCode.split("\n").length * 20 + 24}px`
    : "0px";

  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {needsFinalization ? (
          <div className="rounded-md border border-[#dcdcaa]/40 bg-[#2a2411] px-5 py-5 space-y-4">
            <div>
              <div className="text-base font-semibold text-[#d4d4d4]">
                {t.phase3.revisionPromptTitle}
              </div>
              <div className="text-sm text-[#858585] mt-1 leading-relaxed">
                {t.phase3.revisionPromptBody}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={() => setEditingRevision(true)}
                disabled={finalizing}
              >
                {t.phase3.revisionYes}
              </Button>
              <button
                onClick={() => onFinalize(null)}
                disabled={finalizing}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded border border-[#3e3e42] bg-[#252526] text-[#d4d4d4] text-sm hover:bg-[#2d2d30] disabled:opacity-60 transition-colors"
              >
                {finalizing ? t.phase3.finishingUp : t.phase3.revisionNo}
              </button>
              {error && (
                <span className="text-xs text-[#f48771] font-mono self-center">
                  {error}
                </span>
              )}
            </div>
          </div>
        ) : (
          (divergences.length === 0 || allAnswered) && (
            <div className="rounded-md border border-[#4ec9b0]/40 bg-[#162521] px-5 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-[#d4d4d4] flex items-center gap-2">
                  {t.phase3.sessionComplete}
                  {revisionChoice === "revised" && (
                    <span className="text-[10px] uppercase tracking-wider text-[#75beff] font-mono border border-[#3e5d7a] bg-[#1f3a5c] px-1.5 py-0.5 rounded">
                      {t.phase3.revisedBadge}
                    </span>
                  )}
                </div>
                <div className="text-sm text-[#858585] mt-1">
                  {t.phase3.nothingMore}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                {closed && (
                  <button
                    onClick={onStartFresh}
                    disabled={restarting}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-[#3e3e42] bg-[#252526] text-[#d4d4d4] text-sm hover:bg-[#2d2d30] disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    {restarting ? t.phase3.startingFresh : t.phase3.startFresh}
                  </button>
                )}
                <Link
                  href="/exercises"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-[#007acc] hover:bg-[#1188dd] text-white text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  {t.phase3.headBack}
                </Link>
              </div>
            </div>
          )
        )}

        <Phase5Section title={t.phase3.reviewSection}>
          {divergences.length === 0 ? (
            <div className="rounded border border-[#4ec9b0]/40 bg-[#162521] px-4 py-3 text-sm text-[#d4d4d4]">
              {t.phase3.noDivergences}
            </div>
          ) : allAnswered ? (
            <div className="space-y-3">
              {divergences.map((d, i) => (
                <DivergenceCard
                  key={d.divergenceId}
                  d={d}
                  index={i}
                  onAnswer={() => {}}
                  error={null}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-[#858585]">
                <span>
                  {t.phase3.questionOf(currentIndex + 1, divergences.length)}
                </span>
                <span>
                  {t.phase3.answeredOf(
                    divergences.filter((x) => x.result).length,
                    divergences.length,
                  )}
                </span>
              </div>
              <DivergenceCard
                key={divergences[currentIndex].divergenceId}
                d={divergences[currentIndex]}
                index={currentIndex}
                onAnswer={(answer) => onAnswer(currentIndex, answer)}
                error={error}
              />
              {divergences.length > 1 && (
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
              )}
            </div>
          )}
        </Phase5Section>

        {iterations.length > 0 && (
          <Phase5Section title={t.phase3.iterationHistory(iterations.length)}>
            <div className="border border-[#3e3e42] bg-[#252526] rounded p-4">
              <IterationHistory iterations={iterations} />
            </div>
          </Phase5Section>
        )}

        <Phase5Section title={t.phase3.finalSpec}>
          <div className="text-sm whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-3">
            {finalSpec || t.phase3.empty}
          </div>
        </Phase5Section>

        {finalCode && (
          <Phase5Section title={t.phase3.submittedCode}>
            <div className="border border-[#3e3e42] rounded overflow-hidden">
              <PythonEditor
                value={finalCode}
                readOnly
                height={codeHeight}
                language={language}
              />
            </div>
          </Phase5Section>
        )}
      </div>
    </main>
  );
}

function RevisionEditor({
  finalSpec,
  originalCode,
  divergences,
  onSubmit,
  onCancel,
  finalizing,
  error,
  language = "c",
}: {
  finalSpec: string;
  originalCode: string;
  divergences: DivergenceQuestion[];
  onSubmit: (code: string) => void;
  onCancel: () => void;
  finalizing: boolean;
  error: string | null;
  language?: "c";
}) {
  const t = useT();
  const [draft, setDraft] = useState(originalCode);
  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[#d4d4d4]">
            {t.phase3.revisionEditingTitle}
          </h2>
          <p className="text-sm text-[#858585] leading-relaxed">
            {t.phase3.revisionEditingBody}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-4 items-start">
          <section className="border border-[#3e3e42] rounded overflow-hidden h-[440px]">
            <PythonEditor value={draft} onChange={setDraft} readOnly={false} language={language} />
          </section>
          <aside className="space-y-2 lg:max-h-[440px] lg:overflow-y-auto lg:pr-1">
            <CollapseRow label={t.phase3.finalSpec} defaultOpen>
              <div className="text-sm whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-2">
                {finalSpec || t.phase3.empty}
              </div>
            </CollapseRow>
            <CollapseRow label={t.phase3.revisionRecap}>
              <div className="space-y-2">
                {divergences.map((d, i) => (
                  <div
                    key={d.divergenceId}
                    className="border border-[#3e3e42] bg-[#1e1e1e] rounded p-2 space-y-1.5"
                  >
                    <div className="text-[10px] font-mono text-[#858585]">
                      Q{i + 1}
                    </div>
                    <p className="text-xs text-[#d4d4d4] whitespace-pre-wrap">
                      {d.studentFacingQuestion}
                    </p>
                    <div className="text-[10px] uppercase tracking-wider text-[#858585]">
                      {t.phase3.yourAnswer}
                    </div>
                    <p className="text-xs whitespace-pre-wrap bg-[#252526] border border-[#3e3e42] rounded p-1.5">
                      {d.answer || t.phase3.noAnswer}
                    </p>
                  </div>
                ))}
              </div>
            </CollapseRow>
          </aside>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => onSubmit(draft)}
            disabled={finalizing || !draft.trim()}
          >
            {finalizing ? t.phase3.revisionSubmitting : t.phase3.revisionSubmit}
          </Button>
          <button
            onClick={onCancel}
            disabled={finalizing}
            className="text-sm text-[#858585] hover:text-white underline underline-offset-2 disabled:opacity-60"
          >
            {t.phase3.revisionCancel}
          </button>
          {error && (
            <span className="text-xs text-[#f48771] font-mono">{error}</span>
          )}
        </div>
      </div>
    </main>
  );
}

function DivergenceCard({
  d,
  index,
  onAnswer,
  error,
}: {
  d: DivergenceQuestion;
  index: number;
  onAnswer: (answer: string) => void;
  error: string | null;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const answered = d.result !== null || d.answer !== null;
  return (
    <div className="border border-[#3e3e42] bg-[#252526] rounded overflow-hidden">
      <div className="px-4 py-2 border-b border-[#3e3e42] flex items-center justify-between gap-2">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#3e3e42] bg-[#1e1e1e]">
          <span className="text-[#858585]">Q</span>
          <span className="text-[#569cd6] ml-1">{index + 1}</span>
        </span>
        {answered && (
          <span className="text-[10px] uppercase tracking-wider text-[#89d185] font-mono">
            {t.phase3.answered}
          </span>
        )}
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-sm text-[#d4d4d4] whitespace-pre-wrap">
          {d.studentFacingQuestion}
        </p>
        {answered ? (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-[#858585]">
              {t.phase3.yourAnswer}
            </div>
            <p className="text-sm whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-2.5">
              {d.answer || t.phase3.noAnswer}
            </p>
          </div>
        ) : (
          <>
            <StudentTextarea
              value={draft}
              onChange={setDraft}
              rows={4}
              placeholder={t.phase3.answerPlaceholder}
              disabled={d.submitting}
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={() => onAnswer(draft)}
                disabled={d.submitting || !draft.trim()}
              >
                {d.submitting ? t.phase3.recording : t.phase3.submitAnswer}
              </Button>
              {error && (
                <span className="text-xs text-[#f48771] font-mono">
                  {error}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Phase5Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-[#d4d4d4]">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ─── Collapsible spec + history + final code bundle ───────────

function SpecAndHistoryTop({
  finalSpec,
  iterations,
  finalCode,
  compact,
  defaultOpen,
}: {
  finalSpec: string;
  iterations: Phase1Iteration[];
  finalCode?: string;
  compact?: boolean;
  defaultOpen?: boolean;
}) {
  const t = useT();
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <CollapseRow
        label={`${t.phase3.finalSpec}${finalSpec ? "" : t.phase3.specEmptySuffix}`}
        defaultOpen={defaultOpen}
      >
        <div className="text-sm whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-2">
          {finalSpec || t.phase3.notSubmittedYet}
        </div>
      </CollapseRow>
      {iterations.length > 0 && (
        <CollapseRow
          label={t.phase3.iterationHistory(iterations.length)}
          defaultOpen={defaultOpen}
        >
          <IterationHistory iterations={iterations} />
        </CollapseRow>
      )}
      {finalCode && (
        <CollapseRow label={t.phase3.submittedCode} defaultOpen={defaultOpen}>
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
  const t = useT();
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
              <span className="text-xs text-[#89d185] font-mono">
                {t.phase1.passed}
              </span>
            )}
          </div>
          <div className="text-sm whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-2">
            {it.studentSpecText}
          </div>
          {it.opusQuestions.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-[#858585]">
                {t.phase1.opusAsked}
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

// ─── Inline frozen spec / plan ───────────────────────────────────────

function AcceptedSpecInline({ text }: { text: string }) {
  const t = useT();
  return (
    <div className="border border-[#4ec9b0]/45 bg-[#162521] rounded-md overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[#4ec9b0]/25 bg-[#4ec9b0]/10 flex items-center gap-2">
        <span className="text-[#89d185] text-xs">✓</span>
        <span className="text-[11px] font-semibold tracking-wider uppercase text-[#4ec9b0]">
          {t.phase2.acceptedSpec}
        </span>
      </div>
      <div className="px-3 py-2 text-[13px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto text-[#d4d4d4]">
        {text}
      </div>
    </div>
  );
}

function FrozenSpecInline({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-wider uppercase text-[#858585] mb-1.5">
        {label}
      </div>
      <div className="text-[13px] whitespace-pre-wrap bg-[#1e1e1e] border border-[#3e3e42] rounded p-3 leading-relaxed max-h-48 overflow-y-auto">
        {text}
      </div>
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
  exchanges: Phase2Exchange[];
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChat: () => void;
  chatBusy: boolean;
}) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [exchanges.length]);

  return (
    <aside className="flex flex-col h-[60vh] lg:h-full bg-[#252526] min-h-0">
      <div className="px-4 py-2.5 border-b border-[#3e3e42] flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-[#007acc] text-white flex items-center justify-center text-[10px] font-semibold">
          OP
        </div>
        <div>
          <div className="text-sm font-semibold">{t.phase2.chatWithOpus}</div>
          <div className="text-[10px] text-[#858585] font-mono">
            {t.phase2.chatSubtitle}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 px-4 py-3 overflow-y-auto space-y-4 min-h-0"
      >
        {exchanges.length === 0 ? (
          <p className="text-sm text-[#858585]">{t.phase2.chatEmpty}</p>
        ) : (
          exchanges.map((ex, i) => (
            <div key={i} className="space-y-2">
              <Bubble side="right" label={t.phase2.you}>
                {ex.studentMessage}
              </Bubble>
              <Bubble
                side="left"
                label={
                  ex.opusResponse === "__pending__"
                    ? t.phase2.opus
                    : `${t.phase2.opus} · ${ex.opusMode}`
                }
                highlight
              >
                {ex.opusResponse === "__pending__" ? (
                  <span className="italic text-[#75beff]">
                    {t.phase2.thinking}
                  </span>
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
          placeholder={t.phase2.chatPlaceholder}
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
            {t.phase2.sendHint}
          </span>
          <Button
            size="sm"
            onClick={sendChat}
            disabled={chatBusy || !chatInput.trim()}
          >
            {chatBusy ? t.phase2.sendShort : t.phase2.send}
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
  const t = useT();
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#3e3e42] bg-[#1e1e1e]">
      <span className="text-[#858585]">{t.phase1.roundBadge}</span>{" "}
      <span className="text-[#569cd6] ml-1">{n}</span>
    </span>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────

type RevisionReason = "faster" | "simpler" | "more correct" | "other";

function RevisePlanDialog({ sessionId }: { sessionId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [amendment, setAmendment] = useState("");
  const [reason, setReason] = useState<RevisionReason>("faster");
  const [reasonDetail, setReasonDetail] = useState("");
  const [sending, setSending] = useState(false);

  const justification = useMemo(() => {
    if (reason !== "other") return reason;
    const trimmed = reasonDetail.trim();
    return trimmed ? `other: ${trimmed}` : "";
  }, [reason, reasonDetail]);

  const canSubmit = amendment.trim().length > 0 && justification.length > 0;

  const reset = useCallback(() => {
    setAmendment("");
    setReason("faster");
    setReasonDetail("");
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      const res = await fetch(`/api/session/${sessionId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amendment, justification }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setOpen(false);
      setTimeout(reset, 200);
    } finally {
      setSending(false);
    }
  }, [amendment, canSubmit, justification, reset, sessionId]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm px-3 py-1.5 rounded border border-[#3e3e42] bg-[#2d2d30] text-[#d4d4d4] hover:bg-[#3e3e42] transition-colors"
      >
        {t.phase2.changeOfPlan}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.phase2.changeOfPlan}</DialogTitle>
            <DialogDescription>
              {t.phase2.changeOfPlanDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <StudentTextarea
              value={amendment}
              onChange={setAmendment}
              rows={3}
              placeholder={t.phase2.amendmentPlaceholder}
              disabled={sending}
            />
            <div className="space-y-2">
              <label className="text-xs text-[#858585] font-mono block">
                {t.phase2.why}
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as RevisionReason)}
                disabled={sending}
                className="w-full bg-[#1e1e1e] border border-[#3e3e42] text-[#d4d4d4] text-sm rounded px-3 py-2 font-mono focus:outline-none focus:border-[#007acc]"
              >
                <option value="faster">{t.phase2.reasonFaster}</option>
                <option value="simpler">{t.phase2.reasonSimpler}</option>
                <option value="more correct">
                  {t.phase2.reasonMoreCorrect}
                </option>
                <option value="other">{t.phase2.reasonOther}</option>
              </select>
              {reason === "other" && (
                <StudentTextarea
                  value={reasonDetail}
                  onChange={setReasonDetail}
                  rows={2}
                  placeholder={t.phase2.otherPlaceholder}
                  disabled={sending}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={sending || !canSubmit}>
              {sending ? t.common.saving : t.phase2.saveRevision}
            </Button>
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
