"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
  /** true while rendering within the exit animation */
  exiting?: boolean;
};

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    // Start exit animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    // Remove after animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = `toast-${Date.now()}-${++counterRef.current}`;
      setToasts((prev) => [...prev, { id, message, variant }]);

      // Auto-dismiss after 3 s
      setTimeout(() => dismiss(id), 3000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Toaster display ──────────────────────────────────────────────────────────

const variantConfig: Record<
  ToastVariant,
  { icon: React.ElementType; bg: string; border: string; text: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle2,
    bg: "bg-white",
    border: "border-emerald-200",
    text: "text-stone-900",
    iconColor: "text-emerald-500",
  },
  error: {
    icon: XCircle,
    bg: "bg-white",
    border: "border-rose-200",
    text: "text-stone-900",
    iconColor: "text-rose-500",
  },
  info: {
    icon: Info,
    bg: "bg-white",
    border: "border-stone-200",
    text: "text-stone-700",
    iconColor: "text-amber-500",
  },
};

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2"
    >
      {toasts.map((toast) => {
        const cfg = variantConfig[toast.variant];
        const Icon = cfg.icon;

        return (
          <div
            key={toast.id}
            role="status"
            className={[
              "pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-stone-900/10",
              cfg.bg,
              cfg.border,
              toast.exiting ? "toast-exit" : "toast-enter",
            ].join(" ")}
            style={{ minWidth: 260, maxWidth: 360 }}
          >
            <Icon className={`h-4 w-4 shrink-0 ${cfg.iconColor}`} />
            <p className={`flex-1 text-sm font-semibold ${cfg.text}`}>
              {toast.message}
            </p>
            <button
              aria-label="Dismiss notification"
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 rounded p-0.5 text-stone-400 transition hover:text-stone-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
