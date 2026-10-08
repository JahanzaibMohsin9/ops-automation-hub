"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitDocumentReview } from "@/features/review/actions";
import {
  formatConfidencePercent,
  formatReviewFieldLabel,
  getReviewStatusClasses,
  reviewTaskStatusLabels,
} from "@/features/review/config";
import { initialReviewActionState } from "@/features/review/state";
import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "@/components/toast";

type ReviewField = {
  id: string;
  fieldName: string;
  fieldValue: string | null;
  confidenceScore: number;
  sourceSnippet: string | null;
  reviewerOverrideValue: string | null;
  isOverridden: boolean;
};

type DocumentReviewFormProps = {
  reviewTaskId: string;
  status: "pending" | "approved" | "rejected";
  fields: ReviewField[];
};

export function DocumentReviewForm({
  reviewTaskId,
  status,
  fields,
}: DocumentReviewFormProps) {
  const [state, formAction, pending] = useActionState(
    submitDocumentReview,
    initialReviewActionState
  );
  const { showToast } = useToast();
  const approveButtonRef = useRef<HTMLButtonElement | null>(null);
  const rejectButtonRef = useRef<HTMLButtonElement | null>(null);
  const editApproveButtonRef = useRef<HTMLButtonElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const canResolve = status === "pending";

  // Toast on completion
  useEffect(() => {
    if (state.status === "success" && state.message) {
      showToast(state.message, "success");
    } else if (state.status === "error" && state.message) {
      showToast(state.message, "error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.message]);

  useEffect(() => {
    if (!canResolve) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || pending) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) {
          editApproveButtonRef.current?.click();
        } else {
          approveButtonRef.current?.click();
        }
        return;
      }

      if (event.key === ".") {
        event.preventDefault();
        setShowRejectConfirm(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canResolve, pending]);

  function handleConfirmedReject() {
    setShowRejectConfirm(false);
    rejectButtonRef.current?.click();
  }

  return (
    <>
      <ConfirmModal
        open={showRejectConfirm}
        title="Reject this extraction?"
        description="The extracted record will be marked as rejected and removed from the export queue. This cannot be undone."
        confirmLabel="Reject extraction"
        variant="danger"
        isLoading={pending}
        onConfirm={handleConfirmedReject}
        onCancel={() => setShowRejectConfirm(false)}
      />

      <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.22em] text-stone-500 uppercase">
              Review action
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
              Validate extracted fields before handoff
            </h3>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              Low-confidence fields stay editable so reviewers can correct the extracted output before approval.
            </p>
          </div>
          <span
            className={`inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ${getReviewStatusClasses(
              status
            )}`}
          >
            {reviewTaskStatusLabels[status]}
          </span>
        </div>

        <form ref={formRef} action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="reviewTaskId" value={reviewTaskId} />

        <div className="space-y-3">
          {fields.map((field) => {
            const isEditable = canResolve && (field.confidenceScore < 0.85 || field.isOverridden);
            const effectiveValue = field.isOverridden
              ? field.reviewerOverrideValue ?? ""
              : field.fieldValue ?? "";

            return (
              <article
                key={field.id}
                className={`rounded-2xl border p-4 ${
                  field.confidenceScore < 0.85
                    ? "border-amber-200 bg-amber-50/70"
                    : "border-stone-900/10 bg-stone-50"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold capitalize text-stone-900">
                      {formatReviewFieldLabel(field.fieldName)}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Confidence {formatConfidencePercent(field.confidenceScore)}
                    </p>
                  </div>
                  {field.isOverridden ? (
                    <span className="inline-flex w-fit rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-sky-700 uppercase">
                      Reviewer override
                    </span>
                  ) : null}
                </div>

                {isEditable ? (
                  <label className="mt-4 block">
                    <span className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
                      Corrected value
                    </span>
                    <input
                      type="text"
                      name={`field:${field.id}`}
                      defaultValue={effectiveValue}
                      className="mt-2 w-full rounded-2xl border border-stone-900/15 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-400"
                    />
                  </label>
                ) : (
                  <div className="mt-4 rounded-2xl border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-700">
                    {effectiveValue || "Unknown"}
                  </div>
                )}

                <details className="mt-4 rounded-2xl border border-stone-900/10 bg-white px-4 py-3">
                  <summary className="cursor-pointer text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
                    Source snippet
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                    {field.sourceSnippet ?? "No supporting snippet was captured for this field."}
                  </p>
                </details>
              </article>
            );
          })}
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
          <p className="text-xs text-stone-500">
            Shortcuts: `Ctrl/Cmd + Enter` approve, `Ctrl/Cmd + Shift + Enter`
            save edits + approve, `Ctrl/Cmd + .` reject.
          </p>
            <div className="flex flex-wrap gap-3">
              <button
                ref={approveButtonRef}
                type="submit"
                name="intent"
                value="approve"
                disabled={!canResolve || pending}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {pending ? "Saving..." : "Approve"}
              </button>
              {/* Reject fires the confirm modal; actual submit button is hidden */}
              <button
                type="button"
                onClick={() => setShowRejectConfirm(true)}
                disabled={!canResolve || pending}
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {pending ? "Saving..." : "Reject"}
              </button>
              {/* Hidden real reject submit button, triggered programmatically after confirm */}
              <button
                ref={rejectButtonRef}
                type="submit"
                name="intent"
                value="reject"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
              <button
                ref={editApproveButtonRef}
                type="submit"
                name="intent"
                value="edit_approve"
                disabled={!canResolve || pending}
                className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {pending ? "Saving..." : "Save edits + approve"}
              </button>
            </div>

          <p
            className={`text-sm leading-6 ${
              state.status === "error"
                ? "text-rose-700"
                : state.status === "success"
                  ? "text-emerald-700"
                  : "text-stone-500"
            }`}
          >
            {state.message ||
              (canResolve
                ? "Approve as-is, reject the extraction, or save corrections before approval."
                : "This review task is already resolved. Approved records can be exported below.")}
          </p>

          {status === "approved" ? (
            <div className="flex flex-wrap gap-3">
              <a
                href={`/api/review-tasks/${reviewTaskId}/export?format=json`}
                onClick={() => showToast("JSON export started", "info")}
                className="rounded-full border border-stone-900/15 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-900/30"
              >
                Export JSON
              </a>
              <a
                href={`/api/review-tasks/${reviewTaskId}/export?format=csv`}
                onClick={() => showToast("CSV export started", "info")}
                className="rounded-full border border-stone-900/15 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-900/30"
              >
                Export CSV
              </a>
            </div>
          ) : null}
        </div>
      </form>
    </section>
    </>
  );
}
