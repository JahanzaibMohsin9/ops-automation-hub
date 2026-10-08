export type LeadScoringSettingsActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialLeadScoringSettingsActionState: LeadScoringSettingsActionState = {
  status: "idle",
  message: "",
};
