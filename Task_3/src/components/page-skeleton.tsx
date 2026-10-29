/**
 * Placeholder shown by route-level loading.tsx files while a page's data loads. Having a loading
 * boundary also lets Next.js prefetch these dynamic routes, so navigation responds immediately.
 */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label="Loading page">
      <div className="space-y-3">
        <div className="h-3 w-40 rounded-full bg-slate-200/80 motion-safe:animate-pulse" />
        <div className="h-7 w-72 max-w-full rounded-lg bg-slate-200/80 motion-safe:animate-pulse" />
        <div className="h-3.5 w-96 max-w-full rounded-full bg-slate-200/70 motion-safe:animate-pulse" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-slate-200/80 motion-safe:animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 rounded-full bg-slate-200/80 motion-safe:animate-pulse" />
                <div className="h-3 w-1/3 rounded-full bg-slate-200/70 motion-safe:animate-pulse" />
              </div>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 motion-safe:animate-pulse" />
            <div className="h-3 w-5/6 rounded-full bg-slate-100 motion-safe:animate-pulse" />
            <div className="h-9 w-full rounded-lg bg-slate-100 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
