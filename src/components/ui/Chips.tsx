"use client";

import { useState, type KeyboardEvent } from "react";

interface ChipsProps {
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  max?: number;
  hint?: string;
}

/** Tag / multi-select input. Type + Enter (or comma) to add, click × to remove. */
export function Chips({ label, value, onChange, placeholder, max = 30, hint }: ChipsProps) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const tag = raw.trim().replace(/,$/, "");
    if (!tag || value.includes(tag) || value.length >= max) return;
    onChange([...value, tag]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-all focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2 py-1 text-xs text-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="text-muted hover:text-red-400"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted/60 outline-none"
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>{hint ?? "Press Enter or comma to add"}</span>
        <span className="tabular-nums">
          {value.length}/{max}
        </span>
      </div>
    </label>
  );
}
