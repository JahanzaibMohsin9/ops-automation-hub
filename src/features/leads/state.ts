export type LeadIntakeState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors: Partial<Record<LeadIntakeFieldName, string>>;
  leadId?: string;
};

export type LeadCsvImportResult = {
  rowNumber: number;
  status: "success" | "skipped" | "error";
  email: string;
  message: string;
};

export type LeadCsvImportSummary = {
  fileName: string;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  results: LeadCsvImportResult[];
};

export type LeadCsvImportState = {
  status: "idle" | "success" | "error";
  message: string;
  summary?: LeadCsvImportSummary;
};

export type SalesAssistActionState = {
  status: "idle" | "success" | "error";
  message: string;
  artifactId?: string;
};

export type LeadRetryActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type LeadIntakeFieldName =
  | "fullName"
  | "email"
  | "phone"
  | "companyName"
  | "companyDomain"
  | "jobTitle"
  | "industry"
  | "message";

export const initialLeadIntakeState: LeadIntakeState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};

export const initialLeadCsvImportState: LeadCsvImportState = {
  status: "idle",
  message: "",
};

export const initialSalesAssistActionState: SalesAssistActionState = {
  status: "idle",
  message: "",
};

export const initialLeadRetryActionState: LeadRetryActionState = {
  status: "idle",
  message: "",
};
