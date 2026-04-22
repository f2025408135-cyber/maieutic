"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// Monaco hits the DOM and can't SSR — load it only on the client.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-[#1e1e1e] flex items-center justify-center text-sm text-[#858585]">
      loading editor…
    </div>
  ),
});

type MonacoProps = ComponentProps<typeof MonacoEditor>;

// Phase 3 hard requirement (Tech Spec §Phase 4 task — Monaco config):
// autocomplete / ghost text / parameter hints / word-based suggestions all
// OFF. The tool exists to train the student to write code themselves.
const DISABLED_ASSIST_OPTIONS: MonacoProps["options"] = {
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  parameterHints: { enabled: false },
  wordBasedSuggestions: "off",
  tabCompletion: "off",
  inlineSuggest: { enabled: false },
  acceptSuggestionOnEnter: "off",
  snippetSuggestions: "none",
  minimap: { enabled: false },
  fontSize: 14,
  scrollBeyondLastLine: false,
  lineNumbersMinChars: 3,
  padding: { top: 8 },
};

export interface PythonEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly: boolean;
  height?: string;
  /** Text to overlay when the editor is in its locked Phase 1/2 state. */
  lockNotice?: string;
}

export function PythonEditor({
  value,
  onChange,
  readOnly,
  height = "100%",
  lockNotice,
}: PythonEditorProps) {
  return (
    <div className="relative h-full w-full bg-[#1e1e1e]">
      <MonacoEditor
        language="python"
        value={value}
        theme="vs-dark"
        onChange={(v) => onChange?.(v ?? "")}
        height={height}
        options={{
          ...DISABLED_ASSIST_OPTIONS,
          readOnly,
          domReadOnly: readOnly,
        }}
      />
      {readOnly && lockNotice && (
        <div className="absolute inset-0 bg-[#1e1e1e]/70 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
          <div className="bg-[#252526]/95 border border-[#3e3e42] rounded px-4 py-3 text-sm text-[#858585] shadow-sm max-w-sm text-center">
            {lockNotice}
          </div>
        </div>
      )}
    </div>
  );
}
