import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found (404)",
  description: "The requested clinical page or resource could not be found.",
};

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-50 border border-sky-100 text-[#0875df] mb-6 shadow-xs">
        <span className="text-2xl font-black">404</span>
      </div>
      <h1 className="text-2xl font-bold text-[#14243d] mb-2 tracking-tight">
        Page Not Found
      </h1>
      <p className="text-sm text-[#5d6d84] max-w-md mb-8">
        The clinical resource, department route, or record you requested does not exist or has been moved.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#0875df] text-white hover:bg-[#0764be] transition-colors shadow-xs"
        >
          Return to Medrella Home
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-medium bg-white text-[#14243d] border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          Staff & Patient Login
        </Link>
      </div>
    </div>
  );
}
