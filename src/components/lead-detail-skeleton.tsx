export function LeadDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-[1.75rem] border border-stone-900/10 bg-white p-7 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
        <div className="h-4 w-24 animate-pulse rounded-full bg-stone-200" />
        <div className="mt-6 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="h-3 w-20 animate-pulse rounded-full bg-stone-200" />
            <div className="h-9 w-64 animate-pulse rounded-2xl bg-stone-200" />
            <div className="h-5 w-40 animate-pulse rounded-full bg-stone-100" />
          </div>
          <div className="h-7 w-24 animate-pulse rounded-full bg-stone-100" />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* Contact info */}
          <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
            <div className="h-3 w-24 animate-pulse rounded-full bg-stone-200" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4"
                >
                  <div className="h-3 w-16 animate-pulse rounded-full bg-stone-200" />
                  <div className="mt-3 h-4 w-32 animate-pulse rounded-full bg-stone-100" />
                </div>
              ))}
            </div>
          </section>

          {/* Company info */}
          <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
            <div className="h-3 w-24 animate-pulse rounded-full bg-stone-200" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-2xl border border-stone-900/10 bg-stone-50 p-4 ${
                    i === 2 ? "sm:col-span-2" : ""
                  }`}
                >
                  <div className="h-3 w-20 animate-pulse rounded-full bg-stone-200" />
                  <div className="mt-3 h-4 w-28 animate-pulse rounded-full bg-stone-100" />
                </div>
              ))}
            </div>
          </section>

          {/* Activity timeline */}
          <section className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
            <div className="h-3 w-32 animate-pulse rounded-full bg-stone-200" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="h-4 w-48 animate-pulse rounded-full bg-stone-200" />
                    <div className="h-3 w-24 animate-pulse rounded-full bg-stone-200" />
                  </div>
                  <div className="mt-2 h-3 w-32 animate-pulse rounded-full bg-stone-100" />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar placeholder panels */}
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <section
              key={i}
              className="rounded-[1.5rem] border border-stone-900/10 bg-white p-6 shadow-[0_18px_50px_rgba(70,56,24,0.08)]"
            >
              <div className="h-3 w-20 animate-pulse rounded-full bg-stone-200" />
              <div className="mt-3 h-5 w-36 animate-pulse rounded-2xl bg-stone-200" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full animate-pulse rounded-full bg-stone-100" />
                <div className="h-3 w-4/5 animate-pulse rounded-full bg-stone-100" />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
