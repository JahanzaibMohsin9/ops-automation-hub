"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitLeadReview } from "@/features/review/actions";
import {
  formatConfidencePercent,
  getReviewStatusClasses,
  reviewTaskStatusLabels,
} from "@/features/review/config";
import { initialReviewActionState } from "@/features/review/state";
import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "@/components/toast";

type LeadReviewFormProps = {
  reviewTaskId: string;
  status: "pending" | "approved" | "rejected";
  score: {
    numericScore: number;
    fitLabel: "high_fit" | "medium_fit" | "low_fit";
    reasoning: string;
    confidenceScore: number;
    missingFields: string[];
  };
};

export function LeadReviewForm({
  reviewTaskId,
  status,
  score,
}: LeadReviewFormProps) {
  const [state, formAction, pending] = useActionState(
    submitLeadReview,
    initialReviewActionState
  );
  const { showToast } = useToast();
  const approveButtonRef = useRef<HTMLButtonElement | null>(null);
  const rejectButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const canResolve = status === "pending";

  useEffect(() => {
    if (!state.message) {
      return;
    }

    showToast(state.message, state.status === "error" ? "error" : "success");
  }, [showToast, state.message, state.status]);

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
        approveButtonRef.current?.click();
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

  return (
    <>
      <ConfirmModal
        open={showRejectConfirm}
        title="Mark this lead low priority?"
        description="This review task will be resolved as low priority and the lead will stop moving through the qualified follow-up path."
        confirmLabel="Mark low priority"
        variant="danger"
        isLoading={pending}
        onConfirm={() => {
          setShowRejectConfirm(false);
          rejectButtonRef.current?.click();
        }}
        onCancel={() => setShowRejectConfirm(false)}
      />

      <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.22em] text-stone-500 uppercase">
            Lead review
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
            Validate the score before the lead moves downstream
          </h3>
          <p className="mt-3 text-sm leading-7 text-stone-600">
            Reviewers can tune the score, fit label, and reasoning, then decide
            whether the lead should continue to follow-up or be marked low
            priority.
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

      <form action={formAction} className="mt-6 space-y-5">
        <input type="hidden" name="reviewTaskId" value={reviewTaskId} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
              Score
            </span>
            <input
              type="number"
              name="numericScore"
              min={0}
              max={100}
              step={1}
              defaultValue={score.numericScore}
              disabled={!canResolve}
              className="mt-2 w-full rounded-2xl border border-stone-900/15 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-400 disabled:bg-stone-50"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
              Fit label
            </span>
            <select
              name="fitLabel"
              defaultValue={score.fitLabel}
              disabled={!canResolve}
              className="mt-2 w-full rounded-2xl border border-stone-900/15 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-400 disabled:bg-stone-50"
            >
              <option value="high_fit">High fit</option>
              <option value="medium_fit">Medium fit</option>
              <option value="low_fit">Low fit</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
            Reviewer reasoning
          </span>
          <textarea
            name="reasoning"
            defaultValue={score.reasoning}
            rows={6}
            disabled={!canResolve}
            className="mt-2 w-full rounded-2xl border border-stone-900/15 bg-white px-4 py-3 text-sm leading-7 text-stone-900 outline-none transition focus:border-amber-400 disabled:bg-stone-50"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
            Missing fields
          </span>
          <input
            type="text"
            name="missingFields"
            defaultValue={score.missingFields.join(", ")}
            disabled={!canResolve}
            className="mt-2 w-full rounded-2xl border border-stone-900/15 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-amber-400 disabled:bg-stone-50"
          />
          <p className="mt-2 text-xs text-stone-500">
            Separate items with commas or line breaks.
          </p>
        </label>

        <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
            <span>
              Confidence <strong>{formatConfidencePercent(score.confidenceScore)}</strong>
            </span>
            <span className="text-stone-300">•</span>
            <span>{score.missingFields.length} missing field(s)</span>
            <span className="text-stone-300">•</span>
            <span>`Ctrl/Cmd + Enter` qualifies</span>
            <span className="text-stone-300">•</span>
            <span>`Ctrl/Cmd + .` marks low priority</span>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
          <div className="flex flex-wrap gap-3">
            <button
              ref={approveButtonRef}
              type="submit"
              name="intent"
              value="approve"
              disabled={!canResolve || pending}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {pending ? "Saving..." : "Approve for follow-up"}
            </button>
            <button
              type="button"
              disabled={!canResolve || pending}
              onClick={() => setShowRejectConfirm(true)}
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {pending ? "Saving..." : "Mark low priority"}
            </button>
            <button
              ref={rejectButtonRef}
              type="submit"
              name="intent"
              value="reject"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
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
                ? "Approve qualified leads for follow-up or reject them into low-priority routing."
                : "This lead review task is already resolved.")}
          </p>
        </div>
      </form>
      </section>
    </>
  );
}
