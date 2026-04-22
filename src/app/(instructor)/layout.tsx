// The shared Workbench chrome lives inside each page (it needs per-page
// tabs), so this layout is just a passthrough.

export default function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
