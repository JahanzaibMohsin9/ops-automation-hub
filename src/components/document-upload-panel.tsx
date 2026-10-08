"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentType } from "@/generated/prisma/client";
import {
  DOCUMENT_MAX_SIZE_BYTES,
  documentTypeOptions,
  isAllowedDocumentMimeType,
} from "@/features/documents/config";
import {
  finalizeDocumentUpload,
  markDocumentUploadFailed,
} from "@/features/documents/actions";

type UploadStage = "idle" | "requesting" | "uploading" | "saving" | "success" | "error";

function validateFile(file: File) {
  if (!isAllowedDocumentMimeType(file.type)) {
    return "Allowed file types are PDF, PNG, JPG, and TIFF.";
  }

  if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
    return "Files must be 20MB or smaller.";
  }

  return null;
}

import {
  Upload,
  FileText,
  FileUp,
  CheckCircle2,
  ChevronDown,
  Loader2,
} from "lucide-react";

export function DocumentUploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneRef = useRef<HTMLLabelElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>("invoice");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [message, setMessage] = useState("Select a business document for automated extraction.");
  const [progress, setProgress] = useState(0);
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);
  const isIndeterminate = stage === "requesting" || stage === "saving";
  const selectedDocumentType = documentTypeOptions.find(
    (option) => option.value === documentType
  );

  function handleFileSelection(file: File | null) {
    if (!file) {
      setSelectedFile(null);
      setStage("idle");
      setProgress(0);
      setMessage("Select a business document for automated extraction.");
      return;
    }

    const validationError = validateFile(file);

    if (validationError) {
      setSelectedFile(null);
      setStage("error");
      setProgress(0);
      setMessage(validationError);
      return;
    }

    setSelectedFile(file);
    setStage("idle");
    setProgress(0);
    setMessage(`${file.name} is ready for upload.`);
  }

  function handleDragEnter(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragOver(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (
      dropZoneRef.current &&
      !dropZoneRef.current.contains(event.relatedTarget as Node | null)
    ) {
      setIsDragging(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files[0] ?? null;
    handleFileSelection(file);
  }

  async function uploadWithProgress(url: string, file: File) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", file.type);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }

        reject(new Error(`Upload failed with status ${xhr.status}.`));
      };

      xhr.onerror = () => {
        reject(new Error("Network error during ingest."));
      };

      xhr.send(file);
    });
  }

  async function uploadViaServerProxy(file: File, storageKey: string | null) {
    const formData = new FormData();
    formData.append("file", file);

    if (storageKey) {
      formData.append("storageKey", storageKey);
    }

    const responseText = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/documents/upload");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress(Math.max(15, Math.round((event.loaded / event.total) * 100)));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
          return;
        }

        reject(new Error(xhr.responseText || `Upload failed with status ${xhr.status}.`));
      };

      xhr.onerror = () => {
        reject(new Error("The fallback upload failed."));
      };

      xhr.send(formData);
    });

    const payload = JSON.parse(responseText) as {
      storageKey?: string;
      error?: string;
    };

    if (!payload.storageKey) {
      throw new Error(payload.error ?? "Ingest server did not acknowledge storage key.");
    }

    return payload.storageKey;
  }

  async function handleUpload() {
    if (!selectedFile) {
      setStage("error");
      setMessage("Please select a file first.");
      return;
    }

    const validationError = validateFile(selectedFile);

    if (validationError) {
      setStage("error");
      setMessage(validationError);
      return;
    }

    let storageKey: string | null = null;

    try {
      setStage("requesting");
      setMessage("Preparing secure upload…");
      setProgress(5);

      const presignResponse = await fetch("/api/documents/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          fileSize: selectedFile.size,
        }),
      });

      const presignPayload = (await presignResponse.json()) as {
        uploadUrl?: string;
        storageKey?: string;
        error?: string;
      };

      if (!presignResponse.ok || !presignPayload.uploadUrl || !presignPayload.storageKey) {
        throw new Error(presignPayload.error ?? "Could not negotiate ingest protocol.");
      }

      storageKey = presignPayload.storageKey;
      setStage("uploading");
      setMessage("Uploading…");

      try {
        await uploadWithProgress(presignPayload.uploadUrl, selectedFile);
      } catch (uploadError) {
        setMessage("Direct stream failed. Switching to proxy ingest...");
        storageKey = await uploadViaServerProxy(selectedFile, storageKey);

        if (!(uploadError instanceof Error)) {
          throw uploadError;
        }
      }

      setStage("saving");
      setProgress(100);
      setMessage("Finalizing and queuing extraction…");

      const result = await finalizeDocumentUpload({
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
        fileSize: selectedFile.size,
        storageKey: presignPayload.storageKey,
        documentType,
      });

      setStage("success");
      setMessage(
        result.queued
          ? "Upload complete. Extraction has started."
          : `Upload complete, but extraction queue returned: ${result.queueError}`
      );
      setSelectedFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setTimeout(() => router.refresh(), 1000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ingest failed.";
      setStage("error");
      setProgress(0);
      setMessage(errorMessage);

      if (selectedFile) {
        setStage("error");
        await markDocumentUploadFailed({
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          fileSize: selectedFile.size,
          storageKey,
          documentType,
          errorMessage,
        }).catch(() => undefined);
      }
    }
  }

  const canSubmit = selectedFile !== null && stage !== "requesting" && stage !== "uploading" && stage !== "saving";

  return (
    <section className="rounded-lg border border-stone-900/10 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="inline-flex items-center gap-2 rounded-md bg-stone-100 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-stone-500 uppercase">
            <Upload className="h-3 w-3" />
            Document Upload
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-stone-900">
            Upload Document
          </h2>
          <p className="max-w-2xl text-sm text-stone-500 leading-6">
            Add PDFs or images for classification and extraction.
          </p>
        </div>

        <div className="rounded-lg border border-stone-900/10 bg-stone-50 px-4 py-2 text-center">
          <p className="text-[10px] font-bold tracking-[0.14em] text-stone-400 uppercase">Limit</p>
          <p className="mt-0.5 text-xl font-bold text-stone-900 tabular-nums">20 MB</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <label
            ref={dropZoneRef}
            htmlFor="document-file"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={[
              "group relative flex min-h-52 cursor-pointer items-center gap-4 rounded-lg border border-dashed p-4 transition-all duration-300",
              isDragging
                ? "border-amber-400 bg-amber-50 animate-pulse-border"
                : selectedFile
                  ? "border-stone-900/10 bg-stone-50/50"
                  : "border-stone-900/10 bg-stone-50/50 hover:border-stone-900/20 hover:bg-stone-50"
            ].join(" ")}
          >
            <div className={[
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-all duration-300",
              isDragging ? "bg-amber-400 text-white" : selectedFile ? "bg-stone-900 text-white" : "bg-white text-stone-400"
            ].join(" ")}>
              {selectedFile ? <FileUp className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
            </div>
            
            <div className="min-w-0 space-y-1">
               <p className="truncate text-lg font-semibold text-stone-900">
                 {selectedFile ? selectedFile.name : isDragging ? "Release to upload" : "Drop a document or click to browse"}
               </p>
               {!selectedFile && (
                 <p className="text-sm text-stone-500">
                   PDF, PNG, JPG, or TIFF.
                 </p>
               )}
            </div>

            <input
              ref={inputRef}
              id="document-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/tiff"
              className="sr-only"
              onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null)}
            />
          </label>

          <div className="space-y-3 overflow-hidden rounded-lg border border-stone-900/5 bg-stone-50/70 p-3">
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-2">
                  <div className={[
                    "h-2 w-2 rounded-full",
                    stage === "error" ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" : 
                    stage === "success" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" :
                    stage === "idle" ? "bg-stone-300" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                  ].join(" ")} />
                  <span className="text-[10px] font-bold tracking-[0.16em] text-stone-400 uppercase">Stage: {stage}</span>
               </div>
               {progress > 0 && <span className="text-[10px] font-bold text-stone-400 tabular-nums">{progress}%</span>}
            </div>

            <p className="text-sm font-medium text-stone-600 truncate">{message}</p>

            <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
              {isIndeterminate ? (
                <div className="h-full w-full rounded-full progress-shimmer" />
              ) : (
                <div
                  className={[
                    "h-full rounded-full transition-all duration-500",
                    stage === "error" ? "bg-rose-500" : "bg-stone-900 shadow-[0_0_12px_rgba(28,25,23,0.2)]"
                  ].join(" ")}
                  style={{ width: `${progress}%` }}
                />
              )}
            </div>
          </div>
        </div>

        <div className="sticky top-4 h-fit space-y-4 rounded-lg border border-stone-900/10 bg-stone-950 p-4 text-stone-50 shadow-sm">
           <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-md bg-white/5 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-stone-400 uppercase">
                <FileText className="h-3.5 w-3.5 text-amber-500" />
                Classification
              </div>
              <h3 className="text-xl font-semibold tracking-tight">
                Document Type
              </h3>
              <p className="text-xs leading-5 text-stone-400">
                Choose the closest type before upload.
              </p>
           </div>

           <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  id="documentType-label"
                  className="text-[10px] font-bold tracking-[0.16em] text-stone-500 uppercase"
                >
                  Type
                </label>
                <div
                  className="relative"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setIsTypeMenuOpen(false);
                    }
                  }}
                >
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={isTypeMenuOpen}
                    aria-labelledby="documentType-label documentType-value"
                    onClick={() => setIsTypeMenuOpen((isOpen) => !isOpen)}
                    className="flex w-full items-center justify-between rounded-lg border border-amber-400 bg-white/[0.08] px-3 py-2.5 text-left text-sm font-bold text-white outline-none transition hover:bg-white/[0.12] focus:border-amber-300"
                  >
                    <span id="documentType-value">
                      {selectedDocumentType?.label ?? "Select type"}
                    </span>
                    <ChevronDown
                      className={[
                        "h-4 w-4 text-stone-500 transition-transform",
                        isTypeMenuOpen ? "rotate-180 text-amber-400" : "",
                      ].join(" ")}
                    />
                  </button>

                  {isTypeMenuOpen ? (
                    <div
                      role="listbox"
                      aria-labelledby="documentType-label"
                      className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-amber-400/70 bg-stone-950 p-1 shadow-lg shadow-black/30"
                    >
                      {documentTypeOptions.map((option) => {
                        const isSelected = option.value === documentType;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              setDocumentType(option.value as DocumentType);
                              setIsTypeMenuOpen(false);
                            }}
                            className={[
                              "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-semibold transition",
                              isSelected
                                ? "bg-amber-400 text-stone-950"
                                : "text-stone-200 hover:bg-white/10 hover:text-white",
                            ].join(" ")}
                          >
                            {option.label}
                            {isSelected ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <p className="text-xs text-stone-400 leading-relaxed italic">
                    &ldquo;
                    {documentTypeOptions.find((option) => option.value === documentType)?.description}
                    &rdquo;
                  </p>
              </div>

              <button
                type="button"
                onClick={handleUpload}
                disabled={!canSubmit}
                className="group relative flex w-full items-center justify-center rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-stone-950 transition enabled:hover:bg-amber-300 active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-800 disabled:text-stone-600"
              >
                {stage === "requesting" || stage === "uploading" || stage === "saving" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Upload Document
                    <CheckCircle2 className="ml-2 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </>
                )}
              </button>
           </div>
        </div>
      </div>
    </section>
  );
}
