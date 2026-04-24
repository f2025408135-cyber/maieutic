"use client";

import { useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/editor/TopNav";
import { FileTabBar } from "@/components/editor/FileTab";
import { StatusBar } from "@/components/editor/StatusBar";
import { InstructorNav } from "@/components/instructor/InstructorNav";
import { Button } from "@/components/ui/button";
import type {
  ScaffoldingOutput,
  SpecDimension,
  ExpectedDivergence,
  StudentLevel,
  Source,
  DivergenceCategory,
} from "@/lib/opus/schemas";
import {
  UNIT_IDS,
  UNIT_ROMAN,
  UNIT_TITLE,
  defaultUnitForLevel,
  levelForUnit,
  type Unit,
} from "@/lib/units";

type EditableDimension = SpecDimension & { originalId?: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const CATEGORIES: DivergenceCategory[] = ["drift", "revision", "bug"];

export default function AuthoringPage() {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const [originalScaffolding, setOriginalScaffolding] =
    useState<ScaffoldingOutput | null>(null);
  const [dimensions, setDimensions] = useState<EditableDimension[]>([]);
  const [divergences, setDivergences] = useState<ExpectedDivergence[]>([]);
  const [phase2Required, setPhase2Required] = useState(false);
  const [studentLevel, setStudentLevel] = useState<StudentLevel>("week_1_2");
  const [unit, setUnit] = useState<Unit>("unit_2");
  const [promptQualityNote, setPromptQualityNote] = useState<string | null>(
    null,
  );
  const [hasReviewed, setHasReviewed] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  async function generate() {
    setErrorMsg(null);
    setGenerating(true);
    setPublishedId(null);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/author/generate-scaffolding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, prompt, unit }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string; message?: string };
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { scaffolding: ScaffoldingOutput };
      const s = body.scaffolding;
      setOriginalScaffolding(s);
      setDimensions(
        s.spec_gate_dimensions.map((d) => ({
          id: d.id,
          description: d.description,
          rationale: d.rationale,
          source: "opus",
          originalId: d.id,
        })),
      );
      setDivergences(
        s.expected_divergences.map((d) => ({
          category: d.category,
          pattern: d.pattern,
          source: "opus",
        })),
      );
      setPhase2Required(s.phase_2_required);
      setStudentLevel(s.student_level);
      setUnit(defaultUnitForLevel(s.student_level));
      setPromptQualityNote(s.prompt_quality_note);
      setHasReviewed(false);
      setLatencyMs(Math.round(performance.now() - t0));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "unknown error");
    } finally {
      setGenerating(false);
    }
  }

  function updateDimension(
    index: number,
    patch: Partial<Pick<SpecDimension, "description" | "rationale" | "id">>,
  ) {
    setDimensions((prev) =>
      prev.map((d, i) =>
        i === index
          ? {
              ...d,
              ...patch,
              source: d.source === "opus" ? "instructor_edited" : d.source,
            }
          : d,
      ),
    );
  }

  function addDimension() {
    setDimensions((prev) => [
      ...prev,
      {
        id: `new_${prev.length + 1}`,
        description: "",
        rationale: "",
        source: "instructor_added",
      },
    ]);
  }

  function removeDimension(index: number) {
    setDimensions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDivergence(
    index: number,
    patch: Partial<Pick<ExpectedDivergence, "category" | "pattern">>,
  ) {
    setDivergences((prev) =>
      prev.map((d, i) =>
        i === index
          ? {
              ...d,
              ...patch,
              source: d.source === "opus" ? "instructor_edited" : d.source,
            }
          : d,
      ),
    );
  }

  function addDivergence() {
    setDivergences((prev) => [
      ...prev,
      { category: "drift", pattern: "", source: "instructor_added" },
    ]);
  }

  function removeDivergence(index: number) {
    setDivergences((prev) => prev.filter((_, i) => i !== index));
  }

  const anyEdited =
    dimensions.some((d) => d.source !== "opus") ||
    divergences.some((d) => d.source !== "opus") ||
    (originalScaffolding !== null &&
      (phase2Required !== originalScaffolding.phase_2_required ||
        studentLevel !== originalScaffolding.student_level));

  const canPublish =
    originalScaffolding !== null &&
    !publishing &&
    (hasReviewed || anyEdited) &&
    dimensions.every(
      (d) => d.description.trim() && d.rationale.trim() && d.id.trim(),
    ) &&
    divergences.every((d) => d.pattern.trim());

  async function publish() {
    if (!originalScaffolding) return;
    setPublishing(true);
    setErrorMsg(null);
    try {
      const payload = {
        id: slugify(title),
        title,
        instructorPromptText: prompt,
        specGateDimensions: dimensions.map(
          ({ originalId: _original, ...rest }) => rest,
        ),
        expectedDivergences: divergences,
        phase2Required,
        studentLevel,
        unit,
        opusGeneratedDimensions: originalScaffolding.spec_gate_dimensions,
        opusGeneratedDivergences: originalScaffolding.expected_divergences,
        opusGeneratedPhase2Required: originalScaffolding.phase_2_required,
        opusGeneratedStudentLevel: originalScaffolding.student_level,
      };
      const res = await fetch("/api/author/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json()) as {
          error?: string;
          issues?: unknown;
          message?: string;
        };
        throw new Error(
          body.message ||
            body.error ||
            JSON.stringify(body.issues).slice(0, 300),
        );
      }
      const body = (await res.json()) as { exercise: { id: string } };
      setPublishedId(body.exercise.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "publish failed");
    } finally {
      setPublishing(false);
    }
  }

  const fileName = title
    ? `new-exercise (${slugify(title)}).md`
    : "new-exercise.md";

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4] flex flex-col">
      <TopNav left={<InstructorNav current="cohorts" />} />
      <FileTabBar fileName={fileName} />

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
            <span className="text-[#4ec9b0]">Instructor · New exercise</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight leading-tight">
            Author an exercise
          </h1>
          <p className="mt-2 text-sm text-[#d4d4d4]/85 leading-relaxed">
            Write the instructions. Opus generates the spec-gate scaffolding —
            the questions a student&apos;s specification must commit to before
            the editor unlocks. You review, edit if needed, then publish.
          </p>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-8">
          <Section title="Exercise instructions">
            <div className="border border-[#3e3e42] bg-[#252526] rounded p-4 space-y-4">
              <Field label="Title">
                <TextInput
                  value={title}
                  onChange={setTitle}
                  placeholder="e.g. Count vowels"
                  disabled={generating}
                />
              </Field>
              <Field label="Instructions">
                <TextArea
                  value={prompt}
                  onChange={setPrompt}
                  rows={4}
                  placeholder='e.g. "Write a function that counts vowels in a string."'
                  disabled={generating}
                />
              </Field>
              <div className="flex items-center gap-3">
                <Button
                  onClick={generate}
                  disabled={generating || !title.trim() || !prompt.trim()}
                >
                  {generating ? "Generating…" : "Generate scaffolding"}
                </Button>
                {latencyMs !== null && (
                  <span className="text-xs text-[#858585] font-mono">
                    last call: {(latencyMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              {errorMsg && <ErrorBox>{errorMsg}</ErrorBox>}
            </div>
          </Section>

          {originalScaffolding && (
            <>
              {promptQualityNote && (
                <div className="text-sm border border-[#4f3b17] bg-[#2a2411] text-[#dcdcaa] rounded p-3">
                  <strong>Prompt quality note:</strong> {promptQualityNote}
                </div>
              )}

              <Section
                title={`Specification-gate dimensions · ${dimensions.length}`}
                aside={
                  <button
                    onClick={addDimension}
                    className="text-xs font-mono text-[#569cd6] hover:text-white transition-colors"
                  >
                    + add
                  </button>
                }
              >
                <div className="space-y-3">
                  {dimensions.map((d, i) => (
                    <div
                      key={i}
                      className="border border-[#3e3e42] bg-[#252526] rounded p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <TextInput
                          value={d.id}
                          onChange={(v) => updateDimension(i, { id: v })}
                          className="max-w-xs font-mono text-xs"
                          placeholder="id (snake_case)"
                        />
                        <div className="flex items-center gap-2">
                          <SourceBadge source={d.source} />
                          <button
                            onClick={() => removeDimension(i)}
                            className="text-xs text-[#858585] hover:text-[#f48771]"
                          >
                            remove
                          </button>
                        </div>
                      </div>
                      <TextArea
                        rows={2}
                        value={d.description}
                        onChange={(v) => updateDimension(i, { description: v })}
                        placeholder="Concrete question the student's specification must answer"
                      />
                      <TextArea
                        rows={2}
                        value={d.rationale}
                        onChange={(v) => updateDimension(i, { rationale: v })}
                        placeholder="Why this matters (used by Opus when asking, not shown verbatim)"
                        small
                      />
                    </div>
                  ))}
                </div>
              </Section>

              <Section
                title={`Expected divergences · ${divergences.length}`}
                aside={
                  <button
                    onClick={addDivergence}
                    className="text-xs font-mono text-[#569cd6] hover:text-white transition-colors"
                  >
                    + add
                  </button>
                }
              >
                <div className="space-y-3">
                  {divergences.map((d, i) => (
                    <div
                      key={i}
                      className="border border-[#3e3e42] bg-[#252526] rounded p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={d.category}
                          onChange={(e) =>
                            updateDivergence(i, {
                              category: e.target.value as DivergenceCategory,
                            })
                          }
                          className="border border-[#3e3e42] bg-[#1e1e1e] text-[#d4d4d4] rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-[#007acc]"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-2">
                          <SourceBadge source={d.source} />
                          <button
                            onClick={() => removeDivergence(i)}
                            className="text-xs text-[#858585] hover:text-[#f48771]"
                          >
                            remove
                          </button>
                        </div>
                      </div>
                      <TextArea
                        rows={2}
                        value={d.pattern}
                        onChange={(v) => updateDivergence(i, { pattern: v })}
                        placeholder="Specific pattern (not 'student makes a mistake')"
                      />
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Unit & planning step">
                <div className="border border-[#3e3e42] bg-[#252526] rounded p-4 space-y-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#858585] font-mono mb-2">
                      Unit
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {UNIT_IDS.map((u) => (
                        <label
                          key={u}
                          className={`flex items-center gap-3 text-sm cursor-pointer border rounded px-3 py-2 transition-colors ${
                            unit === u
                              ? "border-[#007acc] bg-[#04395e]/30"
                              : "border-[#3e3e42] hover:border-[#858585]"
                          }`}
                        >
                          <input
                            type="radio"
                            name="unit"
                            checked={unit === u}
                            onChange={() => {
                              setUnit(u);
                              setStudentLevel(levelForUnit(u));
                            }}
                            className="accent-[#007acc]"
                          />
                          <span>
                            <span
                              className="font-semibold"
                              style={{
                                color: unit === u ? "#dcdcaa" : "#d4d4d4",
                              }}
                            >
                              Unit {UNIT_ROMAN[u]}
                            </span>
                            <span className="text-[#858585]"> · </span>
                            <span>{UNIT_TITLE[u]}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-[#858585] mt-2">
                      The Opus-calibration level follows from the unit:{" "}
                      <span className="font-mono">{studentLevel}</span>.
                    </p>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={phase2Required}
                        onChange={(e) => setPhase2Required(e.target.checked)}
                        className="accent-[#007acc]"
                      />
                      Require a planning step (Phase 2)
                    </label>
                    <p className="text-xs text-[#858585] mt-1 ml-6">
                      On for exercises with non-trivial implementation
                      decisions. Off when the spec essentially determines the
                      code.
                    </p>
                  </div>
                </div>
              </Section>

              <Section title="Publish">
                <div className="border border-[#3e3e42] bg-[#252526] rounded p-4 space-y-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasReviewed}
                      onChange={(e) => setHasReviewed(e.target.checked)}
                      className="accent-[#007acc]"
                    />
                    I&apos;ve reviewed the scaffolding above.
                  </label>
                  <p className="text-xs text-[#858585] ml-6">
                    The Publish button is enabled once you&apos;ve either
                    edited at least one field or explicitly confirmed review.
                  </p>
                  <div className="flex items-center gap-3 pt-1">
                    <Button onClick={publish} disabled={!canPublish}>
                      {publishing ? "Publishing…" : "Publish exercise"}
                    </Button>
                    {publishedId && (
                      <span className="text-sm text-[#89d185]">
                        Published as{" "}
                        <code className="font-mono bg-[#1e3a2a] px-1 py-0.5 rounded">
                          {publishedId}
                        </code>
                        {" · "}
                        <a
                          href={`/exercise/${publishedId}`}
                          className="underline hover:text-white"
                        >
                          open student view
                        </a>
                      </span>
                    )}
                  </div>
                </div>
              </Section>
            </>
          )}
        </div>
      </main>

      <StatusBar
        left={
          <>
            <span>✓ claude-opus-4-7</span>
            <span>{originalScaffolding ? "draft" : "new exercise"}</span>
            {latencyMs !== null && (
              <span>scaffold {(latencyMs / 1000).toFixed(1)}s</span>
            )}
          </>
        }
        right={
          <span>
            {publishedId ? "published" : originalScaffolding ? "unsaved" : "—"}
          </span>
        }
      />
    </div>
  );
}

// ─── Section + form primitives ───────────────────────────────────────────

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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-wider text-[#858585] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full bg-[#1e1e1e] text-[#d4d4d4] border border-[#3e3e42] rounded px-3 py-1.5 text-sm placeholder:text-[#6a6a6a] focus:outline-none focus:border-[#007acc] disabled:opacity-50 ${className}`}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
  small,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={`w-full bg-[#1e1e1e] text-[#d4d4d4] border border-[#3e3e42] rounded px-3 py-2 ${small ? "text-xs" : "text-sm"} placeholder:text-[#6a6a6a] focus:outline-none focus:border-[#007acc] disabled:opacity-50 resize-y`}
    />
  );
}

function SourceBadge({ source }: { source: Source }) {
  const palette = {
    opus: { bg: "#1f3a5c", fg: "#75beff", label: "Opus" },
    instructor_edited: { bg: "#4f3b17", fg: "#dcdcaa", label: "Edited" },
    instructor_added: { bg: "#1e3a2a", fg: "#89d185", label: "Added" },
  } as const;
  const { bg, fg, label } = palette[source];
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
      style={{ backgroundColor: bg, color: fg }}
    >
      {label}
    </span>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm border border-[#5a1d1d] bg-[#2a1111] text-[#f48771] rounded p-3 font-mono">
      {children}
    </div>
  );
}
