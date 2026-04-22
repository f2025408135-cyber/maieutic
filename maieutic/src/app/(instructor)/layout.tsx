import Link from "next/link";

export default function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-20">
        <div className="px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-2 h-2 rounded-full bg-foreground" />
            <span className="font-semibold tracking-tight">Maieutic</span>
            <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
              · instructor
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/authoring">Author</NavLink>
            <NavLink href="/live">Live</NavLink>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      {children}
    </Link>
  );
}
