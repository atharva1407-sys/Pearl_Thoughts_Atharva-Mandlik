import Link from "next/link";
import { dbRepo } from "@/db/repo";

export default function HomePage() {
  const doctors = dbRepo.getAllDoctors();

  return (
    <div className="space-y-16">
      {/* Hero Section (Matching Task 1 dark mode) */}
      <section className="flex flex-col items-center text-center py-6 sm:py-12 space-y-5">
        {/* Status Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-800/60 bg-indigo-950/40 text-indigo-300 text-xs sm:text-sm font-medium">
          <span>✨</span>
          <span>Task 2 • Medrella Clinical Scheduler</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
          Hello, Medrella!
        </h1>

        {/* Subtitle */}
        <p className="max-w-2xl text-base sm:text-lg text-zinc-400 leading-relaxed">
          The Next.js outpatient hospital appointment scheduling application for <span className="font-semibold text-white">Task_2</span>. Built with Next.js App Router, TypeScript, Drizzle ORM, PostgreSQL schema, and Tailwind CSS.
        </p>

        {/* Interactive Buttons Row */}
        <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
          <Link
            href="/doctors"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-medium text-sm transition-all shadow-md active:scale-95"
          >
            <span>Book Consultation Now</span>
            <span className="font-mono font-bold bg-zinc-200 text-zinc-900 px-2 py-0.5 rounded text-xs">
              Live
            </span>
          </Link>

          <Link
            href="/doctor/dashboard"
            className="px-6 py-3 rounded-xl border border-zinc-800 hover:bg-zinc-900 font-medium text-sm transition-all text-zinc-300 hover:text-white"
          >
            Doctor Portal →
          </Link>
        </div>

        {/* Quick Reviewer Demo Credentials Banner */}
        <div className="w-full max-w-2xl p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-sm text-xs text-zinc-400 flex flex-col sm:flex-row items-center justify-between gap-2 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">●</span>
            <span><strong>Pre-seeded Demo Login:</strong> password is <code className="text-zinc-200 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">password123</code></span>
          </div>
          <div className="flex gap-2">
            <Link href="/login" className="text-indigo-400 hover:underline">Doctor: doctor.smith@medrella.com</Link>
            <span>•</span>
            <Link href="/login" className="text-indigo-400 hover:underline">Patient: patient.john@medrella.com</Link>
          </div>
        </div>

        {/* 4 Info Cards Grid (Matching Task 1 screenshot) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-2xl text-left pt-4">
          <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm">
            <div className="text-xs text-zinc-500 mb-1">Framework</div>
            <div className="font-semibold text-sm text-white">Next.js 16</div>
          </div>
          <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm">
            <div className="text-xs text-zinc-500 mb-1">Database</div>
            <div className="font-semibold text-sm text-white">PostgreSQL (Neon)</div>
          </div>
          <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm">
            <div className="text-xs text-zinc-500 mb-1">ORM & Typing</div>
            <div className="font-semibold text-sm text-white">Drizzle + Zod</div>
          </div>
          <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm">
            <div className="text-xs text-zinc-500 mb-1">Architecture</div>
            <div className="font-semibold text-sm text-white">App Router</div>
          </div>
        </div>
      </section>

      {/* Featured Doctors Directory */}
      <section className="space-y-6 pt-6 border-t border-zinc-800/80">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">Featured Medical Specialists</h2>
            <p className="text-xs text-zinc-400">Select a verified physician to review real-time consultation slots</p>
          </div>
          <Link
            href="/doctors"
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View All Specialists →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {doctors.slice(0, 3).map((doctor) => (
            <div
              key={doctor.id}
              className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm hover:border-zinc-700 transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 mb-2">
                      {doctor.specialization}
                    </span>
                    <h3 className="font-bold text-white text-base">Dr. {doctor.firstName} {doctor.lastName}</h3>
                    <div className="text-xs text-zinc-500">License: #{doctor.licenseNumber}</div>
                  </div>
                  <span className="flex h-2 w-2 rounded-full bg-emerald-400 mt-1.5" title="Active Shifts"></span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                  {doctor.bio}
                </p>
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                  <span>Fee: <strong className="text-white font-semibold">${doctor.consultationFee}</strong></span>
                  <span>Exp: <strong className="text-zinc-200">{doctor.experienceYears} years</strong></span>
                </div>
              </div>

              <Link
                href={`/doctors/${doctor.id}`}
                className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs text-center transition-colors border border-zinc-700 block"
              >
                View Availability & Book →
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
