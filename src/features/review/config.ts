import type {
  ApprovalActionType,
  ReviewEntityType,
  ReviewTaskStatus,
} from "@/generated/prisma/client";

export const reviewEntityTypeLabels: Record<ReviewEntityType, string> = {
  document: "Document",
  lead: "Lead",
};

export const reviewTaskStatusLabels: Record<ReviewTaskStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const approvalActionLabels: Record<ApprovalActionType, string> = {
  approve: "Approved",
  reject: "Rejected",
  edit_approve: "Edited + approved",
};

export function formatConfidencePercent(score: number | null | undefined) {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return "Unknown";
  }

  return `${Math.round(score * 100)}%`;
}

export function formatReviewFieldLabel(fieldName: string) {
  return fieldName.replace(/_/g, " ");
}

export function getReviewStatusClasses(status: ReviewTaskStatus) {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}
