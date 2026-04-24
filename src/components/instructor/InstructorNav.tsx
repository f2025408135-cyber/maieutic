import Link from "next/link";

export type InstructorTab = "live" | "cohorts";

export function InstructorNav({ current }: { current: InstructorTab }) {
  const items: { id: InstructorTab; href: string; label: string }[] = [
    { id: "live", href: "/live", label: "Live" },
    { id: "cohorts", href: "/cohorts", label: "Exercises" },
  ];
  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        const active = item.id === current;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`text-sm font-mono px-2.5 py-1 rounded transition-colors ${
              active
                ? "text-white bg-[#2d2d30]"
                : "text-[#858585] hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
