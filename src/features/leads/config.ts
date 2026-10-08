export const leadStatusMeta = {
  new: {
    label: "New",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  enriching: {
    label: "Enriching",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  enriched: {
    label: "Enriched",
    className: "border-cyan-200 bg-cyan-50 text-cyan-800",
  },
  scored: {
    label: "Scored",
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
  review_needed: {
    label: "Review needed",
    className: "border-orange-200 bg-orange-50 text-orange-700",
  },
  qualified: {
    label: "Qualified",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  low_priority: {
    label: "Low priority",
    className: "border-stone-200 bg-stone-100 text-stone-700",
  },
  enrichment_failed: {
    label: "Enrichment failed",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
  sync_failed: {
    label: "Sync failed",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
} as const;

export type PersistedLeadStatus = keyof typeof leadStatusMeta;

export const leadStatusFilterOptions = [
  { value: "all", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "qualified", label: "Qualified" },
  { value: "review_needed", label: "Review needed" },
  { value: "low_priority", label: "Low priority" },
] as const;

export type LeadStatusFilter =
  (typeof leadStatusFilterOptions)[number]["value"];
