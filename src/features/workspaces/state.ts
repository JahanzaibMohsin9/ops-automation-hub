export type WorkspaceProvisionState = {
  status: "idle" | "success" | "error";
  message: string;
  organizationId: string;
};

export type InviteState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialWorkspaceProvisionState: WorkspaceProvisionState = {
  status: "idle",
  message: "",
  organizationId: "",
};

export const initialInviteState: InviteState = {
  status: "idle",
  message: "",
};
