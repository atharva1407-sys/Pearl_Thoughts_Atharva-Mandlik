import Link from "next/link";
import { getCurrentUser, logoutAction } from "@/actions/auth";
import { Building2, ArrowUpRight } from "lucide-react";

export async function Navbar() {
  const user = await getCurrentUser();

  return (
    <header className="max-w-5xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between border-b border-zinc-800/80 pb-4 gap-4">
      {/* Brand & Facility */}
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 group select-none">
          {/* Official Medrella 'm+' Logo Badge */}
          <span
            className="relative inline-flex shrink-0 items-center justify-center bg-[#0875df] font-semibold text-white shadow-xs group-hover:scale-105 transition-transform"
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "7.2px 7.2px 7.2px 0",
              fontSize: "19px",
              letterSpacing: "-2px",
              lineHeight: 1,
            }}
          >
            <span style={{ marginTop: "-2px", marginRight: "2px" }}>m</span>
            <span
              className="absolute font-bold"
              style={{ fontSize: "9px", top: "2.5px", right: "3px", lineHeight: 1, letterSpacing: 0 }}
            >
              +
            </span>
          </span>
          <span className="font-bold text-white text-lg tracking-tight">
            medrella<span className="text-[#0584db]">.</span>
          </span>
        </Link>

        {/* Live Facility Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900/90 border border-zinc-800/80 text-xs text-zinc-400">
          <Building2 className="w-3 h-3 text-zinc-500" />
          <span>Ruby Hall, Pune</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" title="Connected"></span>
        </div>
      </div>

      {/* Navigation Actions */}
      <div className="flex items-center flex-wrap gap-2.5">
        <Link
          href="/doctors"
          className="text-xs font-medium text-zinc-400 hover:text-white transition-colors px-2.5 py-1 flex items-center gap-1"
        >
          <span>Find Specialists</span>
          <ArrowUpRight className="w-3 h-3 text-zinc-500" />
        </Link>

        {user ? (
          <div className="flex items-center gap-2">
            <Link
              href={user.role === "PATIENT" ? "/patient/dashboard" : "/doctor/dashboard"}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-white hover:border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>{user.name}</span>
              <span className="text-xs text-zinc-500 font-mono uppercase">({user.role})</span>
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-xs px-2.5 py-1.5 rounded-md text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
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
              className="text-xs font-semibold bg-white text-zinc-950 px-3.5 py-1.5 rounded-lg hover:bg-zinc-200 transition-colors shadow-xs"
            >
              Get Started
            </Link>
          </div>
        )}

        <span className="text-xs font-mono bg-zinc-900/90 border border-zinc-800 px-2.5 py-1 rounded-md text-zinc-500 hidden md:inline-block">
          Task 2
        </span>
      </div>
    </header>
  );
}
