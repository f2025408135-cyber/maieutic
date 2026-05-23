import type { NextConfig } from "next";

// Cross-origin isolation is required for the Pyodide-in-a-Web-Worker
// runner to use SharedArrayBuffer (which is what makes Python's input()
// block synchronously while the main thread waits for the student to
// type). We scope the headers to the student exercise page so the rest
// of the app isn't constrained.
const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/exercise/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      {
        // The Pyodide worker needs its own COEP so it inherits the
        // cross-origin-isolated agent and SharedArrayBuffer is available
        // inside the worker thread. Without this the Worker constructor
        // succeeds but loadPyodide / SAB use throws an opaque error.
        source: "/pyodide-worker.js",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        // The C++ JSCPP worker uses SharedArrayBuffer the same way —
        // it must also be served with COEP.
        source: "/cpp-worker.js",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
