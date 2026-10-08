"use client";

import { useActionState, useEffect } from "react";
import { AlertCircle, Loader2, RefreshCcw, RotateCw } from "lucide-react";
import {
  retryLeadEnrichment,
  retryLeadScoring,
} from "@/features/leads/actions";
import { initialLeadRetryActionState } from "@/features/leads/state";
import { useToast } from "@/components/toast";

type LeadRetryActionsProps = {
  leadId: string;
  showEnrichmentRetry: boolean;
  showScoringRetry: boolean;
};

function RetryCard({
  leadId,
  title,
  description,
  action,
  icon,
  idleLabel,
  pendingLabel,
}: {
  leadId: string;
  title: string;
  description: string;
  action: typeof retryLeadEnrichment;
  icon: "enrichment" | "scoring";
  idleLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialLeadRetryActionState
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.message) {
      return;
    }

    showToast(state.message, state.status === "error" ? "error" : "success");
  }, [showToast, state.message, state.status]);

  return (
    <form
      action={formAction}
      className="rounded-[1.5rem] border border-stone-900/10 bg-stone-50/70 p-5"
    >
      <input type="hidden" name="leadId" value={leadId} />
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-stone-500 shadow-sm">
          {icon === "enrichment" ? (
            <RotateCw className="h-4 w-4" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">{title}</p>
          <p className="mt-1 text-xs leading-6 text-stone-600">{description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-[11px] font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          {pending ? pendingLabel : idleLabel}
        </button>
        {state.message ? (
          <span
            className={[
              "inline-flex items-center gap-1.5 text-[11px] font-semibold",
              state.status === "error" ? "text-rose-600" : "text-emerald-700",
            ].join(" ")}
          >
            {state.status === "error" ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : null}
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

export function LeadRetryActions({
  leadId,
  showEnrichmentRetry,
  showScoringRetry,
}: LeadRetryActionsProps) {
  if (!showEnrichmentRetry && !showScoringRetry) {
    return null;
  }

  return (
    <section className="rounded-[2.5rem] border border-stone-900/10 bg-white p-8 shadow-2xl shadow-stone-900/5">
      <div className="border-b border-stone-900/5 pb-6">
        <p className="text-[10px] font-bold tracking-[0.18em] text-stone-400 uppercase">
          Recovery
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
          Retry failed lead steps
        </h3>
        <p className="mt-2 text-sm leading-7 text-stone-600">
          These controls re-run the failed stage directly without creating a duplicate lead.
        </p>
      </div>

      <div className="mt-6 grid gap-4">
        {showEnrichmentRetry ? (
          <RetryCard
            leadId={leadId}
            title="Retry enrichment"
            description="Re-run the enrichment provider and refresh the latest company and contact context."
            action={retryLeadEnrichment}
            icon="enrichment"
            idleLabel="Retry enrichment"
            pendingLabel="Retrying enrichment..."
          />
        ) : null}

        {showScoringRetry ? (
          <RetryCard
            leadId={leadId}
            title="Retry scoring"
            description="Re-run AI scoring against the latest enrichment snapshot and replace any stale score output."
            action={retryLeadScoring}
            icon="scoring"
            idleLabel="Retry scoring"
            pendingLabel="Retrying scoring..."
          />
        ) : null}
      </div>
    </section>
  );
}
