import Link from "next/link";
import type { Metadata } from "next";
import { DocumentProcessingStatusBadge, DocumentUploadStatusBadge } from "@/components/document-status-badge";
import { DocumentUploadPanel } from "@/components/document-upload-panel";
import { formatBytes, formatDocumentType } from "@/features/documents/config";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceContext } from "@/lib/workspace";
import {
  FileText,
  ArrowUpDown,
  Shield,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Documents — Revenue & Ops Automation Hub",
  description:
    "Upload and track invoices, onboarding forms, and agreements. AI extraction routes low-confidence documents to the review queue.",
};

export default async function DocumentsPage() {
  const workspaceContext = await requireWorkspaceContext();
  const documents = await prisma.document.findMany({
    where: {
      workspaceId: workspaceContext.workspaceId,
      uploadStatus: "uploaded",
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-lg border border-stone-900/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-md bg-stone-100 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-stone-500 uppercase">
              <Shield className="h-3 w-3 text-amber-500" />
              Document Vault
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
              Documents
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
              {documents.length} managed assets for{" "}
              <span className="font-semibold text-stone-800">
                {workspaceContext.workspace.name}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-stone-900/10 bg-stone-50 px-4 py-2 text-center">
              <p className="text-[10px] font-bold tracking-[0.14em] text-stone-400 uppercase">
                Assets
              </p>
              <p className="mt-0.5 text-xl font-bold text-stone-900 tabular-nums">
                {documents.length}
              </p>
            </div>
          </div>
        </div>
      </section>

      <DocumentUploadPanel />

      <section className="rounded-lg border border-stone-900/10 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-stone-900/5 pb-3">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold tracking-tight text-stone-900">
              Repository List
            </h3>
            <p className="text-sm text-stone-500">
              Showing sorted records from your workspace storage
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
             <div className="h-2 w-2 rounded-full bg-emerald-500" />
             <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">OCR Extraction Enabled</span>
          </div>
        </div>

        {documents.length === 0 ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-50/70 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-100 text-stone-300">
              <FileText className="h-5 w-5" />
            </div>
            <p className="mt-4 text-lg font-medium text-stone-900">No documents uploaded yet</p>
            <p className="mt-2 text-sm text-stone-500 max-w-xs mx-auto">
              Upload an invoice, onboarding form, or agreement to start extraction and review routing.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-stone-900/5">
              <table className="w-full text-left border-collapse">
                <thead className="bg-stone-50/50">
                  <tr className="text-[10px] font-bold tracking-[0.2em] text-stone-400 uppercase">
                    <th className="px-6 py-5">Document Name</th>
                    <th className="px-6 py-5">Classification</th>
                    <th className="px-6 py-5">
                      <div className="flex items-center gap-1.5">
                        Status <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th className="px-6 py-5">Size</th>
                    <th className="px-6 py-5 text-right">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-900/5 font-medium">
                  {documents.map((document) => (
                    <tr key={document.id} className="group text-sm text-stone-600 transition-colors hover:bg-stone-50/80">
                      <td className="px-6 py-5">
                        <Link href={`/documents/${document.id}`} className="inline-flex items-center gap-2 font-bold text-stone-900 group-hover:text-amber-700 transition-colors">
                          <FileText className="h-4 w-4 text-stone-400 group-hover:text-amber-500" />
                          {document.fileName}
                        </Link>
                      </td>
                      <td className="px-6 py-5">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-bold text-stone-600 uppercase">
                          {formatDocumentType(document.documentType)}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <DocumentUploadStatusBadge status={document.uploadStatus} />
                          <DocumentProcessingStatusBadge status={document.processingStatus} />
                        </div>
                      </td>
                      <td className="px-6 py-5 text-stone-400 tabular-nums uppercase text-[11px] font-bold">
                        {formatBytes(document.fileSize)}
                      </td>
                      <td className="px-6 py-5 text-right text-[11px] font-bold tracking-widest text-stone-400 uppercase leading-none">
                        {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(document.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
