export function LeadsTableSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <section className="rounded-[1.75rem] border border-stone-900/10 bg-white p-7 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="h-3 w-16 animate-pulse rounded-full bg-stone-200" />
            <div className="h-7 w-72 animate-pulse rounded-2xl bg-stone-200" />
            <div className="h-4 w-96 animate-pulse rounded-full bg-stone-100" />
          </div>
          <div className="h-12 w-60 animate-pulse rounded-2xl bg-stone-100" />
        </div>
      </section>

      {/* Table skeleton */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-[1.75rem] border border-stone-900/10 bg-white p-7 shadow-[0_18px_50px_rgba(70,56,24,0.08)]">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-6 w-28 animate-pulse rounded-2xl bg-stone-200" />
              <div className="h-4 w-48 animate-pulse rounded-full bg-stone-100" />
            </div>
            <div className="h-10 w-20 animate-pulse rounded-2xl bg-stone-100" />
          </div>

          <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-stone-900/10">
            {/* Table header */}
            <div className="flex gap-4 bg-stone-50 px-5 py-4">
              {[120, 100, 140, 80, 60, 80, 80].map((w, i) => (
                <div
                  key={i}
                  className="h-3 animate-pulse rounded-full bg-stone-200"
                  style={{ width: w }}
                />
              ))}
            </div>
            {/* Table rows */}
            {Array.from({ length: 8 }).map((_, rowIndex) => (
              <div
                key={rowIndex}
                className="flex gap-4 border-t border-stone-900/10 px-5 py-4"
              >
                {[120, 100, 140, 80, 60, 80, 80].map((w, i) => (
                  <div
                    key={i}
                    className="h-4 animate-pulse rounded-full bg-stone-100"
                    style={{ width: w, animationDelay: `${rowIndex * 60}ms` }}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="h-4 w-24 animate-pulse rounded-full bg-stone-100" />
            <div className="flex gap-3">
              <div className="h-9 w-20 animate-pulse rounded-full bg-stone-100" />
              <div className="h-9 w-16 animate-pulse rounded-full bg-stone-100" />
            </div>
          </div>
        </section>

        {/* Side intake form skeleton */}
        <section className="rounded-[1.75rem] border border-stone-900/10 bg-stone-950 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="space-y-3">
            <div className="h-3 w-14 animate-pulse rounded-full bg-stone-800" />
            <div className="h-6 w-36 animate-pulse rounded-2xl bg-stone-800" />
            <div className="h-4 w-56 animate-pulse rounded-full bg-stone-800/70" />
          </div>
          <div className="mt-6 space-y-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-20 animate-pulse rounded-full bg-stone-700" />
                <div className="h-10 w-full animate-pulse rounded-2xl bg-stone-800" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
