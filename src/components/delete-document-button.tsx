"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteDocumentAction, type DeleteDocumentActionState } from "@/features/documents/actions";
import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "@/components/toast";

const initialState: DeleteDocumentActionState = {
  error: null,
};

export function DeleteDocumentButton({
  documentId,
}: {
  documentId: string;
}) {
  const [state, formAction, pending] = useActionState(deleteDocumentAction, initialState);
  const { showToast } = useToast();
  const submitRef = useRef<HTMLButtonElement | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!state.error) {
      return;
    }

    showToast(state.error, "error");
  }, [showToast, state.error]);

  return (
    <>
      <ConfirmModal
        open={showConfirm}
        title="Delete this document?"
        description="This removes the document from the app and Cloudflare R2. This action cannot be undone."
        confirmLabel="Delete document"
        variant="danger"
        isLoading={pending}
        onConfirm={() => {
          setShowConfirm(false);
          submitRef.current?.click();
        }}
        onCancel={() => setShowConfirm(false)}
      />

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="documentId" value={documentId} />
        <button
          type="button"
          disabled={pending}
          onClick={() => setShowConfirm(true)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            pending
              ? "cursor-not-allowed bg-red-950/40 text-red-200/70"
              : "bg-red-500 text-white hover:-translate-y-0.5 hover:bg-red-400"
          }`}
        >
          {pending ? "Deleting..." : "Delete document"}
        </button>
        <button ref={submitRef} type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          Confirm delete
        </button>
        {state.error ? <p className="text-sm text-red-300">{state.error}</p> : null}
      </form>
    </>
  );
}
