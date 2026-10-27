import Link from "next/link";
import { dbRepo } from "@/db/repo";
import { ArrowUpRight, Calendar, Users, Activity, CheckCircle2 } from "lucide-react";

export default function HomePage() {
  const doctors = dbRepo.getAllDoctors();

  return (
    <div className="space-y-16">
      {/* Hero Section (Matching Medrella Brand + Task 1 Dark Mode) */}
      <section className="flex flex-col items-center text-center py-6 sm:py-12 space-y-5">
        {/* Medrella Eyebrow Header */}
        <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-indigo-400 block">
          Hospital Information • Human Connection
        </span>

        {/* Hero Title: Medrella Slogan with Italic Emphasis */}
        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
          More time for <em className="not-italic text-indigo-300 font-serif italic">care.</em>
        </h1>

        {/* Subtitle from medrella.com */}
        <p className="max-w-2xl text-base sm:text-lg text-zinc-400 leading-relaxed">
          A connected outpatient scheduling application for <span className="font-semibold text-white">SP Delta Hospital</span>. Connecting clinical specialists, real-time consultation windows, and conflict-proof appointment booking.
        </p>

        {/* Action Buttons Row */}
        <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
          <Link
            href="/doctors"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-sm transition-all shadow-md active:scale-95 group"
          >
            <span>Book an Appointment</span>
            <ArrowUpRight className="w-4 h-4 text-zinc-950 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>

          <Link
            href="/doctor/dashboard"
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-zinc-800 hover:bg-zinc-900 font-medium text-sm transition-all text-zinc-300 hover:text-white"
          >
            <span>Doctor Shift Portal</span>
            <span className="text-xs text-zinc-500 font-mono">→</span>
          </Link>
        </div>

        {/* Pre-seeded Demo Credentials Callout */}
        <div className="w-full max-w-2xl p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-sm text-xs text-zinc-400 flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">●</span>
            <span><strong>Pre-seeded Reviewer Login:</strong> password is <code className="text-zinc-200 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">password123</code></span>
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

      {/* Medrella Capability Editorial Rows (Direct from medrella.com) */}
      <section className="space-y-6 pt-6 border-t border-zinc-800/80">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-zinc-500 block mb-1">
            Hospital Capabilities
          </span>
          <h2 className="text-2xl font-bold text-white tracking-wide">
            Depth in every department. Connection across them.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-3">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="font-mono text-sm font-bold text-indigo-400">01</span>
              <Users className="w-4 h-4 text-zinc-600" />
            </div>
            <h3 className="font-bold text-white text-base">From arrival to admission</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Patient identity, registered profiles, and outpatient coordination mapped 1:1 to Task 1 ER entities.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-3">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="font-mono text-sm font-bold text-indigo-400">02</span>
              <Calendar className="w-4 h-4 text-zinc-600" />
            </div>
            <h3 className="font-bold text-white text-base">Live Slot Computation</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Doctor weekly availability windows, custom slot increments, and real-time conflict-proof booking locks.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-3">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="font-mono text-sm font-bold text-indigo-400">03</span>
              <Activity className="w-4 h-4 text-zinc-600" />
            </div>
            <h3 className="font-bold text-white text-base">Active Clinic Queue</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Chronological consultation queues with instant status transitions: BOOKED, COMPLETED, or CANCELLED.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Doctors Directory */}
      <section className="space-y-6 pt-6 border-t border-zinc-800/80">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-zinc-500 block mb-1">
              Physician Staff
            </span>
            <h2 className="text-xl font-bold text-white tracking-wide">Verified Specialists on Shift</h2>
          </div>
          <Link
            href="/doctors"
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
          >
            <span>Explore All Specialists</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
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
                  <span className="flex h-2 w-2 rounded-full bg-emerald-400 mt-1.5" title="Available"></span>
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
                className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs text-center transition-colors border border-zinc-700 flex items-center justify-center gap-1 group"
              >
                <span>View Shifts & Book</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors" />
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
