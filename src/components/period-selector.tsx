"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Calendar } from "lucide-react";

const PERIOD_OPTIONS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
] as const;

export type PeriodValue = (typeof PERIOD_OPTIONS)[number]["value"];

type PeriodSelectorProps = {
  current: PeriodValue;
};

export function PeriodSelector({ current }: PeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: PeriodValue) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "7d") {
      params.delete("period");
    } else {
      params.set("period", value);
    }
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/dashboard?${query}` : "/dashboard");
    });
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-stone-900/10 bg-stone-50 p-1">
      <Calendar className="ml-1.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => handleChange(option.value)}
          disabled={isPending}
          className={[
            "rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide transition-all duration-150",
            current === option.value
              ? "bg-stone-900 text-white shadow-sm"
              : "text-stone-500 hover:bg-white hover:text-stone-700 hover:shadow-sm",
          ].join(" ")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
