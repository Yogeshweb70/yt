"use client";

import { Input } from "@/components/ui";
import { PRIVACY_OPTIONS, type Privacy, type PublishMode } from "@/types/publishing";

interface Props {
  privacy: Privacy;
  onPrivacy: (p: Privacy) => void;
  mode: PublishMode;
  onMode: (m: PublishMode) => void;
  publishAt: string;
  onPublishAt: (v: string) => void;
  scheduleError?: string | null;
}

/** Privacy segmented control + publish-now/schedule toggle + datetime picker.
 *  Shared by all three create-video modals. */
export function PublishingControls({
  privacy,
  onPrivacy,
  mode,
  onMode,
  publishAt,
  onPublishAt,
  scheduleError,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Privacy */}
      <div>
        <span className="mb-1.5 block text-sm font-medium text-foreground">Privacy</span>
        <div className="grid grid-cols-3 gap-2">
          {PRIVACY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onPrivacy(o.value)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                privacy === o.value
                  ? "border-primary/60 bg-primary/10"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
              }`}
            >
              <span className="block text-sm font-medium text-foreground">{o.label}</span>
              <span className="block text-xs text-muted">{o.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Publish timing */}
      <div>
        <span className="mb-1.5 block text-sm font-medium text-foreground">Publish</span>
        <div className="grid grid-cols-2 gap-2">
          {(["now", "schedule"] as PublishMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                mode === m
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-white/10 bg-white/[0.02] text-muted hover:bg-white/[0.05]"
              }`}
            >
              {m === "now" ? "Publish immediately" : "Schedule"}
            </button>
          ))}
        </div>
      </div>

      {mode === "schedule" && (
        <Input
          label="Schedule date & time"
          type="datetime-local"
          value={publishAt}
          error={scheduleError}
          onChange={(e) => onPublishAt(e.target.value)}
        />
      )}
    </div>
  );
}

/** Converts a datetime-local value to an ISO string, or null. */
export function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
