// Web Worker that runs Pyodide. Handles interactive stdin via a
// SharedArrayBuffer + Atomics.wait — the main thread fills the buffer
// when the student types a line, the worker thread blocks here until
// it does. This is what makes Python's sync input() actually pause.
//
// SAB layout (1024 bytes total):
//   [0..3]   Int32 signal — 0 = empty, 1 = filled, 2 = EOF
//   [4..7]   Int32 length — bytes of UTF-8 input that follow
//   [8..]    Uint8 input bytes
//
// Loaded by /src/lib/run-python.ts via `new Worker("/pyodide-worker.js")`.

/* eslint-disable */

self.addEventListener("error", (e) => {
  self.postMessage({
    type: "fatal",
    text: "worker error: " + (e.message || "(no message)"),
  });
});
self.addEventListener("unhandledrejection", (e) => {
  self.postMessage({
    type: "fatal",
    text:
      "worker unhandled rejection: " +
      (e.reason && e.reason.message ? e.reason.message : String(e.reason)),
  });
});

const PYODIDE_VERSION = "0.27.7";
const PYODIDE_INDEX_URL =
  "https://cdn.jsdelivr.net/pyodide/v" + PYODIDE_VERSION + "/full/";

try {
  importScripts(PYODIDE_INDEX_URL + "pyodide.js");
} catch (err) {
  self.postMessage({
    type: "fatal",
    text:
      "importScripts failed: " +
      (err && err.message ? err.message : String(err)),
  });
}

let pyodide = null;
let inputView = null;
let inputBytes = null;

async function init(buffer) {
  inputView = new Int32Array(buffer);
  inputBytes = new Uint8Array(buffer);
  pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });

  // isatty: true on stdin/stdout — without it Pyodide's input() probes
  // stdin with ioctl() (TIOCGWINSZ etc.) and the pipe-style fallback
  // returns ESPIPE → "OSError: [Errno 29] I/O error". Marking these as
  // terminals takes the tty-aware path, which doesn't seek.
  //
  // `write` rather than `batched` so partial writes (e.g. the prompt of
  // input("Hello: ") which has no trailing newline) reach the UI
  // immediately instead of sitting in a buffer.
  const decoder = new TextDecoder();
  pyodide.setStdout({
    isatty: true,
    write: (bytes) => {
      self.postMessage({ type: "stdout", text: decoder.decode(bytes) });
      return bytes.length;
    },
  });
  pyodide.setStderr({
    isatty: true,
    write: (bytes) => {
      self.postMessage({ type: "stderr", text: decoder.decode(bytes) });
      return bytes.length;
    },
  });
  // Expose a JS-side blocking reader directly to Python. This bypasses
  // Python's stdin machinery entirely (TextIOWrapper / BufferedReader
  // do seek probes on sys.stdin that fail with ESPIPE in Pyodide's
  // emscripten layer, regardless of how setStdin is configured).
  pyodide.globals.set("_maieutic_block_for_input", () => {
    Atomics.store(inputView, 0, 0);
    self.postMessage({ type: "inputRequest" });
    Atomics.wait(inputView, 0, 0);
    const signal = Atomics.load(inputView, 0);
    if (signal === 2) return null; // EOF
    const len = Atomics.load(inputView, 1);
    // TextDecoder refuses to decode a view backed by SharedArrayBuffer,
    // so copy the bytes into a regular Uint8Array first.
    const copy = new Uint8Array(len);
    for (let i = 0; i < len; i++) copy[i] = inputBytes[8 + i];
    return decoder.decode(copy);
  });

  // Override builtins.input to use the JS bridge above. Prompt still
  // goes through sys.stdout so our setStdout `write` callback sees it.
  pyodide.runPython(`
import builtins, sys

def _maieutic_input(prompt=""):
    if prompt:
        sys.stdout.write(str(prompt))
        sys.stdout.flush()
    line = _maieutic_block_for_input()
    if line is None:
        raise EOFError("EOF when reading a line")
    return line

builtins.input = _maieutic_input
`);

  self.postMessage({ type: "ready" });
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    try {
      await init(msg.buffer);
    } catch (err) {
      self.postMessage({
        type: "fatal",
        text: err && err.message ? err.message : String(err),
      });
    }
    return;
  }
  if (msg.type === "run") {
    try {
      // Sync runPython, not runPythonAsync — the async wrapper uses
      // Asyncify, which interferes with our SharedArrayBuffer stdin
      // (Pyodide's coroutine resumes before our Atomics.wait actually
      // receives data, so Python sees an empty stream → EOFError).
      // Sync execution lets the worker thread truly block on Atomics.
      pyodide.runPython(msg.code);
      self.postMessage({ type: "done" });
    } catch (err) {
      self.postMessage({
        type: "error",
        text: err && err.message ? err.message : String(err),
      });
    }
  }
};
