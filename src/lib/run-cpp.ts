export type RunEvent =
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "inputRequest" }
  | { type: "done" }
  | { type: "error"; text: string };

type WorkerMessage =
  | { type: "ready" }
  | { type: "fatal"; text: string }
  | RunEvent;

let worker: Worker | null = null;
let workerReady: Promise<void> | null = null;
let inputBuffer: SharedArrayBuffer | null = null;
let inputView: Int32Array | null = null;
let inputBytes: Uint8Array | null = null;

let activeListener: ((event: RunEvent) => void) | null = null;
let initRejector: ((err: Error) => void) | null = null;

function ensureWorker(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("cpp is browser-only"));
  }
  if (typeof SharedArrayBuffer === "undefined") {
    return Promise.reject(
      new Error(
        "SharedArrayBuffer unavailable — page must be cross-origin isolated",
      ),
    );
  }
  if (workerReady) return workerReady;

  worker = new Worker("/cpp-worker.js");
  inputBuffer = new SharedArrayBuffer(1024);
  inputView = new Int32Array(inputBuffer);
  inputBytes = new Uint8Array(inputBuffer);

  workerReady = new Promise<void>((resolve, reject) => {
    initRejector = reject;
    worker!.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === "ready") {
        resolve();
        return;
      }
      if (msg.type === "fatal") {
        reject(new Error(msg.text));
        worker = null;
        workerReady = null;
        return;
      }
      if (activeListener) activeListener(msg);
    };
    worker!.onerror = (e) => {
      reject(new Error(e.message || "worker error"));
    };
  });

  worker.postMessage({ type: "init", buffer: inputBuffer });
  return workerReady;
}

export function provideInput(text: string): void {
  if (!inputView || !inputBytes) return;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  if (bytes.length > 1016) {
    throw new Error("input too long (max 1016 bytes)");
  }
  inputBytes.set(bytes, 8);
  Atomics.store(inputView, 1, bytes.length);
  Atomics.store(inputView, 0, 1);
  Atomics.notify(inputView, 0);
}

export function provideEOF(): void {
  if (!inputView) return;
  Atomics.store(inputView, 0, 2);
  Atomics.notify(inputView, 0);
}

export async function runCpp(
  code: string,
  listener: (event: RunEvent) => void,
): Promise<void> {
  await ensureWorker();
  activeListener = (event) => {
    listener(event);
    if (event.type === "done" || event.type === "error") {
      activeListener = null;
    }
  };
  worker!.postMessage({ type: "run", code });
}

export function isCppLoaded(): boolean {
  return workerReady !== null;
}
