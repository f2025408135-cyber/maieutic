// Maieutic — runtime and compile-time schemas.
//
// Convention: internal storage types use camelCase and map directly to Prisma
// JSON fields. LLM output schemas keep the snake_case keys the model produces,
// with explicit converter functions at the boundary. Keeping the two shapes
// separate makes it obvious when we are trusting an LLM payload vs. trusting
// already-validated internal state.

import { z } from "zod";

// ─── Common enums ──────────────────────────────────────────────────────────

export const StudentLevel = z.enum(["week_1_2", "week_3_6", "week_7_plus"]);
export type StudentLevel = z.infer<typeof StudentLevel>;

// Curriculum unit — independent of StudentLevel. See src/lib/units.ts for
// the unit-to-level mapping.
export const UnitId = z.enum(["unit_1", "unit_2", "unit_3", "unit_4"]);
export type UnitId = z.infer<typeof UnitId>;

export const DivergenceCategory = z.enum(["drift", "revision", "bug"]);
export type DivergenceCategory = z.infer<typeof DivergenceCategory>;

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const Alignment = z.enum(["aligned", "partial", "diverged"]);
export type Alignment = z.infer<typeof Alignment>;

export const Source = z.enum(["opus", "instructor_edited", "instructor_added"]);
export type Source = z.infer<typeof Source>;

export const OpusMode = z.enum(["interrogative", "direct"]);
export type OpusMode = z.infer<typeof OpusMode>;

export const LiveSummaryFlag = z.enum([
  "help_requested",
  "alignment_failure",
  "proactive_revision",
  "stuck_signal",
  "high_performer",
]);
export type LiveSummaryFlag = z.infer<typeof LiveSummaryFlag>;

// ─── Exercise (storage) ────────────────────────────────────────────────────

export const SpecDimension = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().min(1),
  source: Source,
});
export type SpecDimension = z.infer<typeof SpecDimension>;

export const ExpectedDivergence = z.object({
  category: DivergenceCategory,
  pattern: z.string().min(1),
  source: Source,
});
export type ExpectedDivergence = z.infer<typeof ExpectedDivergence>;

// Used by the authoring trace (pre-edit Opus output). No `source` field,
// because tracing predates the instructor's edit classification.
export const OpusGeneratedDimension = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().min(1),
});
export type OpusGeneratedDimension = z.infer<typeof OpusGeneratedDimension>;

export const OpusGeneratedDivergence = z.object({
  category: DivergenceCategory,
  pattern: z.string().min(1),
});
export type OpusGeneratedDivergence = z.infer<typeof OpusGeneratedDivergence>;

// Shape of an Exercise record's JSON/scalar fields combined. The Prisma row
// itself stores these as individual columns; this schema validates the full
// logical record when we read or write it.
export const ExerciseRecord = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instructorPromptText: z.string().min(1),
  authoredAt: z.coerce.date(),
  publishedAt: z.coerce.date().nullable(),
  specGateDimensions: z.array(SpecDimension),
  expectedDivergences: z.array(ExpectedDivergence),
  phase2Required: z.boolean(),
  studentLevel: StudentLevel,
  unit: UnitId,
  opusGeneratedDimensions: z.array(OpusGeneratedDimension),
  opusGeneratedDivergences: z.array(OpusGeneratedDivergence),
  opusGeneratedPhase2Required: z.boolean(),
  opusGeneratedStudentLevel: StudentLevel,
});
export type ExerciseRecord = z.infer<typeof ExerciseRecord>;

// Authoring-time input (pre-publish, no publishedAt, no authoredAt). Used
// when the instructor edits Opus output before hitting Publish.
export const ExerciseAuthoringInput = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instructorPromptText: z.string().min(1),
  specGateDimensions: z.array(SpecDimension).min(1),
  expectedDivergences: z.array(ExpectedDivergence).min(1),
  phase2Required: z.boolean(),
  studentLevel: StudentLevel,
  // Optional at the boundary — createExercise derives from studentLevel
  // when absent so legacy demo/test scripts keep working.
  unit: UnitId.optional(),
  opusGeneratedDimensions: z.array(OpusGeneratedDimension),
  opusGeneratedDivergences: z.array(OpusGeneratedDivergence),
  opusGeneratedPhase2Required: z.boolean(),
  opusGeneratedStudentLevel: StudentLevel,
});
export type ExerciseAuthoringInput = z.infer<typeof ExerciseAuthoringInput>;

