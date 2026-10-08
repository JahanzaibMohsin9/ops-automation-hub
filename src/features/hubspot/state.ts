export type HubSpotConnectionActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type HubSpotSyncActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialHubSpotConnectionActionState: HubSpotConnectionActionState = {
  status: "idle",
  message: "",
};

export const initialHubSpotSyncActionState: HubSpotSyncActionState = {
  status: "idle",
  message: "",
};
