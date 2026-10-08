"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  connectHubSpotPrivateApp,
  disconnectHubSpotConnection,
} from "@/features/hubspot/actions";
import { initialHubSpotConnectionActionState } from "@/features/hubspot/state";
import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "@/components/toast";
import {
  Settings,
  ShieldCheck,
  Building2,
  PlugZap,
  CheckCircle2,
  AlertCircle,
  Unplug,
  Info,
  Loader2,
} from "lucide-react";

type HubSpotConnectionCardProps = {
  envConfigured: boolean;
  isConnected: boolean;
  connectedAt?: string | null;
  accountName?: string | null;
  portalId?: string | null;
};

function formatConnectedAt(connectedAt?: string | null) {
  if (!connectedAt) {
    return null;
  }

  const parsed = new Date(connectedAt);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(parsed);
}

export function HubSpotConnectionCard({
  envConfigured,
  isConnected,
  connectedAt,
  accountName,
  portalId,
}: HubSpotConnectionCardProps) {
  const [connectState, connectAction, connectPending] = useActionState(
    connectHubSpotPrivateApp,
    initialHubSpotConnectionActionState
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(
    disconnectHubSpotConnection,
    initialHubSpotConnectionActionState
  );
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const disconnectSubmitRef = useRef<HTMLButtonElement | null>(null);
  const formattedConnectedAt = formatConnectedAt(connectedAt);
  const { showToast } = useToast();

  useEffect(() => {
    const message = disconnectState.message ?? connectState.message;

    if (!message) {
      return;
    }

    const hasError =
      disconnectState.status === "error" || connectState.status === "error";

    showToast(message, hasError ? "error" : "success");
  }, [
    showToast,
    connectState.message,
    connectState.status,
    disconnectState.message,
    disconnectState.status,
  ]);

  return (
    <>
      <ConfirmModal
        open={showDisconnectConfirm}
        title="Disconnect HubSpot?"
        description="All pending CRM sync jobs for this workspace will be cancelled. You can reconnect at any time."
        confirmLabel="Disconnect"
        variant="danger"
        isLoading={disconnectPending}
        onConfirm={() => {
          setShowDisconnectConfirm(false);
          disconnectSubmitRef.current?.click();
        }}
        onCancel={() => setShowDisconnectConfirm(false)}
      />

      <section className="rounded-lg border border-stone-900/10 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-md bg-stone-100 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-stone-500 uppercase">
            <PlugZap className="h-3 w-3 text-amber-500" />
            CRM Bridge
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-stone-900">
            HubSpot
          </h2>
          <p className="max-w-2xl text-sm text-stone-500 leading-6">
            Sync qualified leads into your CRM.
          </p>
        </div>

        <div className={[
          "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] uppercase border transition-all duration-500",
          isConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
          envConfigured ? "border-amber-200 bg-amber-50 text-amber-700" :
          "border-rose-200 bg-rose-50 text-rose-700"
        ].join(" ")}>
           <div className={[
             "h-1.5 w-1.5 rounded-full",
             isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" :
             envConfigured ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" :
             "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
           ].join(" ")} />
           {isConnected ? "Live Connection" : envConfigured ? "Protocol Ready" : "Missing Configuration"}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Connection Mode", val: "Private App Token", icon: ShieldCheck },
          { label: "Environment", val: envConfigured ? "Validated" : "Missing", icon: Settings },
          { label: "Target Account", val: accountName ?? "—", icon: Building2 },
          { label: "Portal Index", val: portalId ?? "—", icon: Info },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-stone-900/5 bg-stone-50/70 p-3">
            <dt className="flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-stone-400 uppercase">
              <item.icon className="h-3 w-3" />
              {item.label}
            </dt>
            <dd className="mt-2 truncate text-sm font-bold text-stone-900">
              {item.val}
            </dd>
          </div>
        ))}
      </dl>

      {formattedConnectedAt && (
        <p className="mt-3 text-xs font-medium text-stone-400">
          Authorized on {formattedConnectedAt}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form action={connectAction}>
          <button
            type="submit"
            disabled={!envConfigured || isConnected || connectPending}
            className="group relative flex w-full items-center justify-center rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-bold text-white transition enabled:hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-30 active:scale-95"
          >
            {connectPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Initialize Link
                <PlugZap className="ml-2 h-4 w-4 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>
        
        {isConnected && (
          <form action={disconnectAction}>
            {/* Hidden submit triggered after confirm */}
            <button
              ref={disconnectSubmitRef}
              type="submit"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
            <button
              type="button"
              disabled={disconnectPending}
              onClick={() => setShowDisconnectConfirm(true)}
              className="group flex w-full items-center justify-center rounded-lg border border-stone-900/10 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 transition hover:border-stone-900/20 hover:text-rose-600 active:scale-95"
            >
              {disconnectPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Terminate Link
                  <Unplug className="ml-2 h-4 w-4 opacity-0 transition-all group-hover:opacity-100" />
                </>
              )}
            </button>
          </form>
        )}
      </div>

      <div className={[
        "mt-4 p-3 rounded-lg border text-sm flex items-start gap-3 transition-all duration-500",
        (disconnectState.status === "error" || connectState.status === "error") ? "bg-rose-50 border-rose-100 text-rose-800" :
        (disconnectState.status === "success" || connectState.status === "success") ? "bg-emerald-50 border-emerald-100 text-emerald-800" :
        "bg-stone-50 border-stone-100 text-stone-600"
      ].join(" ")}>
        {(disconnectState.status === "error" || connectState.status === "error") ? <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" /> : 
         (disconnectState.status === "success" || connectState.status === "success") ? <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" /> :
         <Info className="h-5 w-5 shrink-0 mt-0.5 text-stone-400" />}
        <p className="leading-relaxed font-medium">
          {disconnectState.message || connectState.message || (
            envConfigured
              ? "Your environment is ready. Establish the link to start bi-directional lead synchronization."
              : "Authentication required. Configure HUBSPOT_PRIVATE_APP_TOKEN in your environment variables to continue."
          )}
        </p>
      </div>
    </section>
    </>
  );
}
