"use client";

import { useMemo, useRef, useState, useActionState } from "react";
import {
  autoMapCsvHeaders,
  buildCsvImportRows,
  buildCsvPreviewRecords,
  buildMappedPreviewRows,
  CSV_IMPORT_FIELDS,
  csvImportFieldLabels,
  parseCsvFile,
  validateCsvImportPayload,
  type CsvImportMapping,
  type ParsedCsvFile,
} from "@/features/leads/csv";
import {
  initialLeadCsvImportState,
} from "@/features/leads/state";
import { importLeadsFromCsv } from "@/features/leads/actions";
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
} from "lucide-react";

export function LeadCsvImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedCsv, setParsedCsv] = useState<ParsedCsvFile | null>(null);
  const [mapping, setMapping] = useState<CsvImportMapping>({});
  const [parserError, setParserError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [state, formAction, pending] = useActionState(
    importLeadsFromCsv,
    initialLeadCsvImportState
  );

  const previewRows = useMemo(
    () => (parsedCsv ? buildCsvPreviewRecords(parsedCsv, 5) : []),
    [parsedCsv]
  );
  const mappedPreviewRows = useMemo(
    () => buildMappedPreviewRows(previewRows, mapping),
    [mapping, previewRows]
  );
  const importPayload = useMemo(() => {
    if (!parsedCsv) {
      return null;
    }

    return {
      fileName: parsedCsv.fileName,
      delimiter: parsedCsv.delimiter,
      encoding: parsedCsv.encoding,
      mapping,
      rows: buildCsvImportRows(parsedCsv),
    };
  }, [mapping, parsedCsv]);

  async function handleFile(file: File) {
    try {
      const nextParsedCsv = await parseCsvFile(file);
      setParsedCsv(nextParsedCsv);
      setMapping(autoMapCsvHeaders(nextParsedCsv.headers));
      setParserError("");
    } catch (error) {
      setParsedCsv(null);
      setMapping({});
      setParserError(
        error instanceof Error ? error.message : "Could not read that CSV file."
      );
    }
  }

  return (
    <div className="space-y-4">
      <div
        className={[
          "relative overflow-hidden rounded-lg border border-dashed transition-all duration-300",
          isDragging 
            ? "border-amber-400 bg-amber-50 p-4" 
            : parsedCsv 
              ? "border-stone-900/10 bg-white p-4" 
              : "border-stone-900/10 bg-stone-50/70 p-4 hover:border-stone-900/20 hover:bg-stone-50"
        ].join(" ")}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files.item(0);

          if (file) {
            void handleFile(file);
          }
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={[
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-300",
              parsedCsv ? "bg-stone-900 text-white scale-90" : "bg-white text-stone-400"
            ].join(" ")}>
              {parsedCsv ? <FileSpreadsheet className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
            </div>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-md bg-stone-100 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-stone-500 uppercase">
                Lead Import
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-stone-900">
                {parsedCsv ? "CSV ready for mapping" : "Import CSV"}
              </h3>
              <p className="max-w-2xl text-sm leading-6 text-stone-500">
                {parsedCsv 
                  ? `${parsedCsv.fileName} contains ${parsedCsv.rows.length} records.`
                  : "Upload a lead list, map fields, and import without leaving this page."
                }
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 active:scale-95"
            >
              {parsedCsv ? "Change CSV" : "Select CSV"}
            </button>
            {parsedCsv ? (
              <button
                type="button"
                onClick={() => {
                  setParsedCsv(null);
                  setMapping({});
                  setParserError("");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-900/10 bg-white text-stone-400 transition hover:border-stone-900/20 hover:text-stone-900 active:scale-95"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>

        {!parsedCsv && (
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold tracking-[0.14em] text-stone-400 uppercase">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-stone-900/5 bg-white px-2.5 py-1 leading-none">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              5k+ rows
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-stone-900/5 bg-white px-2.5 py-1 leading-none">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Auto-map
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-stone-900/5 bg-white px-2.5 py-1 leading-none">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Dedupe
            </span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.item(0);

            if (file) {
              void handleFile(file);
            }
          }}
        />
      </div>

      {parserError ? (
        <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          <AlertCircle className="h-5 w-5" />
          {parserError}
        </div>
      ) : null}

      {parsedCsv ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-lg border border-stone-900/10 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-stone-900/5 pb-3">
              <span className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-bold leading-none tracking-tight text-white">
                {parsedCsv.fileName}
              </span>
              <div className="flex items-center gap-3 text-[11px] font-bold tracking-[0.14em] text-stone-400 uppercase">
                 <span>Delimiter: {parsedCsv.delimiter === "\t" ? "tab" : parsedCsv.delimiter}</span>
                 <span className="h-1 w-1 rounded-full bg-stone-200" />
                 <span>Encoding: {parsedCsv.encoding}</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="space-y-1">
                <h4 className="text-xl font-semibold tracking-tight text-stone-900">
                  Field Mapping
                </h4>
                <p className="text-sm leading-relaxed text-stone-500">
                  Match required lead fields. Unmapped columns are ignored.
                </p>
              </div>

              <div className="mt-4 max-h-[28rem] overflow-y-auto grid gap-3 md:grid-cols-2">
                {CSV_IMPORT_FIELDS.map((field) => (
                  <div key={field} className="space-y-1.5">
                    <label className="text-[10px] font-bold tracking-[0.16em] text-stone-400 uppercase">
                      {csvImportFieldLabels[field]}
                    </label>
                    <div className="relative">
                       <ChevronDown className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-300 pointer-events-none" />
                       <select
                         value={mapping[field] ?? ""}
                         onChange={(event) => {
                            const header = event.target.value;
                            setMapping((currentMapping) => ({
                              ...currentMapping,
                              [field]: header || undefined,
                            }));
                         }}
                         className="w-full appearance-none rounded-lg border border-stone-900/10 bg-stone-50 px-3 py-2.5 text-sm font-medium text-stone-700 outline-none transition focus:border-stone-900/20 focus:bg-white"
                       >
                         <option value="">Ignore this field</option>
                         {parsedCsv.headers.map((header) => (
                           <option key={`${field}-${header}`} value={header}>
                             {header}
                           </option>
                         ))}
                       </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-4 border-b border-stone-900/5 pb-3">
                <h4 className="text-lg font-bold tracking-tight text-stone-900">
                  Data Preview
                </h4>
                <div className="rounded-md bg-stone-50 px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] text-stone-400 uppercase">
                  First {previewRows.length} Rows
                </div>
              </div>

              <div className="mt-3 overflow-x-auto rounded-lg border border-stone-900/5">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-stone-50/50">
                    <tr className="text-[10px] font-bold tracking-[0.15em] text-stone-400 uppercase">
                      {CSV_IMPORT_FIELDS.map((field) => (
                        <th key={field} className="px-6 py-4">
                          {csvImportFieldLabels[field]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-900/5 text-xs font-medium text-stone-600">
                    {mappedPreviewRows.map((row, index) => (
                      <tr
                        key={`preview-${index + 1}`}
                        className="transition-colors hover:bg-stone-50/50"
                      >
                        {CSV_IMPORT_FIELDS.map((field) => (
                          <td key={`${index + 1}-${field}`} className="px-6 py-4 truncate max-w-[150px]">
                            {row[field] || (
                              <span className="text-stone-300 font-normal italic">Unmapped</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="sticky top-4 h-fit space-y-4 rounded-lg border border-stone-900/10 bg-stone-950 p-4 text-stone-50 shadow-sm">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-md bg-white/5 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-stone-400 uppercase">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Validation
              </div>
              <h3 className="text-xl font-semibold tracking-tight">
                Import Summary
              </h3>
              <p className="text-sm leading-6 text-stone-400">
                Import <span className="font-bold text-white">{parsedCsv.rows.length} records</span> after required fields are mapped.
              </p>
            </div>

            <form action={formAction} className="space-y-4">
              <input
                type="hidden"
                name="payload"
                value={
                  importPayload && validateCsvImportPayload(importPayload)
                    ? JSON.stringify(importPayload)
                    : ""
                }
              />

              <div className="space-y-2 rounded-lg border border-white/5 bg-white/[0.03] p-3">
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                    <span className="text-[10px] font-bold tracking-[0.16em] text-stone-400 uppercase">Required</span>
                 </div>
                 <p className="text-xs text-stone-500 leading-relaxed">
                   Full Name, Email, and Company Name.
                 </p>
              </div>

              <button
                type="submit"
                disabled={
                  pending ||
                  !importPayload ||
                  !validateCsvImportPayload(importPayload)
                }
                className="w-full rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-stone-950 transition enabled:hover:bg-amber-300 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-800 disabled:text-stone-600"
              >
                {pending ? "Importing…" : "Import Leads"}
              </button>

              {state.message && (
                <p
                  className={[
                    "text-center text-xs font-bold tracking-wide uppercase px-4",
                    state.status === "error"
                      ? "text-rose-400"
                      : "text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                  ].join(" ")}
                >
                  {state.message}
                </p>
              )}
            </form>
          </section>
        </div>
      ) : null}

      {state.summary && (
        <section className="rounded-lg border border-stone-900/10 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-md bg-stone-100 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-stone-500 uppercase">
                Import Analytics
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-stone-900">
                Import Results
              </h3>
              <p className="max-w-xl text-sm text-stone-500 leading-6">
                Import batch for <span className="font-bold text-stone-900">{state.summary.fileName}</span> completed. 
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
              {[
                { label: "Processed", val: state.summary.totalRows, color: "bg-stone-50 text-stone-900", sub: "text-stone-400" },
                { label: "Imported", val: state.summary.importedCount, color: "bg-emerald-50 text-emerald-900", sub: "text-emerald-600" },
                { label: "Skipped", val: state.summary.skippedCount, color: "bg-amber-50 text-amber-900", sub: "text-amber-600" },
                { label: "Errors", val: state.summary.errorCount, color: "bg-rose-50 text-rose-900", sub: "text-rose-600" },
              ].map((stat) => (
                <div key={stat.label} className={["rounded-lg p-3", stat.color].join(" ")}>
                   <p className={["text-[10px] font-bold tracking-widest uppercase", stat.sub].join(" ")}>{stat.label}</p>
                   <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{stat.val}</p>
                </div>
              ))}
            </div>
          </div>

          {state.summary.results.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-lg border border-stone-900/5">
              <table className="w-full text-left border-collapse">
                <thead className="bg-stone-50/50">
                  <tr className="text-[10px] font-bold tracking-widest text-stone-400 uppercase">
                    <th className="px-6 py-5">Batch ID</th>
                    <th className="px-6 py-5">Status</th>
                    <th className="px-6 py-5">Prospect Email</th>
                    <th className="px-6 py-5">Processing Log</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-900/5 text-sm font-medium text-stone-600">
                  {state.summary.results.map((result) => (
                    <tr
                      key={`result-${result.rowNumber}`}
                      className="group transition-colors hover:bg-stone-50/50"
                    >
                      <td className="px-6 py-5 tabular-nums text-stone-400 font-bold">#{result.rowNumber}</td>
                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-tight ${
                            result.status === "success"
                              ? "bg-emerald-100 text-emerald-800"
                              : result.status === "skipped"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {result.status}
                        </span>
                      </td>
                      <td className="px-6 py-5 font-bold text-stone-900">
                        {result.email || "—"}
                      </td>
                      <td className="px-6 py-5 text-stone-500">{result.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
