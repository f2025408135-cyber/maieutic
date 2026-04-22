import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-3 text-center">
        <div className="text-xs text-muted-foreground font-mono">404</div>
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="text-sm text-muted-foreground">
          That exercise or session doesn&apos;t exist. Go back to the live
          dashboard or author a new exercise.
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <Link
            href="/live"
            className="inline-flex items-center justify-center rounded-md border px-4 h-9 text-sm hover:bg-muted/60"
          >
            Live dashboard
          </Link>
          <Link
            href="/authoring"
            className="inline-flex items-center justify-center rounded-md bg-foreground text-background px-4 h-9 text-sm hover:bg-foreground/90"
          >
            Author
          </Link>
        </div>
      </div>
    </main>
  );
}
