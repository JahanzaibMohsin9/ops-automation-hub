import Link from "next/link";
import type { Metadata } from "next";
import { Prisma } from "@/generated/prisma/client";
import { LeadCsvImport } from "@/components/lead-csv-import";
import { LeadStatus } from "@/generated/prisma/enums";
import { LeadIntakeForm } from "@/components/lead-intake-form";
import { LeadStatusBadge } from "@/components/lead-status-badge";
import {
  leadStatusFilterOptions,
  type LeadStatusFilter,
} from "@/features/leads/config";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceContext } from "@/lib/workspace";
import {
  Users,
  Filter,
  Plus,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Leads — Revenue & Ops Automation Hub",
  description:
    "Browse, filter, and manage your leads pipeline. Import via CSV or submit individual leads for AI scoring and CRM sync.",
};

const PAGE_SIZE = 20;

type LeadsPageProps = {
  searchParams: Promise<{
    page?: string;
    status?: string;
  }>;
};

function buildLeadsQueryString(page: number, status: LeadStatusFilter) {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }

  if (status !== "all") {
    params.set("status", status);
  }

  const query = params.toString();
  return query.length > 0 ? `/leads?${query}` : "/leads";
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const workspaceContext = await requireWorkspaceContext();
  const resolvedSearchParams = await searchParams;
  const rawPage = Number(resolvedSearchParams.page ?? "1");
  const currentPage =
    Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const selectedStatus = leadStatusFilterOptions.some(
    (option) => option.value === resolvedSearchParams.status
  )
    ? (resolvedSearchParams.status as LeadStatusFilter)
    : "all";
  const where: Prisma.LeadWhereInput = {
    workspaceId: workspaceContext.workspaceId,
    ...(selectedStatus !== "all"
      ? { status: selectedStatus as LeadStatus }
      : {}),
  };
  const [leads, totalLeads] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take: PAGE_SIZE,
      skip: (currentPage - 1) * PAGE_SIZE,
      include: {
        leadSource: true,
      },
    }),
    prisma.lead.count({ where }),
  ]);
  const leadScoreRows =
    leads.length > 0
      ? await prisma.$queryRaw<
          Array<{
            leadId: string;
            numericScore: number;
          }>
        >`SELECT "leadId", "numericScore"
           FROM "LeadScore"
           WHERE "workspaceId" = ${workspaceContext.workspaceId}
             AND "leadId" IN (${Prisma.join(leads.map((lead) => lead.id))})`
      : [];
  const leadScoresByLeadId = new Map(
    leadScoreRows.map((score) => [score.leadId, score.numericScore])
  );
  const totalPages = Math.max(1, Math.ceil(totalLeads / PAGE_SIZE));
  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-lg border border-stone-900/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.16em] text-stone-500 uppercase">
              Lead Pipeline
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
              Leads
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
              {totalLeads} records for{" "}
              <span className="font-semibold text-stone-800">
                {workspaceContext.workspace.name}
              </span>
            </p>
          </div>

          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <label
                htmlFor="status"
                className="text-[10px] font-bold tracking-[0.16em] text-stone-400 uppercase"
              >
                Status
              </label>
              <div className="relative">
                <Filter className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <select
                  id="status"
                  name="status"
                  defaultValue={selectedStatus}
                  className="w-full min-w-[210px] appearance-none rounded-lg border border-stone-900/10 bg-stone-50 py-2.5 pr-9 pl-9 text-sm font-medium text-stone-700 outline-none transition focus:border-stone-900/20 focus:bg-white"
                >
                  {leadStatusFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 active:scale-95"
            >
              Apply
            </button>
          </form>
        </div>
      </section>

      <LeadCsvImport />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-lg border border-stone-900/10 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-stone-900/5 pb-3">
            <div className="space-y-1">
              <h3 className="text-xl font-semibold tracking-tight text-stone-900">
                Prospect List
              </h3>
              <p className="text-sm text-stone-500">
                Displaying {leads.length} of {totalLeads} total records
              </p>
            </div>
            <div className="flex items-center gap-2">
               <div className="h-2 w-2 rounded-full bg-emerald-500" />
               <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">Live Sync Enabled</span>
            </div>
          </div>

          {leads.length === 0 ? (
            <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-50/70 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-100 text-stone-300">
                <Users className="h-5 w-5" />
              </div>
              <p className="mt-4 text-lg font-medium text-stone-900">No leads yet</p>
              <p className="mt-2 text-sm text-stone-500 max-w-xs mx-auto">
                Submit your first lead or import a CSV to start the pipeline for this workspace.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              <div className="overflow-hidden rounded-lg border border-stone-900/5">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-stone-50/50">
                    <tr className="text-[10px] font-bold tracking-[0.2em] text-stone-400 uppercase">
                      <th className="px-6 py-5">Full Name</th>
                      <th className="px-6 py-5">Company / Org</th>
                      <th className="px-6 py-5">
                        <div className="flex items-center gap-1.5">
                          Status <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </th>
                      <th className="px-6 py-5 text-center">Score</th>
                      <th className="px-6 py-5 text-right">Captured</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-900/5 font-medium">
                    {leads.map((lead) => {
                      const score = leadScoresByLeadId.get(lead.id);
                      const detailHref =
                        `/leads/${lead.id}?` +
                        new URLSearchParams({
                          fromPage: String(currentPage),
                          ...(selectedStatus !== "all"
                            ? { status: selectedStatus }
                            : {}),
                        }).toString();

                      return (
                        <tr
                          key={lead.id}
                          className="group text-sm text-stone-600 transition-colors hover:bg-stone-50/80"
                        >
                          <td className="px-6 py-5">
                            <Link
                              href={detailHref}
                              className="font-bold text-stone-900 group-hover:text-amber-700 transition-colors"
                            >
                              {lead.fullName}
                            </Link>
                          </td>
                          <td className="px-6 py-5 text-stone-500">
                            {lead.companyName}
                          </td>
                          <td className="px-6 py-5">
                            <LeadStatusBadge status={lead.status} />
                          </td>
                          <td className="px-6 py-5 text-center">
                            {score !== undefined ? (
                              <span className={`inline-flex items-center justify-center h-8 w-12 rounded-lg font-bold text-[11px] tabular-nums ${
                                score >= 80 ? 'bg-emerald-100 text-emerald-800' : score >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600'
                              }`}>
                                {score}
                              </span>
                            ) : (
                                <div className="h-5 w-5 mx-auto rounded-full border-2 border-stone-100 border-t-stone-300 animate-spin" />
                            )}
                          </td>
                          <td className="px-6 py-5 text-right text-[11px] font-bold tracking-widest text-stone-400 uppercase">
                            {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(lead.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-stone-900/5 pt-4">
                <p className="text-[11px] font-bold tracking-widest text-stone-400 uppercase">
                  Page {Math.min(currentPage, totalPages)} of {totalPages}
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    href={buildLeadsQueryString(previousPage, selectedStatus)}
                    className={[
                      "flex h-10 w-10 items-center justify-center rounded-full border border-stone-900/10 transition-all duration-300",
                      currentPage <= 1 ? "opacity-30 pointer-events-none" : "bg-white text-stone-900 hover:bg-stone-900 hover:text-white hover:scale-105 active:scale-95"
                    ].join(" ")}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Link>
                  <Link
                    href={buildLeadsQueryString(nextPage, selectedStatus)}
                    className={[
                      "flex h-10 w-10 items-center justify-center rounded-full border border-stone-900/10 transition-all duration-300",
                      currentPage >= totalPages ? "opacity-30 pointer-events-none" : "bg-white text-stone-900 hover:bg-stone-900 hover:text-white hover:scale-105 active:scale-95"
                    ].join(" ")}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="sticky top-4 h-fit space-y-4 rounded-lg border border-stone-900/10 bg-stone-950 p-4 text-stone-50 shadow-sm">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-md bg-white/5 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-stone-400 uppercase">
              <Plus className="h-3 w-3 text-amber-500" />
              Quick Capture
            </div>
            <h3 className="text-xl font-semibold tracking-tight">
              Direct Intake Form
            </h3>
            <p className="text-xs leading-5 text-stone-400">
              Add one lead and start enrichment automatically.
            </p>
          </div>
          
          <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
            <LeadIntakeForm />
          </div>
        </section>
      </div>
    </div>
  );
}
