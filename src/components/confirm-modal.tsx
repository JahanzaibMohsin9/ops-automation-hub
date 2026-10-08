"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, AlertCircle, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the cancel button when modal opens (safer default for destructive actions)
  useEffect(() => {
    if (open) {
      cancelButtonRef.current?.focus();
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const isDanger = variant === "danger";
  const Icon = isDanger ? AlertTriangle : AlertCircle;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby={description ? "confirm-modal-description" : undefined}
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="modal-backdrop-enter absolute inset-0 bg-stone-950/40 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="modal-enter relative w-full max-w-md rounded-2xl border border-stone-900/10 bg-white shadow-2xl shadow-stone-900/20">
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-stone-900/5 p-6">
          <div
            className={[
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              isDanger ? "bg-rose-100" : "bg-stone-100",
            ].join(" ")}
          >
            <Icon
              className={`h-5 w-5 ${isDanger ? "text-rose-600" : "text-stone-600"}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-modal-title"
              className="text-base font-semibold text-stone-900"
            >
              {title}
            </h2>
            {description && (
              <p
                id="confirm-modal-description"
                className="mt-1.5 text-sm leading-relaxed text-stone-500"
              >
                {description}
              </p>
            )}
          </div>
          <button
            aria-label="Close"
            onClick={onCancel}
            className="shrink-0 rounded-lg p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 active:scale-95 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={[
              "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60",
              isDanger
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-stone-900 hover:bg-stone-800",
            ].join(" ")}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Working…
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
