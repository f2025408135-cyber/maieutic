import { NextResponse } from "next/server";
import { z } from "zod";
import { callOpusAndParse } from "@/lib/opus/client";
import {
  SCAFFOLDING_SYSTEM,
  buildScaffoldingUserMessage,
} from "@/lib/opus/prompts/scaffolding";
import { ScaffoldingOutput } from "@/lib/opus/schemas";

const Body = z.object({
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(5000),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", details: err instanceof Error ? err.message : "" },
      { status: 400 },
    );
  }

  try {
    const scaffolding = await callOpusAndParse({
      promptName: "scaffolding",
      system: SCAFFOLDING_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildScaffoldingUserMessage(body.prompt, body.title),
        },
      ],
      maxTokens: 4096,
      schema: ScaffoldingOutput,
    });
    return NextResponse.json({ scaffolding });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: "scaffolding_failed", message },
      { status: 500 },
    );
  }
}
