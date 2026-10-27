import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { dbRepo } from "@/db/repo";
import { getCurrentUser } from "@/actions/auth";
import { SlotPicker } from "@/components/slot-picker";
import { ArrowLeft, Stethoscope, ShieldCheck, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoctorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doctor = await dbRepo.getDoctorById(id);
  if (!doctor) {
    notFound();
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(`/login?redirectTo=/doctors/${doctor.id}`);
  }
  const isLoggedInPatient = currentUser?.role === "PATIENT";
  const availabilities = await dbRepo.getAvailabilitiesByDoctorId(doctor.id);
  const activeDays = availabilities.filter((a) => a.isActive).map((a) => a.dayOfWeek);

  return (
    <div className="space-y-6">
      <Link
        href="/doctors"
        className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-bold hover:underline"
      >
        <ArrowLeft size={14} />
        <span>Back to Specialist Directory</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Doctor Profile Card */}
        <div className="card space-y-5 h-fit">
          <div className="space-y-2">
            <span className="badge blue">
              {doctor.specialization}
            </span>
            <h1 className="text-2xl font-bold text-slate-900 m-0">
              Dr. {doctor.firstName} {doctor.lastName}
            </h1>
            <p className="text-xs text-slate-400 m-0">
              License: #{doctor.licenseNumber} · Ruby Hall, Pune
            </p>
          </div>

          <div className="space-y-3 border-t border-b border-slate-100 py-4 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Consultation Fee</span>
              <span className="font-bold text-slate-900 text-sm">
                ₹{doctor.consultationFee}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Clinical Experience</span>
              <span className="font-semibold text-slate-800">
                {doctor.experienceYears} years
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Active Shift Days</span>
              <span className="badge sky">
                {activeDays.length > 0 ? activeDays.join(", ") : "Mon - Fri"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">OPD Phone Contact</span>
              <span className="font-mono text-slate-700">{doctor.phone}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Physician Profile
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {doctor.bio}
            </p>
          </div>

          <div className="p-3 rounded-lg border border-blue-100 bg-blue-50/60 text-xs text-blue-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-blue-600" />
              <span>Conflict-Free OPD Scheduling</span>
            </div>
            <p className="text-slate-600 text-xs leading-relaxed">
              Real-time slot locking guarantees no double-booking. Cancellations are permitted up to 1 hour prior to appointment.
            </p>
          </div>
        </div>

        {/* Right Column: Interactive Slot Picker */}
        <div className="lg:col-span-2">
          <SlotPicker
            doctorId={doctor.id}
            doctorName={`${doctor.firstName} ${doctor.lastName}`}
            consultationFee={doctor.consultationFee}
            isLoggedInPatient={isLoggedInPatient}
          />
        </div>
      </div>
    </div>
  );
}
