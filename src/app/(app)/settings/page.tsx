import type { Metadata } from "next";
import { clerkClient } from "@clerk/nextjs/server";
import { HubSpotConnectionCard } from "@/components/hubspot-connection-card";
import { InviteMemberForm } from "@/components/invite-member-form";
import { LeadScoringSettingsCard } from "@/components/lead-scoring-settings-card";
import { SlackConnectionCard } from "@/components/slack-connection-card";
import {
  fetchHubSpotAccountDetails,
  getHubSpotConnectionState,
} from "@/features/hubspot/connection";
import {
  getSlackConnectionState,
  maskSlackWebhookUrl,
} from "@/features/slack/connection";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceContext } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Settings — Revenue & Ops Automation Hub",
  description:
    "Manage workspace details, team members, HubSpot and Slack integrations, lead scoring criteria, and notification preferences.",
};

type OrganizationMembershipSummary = {
  id: string;
  role: string;
  fullName: string;
  emailAddress: string;
};

function formatRole(role: string) {
  return role.replace(/^org:/, "").replace(/_/g, " ");
}

async function getOrganizationMemberships(
  organizationId: string
): Promise<OrganizationMembershipSummary[]> {
  const client = await clerkClient();
  const response = (await client.organizations.getOrganizationMembershipList({
    organizationId,
    limit: 50,
  })) as {
    data?: Array<{
      id?: string;
      role?: string;
      publicUserData?: {
        firstName?: string | null;
        lastName?: string | null;
        identifier?: string | null;
      } | null;
    }>;
  };

  return (response.data ?? []).map((membership, index) => {
    const firstName = membership.publicUserData?.firstName?.trim() ?? "";
    const lastName = membership.publicUserData?.lastName?.trim() ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    return {
      id: membership.id ?? `membership-${index}`,
      role: membership.role ?? "org:member",
      fullName: fullName || "Unnamed teammate",
      emailAddress: membership.publicUserData?.identifier?.trim() || "No email available",
    };
  });
}

export default async function SettingsPage() {
  const workspaceContext = await requireWorkspaceContext();
  const [connectionState, slackConnectionState, memberships, workspaceSettings] =
    await Promise.all([
    getHubSpotConnectionState(workspaceContext.workspaceId),
    getSlackConnectionState(workspaceContext.workspaceId),
    getOrganizationMemberships(workspaceContext.clerkOrgId),
    prisma.workspace.findUnique({
      where: {
        id: workspaceContext.workspaceId,
      },
      select: {
        leadScoringCriteria: true,
      },
    }),
  ]);

  const accountDetails =
    connectionState.isConnected || connectionState.envConfigured
      ? await fetchHubSpotAccountDetails()
      : { portalId: null, accountName: null };

  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
        <p className="text-sm font-semibold tracking-[0.24em] text-stone-500 uppercase">
          General
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Workspace settings
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
          Review the active workspace, team, integrations, scoring configuration, and
          alert routing from one place.
        </p>

        <dl className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
            <dt className="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">
              Workspace name
            </dt>
            <dd className="mt-2 text-sm text-stone-800">
              {workspaceContext.workspace.name}
            </dd>
          </div>
          <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
            <dt className="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">
              Workspace slug
            </dt>
            <dd className="mt-2 text-sm text-stone-800">
              {workspaceContext.workspace.slug}
            </dd>
          </div>
          <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
            <dt className="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">
              Database workspace ID
            </dt>
            <dd className="mt-2 text-sm text-stone-800">
              {workspaceContext.workspace.id}
            </dd>
          </div>
          <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
            <dt className="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">
              Clerk organization ID
            </dt>
            <dd className="mt-2 text-sm text-stone-800">
              {workspaceContext.clerkOrgId}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
          <p className="text-sm font-semibold tracking-[0.24em] text-stone-500 uppercase">
            Team
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Members and invites
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
            Team membership is sourced from the active Clerk organization so the workspace
            list here matches the users who can access this tenant.
          </p>

          <div className="mt-6 overflow-hidden rounded-3xl border border-stone-900/10">
            <table className="min-w-full divide-y divide-stone-900/10 text-sm">
              <thead className="bg-stone-50">
                <tr className="text-left text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase">
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-900/5 bg-white">
                {memberships.length > 0 ? (
                  memberships.map((membership) => (
                    <tr key={membership.id}>
                      <td className="px-4 py-3 font-medium text-stone-900">
                        {membership.fullName}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {membership.emailAddress}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {formatRole(membership.role)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-4 text-stone-600" colSpan={3}>
                      No team members were returned from Clerk for this organization yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-3xl border border-stone-900/10 bg-stone-50 p-5">
            <p className="text-xs font-semibold tracking-[0.22em] text-stone-500 uppercase">
              Invite teammate
            </p>
            <div className="mt-4">
              <InviteMemberForm canInvite={Boolean(workspaceContext.clerkOrgId)} />
            </div>
          </div>
        </section>

        <LeadScoringSettingsCard
          currentCriteria={workspaceSettings?.leadScoringCriteria ?? null}
        />
      </div>

      <section className="space-y-4">
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-stone-500 uppercase">
            Integrations
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Connection status
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
            HubSpot reflects CRM sync readiness. Slack doubles as the MVP notifications
            page because the alert toggles live with the channel connection.
          </p>
        </div>

        <HubSpotConnectionCard
          envConfigured={connectionState.envConfigured}
          isConnected={connectionState.isConnected}
          connectedAt={connectionState.record?.connectedAt?.toISOString() ?? null}
          accountName={
            typeof connectionState.record?.metadata === "object" &&
            connectionState.record?.metadata &&
            !Array.isArray(connectionState.record.metadata) &&
            typeof connectionState.record.metadata.accountName === "string"
              ? connectionState.record.metadata.accountName
              : accountDetails.accountName
          }
          portalId={
            typeof connectionState.record?.metadata === "object" &&
            connectionState.record?.metadata &&
            !Array.isArray(connectionState.record.metadata) &&
            typeof connectionState.record.metadata.portalId !== "undefined"
              ? String(connectionState.record.metadata.portalId)
              : accountDetails.portalId !== null
                ? String(accountDetails.portalId)
                : null
          }
        />

        <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
          <p className="text-sm font-semibold tracking-[0.24em] text-stone-500 uppercase">
            Notifications
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Slack alert routing
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
            Toggle which event types should post into Slack and confirm whether the
            workspace is using a stored webhook or the environment fallback.
          </p>

          <div className="mt-6">
            <SlackConnectionCard
              envConfigured={slackConnectionState.envConfigured}
              isConnected={slackConnectionState.isConnected}
              connectedAt={
                slackConnectionState.record?.connectedAt?.toISOString() ?? null
              }
              channelName={slackConnectionState.channelName}
              maskedWebhook={maskSlackWebhookUrl(slackConnectionState.webhookUrl)}
              usingStoredWebhook={slackConnectionState.storedWebhookConfigured}
              defaultChannelName={slackConnectionState.channelName ?? ""}
              preferences={{
                qualifiedLead: slackConnectionState.preferences.qualified_lead,
                reviewNeeded: slackConnectionState.preferences.review_needed,
                crmSyncFailure: slackConnectionState.preferences.crm_sync_failure,
                documentProcessingFailure:
                  slackConnectionState.preferences.document_processing_failure,
              }}
            />
          </div>
        </section>
      </section>
    </div>
  );
}
