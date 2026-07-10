"use client";

interface BaseProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  maxLength?: number;
  /** Current length, for the character counter. */
  value?: string;
}

const labelRow = (label?: string, required?: boolean) =>
  label ? (
    <span className="mb-1.5 block text-sm font-medium text-foreground">
      {label}
      {required && <span className="ml-0.5 text-primary">*</span>}
    </span>
  ) : null;

function Meta({
  hint,
  error,
  value,
  maxLength,
}: Pick<BaseProps, "hint" | "error" | "value" | "maxLength">) {
  const showCounter = typeof maxLength === "number";
  if (!hint && !error && !showCounter) return null;
  return (
    <div className="mt-1.5 flex items-start justify-between gap-3">
      <span className={`text-xs ${error ? "text-red-400" : "text-muted"}`}>
        {error || hint || ""}
      </span>
      {showCounter && (
        <span
          className={`shrink-0 text-xs tabular-nums ${
            (value?.length ?? 0) > maxLength! ? "text-red-400" : "text-muted"
          }`}
        >
          {value?.length ?? 0}/{maxLength}
        </span>
      )}
    </div>
  );
}

const fieldClasses = (error?: string | null) =>
  `w-full rounded-xl border bg-white/[0.03] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/60 outline-none transition-all focus:border-primary/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-primary/20 ${
    error ? "border-red-500/50" : "border-white/10"
  }`;

export function Input({
  label,
  hint,
  error,
  required,
  maxLength,
  className = "",
  ...rest
}: BaseProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {labelRow(label, required)}
      <input
        maxLength={maxLength}
        className={`${fieldClasses(error)} ${className}`}
        {...rest}
      />
      <Meta hint={hint} error={error} value={rest.value as string} maxLength={maxLength} />
    </label>
  );
}

export function Textarea({
  label,
  hint,
  error,
  required,
  maxLength,
  rows = 4,
  className = "",
  ...rest
}: BaseProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      {labelRow(label, required)}
      <textarea
        rows={rows}
        maxLength={maxLength}
        className={`${fieldClasses(error)} resize-y ${className}`}
        {...rest}
      />
      <Meta hint={hint} error={error} value={rest.value as string} maxLength={maxLength} />
    </label>
  );
}
