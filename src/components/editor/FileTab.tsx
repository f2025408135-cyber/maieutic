// Single active VSCode-style file tab. Used on CodeFrame-based pages and
// on the exercise detail page to keep the IDE aesthetic consistent.

export function FileTabBar({ fileName }: { fileName: string }) {
  return (
    <div className="flex items-stretch bg-[#2d2d30] border-b border-[#252526] shrink-0">
      <div
        className="flex items-center gap-2 px-4 py-2 text-[13px] border-t-2"
        style={{
          backgroundColor: "#1e1e1e",
          color: "#d4d4d4",
          borderTopColor: "#007acc",
        }}
      >
        <FileIcon />
        <span>{fileName}</span>
        <span className="text-[#858585] ml-1">×</span>
      </div>
    </div>
  );
}

function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M13 4.5L9.5 1H3.5v14H13V4.5Z"
        stroke="#6ba5d9"
        strokeWidth="1"
      />
      <path d="M9.5 1v3.5H13" stroke="#6ba5d9" strokeWidth="1" />
    </svg>
  );
}
