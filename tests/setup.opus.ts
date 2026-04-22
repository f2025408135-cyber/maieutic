import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    "ANTHROPIC_API_KEY not set — Opus-hitting tests cannot run without it.",
  );
}
