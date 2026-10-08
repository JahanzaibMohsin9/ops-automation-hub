"use client";

import { useActionState, useEffect } from "react";
import { AlertCircle, Loader2, RefreshCcw } from "lucide-react";
import { retryDocumentProcessing } from "@/features/documents/actions";
import { initialDocumentRetryActionState } from "@/features/documents/state";
import { useToast } from "@/components/toast";

export function DocumentRetryPanel({
  documentId,
  processingStatus,
}: {
  documentId: string;
  processingStatus: string;
}) {
  const [state, formAction, pending] = useActionState(
    retryDocumentProcessing,
    initialDocumentRetryActionState
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.message) {
      return;
    }

    showToast(state.message, state.status === "error" ? "error" : "success");
  }, [showToast, state.message, state.status]);

  const helperText =
    processingStatus === "failed" || processingStatus === "ocr_required"
      ? "Retry the extraction pipeline from the beginning without duplicating stored records."
      : "Re-run the extraction pipeline from the beginning. Existing extracted records will be replaced by the latest run.";

  return (
    <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-stone-900">Manual reprocess</p>
          <p className="mt-1 text-sm leading-6 text-stone-600">{helperText}</p>
        </div>
        <form action={formAction} className="flex flex-col items-start gap-2 sm:items-end">
          <input type="hidden" name="documentId" value={documentId} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            {pending ? "Reprocessing..." : "Reprocess"}
          </button>
          {state.message ? (
            <p
              className={[
                "inline-flex items-center gap-1.5 text-xs font-semibold",
                state.status === "error" ? "text-rose-600" : "text-emerald-700",
              ].join(" ")}
            >
              {state.status === "error" ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : null}
              {state.message}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
