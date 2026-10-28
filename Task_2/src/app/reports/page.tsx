import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo, type AppointmentEntity, type DoctorEntity } from "@/db/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import {
  FileBarChart,
  Users,
  Stethoscope,
  Activity,
  CalendarDays,
  Plus,
  Clock3,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { ReportsClientControls } from "./reports-client";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Only authorized medical staff can access clinical reports and census analytics.");
  }

  const [allAppointments, doctors, allPatients] = await Promise.all([
    dbRepo.getAllAppointments(),
    dbRepo.getAllDoctors(),
    dbRepo.getAllPatients(),
  ]);

  const completedVisits = allAppointments.filter((a) => a.status === "COMPLETED");
  const bookedVisits = allAppointments.filter((a) => a.status === "BOOKED");
  const cancelledVisits = allAppointments.filter((a) => a.status === "CANCELLED");

  // Calculate real category breakdown if appointments exist
  const total = allAppointments.length;
  const consultationCount = allAppointments.filter((a) => {
    const r = (a.reason || "").toLowerCase();
    return (
      r.includes("consult") ||
      r.includes("wellness") ||
      r.includes("fever") ||
      r.includes("assessment")
    );
  }).length;

  const followUpCount = allAppointments.filter((a) => {
    const r = (a.reason || "").toLowerCase();
    return r.includes("follow") || r.includes("check") || r.includes("review");
  }).length;

  const procedureCount = allAppointments.filter((a) => {
    const r = (a.reason || "").toLowerCase();
    return r.includes("procedure") || r.includes("patch") || r.includes("test");
  }).length;
  const otherCount = total - consultationCount - followUpCount - procedureCount;

  const getPercent = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

  // Group appointments by date for the last 5 days
  const last5Days: { dateStr: string; label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 4; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    const label = i === 0 ? "Today" : d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    const count = allAppointments.filter((a) => a.appointmentDate === dateStr).length;
    last5Days.push({ dateStr, label, count });
  }

  const maxDailyCount = Math.max(...last5Days.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">HOSPITAL METRICS & ANALYTICS</div>
          <h1>Visit Reports & Census</h1>
          <p>Real-time outpatient volume, consultation census, and departmental throughput for Ruby Hall, Pune.</p>
        </div>
      </div>

      {/* Interactive Filter Row & CSV Export */}
      <ReportsClientControls
        doctors={doctors.map((d) => ({
          id: d.id,
          name: `Dr. ${d.firstName} ${d.lastName}`,
          specialization: d.specialization,
        }))}
        totalAppointments={total}
      />

      {/* 4 Real Metric Stat Cards */}
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon">
              <Users />
            </span>
            <span className="badge sky">Census</span>
          </div>
          <div className="stat-value">{total}</div>
          <div className="stat-label">Total Visits</div>
          <div className="stat-note">
            {total > 0 ? "Active clinical visit records" : "No visits currently logged"}
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-emerald-600 bg-emerald-50">
              <CheckCircle2 />
            </span>
            <span className="badge green">Completed</span>
          </div>
          <div className="stat-value">{completedVisits.length}</div>
          <div className="stat-label">Completed Consultations</div>
          <div className="stat-note">
            {completedVisits.length > 0 ? "Discharged / EHR charted" : "No completed visits"}
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-amber-600 bg-amber-50">
              <Clock3 />
            </span>
            <span className="badge amber">Queue</span>
          </div>
          <div className="stat-value">{bookedVisits.length}</div>
          <div className="stat-label">Scheduled in Queue</div>
          <div className="stat-note">
            {bookedVisits.length > 0 ? "Awaiting triage consultation" : "No pending queue"}
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-purple-600 bg-purple-50">
              <Stethoscope />
            </span>
            <span className="badge blue">Staff</span>
          </div>
          <div className="stat-value">{doctors.length}</div>
          <div className="stat-label">Specialists on Duty</div>
          <div className="stat-note">
            {doctors.length > 0 ? "Across hospital departments" : "0 doctors active"}
          </div>
        </div>
      </div>

      {/* Content Grid: Real Dynamic Chart & Breakdown */}
      <div className="content-grid">
        {/* Left: Visits Over Time */}
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Visits Over Time</h2>
              <p>Daily patient volume · Real clinical records</p>
            </div>
            <span className="badge blue">Recent Timeline</span>
          </div>

          {total === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400 space-y-2">
              <FileBarChart size={34} className="mx-auto text-slate-300" />
              <div className="font-bold text-slate-700 text-sm">No visit records logged</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto m-0">
                Patient volume graphs and throughput histograms will render here dynamically as consultations are scheduled and completed.
              </p>
              <div className="pt-2">
                <Link href="/doctors" className="btn primary text-xs">
                  <Plus size={14} />
                  <span>Book an Appointment</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-end justify-between gap-6 px-4 pb-2 border-b border-slate-100">
              {last5Days.map((day) => {
                const heightPercent = Math.max(Math.round((day.count / maxDailyCount) * 120), 12);
                return (
                  <div key={day.dateStr} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">{day.count}</span>
                    <div
                      className="w-full bg-blue-500 hover:bg-blue-600 transition-all rounded-t"
                      style={{ height: `${heightPercent}px` }}
                      title={`${day.count} appointments on ${day.label}`}
                    />
                    <span className="text-xs text-slate-400">{day.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Visit Breakdown */}
        <div className="card space-y-4">
          <div className="card-head">
            <div>
              <h2>Visit Breakdown</h2>
              <p>Categorized by appointment type</p>
            </div>
            <span className="badge sky">{total} Total</span>
          </div>

          {total === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400 space-y-2">
              <Activity size={32} className="mx-auto text-slate-300" />
              <div className="font-bold text-slate-700 text-sm">No categorized visits</div>
              <p className="text-xs text-slate-400 max-w-xs mx-auto m-0">
                Departmental ratios (Consultations, Procedures, Follow-ups) will display in real time when patient appointments are active.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700">General Consultation</span>
                  <b className="text-slate-900">{getPercent(consultationCount)}%</b>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${getPercent(consultationCount)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700">Follow-up Visits</span>
                  <b className="text-slate-900">{getPercent(followUpCount)}%</b>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all"
                    style={{ width: `${getPercent(followUpCount)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700">Procedures & Diagnostics</span>
                  <b className="text-slate-900">{getPercent(procedureCount)}%</b>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all"
                    style={{ width: `${getPercent(procedureCount)}%` }}
                  />
                </div>
              </div>

              {otherCount > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700">Other OPD Care</span>
                    <b className="text-slate-900">{getPercent(otherCount)}%</b>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-2 rounded-full transition-all"
                      style={{ width: `${getPercent(otherCount)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
