import { redirect } from "next/navigation";
import { SetupWorkspace } from "@/components/setup-workspace";
import { getAuthContext, getWorkspaceByClerkOrgId } from "@/lib/workspace";

export default async function SetupPage() {
  const { orgId } = await getAuthContext();

  if (orgId) {
    const workspace = await getWorkspaceByClerkOrgId(orgId);

    if (workspace) {
      redirect("/dashboard");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SetupWorkspace />
    </div>
  );
}
