// Centralized Anthropic SDK wrapper. Every Opus call in the app goes through
// here so we get uniform logging, a single place to tune max_tokens, and a
// retry helper for JSON-output prompts. Per Tech Spec §8.

import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

const MODEL = "claude-opus-4-7";

// Lazy-init so importing this module doesn't throw when ANTHROPIC_API_KEY is
// absent (e.g. in unit tests that mock the wrapper).
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

type MessageParam = Anthropic.Messages.MessageParam;

export interface CallOpusArgs {
  promptName: string;
  system: string;
  messages: MessageParam[];
  maxTokens?: number;
  expectJson?: boolean;
}

function log(record: Record<string, unknown>) {
  console.log(JSON.stringify({ src: "opus", ...record }));
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

export async function callOpus(args: CallOpusArgs): Promise<string> {
  const start = Date.now();
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: args.maxTokens ?? 4096,
    system: args.system,
    messages: args.messages,
  });
  const durationMs = Date.now() - start;
  const text = res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  log({
    prompt: args.promptName,
    model: MODEL,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    durationMs,
    stopReason: res.stop_reason,
  });
  return args.expectJson ? stripFences(text) : text;
}

export async function* streamOpus(args: {
  promptName: string;
  system: string;
  messages: MessageParam[];
  maxTokens?: number;
}): AsyncGenerator<string> {
  const start = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;
  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: args.maxTokens ?? 4096,
    system: args.system,
    messages: args.messages,
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    } else if (event.type === "message_start") {
      inputTokens = event.message.usage?.input_tokens ?? 0;
    } else if (event.type === "message_delta") {
      outputTokens = event.usage.output_tokens;
      stopReason = event.delta.stop_reason ?? stopReason;
    }
  }
  log({
    prompt: args.promptName,
    model: MODEL,
    inputTokens,
    outputTokens,
    durationMs: Date.now() - start,
    stopReason,
    streamed: true,
  });
}

// Calls Opus expecting a JSON response, parses against the supplied Zod
// schema, and on validation failure retries once with a corrective follow-up
// message. Throws on second failure with a descriptive error.
export async function callOpusAndParse<T>(
  args: CallOpusArgs & { schema: z.ZodType<T> },
): Promise<T> {
  const raw = await callOpus({ ...args, expectJson: true });
  const first = args.schema.safeParse(safeJson(raw));
  if (first.success) return first.data;

  const errorSummary = summarizeZodIssues(first.error.issues);
  log({
    prompt: args.promptName,
    event: "zod_validation_retry",
    errorSummary,
  });

  const correctiveMessages: MessageParam[] = [
    ...args.messages,
    { role: "assistant", content: raw },
    {
      role: "user",
      content: `Your previous output failed validation: ${errorSummary}\n\nPlease output valid JSON per the schema, with no preamble or code fences.`,
    },
  ];
  const retryRaw = await callOpus({
    ...args,
    messages: correctiveMessages,
    promptName: `${args.promptName}:retry`,
    expectJson: true,
  });
  const second = args.schema.safeParse(safeJson(retryRaw));
  if (second.success) return second.data;

  const secondSummary = summarizeZodIssues(second.error.issues);
  throw new Error(
    `Opus prompt "${args.promptName}" produced invalid JSON twice.\n` +
      `First failure: ${errorSummary}\n` +
      `Second failure: ${secondSummary}\n` +
      `Second raw output (first 500 chars): ${retryRaw.slice(0, 500)}`,
  );
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { __parseError: err instanceof Error ? err.message : String(err), raw };
  }
}

function summarizeZodIssues(issues: z.core.$ZodIssue[]): string {
  return issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ");
}

export { MODEL };
