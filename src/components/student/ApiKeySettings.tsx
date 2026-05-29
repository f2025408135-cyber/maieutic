"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  let expires = "";
  if (value && value.trim() !== "") {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    expires = "; expires=" + date.toUTCString();
  } else {
    // Delete cookie
    expires = "; expires=Thu, 01 Jan 1970 00:00:00 UTC";
  }
  document.cookie = name + "=" + encodeURIComponent(value || "") + expires + "; path=/; SameSite=Lax";
}

function getCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const nameEQ = name + "=";
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === " ") c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
  }
  return "";
}

export function ApiKeySettings() {
  const [open, setOpen] = React.useState(false);
  const [geminiKey, setGeminiKey] = React.useState("");
  const [openrouterKey, setOpenrouterKey] = React.useState("");
  const [anthropicKey, setAnthropicKey] = React.useState("");

  // Load from cookies on mount or when dialog opens
  React.useEffect(() => {
    if (open) {
      setGeminiKey(getCookie("gemini_api_key"));
      setOpenrouterKey(getCookie("openrouter_api_key"));
      setAnthropicKey(getCookie("anthropic_api_key"));
    }
  }, [open]);

  const handleSave = () => {
    setCookie("gemini_api_key", geminiKey);
    setCookie("openrouter_api_key", openrouterKey);
    setCookie("anthropic_api_key", anthropicKey);
    setOpen(false);
    // Reload page to apply changes immediately
    window.location.reload();
  };

  const handleClear = () => {
    setCookie("gemini_api_key", "");
    setCookie("openrouter_api_key", "");
    setCookie("anthropic_api_key", "");
    setGeminiKey("");
    setOpenrouterKey("");
    setAnthropicKey("");
    setOpen(false);
    window.location.reload();
  };

  const isGeminiSaved = geminiKey.trim() !== "";
  const isOpenRouterSaved = openrouterKey.trim() !== "";
  const isAnthropicSaved = anthropicKey.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="text-xs px-2.5 py-1 rounded border border-[#3e3e42] bg-[#252526] text-[#d4d4d4] hover:bg-[#2d2d30] transition-colors inline-flex items-center gap-1.5 focus:outline-none focus:border-[#569cd6] cursor-pointer"
        title="Configure API Keys"
      >
        <span>⚙️</span>
        <span>API Keys</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-[#1e1e1e] border border-[#3e3e42] text-[#d4d4d4]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[#f5f5f5] flex items-center gap-2">
            <span>⚙️</span> API Keys Setup
          </DialogTitle>
          <DialogDescription className="text-xs text-[#858585] leading-relaxed">
            Enter your API keys below. They are saved **locally in your browser cookies** and override backend defaults. Leave blank to use server keys.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2 text-xs">
          {/* Gemini */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-gray-300">Google Gemini Key (Recommended & Free)</label>
              {isGeminiSaved ? (
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Saved</span>
              ) : (
                <span className="text-[10px] text-[#858585] bg-[#252526] px-1.5 py-0.5 rounded border border-[#3e3e42]">Using Server Key</span>
              )}
            </div>
            <Input
              type="password"
              placeholder="AIzaSy..."
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="bg-[#252526] border-[#3e3e42] focus:border-[#569cd6] text-xs text-[#d4d4d4] placeholder:text-[#5a5a5a] h-9"
            />
            <p className="text-[10px] text-[#858585]">
              Get a free key at:{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[#569cd6] hover:underline"
              >
                Google AI Studio API Key Creator
              </a>
            </p>
          </div>

          {/* OpenRouter */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-gray-300">OpenRouter Key (Free Models Access)</label>
              {isOpenRouterSaved ? (
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Saved</span>
              ) : (
                <span className="text-[10px] text-[#858585] bg-[#252526] px-1.5 py-0.5 rounded border border-[#3e3e42]">Using Server Key</span>
              )}
            </div>
            <Input
              type="password"
              placeholder="sk-or-v1-..."
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              className="bg-[#252526] border-[#3e3e42] focus:border-[#569cd6] text-xs text-[#d4d4d4] placeholder:text-[#5a5a5a] h-9"
            />
            <p className="text-[10px] text-[#858585]">
              Get a key at:{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[#569cd6] hover:underline"
              >
                OpenRouter Dashboard
              </a>
            </p>
          </div>

          {/* Anthropic */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-gray-300">Anthropic Claude Key (Paid Option)</label>
              {isAnthropicSaved ? (
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Saved</span>
              ) : (
                <span className="text-[10px] text-[#858585] bg-[#252526] px-1.5 py-0.5 rounded border border-[#3e3e42]">Using Server Key</span>
              )}
            </div>
            <Input
              type="password"
              placeholder="sk-ant-..."
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              className="bg-[#252526] border-[#3e3e42] focus:border-[#569cd6] text-xs text-[#d4d4d4] placeholder:text-[#5a5a5a] h-9"
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 border-t border-[#3e3e42] pt-4 mt-2">
          <Button
            variant="destructive"
            onClick={handleClear}
            className="text-xs border border-transparent bg-red-950/20 text-red-400 hover:bg-red-900/30"
          >
            Clear Keys
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="text-xs bg-transparent border-[#3e3e42] text-[#d4d4d4] hover:bg-[#252526]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="text-xs bg-[#569cd6] text-black hover:bg-[#569cd6]/80"
            >
              Save Keys
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
