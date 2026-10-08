"use client";

import { useActionState, useEffect } from "react";
import { inviteWorkspaceMember } from "@/features/workspaces/actions";
import { initialInviteState } from "@/features/workspaces/state";
import { useToast } from "@/components/toast";

type InviteMemberFormProps = {
  canInvite: boolean;
};

export function InviteMemberForm({ canInvite }: InviteMemberFormProps) {
  const [state, formAction, pending] = useActionState(
    inviteWorkspaceMember,
    initialInviteState
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.message) {
      return;
    }

    showToast(state.message, state.status === "error" ? "error" : "success");
  }, [showToast, state.message, state.status]);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-semibold text-stone-800"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="teammate@company.com"
          disabled={!canInvite || pending}
          className="w-full rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm transition outline-none focus:border-stone-900/30"
        />
      </div>

      <div>
        <label
          htmlFor="role"
          className="mb-2 block text-sm font-semibold text-stone-800"
        >
          Role
        </label>
        <select
          id="role"
          name="role"
          disabled={!canInvite || pending}
          className="w-full rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm transition outline-none focus:border-stone-900/30"
          defaultValue="org:member"
        >
          <option value="org:member">Member</option>
          <option value="org:admin">Admin</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={!canInvite || pending}
        className="rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {pending ? "Sending invite..." : "Send invite"}
      </button>

      {!canInvite ? (
        <p className="text-sm leading-6 text-amber-700">
          Finish workspace setup first so there is an active organization to
          invite teammates into.
        </p>
      ) : null}

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
  );
}
