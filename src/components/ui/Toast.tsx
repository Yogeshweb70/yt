"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastApi {
  toast: (t: Omit<Toast, "id">) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Access the toast API. Must be used within <ToastProvider>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const ICON: Record<ToastKind, string> = { success: "✓", error: "✕", info: "i" };
const ACCENT: Record<ToastKind, string> = {
  success: "border-green-500/30 bg-green-500/10 text-green-300",
  error: "border-red-500/30 bg-red-500/10 text-red-300",
  info: "border-primary/30 bg-primary/10 text-primary",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq.current;
      setToasts((prev) => [...prev, { ...t, id }]);
      setTimeout(() => remove(id), 5000);
    },
    [remove],
  );

  const api: ToastApi = {
    toast,
    success: (title, message) => toast({ kind: "success", title, message }),
    error: (title, message) => toast({ kind: "error", title, message }),
    info: (title, message) => toast({ kind: "info", title, message }),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-white/10 bg-background/95 p-4 shadow-2xl backdrop-blur-md animate-[toastIn_0.3s_cubic-bezier(0.16,1,0.3,1)]"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${ACCENT[t.kind]}`}
            >
              {ICON[t.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t.title}</p>
              {t.message && <p className="mt-0.5 break-words text-xs text-muted">{t.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="text-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <style jsx global>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
