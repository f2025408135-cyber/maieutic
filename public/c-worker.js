// public/c-worker.js
// Web Worker that runs JSCPP. Handles interactive stdin via a SharedArrayBuffer + Atomics.wait.

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

try {
  importScripts("https://cdn.jsdelivr.net/npm/JSCPP@2.0.9/dist/JSCPP.es5.min.js");
} catch (err) {
  self.postMessage({
    type: "fatal",
    text:
      "importScripts failed: " +
      (err && err.message ? err.message : String(err)),
  });
}

let inputView = null;
let inputBytes = null;
const decoder = new TextDecoder();

async function init(buffer) {
  inputView = new Int32Array(buffer);
  inputBytes = new Uint8Array(buffer);
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
      const config = {
        stdio: {
          write: (s) => {
            self.postMessage({ type: "stdout", text: s });
          },
          input: () => {
            // Signal main thread to request input
            Atomics.store(inputView, 0, 0);
            self.postMessage({ type: "inputRequest" });
            
            // Wait for main thread to notify us
            Atomics.wait(inputView, 0, 0);
            
            const signal = Atomics.load(inputView, 0);
            if (signal === 2) return ""; // EOF
            
            const len = Atomics.load(inputView, 1);
            const copy = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              copy[i] = inputBytes[8 + i];
            }
            const inputVal = decoder.decode(copy);
            return inputVal;
          }
        }
      };
      
      const exitCode = self.JSCPP.run(msg.code, "", config);
      self.postMessage({ type: "stdout", text: `\nProgram exited with code ${exitCode}\n` });
      self.postMessage({ type: "done" });
    } catch (err) {
      self.postMessage({
        type: "error",
        text: err && err.message ? err.message : String(err),
      });
    }
  }
};
