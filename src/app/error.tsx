"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        src: "error-boundary",
        message: error.message,
        digest: error.digest,
      }),
    );
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-4">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground font-mono">
            Something broke.
          </div>
          <h1 className="text-xl font-semibold">Unhandled error</h1>
        </div>
        <pre className="text-sm bg-muted/40 border rounded p-3 whitespace-pre-wrap break-words">
          {error.message}
        </pre>
        {error.digest && (
          <div className="text-xs text-muted-foreground font-mono">
            digest: {error.digest}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={reset} variant="default">
            Try again
          </Button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border px-4 h-9 text-sm hover:bg-muted/60"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
