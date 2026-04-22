// scripts/reset-demo.ts — one-command prep for the demo.
// Wipes the DB and replays the captured fixtures.

import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["tsx", "scripts/replay-fixtures.ts", "--wipe"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 0);
