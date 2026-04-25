import { NextResponse } from "next/server";
import { z } from "zod";
import { callOpusAndParse } from "@/lib/opus/client";
import {
  PHASE2_CHAT_SYSTEM,
  buildPhase2ChatUserMessage,
} from "@/lib/opus/prompts/phase2-chat";
import { Phase2ChatOutput, Phase2Data, Phase1Data } from "@/lib/opus/schemas";
import {
  appendPhase2Exchange,
  getExercise,
  getSession,
} from "@/lib/sessions";
import { getLang } from "@/lib/i18n/server";
import { langDirective } from "@/lib/i18n/prompt";

const Body = z.object({
  message: z.string().min(1).max(5_000),
});

export async function POST(
  req: Request,
  ctx: RouteContext<"/api/session/[sid]/chat">,
) {
  const { sid } = await ctx.params;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", details: err instanceof Error ? err.message : "" },
      { status: 400 },
    );
  }

  const session = await getSession(sid);
  if (session.currentPhase !== 2) {
    return NextResponse.json(
      { error: "wrong_phase", currentPhase: session.currentPhase },
      { status: 409 },
    );
  }

  const exercise = await getExercise(session.exerciseId);
  const phase1 = Phase1Data.parse(session.phase1Data);
  const phase2 = Phase2Data.parse(session.phase2Data);
  const lang = await getLang();

  let chat;
  try {
    chat = await callOpusAndParse({
      promptName: "phase2-chat",
      system: PHASE2_CHAT_SYSTEM + langDirective(lang, ["response"]),
      messages: [
        {
          role: "user",
          content: buildPhase2ChatUserMessage({
            exercise,
            specText: phase1.finalSpecText ?? "",
            currentCode: phase2.currentCode,
            recentExchanges: phase2.opusExchanges,
            studentMessage: body.message,
          }),
        },
      ],
      maxTokens: 1024,
      schema: Phase2ChatOutput,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "opus_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }

  const exchange = {
    timestamp: new Date().toISOString(),
    studentMessage: body.message,
    opusMode: chat.mode,
    opusResponse: chat.response,
  };
  await appendPhase2Exchange(sid, exchange);

  return NextResponse.json({ exchange });
}