// ─── Phase 1 — spec gate ───────────────────────────────────────────────────

export const Phase1Iteration = z.object({
  timestamp: z.string(),
  studentSpecText: z.string(),
  opusQuestions: z.array(z.string()),
  gapsIdentified: z.array(z.string()), // dimension ids still unaddressed
  gapsAddressedThisRound: z.array(z.string()),
  emergentGaps: z
    .array(z.object({ description: z.string(), question: z.string() }))
    .default([]),
  passed: z.boolean(),
});
export type Phase1Iteration = z.infer<typeof Phase1Iteration>;

export const HelpRequest = z.object({
  timestamp: z.string(),
  stateAtRequest: z.record(z.string(), z.unknown()),
  message: z.string().default(""),
  resolution: z.string().nullable(),
});
export type HelpRequest = z.infer<typeof HelpRequest>;

export const Phase1Data = z.object({
  iterations: z.array(Phase1Iteration),
  finalSpecText: z.string().nullable(),
  instructorConfiguredDimensionsAddressed: z.array(z.string()),
  helpRequests: z.array(HelpRequest),
});
export type Phase1Data = z.infer<typeof Phase1Data>;

export const emptyPhase1Data = (): Phase1Data => ({
  iterations: [],
  finalSpecText: null,
  instructorConfiguredDimensionsAddressed: [],
  helpRequests: [],
});

// ─── Phase 2 — intent declaration ─────────────────────────────────────────

export const Phase2Data = z.object({
  planText: z.string(),
  submittedAt: z.string(),
});
export type Phase2Data = z.infer<typeof Phase2Data>;

// ─── Phase 3 — constrained writing ────────────────────────────────────────

export const Phase3Exchange = z.object({
  timestamp: z.string(),
  studentMessage: z.string(),
  opusMode: OpusMode,
  opusResponse: z.string(),
});
export type Phase3Exchange = z.infer<typeof Phase3Exchange>;

export const Phase3Revision = z.object({
  timestamp: z.string(),
  amendmentText: z.string(),
  justificationText: z.string(),
  // Older records may carry an Opus-generated follow-up question; new revisions
  // don't (the dropdown-based justification makes that round-trip redundant).
  opusQuestion: z.string().optional(),
  opusFollowupQuestion: z.string().nullable().optional(),
});
export type Phase3Revision = z.infer<typeof Phase3Revision>;

export const Phase3Data = z.object({
  opusExchanges: z.array(Phase3Exchange),
  revisions: z.array(Phase3Revision),
  currentCode: z.string(), // autosave target
  finalCode: z.string().nullable(),
  submittedAt: z.string().nullable(),
});
export type Phase3Data = z.infer<typeof Phase3Data>;

export const emptyPhase3Data = (): Phase3Data => ({
  opusExchanges: [],
  revisions: [],
  currentCode: "",
  finalCode: null,
  submittedAt: null,
});

// ─── Phase 4 — intent-diff review ─────────────────────────────────────────

export const Divergence = z.object({
  divergenceId: z.string(),
  initialClassification: DivergenceCategory,
  initialConfidence: Confidence,
  predictedJustification: z.string(), // instructor-visible
  studentFacingQuestion: z.string(), // student-visible
  evidenceFromSpec: z.string(),
  evidenceFromPlan: z.string().nullable(),
  evidenceFromCode: z.string(),
  // Post-hoc fields — populated after the student responds.
  studentResponse: z.string().nullable(),
  alignment: Alignment.nullable(),
  finalClassification: DivergenceCategory.nullable(),
  finalClassificationReason: z.string().nullable(),
  respondedAt: z.string().nullable(),
});
export type Divergence = z.infer<typeof Divergence>;

