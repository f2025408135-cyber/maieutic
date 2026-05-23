// Centralized Anthropic/Gemini/OpenRouter SDK/REST wrapper.
// Every LLM call in the app goes through here so we get uniform logging,
// a single place to tune max_tokens, retry helper for JSON-output prompts,
// and automatic fallback routing to active free/paid models.

import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

const MODEL = "claude-opus-4-7"; // Preserved for compatibility

export interface CallOpusArgs {
  promptName: string;
  system: string;
  messages: Anthropic.Messages.MessageParam[];
  maxTokens?: number;
  expectJson?: boolean;
}

interface LlmTarget {
  name: string;
  provider: "anthropic" | "gemini" | "openrouter";
  model: string;
  apiKey: string;
}

function log(record: Record<string, unknown>) {
  console.log(JSON.stringify({ src: "opus-router", ...record }));
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

// Helper to get all configured LLM providers in fallback order
function getTargets(): LlmTarget[] {
  const targets: LlmTarget[] = [];

  // 1. Anthropic (Paid/Existing option)
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && !anthropicKey.includes("your-key-here") && anthropicKey.trim() !== "") {
    targets.push({
      name: "Anthropic",
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
      apiKey: anthropicKey,
    });
  }

  // 2. Google Gemini (Native Free tier option)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.trim() !== "") {
    targets.push({
      name: "Google Gemini",
      provider: "gemini",
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      apiKey: geminiKey,
    });
  }

  // 3. OpenRouter (Free models chain option)
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey && openrouterKey.trim() !== "") {
    const freeModels = [
      "google/gemini-2.5-flash:free",
      "deepseek/deepseek-chat:free",
      "meta-llama/llama-3-8b-instruct:free",
      "qwen/qwen-2.5-72b-instruct:free",
    ];
    for (const model of freeModels) {
      targets.push({
        name: `OpenRouter (${model})`,
        provider: "openrouter",
        model: model,
        apiKey: openrouterKey,
      });
    }
  }

  return targets;
}

let _anthropicClient: Anthropic | null = null;
function getAnthropicClient(apiKey: string): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
}

// Maps Anthropic message params to Gemini contents format
function mapMessagesToGemini(messages: Anthropic.Messages.MessageParam[]) {
  return messages.map((m) => {
    const role = m.role === "assistant" ? "model" : "user";
    let text = "";
    if (typeof m.content === "string") {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = m.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
    }
    return {
      role,
      parts: [{ text }],
    };
  });
}

// Maps Anthropic messages to standard chat completion format
function mapMessagesToOpenRouter(system: string, messages: Anthropic.Messages.MessageParam[]) {
  const result: any[] = [];
  if (system) {
    result.push({ role: "system", content: system });
  }
  for (const m of messages) {
    let content = "";
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
    }
    result.push({
      role: m.role,
      content,
    });
  }
  return result;
}

async function callTarget(target: LlmTarget, args: CallOpusArgs): Promise<string> {
  const maxTokens = args.maxTokens ?? 4096;

  if (target.provider === "anthropic") {
    const res = await getAnthropicClient(target.apiKey).messages.create({
      model: target.model,
      max_tokens: maxTokens,
      system: args.system,
      messages: args.messages,
    });
    const text = res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return args.expectJson ? stripFences(text) : text;
  }

  if (target.provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${target.model}:generateContent?key=${target.apiKey}`;
    const body: any = {
      contents: mapMessagesToGemini(args.messages),
      systemInstruction: {
        parts: [{ text: args.system }],
      },
      generationConfig: {
        maxOutputTokens: maxTokens,
      },
    };

    if (args.expectJson) {
      body.generationConfig.responseMimeType = "application/json";
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error("Invalid response shape from Gemini API");
    }
    return args.expectJson ? stripFences(text) : text;
  }

  if (target.provider === "openrouter") {
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const body: any = {
      model: target.model,
      messages: mapMessagesToOpenRouter(args.system, args.messages),
      max_tokens: maxTokens,
    };

    if (args.expectJson) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${target.apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Maieutic",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenRouter API error (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new Error("Invalid response shape from OpenRouter API");
    }
    return args.expectJson ? stripFences(text) : text;
  }

  throw new Error(`Unknown provider: ${target.provider}`);
}

export async function callOpus(args: CallOpusArgs): Promise<string> {
  const targets = getTargets();
  if (targets.length === 0) {
    throw new Error(
      "No LLM providers configured. Please set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY in your environment variables."
    );
  }

  const errors: string[] = [];
  const start = Date.now();

  for (const target of targets) {
    try {
      log({
        event: "routing_attempt",
        prompt: args.promptName,
        provider: target.provider,
        model: target.model,
      });

      const text = await callTarget(target, args);

      log({
        event: "routing_success",
        prompt: args.promptName,
        provider: target.provider,
        model: target.model,
        durationMs: Date.now() - start,
      });

      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`LlmTarget ${target.name} failed: ${msg}. Trying next provider...`);
      errors.push(`${target.name}: ${msg}`);
    }
  }

  throw new Error(
    `All LLM routing targets failed:\n${errors.map((e) => ` - ${e}`).join("\n")}`
  );
}

export async function* streamOpus(args: {
  promptName: string;
  system: string;
  messages: Anthropic.Messages.MessageParam[];
  maxTokens?: number;
}): AsyncGenerator<string> {
  // Compatible generator that resolves the fallbacks and yields the complete text
  const text = await callOpus(args);
  yield text;
}

// Calls LLM expecting a JSON response, parses against the supplied Zod
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

  const correctiveMessages: Anthropic.Messages.MessageParam[] = [
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
    `LLM prompt "${args.promptName}" produced invalid JSON twice.\n` +
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
