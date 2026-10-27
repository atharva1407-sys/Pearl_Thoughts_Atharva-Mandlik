import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/actions/auth";
import { completeAppointmentAction, cancelAppointmentAction } from "@/actions/appointments";
import { dbRepo } from "@/db/repo";
import { formatDate } from "@/lib/utils";
import { Building2, ArrowUpRight, CheckCircle2 } from "lucide-react";

export default async function DoctorDashboard() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Please sign in to access the doctor dashboard.");
  }

  const doctor = dbRepo.getDoctorById(user.profileId);
  const appointments = dbRepo.getAppointmentsByDoctorId(user.profileId);
  const availabilities = dbRepo.getAvailabilitiesByDoctorId(user.profileId);

  const activeShifts = availabilities.filter((a) => a.isActive);
  const activeBookings = appointments.filter((a) => a.status === "BOOKED");
  const completedBookings = appointments.filter((a) => a.status === "COMPLETED");

  return (
    <div className="space-y-8">
      {/* Header with Medrella Eyebrow & Facility Tag */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-indigo-400">
              Outpatient Care • Physician Portal
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-xs text-zinc-400 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-zinc-500" />
              SP Delta Hospital
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-white">Dr. {doctor?.firstName} {doctor?.lastName}</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {doctor?.specialization} Department • License #{doctor?.licenseNumber} • Fee: ${doctor?.consultationFee}
          </p>
        </div>
        <Link
          href="/doctor/availability"
          className="px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs transition-colors shadow-md flex items-center gap-1.5 group"
        >
          <span>Manage Weekly Shifts</span>
          <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>

      {/* Metrics Row (Matching Task 1 screenshot cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm">
          <div className="text-xs text-zinc-500 mb-1">Active Queue Bookings</div>
          <div className="font-bold text-2xl text-white">{activeBookings.length} Patients</div>
          <div className="text-[11px] text-emerald-400 font-semibold mt-1">● Next patient ready</div>
        </div>

        <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm">
          <div className="text-xs text-zinc-500 mb-1">Completed Consultations</div>
          <div className="font-bold text-2xl text-white">{completedBookings.length} Completed</div>
          <div className="text-[11px] text-zinc-400 mt-1">Outpatient medical reports</div>
        </div>

        <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm">
          <div className="text-xs text-zinc-500 mb-1">Configured Shifts</div>
          <div className="font-bold text-lg text-white">{activeShifts.length} Days / Week</div>
          <div className="text-[11px] text-indigo-400 mt-1">
            {activeShifts.map(s => s.dayOfWeek).join(", ")}
          </div>
        </div>
      </div>

      {/* Patient Queue */}
      <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white text-base">Active Consultation Queue</h2>
            <p className="text-xs text-zinc-500">Live outpatient appointments awaiting review</p>
          </div>
          <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-zinc-900 text-zinc-300 border border-zinc-800">
            {activeBookings.length} In Queue
          </span>
        </div>

        {activeBookings.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
            No patient appointments are currently queued.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/80">
            {activeBookings.map((apt, index) => (
              <div
                key={apt.id}
                className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-indigo-300">
                      📅 {formatDate(apt.appointmentDate)} • {apt.startTime} - {apt.endTime}
                    </span>
                    {index === 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                        NEXT PATIENT
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-white text-sm">
                    {apt.patient.firstName} {apt.patient.lastName} (Phone: {apt.patient.phone})
                  </div>
                  <div className="text-xs text-zinc-400">
                    Reason: <span className="text-zinc-200">{apt.reason}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <form action={async () => {
                    "use server";
                    await completeAppointmentAction(apt.id);
                  }}>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark Done</span>
                    </button>
                  </form>

                  <form action={async () => {
                    "use server";
                    await cancelAppointmentAction(apt.id);
                  }}>
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs cursor-pointer"
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

      {/* Completed Consultations History */}
      {completedBookings.length > 0 && (
        <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-4">
          <h2 className="font-bold text-white text-base">Completed Consultations History</h2>
          <div className="divide-y divide-zinc-800/80">
            {completedBookings.map((apt) => (
              <div
                key={apt.id}
                className="py-3 flex items-center justify-between opacity-70 text-xs"
              >
                <div>
                  <span className="font-bold text-white">{apt.patient.firstName} {apt.patient.lastName}</span>
                  <span className="text-zinc-500 ml-2">({formatDate(apt.appointmentDate)} at {apt.startTime})</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  COMPLETED
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
