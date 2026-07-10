"use client";

import { useRef, useState } from "react";
import { ProgressBar } from "./ProgressBar";

interface DropzoneProps {
  label?: string;
  accept: string;
  /** "video" shows a <video> preview; "image" shows an <img> preview. */
  kind: "video" | "image";
  file: File | null;
  onFile: (file: File | null) => void;
  /** Max size in MB; a file over this is rejected with an inline error. */
  maxMB?: number;
  required?: boolean;
  /** 0–100 while uploading; omit/undefined to hide the bar. */
  progress?: number;
  hint?: string;
}

function humanSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Drag-and-drop / click upload zone with inline preview, size validation
 *  and an optional progress bar. */
export function Dropzone({
  label,
  accept,
  kind,
  file,
  onFile,
  maxMB,
  required,
  progress,
  hint,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const accept_ = (f: File) => {
    if (maxMB && f.size > maxMB * 1024 * 1024) {
      setError(`File is ${humanSize(f.size)} — max ${maxMB} MB.`);
      return;
    }
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    onFile(f);
  };

  const clear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setError(null);
    onFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const uploading = typeof progress === "number" && progress < 100;

  return (
    <div>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-foreground">
          {label}
          {required && <span className="ml-0.5 text-primary">*</span>}
        </span>
      )}

      {file ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-3">
            {kind === "image" && previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="preview"
                className="h-16 w-16 shrink-0 rounded-xl object-cover"
              />
            ) : kind === "video" && previewUrl ? (
              <video
                src={previewUrl}
                className="h-16 w-24 shrink-0 rounded-xl bg-black object-cover"
                muted
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted">{humanSize(file.size)}</p>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={clear}
                className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-white/10 hover:text-red-400"
              >
                Remove
              </button>
            )}
          </div>
          {typeof progress === "number" && (
            <div className="mt-3">
              <ProgressBar pct={progress} label={uploading ? "Uploading" : "Uploaded"} />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) accept_(f);
          }}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-all ${
            dragging
              ? "border-primary bg-primary/10"
              : error
                ? "border-red-500/50 bg-red-500/5"
                : "border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]"
          }`}
        >
          <span className="text-2xl">{kind === "video" ? "🎞️" : "🖼️"}</span>
          <span className="text-sm text-foreground">
            <span className="font-medium text-primary">Click to upload</span> or drag & drop
          </span>
          <span className="text-xs text-muted">
            {hint ?? accept.replaceAll(",", ", ")}
            {maxMB ? ` · up to ${maxMB} MB` : ""}
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) accept_(f);
        }}
      />
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}
