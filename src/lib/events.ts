// Module-scoped in-process event bus. The live-view SSE stream listens here
// so Route Handlers that mutate session state can push updates without going
// through the DB. Single-process assumption — fine for the MVP, first thing
// to replace for the pilot (per Tech Spec §9, §13).

import { EventEmitter } from "node:events";
import type { SessionEventKind } from "./opus/schemas";

export type SessionEventMessage = {
  sessionId: string;
  kind: SessionEventKind;
  payload: unknown;
  createdAt: Date;
};

class SessionEventBus extends EventEmitter {}

declare global {
  // eslint-disable-next-line no-var
  var __maieuticSessionEventBus: SessionEventBus | undefined;
}

export const sessionEventBus: SessionEventBus =
  globalThis.__maieuticSessionEventBus ??
  (globalThis.__maieuticSessionEventBus = new SessionEventBus());

// Raise listener cap so many open SSE connections + internal subscribers
// don't trigger the default-10 warning during a demo.
sessionEventBus.setMaxListeners(64);
