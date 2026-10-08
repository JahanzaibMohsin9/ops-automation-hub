"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  disconnectSlackConnection,
  saveSlackSettings,
} from "@/features/slack/actions";
import { initialSlackConnectionActionState } from "@/features/slack/state";
import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "@/components/toast";
import {
  Bell,
  CheckCircle2,
  Hash,
  Info,
  Link,
  Loader2,
  Lock,
  MessageSquare,
  Network,
  Settings2,
  ShieldCheck,
  Unplug,
  Zap,
  AlertCircle,
} from "lucide-react";

type SlackConnectionCardProps = {
  envConfigured: boolean;
  isConnected: boolean;
  connectedAt?: string | null;
  channelName?: string | null;
  maskedWebhook?: string | null;
  usingStoredWebhook: boolean;
  defaultChannelName?: string;
  preferences: {
    qualifiedLead: boolean;
    reviewNeeded: boolean;
    crmSyncFailure: boolean;
    documentProcessingFailure: boolean;
  };
};

function formatConnectedAtLabel(connectedAt?: string | null) {
  if (!connectedAt) {
    return null;
  }

  const parsed = new Date(connectedAt);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function PreferenceToggle(props: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="group flex cursor-pointer items-start gap-3 rounded-lg border border-stone-900/5 bg-stone-50/70 p-3 transition hover:bg-white">
      <div className="relative flex h-5 w-5 shrink-0 items-center justify-center mt-1">
        <input
          type="checkbox"
          name={props.name}
          defaultChecked={props.defaultChecked}
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-lg border-2 border-stone-200 transition-all checked:border-amber-500 checked:bg-amber-500 hover:border-stone-400"
        />
        <CheckCircle2 className="absolute h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100 pointer-events-none" />
      </div>
      <div>
        <span className="block text-sm font-bold text-stone-900 group-hover:text-amber-700 transition-colors">
          {props.label}
        </span>
        <span className="mt-1 block text-[11px] leading-5 text-stone-500">
          {props.description}
        </span>
      </div>
    </label>
  );
}

