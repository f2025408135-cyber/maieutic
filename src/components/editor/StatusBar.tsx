// VSCode-style status bar (blue) used across pages.

import * as React from "react";

export function StatusBar({
  left,
  right,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between bg-[#007acc] text-white text-[12px] px-4 py-1.5 font-mono shrink-0">
      <div className="flex items-center gap-5">{left}</div>
      <div className="flex items-center gap-5">{right}</div>
    </div>
  );
}
