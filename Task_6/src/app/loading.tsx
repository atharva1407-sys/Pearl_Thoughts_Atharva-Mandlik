import { Logo } from "@/components/landing/logo";

// Shown while the landing page (and other top-level pages without their own loading state)
// fetches live doctor availability; mirrors the landing header and hero so the swap is gentle.
export default function Loading() {
  return (
    <div className="min-h-screen bg-white" role="status" aria-live="polite" aria-label="Loading page">
      <div className="border-b border-[#e8edf5]">
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <Logo />
          <div className="hidden gap-3 lg:flex">
            <div className="h-9 w-24 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
            <div className="h-9 w-44 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] space-y-5 px-5 py-14 sm:px-8">
        <div className="h-3 w-28 rounded-full bg-slate-100 motion-safe:animate-pulse" />
        <div className="h-12 w-80 max-w-full rounded-xl bg-slate-100 motion-safe:animate-pulse" />
        <div className="h-12 w-64 max-w-full rounded-xl bg-slate-100 motion-safe:animate-pulse" />
        <div className="h-4 w-[26rem] max-w-full rounded-full bg-slate-100 motion-safe:animate-pulse" />
        <div className="flex gap-3 pt-3">
          <div className="h-11 w-48 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
          <div className="h-11 w-40 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
