"use client";

import { useActionState, useEffect } from "react";
import { saveLeadScoringSettings } from "@/features/settings/actions";
import { initialLeadScoringSettingsActionState } from "@/features/settings/state";
import { DEFAULT_LEAD_SCORING_CRITERIA } from "@/features/leads/scoring";
import { useToast } from "@/components/toast";

type LeadScoringSettingsCardProps = {
  currentCriteria: string | null;
};

export function LeadScoringSettingsCard({
  currentCriteria,
}: LeadScoringSettingsCardProps) {
  const [state, formAction, pending] = useActionState(
    saveLeadScoringSettings,
    initialLeadScoringSettingsActionState
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.message) {
      return;
    }

    showToast(state.message, state.status === "error" ? "error" : "success");
  }, [showToast, state.message, state.status]);

  return (
    <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
      <p className="text-sm font-semibold tracking-[0.24em] text-stone-500 uppercase">
        Lead scoring
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight">
        ICP guidance
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
        This text is injected into the lead scoring prompt so each workspace can tune
        what counts as a strong fit for the MVP demo.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="criteria"
            className="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase"
          >
            ICP criteria
          </label>
          <textarea
            id="criteria"
            name="criteria"
            rows={10}
            disabled={pending}
            defaultValue={currentCriteria ?? DEFAULT_LEAD_SCORING_CRITERIA}
            className="mt-2 w-full rounded-3xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm leading-7 text-stone-800 outline-none transition focus:border-stone-900/30"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {pending ? "Saving..." : "Save lead scoring settings"}
          </button>
          <p className="text-xs leading-6 text-stone-500">
            Leave the default copy in place if you want the shared MVP ICP.
          </p>
        </div>

        {state.message ? (
          <p
            className={`text-sm leading-6 ${
              state.status === "error" ? "text-rose-700" : "text-emerald-700"
            }`}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
