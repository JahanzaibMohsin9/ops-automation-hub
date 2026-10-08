export type DocumentRetryActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialDocumentRetryActionState: DocumentRetryActionState = {
  status: "idle",
  message: "",
};
