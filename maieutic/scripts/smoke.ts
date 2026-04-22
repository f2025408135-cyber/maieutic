import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Put it in .env.local and rerun.");
    process.exit(1);
  }

  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 256,
    messages: [{ role: "user", content: "Reply with exactly: PONG" }],
  });

  console.log(JSON.stringify(res.content, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
