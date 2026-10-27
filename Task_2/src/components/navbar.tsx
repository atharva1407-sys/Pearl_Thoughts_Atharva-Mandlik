import Link from "next/link";
import { getCurrentUser, logoutAction } from "@/actions/auth";

export async function Navbar() {
  const user = await getCurrentUser();

  return (
    <header className="max-w-5xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between border-b border-zinc-800/80 pb-4 gap-4">
      <Link href="/" className="flex items-center gap-2.5 group">
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
        <span className="text-xs sm:text-sm font-semibold tracking-wider uppercase text-zinc-400 group-hover:text-white transition-colors">
          TASK 2 • MEDRELLA SCHEDULER
        </span>
      </Link>

      <div className="flex items-center flex-wrap gap-3">
        <Link
          href="/doctors"
          className="text-xs font-medium text-zinc-400 hover:text-white transition-colors px-2.5 py-1"
        >
          Browse Doctors
        </Link>

        {user ? (
          <div className="flex items-center gap-2.5">
            <Link
              href={user.role === "PATIENT" ? "/patient/dashboard" : "/doctor/dashboard"}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-white hover:border-zinc-700 transition-colors"
            >
              {user.name} ({user.role})
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-xs px-2.5 py-1 rounded-md text-zinc-500 hover:text-rose-400 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-xs font-medium text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-900 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-xs font-semibold bg-white text-zinc-950 px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition-colors shadow-xs"
            >
              Get Started
            </Link>
          </div>
        )}

        <span className="text-xs font-mono bg-zinc-900/90 border border-zinc-800 px-2.5 py-1 rounded-md text-zinc-500 hidden md:inline-block">
          Next.js App Router
        </span>
      </div>
    </header>
  );
}
