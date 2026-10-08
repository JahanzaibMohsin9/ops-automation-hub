export type SlackConnectionActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialSlackConnectionActionState: SlackConnectionActionState = {
  status: "idle",
  message: "",
};
