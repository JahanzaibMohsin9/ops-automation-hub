"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { retryHubSpotSync } from "@/features/hubspot/actions";
import { initialHubSpotSyncActionState } from "@/features/hubspot/state";
import { useToast } from "@/components/toast";
import {
  ExternalLink,
  Settings,
  AlertCircle,
  Clock,
  RefreshCcw,
  Loader2,
  Lock,
} from "lucide-react";

type HubSpotSyncPanelProps = {
  leadId: string;
  leadStatus: string;
  workspaceConnected: boolean;
  syncRecord: {
    syncStatus: "pending" | "synced" | "failed" | "retrying";
    externalContactId?: string | null;
    errorMessage?: string | null;
    contactUrl?: string | null;
    lastSyncedAt?: string | null;
    retryCount: number;
  } | null;
};

function SyncBadge({ status }: { status: string }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold tracking-widest uppercase border",
        status === "synced"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : status === "failed"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
      ].join(" ")}
    >
      <div className={[
        "h-1.5 w-1.5 rounded-full",
        status === "synced" ? "bg-emerald-500" : status === "failed" ? "bg-rose-500" : "bg-amber-500"
      ].join(" ")} />
      {status}
    </span>
  );
}

export function HubSpotSyncPanel({
  leadId,
  leadStatus,
  workspaceConnected,
  syncRecord,
}: HubSpotSyncPanelProps) {
  const [state, formAction, pending] = useActionState(
    retryHubSpotSync,
    initialHubSpotSyncActionState
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.message) {
      return;
    }

    showToast(state.message, state.status === "error" ? "error" : "success");
  }, [showToast, state.message, state.status]);

  if (!workspaceConnected) {
    return (
      <section className="space-y-6">
        <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50/50 p-6 flex items-start gap-4">
          <Lock className="h-5 w-5 text-stone-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-stone-900">CRM connection required</p>
            <p className="mt-1 text-xs text-stone-500 leading-relaxed">
              Connect HubSpot in Settings before qualified leads can sync into the pipeline.
            </p>
          </div>
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-white px-5 py-2 text-[11px] font-bold text-stone-900 transition hover:bg-stone-50"
        >
          <Settings className="h-3 w-3" />
          Manage Integration
        </Link>
      </section>
    );
  }

  if (!syncRecord) {
    return (
       <div className="space-y-6">
          <div className="rounded-[1.5rem] border border-stone-100 bg-stone-50/50 p-6 flex items-start gap-4">
            <Clock className="h-5 w-5 text-stone-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-stone-900">
                {leadStatus === "qualified" ? "Awaiting sync" : "Awaiting qualification"}
              </p>
              <p className="mt-1 text-xs text-stone-500 leading-relaxed">
                {leadStatus === "qualified"
                  ? "This lead is qualified and will be pushed to HubSpot on the next sync."
                  : "Only leads marked as qualified are automatically pushed into HubSpot."}
              </p>
            </div>
          </div>
       </div>
    );
  }

  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between">
         <p className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">HubSpot Sync</p>
         <SyncBadge status={syncRecord.syncStatus} />
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="group rounded-[1.5rem] border border-stone-900/5 bg-stone-50/50 p-5 transition-colors hover:bg-white hover:shadow-xl hover:shadow-stone-900/5">
          <dt className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">Last Synced</dt>
          <dd className="mt-2 text-xs font-bold text-stone-900 tabular-nums">
            {syncRecord.lastSyncedAt ?? "—"}
          </dd>
        </div>
        <div className="group rounded-[1.5rem] border border-stone-900/5 bg-stone-50/50 p-5 transition-colors hover:bg-white hover:shadow-xl hover:shadow-stone-900/5">
          <dt className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">Retry Attempts</dt>
          <dd className="mt-2 text-xs font-bold text-stone-900 tabular-nums">{syncRecord.retryCount}/10</dd>
        </div>
        <div className="sm:col-span-2 group rounded-[1.5rem] border border-stone-900/5 bg-stone-50/50 p-5 transition-colors hover:bg-white">
          <dt className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">HubSpot Contact ID</dt>
          <dd className="mt-2 flex items-center justify-between gap-4">
             <code className="text-[11px] font-bold text-stone-700 bg-white border border-stone-900/5 px-2 py-1 rounded-lg truncate">
               {syncRecord.externalContactId ?? "Pending"}
             </code>
             {syncRecord.contactUrl && (
               <a
                 href={syncRecord.contactUrl}
                 target="_blank"
                 rel="noreferrer"
                 className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-white shadow-lg transition hover:scale-105 active:scale-95"
                 title="Open in HubSpot"
               >
                 <ExternalLink className="h-4 w-4" />
               </a>
             )}
          </dd>
        </div>
      </dl>

      {syncRecord.errorMessage && (
        <div className="rounded-[1.5rem] border border-rose-100 bg-rose-50 p-5">
           <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-rose-500" />
              <p className="text-[10px] font-bold tracking-widest text-rose-600 uppercase">Sync Error</p>
           </div>
           <p className="text-xs font-medium text-rose-800 leading-relaxed">{syncRecord.errorMessage}</p>
        </div>
      )}

      {syncRecord.syncStatus === "failed" && (
        <form action={formAction} className="flex items-center justify-between gap-4">
          <input type="hidden" name="leadId" value={leadId} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-[11px] font-bold text-white transition-all duration-300 hover:scale-[1.02] hover:bg-rose-500 disabled:opacity-30 active:scale-95 shadow-lg shadow-rose-900/10"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
            {pending ? "Retrying…" : "Retry Sync"}
          </button>
          
          {state.message && (
             <p className="text-[10px] font-bold uppercase tracking-tight text-stone-400">{state.message}</p>
          )}
        </form>
      )}
    </section>
  );
}
