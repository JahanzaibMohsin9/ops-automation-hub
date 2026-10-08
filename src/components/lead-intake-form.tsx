"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useActionState } from "react";
import { submitLeadIntake } from "@/features/leads/actions";
import { initialLeadIntakeState } from "@/features/leads/state";

const MESSAGE_MAX_LENGTH = 2000;

const fieldClassName =
  "w-full rounded-lg border bg-stone-50 px-3 py-2 text-sm text-stone-900 transition outline-none focus:border-stone-900/30";

type FieldProps = {
  id: string;
  label: string;
  type?: string;
  name: string;
  placeholder: string;
  required?: boolean;
  autoComplete?: string;
  helperText?: string;
  error?: string;
};

function RequiredMark() {
  return (
    <span className="ml-1 text-rose-500" aria-hidden="true">
      *
    </span>
  );
}

function InputField({
  id,
  label,
  type = "text",
  name,
  placeholder,
  required,
  autoComplete,
  helperText,
  error,
}: FieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold text-stone-800"
      >
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${id}-error` : helperText ? `${id}-hint` : undefined
        }
        className={`${fieldClassName} ${
          error ? "border-rose-300 bg-rose-50/60" : "border-stone-900/10"
        }`}
      />
      {helperText ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-5 text-stone-500">
          {helperText}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function LeadIntakeForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const messageId = useId();
  const [messageLength, setMessageLength] = useState(0);
  const [state, formAction, pending] = useActionState(
    submitLeadIntake,
    initialLeadIntakeState
  );

  // Reset form on success
  useEffect(() => {
    if (state.status === "success" && formRef.current) {
      formRef.current.reset();
      // Reset character counter in a microtask to avoid react-hooks/set-state-in-effect
      Promise.resolve().then(() => setMessageLength(0));
    }
  }, [state.status]);

  // Focus the first errored field after a failed submission
  useEffect(() => {
    if (state.status === "error" && formRef.current) {
      const firstInvalid = formRef.current.querySelector<HTMLElement>(
        "[aria-invalid='true']"
      );
      firstInvalid?.focus();
    }
  }, [state]);

  const remaining = MESSAGE_MAX_LENGTH - messageLength;
  const remainingLabel =
    remaining <= 200
      ? remaining <= 0
        ? "0 characters remaining"
        : `${remaining} character${remaining === 1 ? "" : "s"} remaining`
      : null;

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
        <InputField
          id="fullName"
          name="fullName"
          label="Full name"
          placeholder="Jordan Lee"
          required
          autoComplete="name"
          error={state.fieldErrors.fullName}
        />
        <InputField
          id="email"
          name="email"
          type="email"
          label="Email"
          placeholder="jordan@northbeamops.com"
          required
          autoComplete="email"
          error={state.fieldErrors.email}
        />
        <InputField
          id="phone"
          name="phone"
          type="tel"
          label="Phone"
          placeholder="+1 415 555 0199"
          autoComplete="tel"
          error={state.fieldErrors.phone}
        />
        <InputField
          id="companyName"
          name="companyName"
          label="Company name"
          placeholder="Northbeam Ops"
          required
          autoComplete="organization"
          error={state.fieldErrors.companyName}
        />
        <InputField
          id="companyDomain"
          name="companyDomain"
          label="Company domain"
          placeholder="northbeamops.com"
          autoComplete="url"
          helperText="Optional, but helpful for enrichment later in the pipeline."
          error={state.fieldErrors.companyDomain}
        />
        <InputField
          id="jobTitle"
          name="jobTitle"
          label="Job title"
          placeholder="Operations Director"
          autoComplete="organization-title"
          error={state.fieldErrors.jobTitle}
        />
        <InputField
          id="industry"
          name="industry"
          label="Industry"
          placeholder="B2B consulting"
          error={state.fieldErrors.industry}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label
            htmlFor={messageId}
            className="block text-xs font-semibold text-stone-800"
          >
            Message
          </label>
          {remainingLabel ? (
            <span
              className={`text-xs tabular-nums ${
                remaining <= 0 ? "text-rose-600" : "text-stone-400"
              }`}
              aria-live="polite"
              aria-atomic="true"
            >
              {remainingLabel}
            </span>
          ) : null}
        </div>
        <textarea
          id={messageId}
          name="message"
          rows={3}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder="Share what the lead is looking for, timeline, or any qualification context."
          aria-invalid={Boolean(state.fieldErrors.message)}
          aria-describedby={
            state.fieldErrors.message
              ? `${messageId}-error`
              : `${messageId}-hint`
          }
          onChange={(event) => setMessageLength(event.target.value.length)}
          className={`${fieldClassName} resize-y border ${
            state.fieldErrors.message
              ? "border-rose-300 bg-rose-50/60"
              : "border-stone-900/10"
          }`}
        />
        <p
          id={`${messageId}-hint`}
          className="mt-1.5 text-xs leading-5 text-stone-500"
        >
          This gets stored in the raw payload so downstream scoring can reuse
          the context.
        </p>
        {state.fieldErrors.message ? (
          <p
            id={`${messageId}-error`}
            className="mt-1.5 text-xs text-rose-700"
          >
            {state.fieldErrors.message}
          </p>
        ) : null}
      </div>

      <p className="text-xs text-stone-400">
        <span aria-hidden="true" className="text-rose-500">
          *
        </span>{" "}
        Required fields
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {pending ? "Saving lead..." : "Submit lead"}
        </button>
        <p
          className={`text-xs leading-5 ${
            state.status === "error"
              ? "text-rose-700"
              : state.status === "success"
                ? "text-emerald-700"
                : "text-stone-500"
          }`}
        >
          {state.message ||
            "Every submission is scoped to the active workspace and logged for audit history."}
        </p>
      </div>
    </form>
  );
}
