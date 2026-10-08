import {
  leadStatusMeta,
  type PersistedLeadStatus,
} from "@/features/leads/config";

type LeadStatusBadgeProps = {
  status: string;
};

export function LeadStatusBadge({ status }: LeadStatusBadgeProps) {
  const meta =
    leadStatusMeta[status as PersistedLeadStatus] ?? leadStatusMeta.new;

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.14em] uppercase ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
