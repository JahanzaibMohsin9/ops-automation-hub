"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { useOrganizationList } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { provisionWorkspace } from "@/features/workspaces/actions";
import { initialWorkspaceProvisionState } from "@/features/workspaces/state";

export function SetupWorkspace() {
  const router = useRouter();
  const hasTriggered = useRef(false);
  const { setActive } = useOrganizationList();
  const [state, formAction, pending] = useActionState(
    provisionWorkspace,
    initialWorkspaceProvisionState
  );

  useEffect(() => {
    if (hasTriggered.current) {
      return;
    }

    hasTriggered.current = true;
    formAction();
  }, [formAction]);

  useEffect(() => {
    if (!state.organizationId || !setActive) {
      return;
    }

    void setActive({ organization: state.organizationId }).then(() => {
      router.replace("/dashboard");
    });
  }, [router, setActive, state.organizationId]);

  return (
    <section className="rounded-[2rem] border border-stone-900/10 bg-white/90 p-10 shadow-[0_24px_70px_rgba(70,56,24,0.1)]">
      <p className="text-sm font-semibold tracking-[0.28em] text-stone-500 uppercase">
        Workspace setup
      </p>
      <h1 className="mt-3 text-5xl font-semibold tracking-tight text-balance">
        We&apos;re creating the first workspace for this account.
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600">
        The setup flow provisions a Clerk organization, persists a matching
        workspace row in Prisma, and activates the organization for the current
        session before sending you into the app shell.
      </p>

      <div className="mt-8 rounded-[1.5rem] border border-stone-900/10 bg-stone-50 p-5">
        <p className="text-sm font-semibold text-stone-800">
          {pending
            ? "Provisioning workspace..."
            : state.status === "success"
              ? "Workspace ready. Redirecting..."
              : (state.message ?? "Preparing setup...")}
        </p>
        {state.status === "error" ? (
          <p className="mt-3 text-sm leading-6 text-rose-700">
            {state.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
