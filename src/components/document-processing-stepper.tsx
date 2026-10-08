import { getDocumentPipelineSteps } from "@/features/documents/progress";
import type {
  DocumentProcessingStatus,
  DocumentUploadStatus,
  ReviewTaskStatus,
} from "@/generated/prisma/client";

const stepStateClasses = {
  complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
  current: "border-amber-200 bg-amber-50 text-amber-800",
  upcoming: "border-stone-200 bg-white text-stone-500",
  attention: "border-rose-200 bg-rose-50 text-rose-700",
  skipped: "border-stone-200 bg-stone-100 text-stone-500",
} as const;

const markerStateClasses = {
  complete: "border-emerald-500 bg-emerald-500",
  current: "border-amber-500 bg-amber-400",
  upcoming: "border-stone-300 bg-white",
  attention: "border-rose-500 bg-rose-500",
  skipped: "border-stone-300 bg-stone-200",
} as const;

export function DocumentProcessingStepper(props: {
  uploadStatus: DocumentUploadStatus;
  processingStatus: DocumentProcessingStatus;
  hasExtractedPages: boolean;
  hasStructuredRecord: boolean;
  reviewTaskStatus: ReviewTaskStatus | null;
}) {
  const steps = getDocumentPipelineSteps(props);

  return (
    <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
      <p className="text-sm font-semibold tracking-[0.22em] text-stone-500 uppercase">
        Processing stages
      </p>
      <h3 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
        Real-time pipeline progress
      </h3>
      <p className="mt-3 text-sm leading-7 text-stone-600">
        Each stage reflects the latest stored state from upload through review and export.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
        {steps.map((step, index) => (
          <article
            key={step.id}
            className={`rounded-2xl border p-4 ${stepStateClasses[step.state]}`}
          >
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={`mt-1 inline-flex h-4 w-4 rounded-full border-2 ${markerStateClasses[step.state]}`}
                />
                {index < steps.length - 1 ? (
                  <span className="mt-2 h-10 w-px bg-stone-200" />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-semibold tracking-[0.14em] uppercase">
                    {step.label}
                  </p>
                  <span className="text-[11px] font-semibold tracking-[0.14em] uppercase">
                    {step.state.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6">{step.description}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
