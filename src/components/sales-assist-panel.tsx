"use client";

import { useActionState, useState } from "react";
import {
  generateFollowUpDraft,
  generateLeadSummary,
  generateMeetingBrief,
} from "@/features/leads/actions";
import { initialSalesAssistActionState } from "@/features/leads/state";
import { useToast } from "@/components/toast";

import {
  Sparkles,
  FileText,
  Mail,
  Users,
  Copy,
  CheckCircle2,
  RefreshCcw,
  AlertCircle,
  Loader2,
  Zap,
  Clock,
} from "lucide-react";

type ArtifactCard = {
  type: "summary" | "followup" | "brief";
  title: string;
  description: string;
  content?: string;
  modelUsed?: string;
  promptVersion?: string;
  generatedAt?: string;
};

type SalesAssistPanelProps = {
  leadId: string;
  isReady: boolean;
  cards: ArtifactCard[];
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  return (
    <button
      type="button"
      title={copied ? "Copied!" : "Copy to clipboard"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          showToast("Copied to clipboard", "success");
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
          showToast("Failed to copy — please try selecting the text manually.", "error");
        }
      }}
      className="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-white px-3 py-1.5 text-[10px] font-bold tracking-widest text-stone-500 uppercase transition-all hover:border-stone-900/20 hover:text-stone-900 active:scale-95 shadow-sm"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          <span>Copied ✓</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy Draft</span>
        </>
      )}
    </button>
  );
}

function SalesAssistCard({
  leadId,
  card,
  disabled,
  action,
}: {
  leadId: string;
  card: ArtifactCard;
  disabled: boolean;
  action: (
    state: typeof initialSalesAssistActionState,
    payload: FormData
  ) => Promise<typeof initialSalesAssistActionState>;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialSalesAssistActionState
  );

  const Icon = card.type === "summary" ? Users : card.type === "followup" ? Mail : FileText;

  return (
    <article className="group rounded-[1.5rem] border border-stone-900/5 bg-stone-50/50 p-6 transition-all duration-300 hover:bg-white hover:shadow-xl hover:shadow-stone-900/5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-stone-400 shadow-sm transition-colors duration-200 group-hover:text-amber-500">
             <Icon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-stone-900">{card.title}</h4>
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-stone-400 uppercase">
               {card.generatedAt ? (
                 <span className="flex items-center gap-1">
                   <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                   Synced {card.generatedAt}
                 </span>
               ) : (
                 <span className="flex items-center gap-1">
                   <Clock className="h-2.5 w-2.5" />
                   Pending Generation
                 </span>
               )}
            </div>
          </div>
        </div>
        {card.content && <CopyButton value={card.content} />}
      </div>

      <div className="mt-5">
        {card.content ? (
          <div className="space-y-4">
            <div className="rounded-[1.25rem] border border-stone-900/10 bg-white p-5 shadow-inner">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-stone-700">
                {card.content}
              </pre>
            </div>
            <div className="flex items-center justify-between text-[9px] font-bold tracking-widest text-stone-400 uppercase">
               <span>{card.modelUsed}</span>
               <span>v{card.promptVersion}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-[1.25rem] border border-dashed border-stone-200 bg-stone-100/50 p-6 text-center">
            <p className="text-xs font-medium text-stone-500 italic max-w-xs mx-auto">
              {card.description}
            </p>
          </div>
        )}
      </div>

      <form action={formAction} className="mt-6 flex items-center justify-between gap-4">
        <input type="hidden" name="leadId" value={leadId} />
        <button
          type="submit"
          disabled={disabled || pending}
          className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-[11px] font-bold text-white transition-all duration-300 enabled:hover:scale-[1.02] enabled:hover:bg-stone-800 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 shadow-lg shadow-stone-900/10"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : card.content ? (
            <RefreshCcw className="h-3 w-3" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {pending ? "Generating…" : card.content ? "Regenerate" : "Generate"}
        </button>

        {state.message && (
          <div className={[
            "flex items-center gap-2 text-[10px] font-bold uppercase tracking-tight",
            state.status === "error" ? "text-rose-500" : "text-emerald-500"
          ].join(" ")}>
            {state.status === "error" ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            {state.message}
          </div>
        )}
      </form>
    </article>
  );
}

export function SalesAssistPanel({
  leadId,
  isReady,
  cards,
}: SalesAssistPanelProps) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-amber-900/10 bg-white/40 p-1 backdrop-blur-sm shadow-xl shadow-amber-900/5">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200" />

      <div className="p-6 md:p-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div className="space-y-1">
             <div className="inline-flex items-center gap-2 rounded-md bg-amber-100/50 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-amber-600 uppercase">
                AI Pipeline
             </div>
             <h2 className="text-2xl font-bold tracking-tight text-stone-900">AI Sales Tools</h2>
             <p className="text-sm text-stone-500">Automated lead extraction and communication artifacts.</p>
          </div>
           <div className={[
             "inline-flex h-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase border",
             isReady ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
           ].join(" ")}>
              <div className={["h-1.5 w-1.5 rounded-full", isReady ? "bg-emerald-500" : "bg-amber-500"].join(" ")} />
              {isReady ? "Pipeline Ready" : "Awaiting Score"}
           </div>
        </header>

        {!isReady && (
          <div className="mb-8 rounded-[1.5rem] border border-amber-200 bg-amber-50/50 p-6 flex items-start gap-4">
            <Zap className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">Score required</p>
              <p className="mt-1 text-xs text-amber-700 leading-relaxed">
                AI content generation requires a lead score. Wait for background enrichment to complete.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-6">
          <SalesAssistCard
            leadId={leadId}
            card={cards[0]}
            disabled={!isReady}
            action={generateLeadSummary}
          />
          <SalesAssistCard
            leadId={leadId}
            card={cards[1]}
            disabled={!isReady}
            action={generateFollowUpDraft}
          />
          <SalesAssistCard
            leadId={leadId}
            card={cards[2]}
            disabled={!isReady}
            action={generateMeetingBrief}
          />
        </div>
      </div>
    </section>
  );
}
