import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/actions/auth";
import { cancelAppointmentAction } from "@/actions/appointments";
import { dbRepo } from "@/db/repo";
import { formatDate } from "@/lib/utils";
import { Building2, ArrowUpRight } from "lucide-react";

export default async function PatientDashboard() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PATIENT") {
    redirect("/login?message=Please sign in to access the patient dashboard.");
  }

  const patient = dbRepo.getPatientById(user.profileId);
  const appointments = dbRepo.getAppointmentsByPatientId(user.profileId);

  const upcoming = appointments.filter((a) => a.status === "BOOKED");
  const past = appointments.filter((a) => a.status !== "BOOKED");

  return (
    <div className="space-y-8">
      {/* Header with Medrella Eyebrow & Facility Tag */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-indigo-400">
              Patient Care • Outpatient Portal
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-xs text-zinc-400 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-zinc-500" />
              SP Delta Hospital
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-white">Welcome, {patient?.firstName} {patient?.lastName}</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Manage your scheduled hospital consultations and clinical records</p>
        </div>
        <Link
          href="/doctors"
          className="px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs transition-colors shadow-md flex items-center gap-1.5 group"
        >
          <span>+ Book New Consultation</span>
          <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>

      {/* Metrics Row (Matching Task 1 screenshot cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm">
          <div className="text-xs text-zinc-500 mb-1">Upcoming Visits</div>
          <div className="font-bold text-2xl text-white">{upcoming.length} Scheduled</div>
          <div className="text-[11px] text-emerald-400 font-semibold mt-1">
            {upcoming.length > 0 ? `Next: ${upcoming[0].appointmentDate}` : "No pending visits"}
          </div>
        </div>

        <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm">
          <div className="text-xs text-zinc-500 mb-1">Completed Consultations</div>
          <div className="font-bold text-2xl text-white">{past.filter(a => a.status === 'COMPLETED').length} Visits</div>
          <div className="text-[11px] text-zinc-500 mt-1">Patient records synchronized</div>
        </div>

        <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm">
          <div className="text-xs text-zinc-500 mb-1">Patient Identity</div>
          <div className="font-bold text-lg text-white">{patient?.firstName} {patient?.lastName}</div>
          <div className="text-[11px] text-zinc-400 mt-1">Contact: {patient?.phone}</div>
        </div>
      </div>

      {/* Upcoming Appointments List */}
      <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-white text-base">Upcoming Hospital Consultations</h2>
          <span className="text-xs font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
            {upcoming.length} Active
          </span>
        </div>

        {upcoming.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
            You have no upcoming consultations scheduled.{" "}
            <Link href="/doctors" className="text-indigo-400 font-semibold hover:underline">
              Browse available doctors
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/80">
            {upcoming.map((apt) => (
              <div
                key={apt.id}
                className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 flex items-center justify-center font-bold text-xs">
                    {apt.doctor.firstName[0]}{apt.doctor.lastName[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm">
                        Dr. {apt.doctor.firstName} {apt.doctor.lastName}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
                        {apt.doctor.specialization}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      📅 <strong>{formatDate(apt.appointmentDate)}</strong> • ⏰ <strong>{apt.startTime} - {apt.endTime}</strong> • Fee: ${apt.doctor.consultationFee}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Reason: <span className="text-zinc-300">{apt.reason}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
                    BOOKED
                  </span>

                  <form action={async () => {
                    "use server";
                    await cancelAppointmentAction(apt.id);
                  }}>
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg border border-rose-900/60 text-rose-400 hover:bg-rose-950/40 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Consultations */}
      {past.length > 0 && (
        <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-4">
          <h2 className="font-bold text-white text-base">Past Consultations</h2>
          <div className="divide-y divide-zinc-800/80">
            {past.map((apt) => (
              <div
                key={apt.id}
                className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 opacity-70"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center font-bold text-xs">
                    {apt.doctor.firstName[0]}{apt.doctor.lastName[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm">
                        Dr. {apt.doctor.firstName} {apt.doctor.lastName}
                      </h3>
                      <span className="text-xs text-zinc-500">
                        ({apt.doctor.specialization})
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {formatDate(apt.appointmentDate)} • {apt.startTime} - {apt.endTime}
                    </div>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                    apt.status === "COMPLETED"
                      ? "bg-zinc-800/80 text-zinc-300 border-zinc-700"
                      : "bg-rose-950/40 text-rose-400 border-rose-900/60"
                  }`}
                >
                  {apt.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