export const Phase4Data = z.object({
  divergences: z.array(Divergence),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type Phase4Data = z.infer<typeof Phase4Data>;

// ─── Live summaries ───────────────────────────────────────────────────────

export const LiveSummary = z.object({
  timestamp: z.string(),
  summaryText: z.string(),
  flags: z.array(LiveSummaryFlag),
});
export type LiveSummary = z.infer<typeof LiveSummary>;

// ─── Session events (discriminated union by kind) ─────────────────────────

export const SessionEventKind = z.enum([
  "phase_transition",
  "alignment_failure",
  "help_request",
  "help_resolved",
  "revision",
  "summary_refresh",
]);
export type SessionEventKind = z.infer<typeof SessionEventKind>;

export const PhaseTransitionPayload = z.object({
  from: z.number().int(),
  to: z.number().int(),
});
export type PhaseTransitionPayload = z.infer<typeof PhaseTransitionPayload>;

export const AlignmentFailurePayload = z.object({
  divergenceId: z.string(),
  prediction: z.string(),
  response: z.string(),
});
export type AlignmentFailurePayload = z.infer<typeof AlignmentFailurePayload>;

export const HelpRequestPayload = z.object({
  message: z.string(),
  phase: z.number().int(),
});
export type HelpRequestPayload = z.infer<typeof HelpRequestPayload>;

export const HelpResolvedPayload = z.object({
  phase: z.number().int(),
  count: z.number().int(),
});
export type HelpResolvedPayload = z.infer<typeof HelpResolvedPayload>;

export const RevisionPayload = z.object({
  amendmentText: z.string(),
  justificationText: z.string(),
});
export type RevisionPayload = z.infer<typeof RevisionPayload>;

export const SummaryRefreshPayload = z.object({
  summary: z.string(),
  flags: z.array(LiveSummaryFlag),
});
export type SummaryRefreshPayload = z.infer<typeof SummaryRefreshPayload>;

// Map from event kind → payload schema, for runtime dispatch when reading
// the opaque `payload` Json column.
export const SessionEventPayloadSchemaByKind = {
  phase_transition: PhaseTransitionPayload,
  alignment_failure: AlignmentFailurePayload,
  help_request: HelpRequestPayload,
  help_resolved: HelpResolvedPayload,
  revision: RevisionPayload,
  summary_refresh: SummaryRefreshPayload,
} as const;

export type SessionEventPayloadByKind = {
  phase_transition: PhaseTransitionPayload;
  alignment_failure: AlignmentFailurePayload;
  help_request: HelpRequestPayload;
  help_resolved: HelpResolvedPayload;
  revision: RevisionPayload;
  summary_refresh: SummaryRefreshPayload;
};

export function parseSessionEventPayload<K extends SessionEventKind>(
  kind: K,
  payload: unknown,
): SessionEventPayloadByKind[K] {
  const schema = SessionEventPayloadSchemaByKind[kind];
  return schema.parse(payload) as SessionEventPayloadByKind[K];
}

// ─── LLM output schemas (snake_case, as Opus emits) ───────────────────────

// 1. Scaffolding generation (Tech Spec §3.1)
const ScaffoldingDimensionOutput = z.object({
  id: z.string(),
  description: z.string(),
  rationale: z.string(),
});

const ScaffoldingDivergenceOutput = z.object({
  category: DivergenceCategory,
  pattern: z.string(),
});

export const ScaffoldingOutput = z.object({
  spec_gate_dimensions: z.array(ScaffoldingDimensionOutput).min(1),
  expected_divergences: z.array(ScaffoldingDivergenceOutput).min(1),
  phase_2_required: z.boolean(),
  student_level: StudentLevel,
  prompt_quality_note: z.string().nullable(),
});
export type ScaffoldingOutput = z.infer<typeof ScaffoldingOutput>;

// 2. Spec examiner (Tech Spec §4.1)
export const SpecExaminerOutput = z.object({
  gaps_addressed: z.array(z.string()),
  gaps_still_open: z.array(z.string()),
  emergent_gaps: z.array(
    z.object({ description: z.string(), question: z.string() }),
  ),
  questions: z.array(z.string()),
  passed: z.boolean(),
});
export type SpecExaminerOutput = z.infer<typeof SpecExaminerOutput>;

// 3. Intent-diff (Tech Spec §5.1)
const IntentDiffDivergenceOutput = z.object({
  divergence_id: z.string(),
  initial_classification: DivergenceCategory,
  initial_confidence: Confidence,
  predicted_justification: z.string(),
  student_facing_question: z.string(),
  evidence_from_spec: z.string(),
  evidence_from_plan: z.string().nullable(),
  evidence_from_code: z.string(),
});

export const IntentDiffOutput = z.object({
  divergences: z.array(IntentDiffDivergenceOutput),
});
export type IntentDiffOutput = z.infer<typeof IntentDiffOutput>;

// 4. Post-hoc re-classifier (Tech Spec §5.4)
export const PostHocOutput = z.object({
  alignment: Alignment,
  final_classification: DivergenceCategory,
  final_classification_reason: z.string(),
});
export type PostHocOutput = z.infer<typeof PostHocOutput>;

// 5. Live summary (Tech Spec §6.1)
export const LiveSummaryOutput = z.object({
  summary: z.string(),
  flags: z.array(LiveSummaryFlag),
});
export type LiveSummaryOutput = z.infer<typeof LiveSummaryOutput>;

// 6. Cohort narrative (Tech Spec §7.1)
export const CohortNarrativeOutput = z.object({
  narrative: z.string(),
  pattern_summary: z.string(),
  recommendation: z.string(),
  provisional: z.boolean(),
});
export type CohortNarrativeOutput = z.infer<typeof CohortNarrativeOutput>;

// 7. Phase-3 chat mode selector (Tech Spec §Phase 4 task 1)
export const Phase3ChatOutput = z.object({
  mode: OpusMode,
  response: z.string(),
});
export type Phase3ChatOutput = z.infer<typeof Phase3ChatOutput>;


// ─── LLM-output → internal-storage converters ────────────────────────────

export function scaffoldingOutputToAuthoringFields(
  out: ScaffoldingOutput,
): Pick<
  ExerciseAuthoringInput,
  | "specGateDimensions"
  | "expectedDivergences"
  | "phase2Required"
  | "studentLevel"
  | "opusGeneratedDimensions"
  | "opusGeneratedDivergences"
  | "opusGeneratedPhase2Required"
  | "opusGeneratedStudentLevel"
> {
  return {
    specGateDimensions: out.spec_gate_dimensions.map((d) => ({
      id: d.id,
      description: d.description,
      rationale: d.rationale,
      source: "opus" as const,
    })),
    expectedDivergences: out.expected_divergences.map((d) => ({
      category: d.category,
      pattern: d.pattern,
      source: "opus" as const,
    })),
    phase2Required: out.phase_2_required,
    studentLevel: out.student_level,
    opusGeneratedDimensions: out.spec_gate_dimensions,
    opusGeneratedDivergences: out.expected_divergences,
    opusGeneratedPhase2Required: out.phase_2_required,
    opusGeneratedStudentLevel: out.student_level,
  };
}

export function intentDiffOutputToDivergences(
  out: IntentDiffOutput,
): Divergence[] {
  return out.divergences.map((d) => ({
    divergenceId: d.divergence_id,
    initialClassification: d.initial_classification,
    initialConfidence: d.initial_confidence,
    predictedJustification: d.predicted_justification,
    studentFacingQuestion: d.student_facing_question,
    evidenceFromSpec: d.evidence_from_spec,
    evidenceFromPlan: d.evidence_from_plan,
    evidenceFromCode: d.evidence_from_code,
    studentResponse: null,
    alignment: null,
    finalClassification: null,
    finalClassificationReason: null,
    respondedAt: null,
  }));
}
