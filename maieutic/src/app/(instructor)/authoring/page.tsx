"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
  ScaffoldingOutput,
  SpecDimension,
  ExpectedDivergence,
  StudentLevel,
  Source,
  DivergenceCategory,
} from "@/lib/opus/schemas";

type EditableDimension = SpecDimension & { originalId?: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const LEVELS: StudentLevel[] = ["week_1_2", "week_3_6", "week_7_plus"];
const CATEGORIES: DivergenceCategory[] = ["drift", "revision", "bug"];

function SourceBadge({ source }: { source: Source }) {
  const label =
    source === "opus"
      ? "Opus"
      : source === "instructor_edited"
        ? "Edited"
        : "Added";
  const variant = source === "opus" ? "secondary" : "default";
  return <Badge variant={variant}>{label}</Badge>;
}

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
        body: JSON.stringify({ title, prompt }),
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
    dimensions.every((d) => d.description.trim() && d.rationale.trim() && d.id.trim()) &&
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

  return (
    <main className="mx-auto max-w-4xl p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Maieutic — exercise authoring</h1>
        <p className="text-sm text-muted-foreground">
          Write a prompt. Opus generates the spec-gate scaffolding. You review,
          edit if needed, then publish.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Count vowels"
              disabled={generating}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Exercise prompt
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder='e.g. "Write a function that counts vowels in a string."'
              disabled={generating}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={generate}
              disabled={generating || !title.trim() || !prompt.trim()}
            >
              {generating ? "Generating…" : "Generate scaffolding"}
            </Button>
            {latencyMs !== null && (
              <span className="text-xs text-muted-foreground">
                last call: {(latencyMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          {errorMsg && (
            <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded p-3">
              {errorMsg}
            </div>
          )}
        </CardContent>
      </Card>

      {originalScaffolding && (
        <>
          {promptQualityNote && (
            <div className="text-sm border border-yellow-300 bg-yellow-50 text-yellow-900 rounded p-3">
              <strong>Prompt quality note:</strong> {promptQualityNote}
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Spec-gate dimensions ({dimensions.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={addDimension}>
                + Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {dimensions.map((d, i) => (
                <div
                  key={i}
                  className="border rounded p-3 space-y-2 bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Input
                      value={d.id}
                      onChange={(e) =>
                        updateDimension(i, { id: e.target.value })
                      }
                      className="max-w-xs text-xs font-mono"
                      placeholder="id (snake_case)"
                    />
                    <div className="flex items-center gap-2">
                      <SourceBadge source={d.source} />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeDimension(i)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    rows={2}
                    value={d.description}
                    onChange={(e) =>
                      updateDimension(i, { description: e.target.value })
                    }
                    placeholder="Concrete question the student's spec must answer"
                  />
                  <Textarea
                    rows={2}
                    value={d.rationale}
                    onChange={(e) =>
                      updateDimension(i, { rationale: e.target.value })
                    }
                    placeholder="Why this matters (used by Opus when asking, not shown verbatim)"
                    className="text-sm"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Expected divergences ({divergences.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={addDivergence}>
                + Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {divergences.map((d, i) => (
                <div
                  key={i}
                  className="border rounded p-3 space-y-2 bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={d.category}
                      onChange={(e) =>
                        updateDivergence(i, {
                          category: e.target.value as DivergenceCategory,
                        })
                      }
                      className="border rounded px-2 py-1 text-sm bg-background"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <SourceBadge source={d.source} />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeDivergence(i)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    rows={2}
                    value={d.pattern}
                    onChange={(e) =>
                      updateDivergence(i, { pattern: e.target.value })
                    }
                    placeholder="Specific pattern (not 'student makes a mistake')"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Student level & Phase 2</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Student level
                </label>
                <div className="flex gap-4">
                  {LEVELS.map((lvl) => (
                    <label
                      key={lvl}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="student_level"
                        checked={studentLevel === lvl}
                        onChange={() => setStudentLevel(lvl)}
                      />
                      {lvl}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={phase2Required}
                    onChange={(e) => setPhase2Required(e.target.checked)}
                  />
                  Require Phase 2 (intent declaration)
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  On for exercises with non-trivial implementation decisions.
                  Off when the spec essentially determines the code.
                </p>
              </div>
            </CardContent>
          </Card>

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle>Publish</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasReviewed}
                  onChange={(e) => setHasReviewed(e.target.checked)}
                />
                I&apos;ve reviewed the scaffolding above.
              </label>
              <p className="text-xs text-muted-foreground">
                The Publish button is enabled once you&apos;ve either edited at
                least one field or explicitly confirmed review.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  onClick={publish}
                  disabled={!canPublish}
                  variant="default"
                >
                  {publishing ? "Publishing…" : "Publish exercise"}
                </Button>
                {publishedId && (
                  <span className="text-sm text-green-700">
                    Published as <code className="font-mono">{publishedId}</code>.
                    Student view:{" "}
                    <a
                      href={`/exercise/${publishedId}`}
                      className="underline text-blue-700"
                    >
                      /exercise/{publishedId}
                    </a>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