export function SlackConnectionCard({
  envConfigured,
  isConnected,
  connectedAt,
  channelName,
  maskedWebhook,
  usingStoredWebhook,
  defaultChannelName,
  preferences,
}: SlackConnectionCardProps) {
  const [saveState, saveAction, savePending] = useActionState(
    saveSlackSettings,
    initialSlackConnectionActionState
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(
    disconnectSlackConnection,
    initialSlackConnectionActionState
  );
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const disconnectSubmitRef = useRef<HTMLButtonElement | null>(null);
  const connectedAtLabel = formatConnectedAtLabel(connectedAt);
  const { showToast } = useToast();

  useEffect(() => {
    const message = saveState.message ?? disconnectState.message;

    if (!message) {
      return;
    }

    const hasError =
      saveState.status === "error" || disconnectState.status === "error";

    showToast(message, hasError ? "error" : "success");
  }, [
    showToast,
    saveState.message,
    saveState.status,
    disconnectState.message,
    disconnectState.status,
  ]);

  return (
    <>
      <ConfirmModal
        open={showDisconnectConfirm}
        title="Disconnect Slack?"
        description="Slack alert notifications will stop immediately. Your preferences will be saved and can be re-enabled after reconnecting."
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
             <MessageSquare className="h-3 w-3 text-amber-500" />
             Notification Engine
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-stone-900">
            Slack Alerts
          </h2>
          <p className="max-w-2xl text-sm text-stone-500 leading-6">
            Send lead and document updates to your team channel.
          </p>
        </div>

        <div className={[
          "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] uppercase border transition-all duration-500",
          isConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700 font-bold" :
          envConfigured ? "border-amber-200 bg-amber-50 text-amber-700 font-bold" :
          "border-rose-200 bg-rose-50 text-rose-700 font-bold"
        ].join(" ")}>
           <div className={[
             "h-1.5 w-1.5 rounded-full",
             isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" :
             envConfigured ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" :
             "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
           ].join(" ")} />
           {isConnected ? "Linked" : envConfigured ? "Environment Ready" : "Terminal State: Unconfigured"}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Protocol", val: "Incoming Webhook", icon: Network },
          { label: "Target Route", val: channelName ?? "Undefined Path", icon: Hash },
          {
            label: "Origin",
            val: connectedAtLabel
              ? `Linked ${connectedAtLabel}`
              : usingStoredWebhook
                ? "Workspace Store"
                : envConfigured
                  ? "Environment Fallback"
                  : "Unknown",
            icon: Settings2,
          },
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

      <div className="mt-4 space-y-4">
        <form action={saveAction} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
             <label htmlFor="webhookUrl" className="flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-stone-400 uppercase">
                <Link className="h-3 w-3" />
                Endpoint URL
             </label>
             <input
               id="webhookUrl"
               type="url"
               name="webhookUrl"
               placeholder="https://hooks.slack.com/services/..."
               className="w-full rounded-lg border border-stone-900/10 bg-stone-50/30 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none transition focus:border-amber-400 focus:bg-white placeholder:text-stone-300"
             />
             <div className="flex items-center gap-2 text-[10px] font-medium text-stone-400 italic">
                <Lock className="h-2.5 w-2.5" />
                Masked: {maskedWebhook ?? "No active stream"}
             </div>
          </div>

          <div className="space-y-1.5">
             <label htmlFor="channelName" className="flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-stone-400 uppercase">
                <Hash className="h-3 w-3" />
                Identification Label
             </label>
             <input
               id="channelName"
               type="text"
               name="channelName"
               defaultValue={defaultChannelName}
               placeholder="#revenue-ops-alerts"
               className="w-full rounded-lg border border-stone-900/10 bg-stone-50/30 px-3 py-2.5 text-sm font-bold text-stone-900 outline-none transition focus:border-amber-400 focus:bg-white placeholder:text-stone-300"
             />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 border-b border-stone-900/5 pb-3">
             <Bell className="h-4 w-4 text-amber-500" />
             <h3 className="text-lg font-bold tracking-tight text-stone-900">Subscription Preferences</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <PreferenceToggle
              name="qualifiedLead"
              label="Pipeline Qualification"
              description="Events triggered when a lead crosses the deterministic score threshold."
              defaultChecked={preferences.qualifiedLead}
            />
            <PreferenceToggle
              name="reviewNeeded"
              label="Manual Routing"
              description="Alerts for leads requiring human intervention due to scoring ambiguity."
              defaultChecked={preferences.reviewNeeded}
            />
            <PreferenceToggle
              name="crmSyncFailure"
              label="Synchronization Errors"
              description="Telemetry alerts for broken HubSpot handshakes and payload rejections."
              defaultChecked={preferences.crmSyncFailure}
            />
            <PreferenceToggle
              name="documentProcessingFailure"
              label="Ingest Subsystem Health"
              description="Infrastructure monitoring for OCR pipeline stalls and conversion errors."
              defaultChecked={preferences.documentProcessingFailure}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={savePending}
            className="group relative flex items-center justify-center rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-bold text-white transition enabled:hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-30 active:scale-95"
          >
            {savePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Save Preferences
                <Zap className="ml-2 h-4 w-4 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1" />
              </>
            )}
          </button>
        </div>
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
              className="group flex items-center justify-center rounded-lg border border-stone-900/10 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 transition hover:border-stone-900/20 hover:text-rose-600 active:scale-95"
            >
              {disconnectPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Wipe Subscription
                  <Unplug className="ml-2 h-4 w-4 opacity-0 transition-all group-hover:opacity-100" />
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {saveState.message || disconnectState.message ? (
        <div className={[
          "mt-4 p-3 rounded-lg border text-sm flex items-start gap-3",
          (saveState.status === "error" || disconnectState.status === "error") ? "bg-rose-50 border-rose-100 text-rose-800" : "bg-emerald-50 border-emerald-100 text-emerald-800"
        ].join(" ")}>
          {(saveState.status === "error" || disconnectState.status === "error") ? <AlertCircle className="h-5 w-5 shrink-0" /> : <ShieldCheck className="h-5 w-5 shrink-0" />}
          <p className="font-bold uppercase tracking-tight text-[11px]">
             {saveState.message || disconnectState.message}
          </p>
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-stone-100 bg-stone-50/70 p-3">
           <Info className="h-5 w-5 text-stone-400 shrink-0" />
           <p className="text-xs text-stone-500 italic leading-relaxed">
             Endpoint isolation is active. Subscriptions are scoped strictly to this workspace context to prevent cross-account data leakage.
           </p>
        </div>
      )}
    </section>
    </>
  );
}
